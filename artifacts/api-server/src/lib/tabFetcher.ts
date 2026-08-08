/**
 * TAB Australia public API fetcher.
 *
 * The TAB API (api.tab.com.au) is a public, unauthenticated endpoint that
 * returns live race cards for Australian thoroughbred meetings.  It is
 * geo-restricted to Australian IP addresses, so in non-AU environments the
 * fetch will fail and the caller must fall back to mock data.
 *
 * Endpoint pattern:
 *   GET https://api.tab.com.au/v1/tab-info-service/racing/dates/{YYYY-MM-DD}/meetings?jurisdiction={VIC|NSW}
 *
 * Speed-map position is not available in the TAB feed; we derive a
 * deterministic estimate from the barrier number (a well-known proxy for
 * on-pace tendency in Australian racing).
 */

import { logger } from "./logger";

const TAB_BASE = "https://api.tab.com.au/v1/tab-info-service";
const FETCH_TIMEOUT_MS = 15_000;

// ── TAB API response types ──────────────────────────────────────────────────

interface TabFixedOdds {
  returnWin?: number;
  returnPlace?: number;
  isSuspended?: boolean;
}

interface TabRunner {
  runnerNumber: number;
  runnerName: string;
  barrierNumber?: number;
  jockeyName?: string;
  trainerName?: string;
  fixedOdds?: TabFixedOdds;
  /** scratched runners should be skipped */
  isScratched?: boolean;
}

interface TabRace {
  raceNumber: number;
  raceName?: string;
  raceStartTime?: string;
  raceDistance?: number;
  numberOfRunners?: number;
  runners?: TabRunner[];
}

interface TabMeeting {
  venueName: string;
  venueState?: string;
  meetingDate?: string;
  /** R = thoroughbred, G = greyhound, H = harness */
  raceType?: string;
  races?: TabRace[];
}

interface TabMeetingsResponse {
  meetings?: TabMeeting[];
}

// ── Normalised output types (what sync.ts works with) ──────────────────────

export type SpeedMapPosition = "Lead" | "On-Pace" | "Handy" | "Midfield" | "Back-Marker";

export interface LiveRunner {
  horseName: string;
  barrierNumber: number;
  speedMapPosition: SpeedMapPosition;
  winOdds: number;
  placeOdds: number;
  jockey: string;
  trainer: string;
}

export interface LiveRace {
  raceNumber: number;
  raceName: string;
  raceDate: string;       // YYYY-MM-DD
  raceTime: string;       // HH:MM  (local AEST)
  fieldSize: number;
  distance: number;
  runners: LiveRunner[];
}

export interface LiveMeeting {
  venueName: string;
  venueState: string;
  races: LiveRace[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Derive a deterministic speed-map position from the barrier number.
 * Inside barriers tend to get better sectionals and lead / on-pace roles.
 */
function barrierToSpeedMap(barrier: number): SpeedMapPosition {
  if (barrier <= 2) return "Lead";
  if (barrier <= 4) return "On-Pace";
  if (barrier <= 6) return "Handy";
  if (barrier <= 10) return "Midfield";
  return "Back-Marker";
}

const SYD_TZ = "Australia/Sydney";

/**
 * Parse an ISO-8601 race start time into a local Sydney "HH:MM" string.
 * Uses Intl.DateTimeFormat so it correctly handles both AEST (UTC+10) and
 * AEDT (UTC+11) during Australian daylight saving.
 */
function parseRaceTime(isoTime?: string): string {
  if (!isoTime) return "12:00";
  try {
    const d = new Date(isoTime);
    const parts = new Intl.DateTimeFormat("en-AU", {
      timeZone: SYD_TZ,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(d);
    const hh = parts.find((p) => p.type === "hour")?.value ?? "12";
    const mm = parts.find((p) => p.type === "minute")?.value ?? "00";
    // Intl hour12:false can return "24" for midnight; normalise to "00"
    return `${hh === "24" ? "00" : hh}:${mm}`;
  } catch {
    return "12:00";
  }
}

/**
 * Return an array of YYYY-MM-DD strings for the next `count` days in
 * Sydney local time.  Using Sydney time avoids selecting the wrong racing
 * date around the UTC day boundary (e.g. 22:00–00:00 UTC is already
 * "tomorrow" in Sydney during AEST).
 */
export function getSydneyDateStrings(count: number): string[] {
  const dates: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    // en-CA locale formats as YYYY-MM-DD
    const dateStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: SYD_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
    dates.push(dateStr);
  }
  return dates;
}

/** Strip (AUS) suffixes and normalise whitespace from horse names. */
function normaliseName(raw: string): string {
  return raw.replace(/\s*\(.*?\)\s*$/, "").trim();
}

// ── Fetcher ─────────────────────────────────────────────────────────────────

/**
 * Fetch all thoroughbred meetings for the given date and jurisdiction from
 * the TAB public API.
 *
 * Throws on network/parse failure so the caller can catch and fall back.
 */
async function fetchMeetingsForJurisdiction(
  date: string,
  jurisdiction: string
): Promise<LiveMeeting[]> {
  const url = `${TAB_BASE}/racing/dates/${date}/meetings?jurisdiction=${jurisdiction}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let resp: Response;
  try {
    resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "AussieHorseWin/1.0 (+https://github.com/)",
      },
    });
  } finally {
    clearTimeout(timer);
  }

  if (!resp.ok) {
    throw new Error(`TAB API ${jurisdiction} returned HTTP ${resp.status}`);
  }

  const data = (await resp.json()) as TabMeetingsResponse;
  const meetings: LiveMeeting[] = [];

  for (const meeting of data.meetings ?? []) {
    // Only thoroughbred racing
    if (meeting.raceType && meeting.raceType !== "R") continue;

    const venueName = meeting.venueName ?? "Unknown";
    const venueState = meeting.venueState ?? jurisdiction;
    const meetingDate = meeting.meetingDate ?? date;

    const races: LiveRace[] = [];

    for (const race of meeting.races ?? []) {
      const runners: LiveRunner[] = [];

      for (const r of race.runners ?? []) {
        if (r.isScratched) continue;

        const winOdds = r.fixedOdds?.returnWin;
        const placeOdds = r.fixedOdds?.returnPlace;

        // Skip runners without tradeable fixed odds
        if (
          !winOdds ||
          !placeOdds ||
          r.fixedOdds?.isSuspended ||
          winOdds <= 0 ||
          placeOdds <= 0
        ) continue;

        const barrier = r.barrierNumber ?? r.runnerNumber;

        runners.push({
          horseName: normaliseName(r.runnerName),
          barrierNumber: barrier,
          speedMapPosition: barrierToSpeedMap(barrier),
          winOdds: Math.round(winOdds * 100) / 100,
          placeOdds: Math.round(placeOdds * 100) / 100,
          jockey: r.jockeyName ?? "Unknown",
          trainer: r.trainerName ?? "Unknown",
        });
      }

      if (runners.length === 0) continue;

      races.push({
        raceNumber: race.raceNumber,
        raceName: race.raceName ?? `Race ${race.raceNumber}`,
        raceDate: meetingDate,
        raceTime: parseRaceTime(race.raceStartTime),
        fieldSize: runners.length,
        distance: race.raceDistance ?? 1200,
        runners,
      });
    }

    if (races.length > 0) {
      meetings.push({ venueName, venueState, races });
    }
  }

  return meetings;
}

/**
 * Fetch live race cards for all requested dates and jurisdictions.
 *
 * Returns `{ meetings, source: "live" }` on success, or rethrows so the
 * caller can fall back to mock data.
 *
 * @param dates     Array of YYYY-MM-DD strings to fetch
 * @param states    Array of state codes present in enabled tracks (e.g. ["VIC", "NSW"])
 */
export async function fetchLiveRaceCards(
  dates: string[],
  states: string[]
): Promise<{ meetings: LiveMeeting[]; source: "live" }> {
  // Deduplicate jurisdictions — TAB uses the state code directly
  const jurisdictions = [...new Set(states)].filter((s) =>
    ["VIC", "NSW", "QLD", "SA", "WA", "TAS", "ACT", "NT"].includes(s)
  );

  if (jurisdictions.length === 0) {
    throw new Error("No supported jurisdictions found in enabled tracks");
  }

  const all: LiveMeeting[] = [];

  for (const date of dates) {
    for (const jur of jurisdictions) {
      try {
        const meetings = await fetchMeetingsForJurisdiction(date, jur);
        all.push(...meetings);
        logger.info(
          { date, jurisdiction: jur, count: meetings.length },
          "TAB: fetched meetings"
        );
      } catch (err) {
        // A single date/jurisdiction failing should not abort everything
        logger.warn(
          { date, jurisdiction: jur, err },
          "TAB: failed to fetch meetings for date/jurisdiction"
        );
        throw err; // re-throw so the outer layer can decide to fall back
      }
    }
  }

  return { meetings: all, source: "live" };
}
