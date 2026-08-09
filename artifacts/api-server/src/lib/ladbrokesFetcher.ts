/**
 * Ladbrokes Australia public API fetcher.
 *
 * Fetches fixed-odds win/place prices from the Ladbrokes AU mobile feed and
 * returns them as a nested lookup map:
 *   raceDate (YYYY-MM-DD) → venueName (lower-cased) → raceNumber → horseName (lower-cased) → { winOdds, placeOdds }
 *
 * The date is the outer key so that identical race numbers at the same venue
 * on different dates never overwrite each other.
 *
 * The same SOCKS5 proxy credentials used for TAB are reused here so that
 * requests bypass geo-restrictions when the server runs outside Australia.
 *
 * Endpoint pattern:
 *   GET https://api.ladbrokes.com.au/v2/racing/racing-overview?date={YYYY-MM-DD}&type=R
 *   GET https://api.ladbrokes.com.au/v2/racing/event-card?id={meetingId}
 */

import nodeFetch from "node-fetch";
import { SocksProxyAgent } from "socks-proxy-agent";
import { logger } from "./logger";

// ── SOCKS5 proxy (shared credential pattern — same as tabFetcher) ────────────

let _agent: SocksProxyAgent | null | undefined = undefined;

function getProxyAgent(): SocksProxyAgent | null {
  if (_agent !== undefined) return _agent;

  const user = process.env.NORDVPN_SOCKS5_USER;
  const pass = process.env.NORDVPN_SOCKS5_PASS;
  const host = process.env.NORDVPN_SOCKS5_HOST ?? "au1025.nordvpn.com";
  const port = process.env.NORDVPN_SOCKS5_PORT ?? "1080";

  if (!user || !pass) {
    logger.info("Ladbrokes proxy: no SOCKS5 credentials — requests will go direct");
    _agent = null;
    return null;
  }

  const proxyUrl = `socks5h://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}`;
  _agent = new SocksProxyAgent(proxyUrl);
  logger.info({ host, port }, "Ladbrokes proxy: SOCKS5 agent initialised");
  return _agent;
}

const LADS_BASE = "https://api.ladbrokes.com.au/v2/racing";
const FETCH_TIMEOUT_MS = 15_000;

// ── Ladbrokes API response shapes ────────────────────────────────────────────

export interface LadbrokesFixedOdds {
  win_odds?: number;
  place_odds?: number;
  is_suspended?: boolean;
}

export interface LadbrokesRunner {
  name?: string;
  scratched?: boolean;
  fixed_odds?: LadbrokesFixedOdds;
  number?: number;
}

export interface LadbrokesRace {
  id?: string;
  number?: number;
  runners?: LadbrokesRunner[];
}

export interface LadbrokesMeeting {
  id?: string;
  name?: string;
  venue_name?: string;
  state?: string;
  /** "R" = thoroughbred, "G" = greyhound, "H" = harness */
  race_type?: string;
  races?: LadbrokesRace[];
}

export interface LadbrokesOverviewResponse {
  meetings?: LadbrokesMeeting[];
}

// ── Output type ──────────────────────────────────────────────────────────────

/**
 * Nested map:
 *   raceDate (YYYY-MM-DD) → venueName (lower-cased) → raceNumber → horseName (lower-cased) → odds
 */
export type LadbrokesOddsMap = Map<
  string, // raceDate
  Map<string, Map<number, Map<string, { winOdds: number; placeOdds: number }>>>
>;

// ── Normalisation ─────────────────────────────────────────────────────────────

/**
 * Shared key normalisation used for both venue names and horse names.
 * Strips country/state suffixes in parentheses (e.g. "(AUS)", "(NZ)"),
 * trims surrounding whitespace, and converts to lower-case.
 *
 * This MUST be the single function used wherever Ladbrokes names are
 * stored or compared so that matching is consistent end-to-end.
 */
export function normaliseKey(raw: string): string {
  return raw
    .replace(/\s*\(.*?\)\s*$/, "")
    .trim()
    .toLowerCase();
}

// ── Pure parsing (testable without network) ───────────────────────────────────

/**
 * Parse a Ladbrokes racing-overview response for a given date into the
 * `LadbrokesOddsMap` structure.
 *
 * This is a pure function — no network or side-effects — making it easy to
 * unit-test with fixture data.  The `fetchLadbrokesOdds` function is a thin
 * wrapper that fetches then delegates here.
 */
export function parseLadbrokesOverview(
  date: string,
  overview: LadbrokesOverviewResponse
): LadbrokesOddsMap {
  const oddsMap: LadbrokesOddsMap = new Map();

  for (const meeting of overview.meetings ?? []) {
    // Filter to thoroughbreds only
    if (meeting.race_type && meeting.race_type !== "R") continue;

    const rawVenue = meeting.venue_name ?? meeting.name ?? "";
    if (!rawVenue) continue;
    const venueKey = normaliseKey(rawVenue);

    for (const race of meeting.races ?? []) {
      const raceNumber = race.number;
      if (!raceNumber) continue;

      const runners = race.runners ?? [];

      for (const runner of runners) {
        if (runner.scratched) continue;
        if (!runner.name) continue;

        const winOdds = runner.fixed_odds?.win_odds;
        const placeOdds = runner.fixed_odds?.place_odds;

        if (
          !winOdds ||
          !placeOdds ||
          runner.fixed_odds?.is_suspended ||
          winOdds <= 0 ||
          placeOdds <= 0
        )
          continue;

        // Ensure date → venue → race nesting exists
        if (!oddsMap.has(date)) oddsMap.set(date, new Map());
        const dateMap = oddsMap.get(date)!;

        if (!dateMap.has(venueKey)) dateMap.set(venueKey, new Map());
        const venueMap = dateMap.get(venueKey)!;

        if (!venueMap.has(raceNumber)) venueMap.set(raceNumber, new Map());
        const raceMap = venueMap.get(raceNumber)!;

        raceMap.set(normaliseKey(runner.name), {
          winOdds: Math.round(winOdds * 100) / 100,
          placeOdds: Math.round(placeOdds * 100) / 100,
        });
      }
    }
  }

  return oddsMap;
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const agent = getProxyAgent();

  try {
    const resp = await nodeFetch(url, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      signal: controller.signal as any,
      agent: agent ?? undefined,
      headers: {
        // Use */* to avoid triggering content-type negotiation that some
        // Ladbrokes API versions reject ("unsupported content-type").
        Accept: "*/*",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      },
    });

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status} from ${url}`);
    }

    return await resp.json();
  } finally {
    clearTimeout(timer);
  }
}

// ── Fetcher ───────────────────────────────────────────────────────────────────

/**
 * Fetch all Ladbrokes fixed-odds prices for thoroughbred races on `date`.
 *
 * When the overview endpoint doesn't embed runners in the meeting list,
 * this function falls back to fetching individual event-card responses per
 * race (common on the Ladbrokes feed when markets are not yet open).
 *
 * Returns an empty map (never throws) so the caller can silently fall back to
 * showing "—" for Ladbrokes columns when the feed is unavailable.
 */
export async function fetchLadbrokesOdds(date: string): Promise<LadbrokesOddsMap> {
  // Step 1 — fetch the daily racing overview
  const overviewUrl = `${LADS_BASE}/racing-overview?date=${date}&type=R`;
  let overviewRaw: LadbrokesOverviewResponse;

  try {
    overviewRaw = (await fetchJson(overviewUrl)) as LadbrokesOverviewResponse;
  } catch (err) {
    logger.warn({ date, err }, "Ladbrokes: failed to fetch racing overview — skipping Ladbrokes odds");
    return new Map();
  }

  // Step 2 — if individual races lack embedded runners, fetch event cards
  const overview = await fillEventCards(overviewRaw);

  const oddsMap = parseLadbrokesOverview(date, overview);

  const dateEntry = oddsMap.get(date);
  logger.info(
    { date, venuesWithOdds: dateEntry?.size ?? 0 },
    "Ladbrokes: odds fetched"
  );
  return oddsMap;
}

/**
 * For each race in the overview that has no embedded runners, fetch the
 * event-card endpoint and populate runners before parsing.
 *
 * Mutations are applied to a shallow copy of the meeting/race arrays to
 * keep the function free of reference aliasing.
 */
async function fillEventCards(
  overview: LadbrokesOverviewResponse
): Promise<LadbrokesOverviewResponse> {
  const meetings: LadbrokesMeeting[] = [];

  for (const meeting of overview.meetings ?? []) {
    if (meeting.race_type && meeting.race_type !== "R") {
      meetings.push(meeting);
      continue;
    }

    const races: LadbrokesRace[] = [];
    for (const race of meeting.races ?? []) {
      if ((race.runners ?? []).length > 0 || !race.id) {
        races.push(race);
        continue;
      }

      try {
        const card = (await fetchJson(
          `${LADS_BASE}/event-card?id=${race.id}`
        )) as { runners?: LadbrokesRunner[] };
        races.push({ ...race, runners: card.runners ?? [] });
      } catch (err) {
        logger.debug(
          { raceId: race.id, err },
          "Ladbrokes: failed to fetch event card — skipping race"
        );
        races.push(race); // keep the race without runners; parser will skip it
      }
    }

    meetings.push({ ...meeting, races });
  }

  return { ...overview, meetings };
}
