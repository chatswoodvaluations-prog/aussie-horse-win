import { Router } from "express";
import { TriggerSyncResponse } from "@workspace/api-zod";
import { runSelectionEngine, getSettings } from "../lib/selectionEngine";
import { db, tracksTable, racesTable, runnersTable, nominationsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { fetchLiveRaceCards, getSydneyDateStrings, type LiveMeeting } from "../lib/tabFetcher";
import { fetchLiveRaceCardsFromLadbrokes, fetchLadbrokesOdds, normaliseKey as normaliseForLadbrokes, type LadbrokesOddsMap } from "../lib/ladbrokesFetcher";
import { sendNominationAlert, type NominationSummaryRow } from "../lib/emailService";
import { upsertRaceRunners, makeDrizzleUpsertDb } from "../lib/raceUpsert";

const router = Router();

// ── Mock data generator (fallback) ──────────────────────────────────────────

const SPEED_POSITIONS = ["Lead", "On-Pace", "Handy", "Midfield", "Back-Marker"] as const;
const JOCKEYS = [
  "Craig Williams", "Damian Lane", "Mark Zahra", "John Allen",
  "Jye McNeil", "Blake Shinn", "Hugh Bowman", "James McDonald",
  "Tommy Berry", "Nash Rawiller", "Zac Purton", "Kerrin McEvoy",
  "Tim Clark", "Jason Collett", "Glyn Schofield", "Brenton Avdulla",
];
const TRAINERS = [
  "Gai Waterhouse", "Adrian Bott", "Chris Waller", "Peter Moody",
  "David Hayes", "Ben Hayes", "Tom Dabernig", "Ciaron Maher",
  "Michael Moroney", "Danny O'Brien", "Tony McEvoy", "Simon Miller",
  "Matthew Dunn", "Mark Newnham", "Joe Pride", "Gerald Ryan",
];

const HORSE_NAMES = [
  "Thunderbolt", "Silver Streak", "Golden Arrow", "Iron Duke",
  "Pacific Storm", "Desert Rose", "Red Ember", "Morning Glory",
  "Night Hawk", "Blue Horizon", "Steel Warrior", "Crimson Tide",
  "Wild Spirit", "Shadow Run", "Storm Chaser", "Bright Star",
  "Dark Knight", "River Queen", "Blazing Sun", "Ocean Drift",
  "Autumn Wind", "Spring Dancer", "Winter Dream", "Summer Blaze",
  "Rapid Fire", "Lucky Strike", "Northern Light", "Southern Cross",
  "Eagle Eye", "Swift Arrow", "Galloping Ghost", "Mighty Oak",
  "Celtic Spirit", "Dublin Rose", "Shannon's Pride", "Emerald Isle",
  "Outback Sun", "Dusty Trail", "Bush Telegraph", "Red Dirt",
  "Coral Queen", "Reef Runner", "Lagoon Blue", "Tropic Star",
  "Granite Peak", "Blue Mountain", "Valley View", "Ridge Rider",
];

function randomBetween(min: number, max: number, decimals = 2) {
  const val = Math.random() * (max - min) + min;
  return parseFloat(val.toFixed(decimals));
}

function randomElement<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomHorseName(used: Set<string>): string {
  let name: string;
  do {
    name =
      randomElement(HORSE_NAMES) +
      (Math.random() > 0.7
        ? ` ${["II", "III", "Star", "Boy", "Girl", "King", "Queen"][Math.floor(Math.random() * 7)]}`
        : "");
  } while (used.has(name));
  used.add(name);
  return name;
}

// ── Live-data insertion helper ───────────────────────────────────────────────

/**
 * Normalise a venue name from the TAB API to match our track names.
 * TAB uses names like "Flemington" while our seed uses "Flemington" too,
 * so this is mostly a trim/case guard.
 */
function normalisedMatch(tabName: string, trackName: string): boolean {
  return (
    tabName.trim().toLowerCase() === trackName.trim().toLowerCase()
  );
}

async function insertLiveRaceCards(
  meetings: LiveMeeting[],
  tracks: { id: number; name: string; state: string }[]
): Promise<{ racesAdded: number; runnersAdded: number; runnersUpdated: number }> {
  let racesAdded = 0;
  let runnersAdded = 0;
  let runnersUpdated = 0;

  for (const meeting of meetings) {
    // Find the matching track in our database
    const track = tracks.find(
      (t) =>
        normalisedMatch(meeting.venueName, t.name) &&
        t.state === meeting.venueState
    );

    if (!track) {
      logger.debug(
        { venue: meeting.venueName, state: meeting.venueState },
        "Live sync: no matching enabled track, skipping meeting"
      );
      continue;
    }

    for (const race of meeting.races) {
      // Check whether we already have this race
      const existingRaces = await db
        .select()
        .from(racesTable)
        .where(
          and(
            eq(racesTable.trackId, track.id),
            eq(racesTable.raceDate, race.raceDate),
            eq(racesTable.raceNumber, race.raceNumber)
          )
        );

      let raceId: number;

      if (existingRaces.length > 0) {
        // Race already exists — update odds in-place so the selection engine
        // can re-evaluate with fresh market prices.  Runner IDs are preserved
        // so historical nominations (Won/Placed/Unplaced) remain linked.
        raceId = existingRaces[0].id;

        // Update race-level metadata (time, distance, field size) from TAB
        await db
          .update(racesTable)
          .set({
            raceName: race.raceName,
            raceTime: race.raceTime,
            fieldSize: race.fieldSize,
            distance: race.distance,
            dataSource: "live",
          })
          .where(eq(racesTable.id, raceId));

        // Upsert runners using the extracted, testable logic.
        // Runner IDs are preserved across odds refreshes so settled nominations
        // (Won/Placed/Unplaced) remain correctly linked to their runner rows.
        const upsertCounts = await upsertRaceRunners(
          raceId,
          race.runners,
          makeDrizzleUpsertDb()
        );
        runnersAdded += upsertCounts.runnersAdded;
        runnersUpdated += upsertCounts.runnersUpdated;
      } else {
        // New race — insert race record and all runners
        const [insertedRace] = await db
          .insert(racesTable)
          .values({
            trackId: track.id,
            trackName: track.name,
            state: track.state,
            raceNumber: race.raceNumber,
            raceName: race.raceName,
            raceDate: race.raceDate,
            raceTime: race.raceTime,
            fieldSize: race.fieldSize,
            distance: race.distance,
            dataSource: "live",
          })
          .returning();

        racesAdded++;
        raceId = insertedRace.id;

        for (const runner of race.runners) {
          await db.insert(runnersTable).values({
            raceId,
            horseName: runner.horseName,
            barrierNumber: runner.barrierNumber,
            speedMapPosition: runner.speedMapPosition,
            winOdds: runner.winOdds,
            placeOdds: runner.placeOdds,
            jockey: runner.jockey,
            trainer: runner.trainer,
            passed: false,
            filterResults: "[]",
          });
          runnersAdded++;
        }
      }
    }
  }

  return { racesAdded, runnersAdded, runnersUpdated };
}

// ── Mock-data insertion (fallback) ───────────────────────────────────────────

async function insertMockRaceCards(
  tracks: { id: number; name: string; state: string }[],
  dates: string[]
): Promise<{ racesAdded: number; runnersAdded: number }> {
  let racesAdded = 0;
  let runnersAdded = 0;

  for (const track of tracks) {
    for (const date of dates) {
      const existing = await db
        .select()
        .from(racesTable)
        .where(eq(racesTable.trackId, track.id));
      const existingForDate = existing.filter((r) => r.raceDate === date);
      if (existingForDate.length > 0) continue;

      const numRaces = Math.floor(Math.random() * 4) + 5;
      for (let raceNum = 1; raceNum <= numRaces; raceNum++) {
        const fieldSize = Math.floor(Math.random() * 9) + 6;
        const distance = [1000, 1100, 1200, 1300, 1400, 1600, 1800, 2000, 2400][
          Math.floor(Math.random() * 9)
        ];
        const hour = 11 + Math.floor((raceNum * 35) / 60);
        const minute = (raceNum * 35) % 60;
        const raceTime = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;

        const [insertedRace] = await db
          .insert(racesTable)
          .values({
            trackId: track.id,
            trackName: track.name,
            state: track.state,
            raceNumber: raceNum,
            raceName: `Race ${raceNum} - ${distance}m`,
            raceDate: date,
            raceTime,
            fieldSize,
            distance,
            dataSource: "mock",
          })
          .returning();

        racesAdded++;

        const usedNames = new Set<string>();
        for (let barrier = 1; barrier <= fieldSize; barrier++) {
          const speedIdx = Math.floor(Math.random() * SPEED_POSITIONS.length);
          const speedPos = SPEED_POSITIONS[speedIdx];
          const winOdds = randomBetween(2.5, 15.0);
          const placeOdds = parseFloat(
            (winOdds * randomBetween(0.25, 0.38)).toFixed(2)
          );

          await db.insert(runnersTable).values({
            raceId: insertedRace.id,
            horseName: randomHorseName(usedNames),
            barrierNumber: barrier,
            speedMapPosition: speedPos,
            winOdds,
            placeOdds,
            jockey: randomElement(JOCKEYS),
            trainer: randomElement(TRAINERS),
            passed: false,
            filterResults: "[]",
          });
          runnersAdded++;
        }
      }
    }
  }

  return { racesAdded, runnersAdded };
}

// ── Ladbrokes odds applicator ────────────────────────────────────────────────

/**
 * Apply Ladbrokes odds to runner rows and keep any existing pending nominations
 * in sync.  Uses the race date when looking up the Ladbrokes map so identical
 * race numbers at the same venue on different days never collide.
 *
 * Only pending nominations are updated — settled records (Won/Placed/Unplaced)
 * preserve the prices that were live at bet-time.
 */
async function applyLadbrokesOdds(
  ladbrokesMap: LadbrokesOddsMap,
  tracks: { id: number; name: string; state: string }[]
): Promise<void> {
  let runnersUpdated = 0;
  let nominationsUpdated = 0;

  const allRaces = await db.select().from(racesTable);

  for (const race of allRaces) {
    const track = tracks.find((t) => t.id === race.trackId);
    if (!track) continue;

    // Use the same normaliseKey function as the fetcher so suffix/case variation
    // in TAB venue names matches Ladbrokes venue names consistently.
    const venueKey = normaliseForLadbrokes(track.name);
    // Use raceDate as the outer key to avoid cross-date collisions
    const raceMap = ladbrokesMap.get(race.raceDate)?.get(venueKey)?.get(race.raceNumber);
    if (!raceMap) continue;

    const runners = await db
      .select()
      .from(runnersTable)
      .where(eq(runnersTable.raceId, race.id));

    for (const runner of runners) {
      // Use the same normaliser as the Ladbrokes fetcher so that suffix
      // variations like "(AUS)" are stripped before comparison.
      const horseKey = normaliseForLadbrokes(runner.horseName);
      const ladsOdds = raceMap.get(horseKey);

      if (!ladsOdds) continue;

      // Update the runner row
      await db
        .update(runnersTable)
        .set({
          ladbrokesWinOdds: ladsOdds.winOdds,
          ladbrokesPlaceOdds: ladsOdds.placeOdds,
        })
        .where(eq(runnersTable.id, runner.id));
      runnersUpdated++;

      // Also update any *pending* nominations linked to this runner so the
      // card immediately shows the fresh price.  Settled records are untouched
      // so historical P&L calculations remain accurate.
      const pendingNoms = await db
        .select()
        .from(nominationsTable)
        .where(
          and(
            eq(nominationsTable.runnerId, runner.id),
            eq(nominationsTable.status, "Pending")
          )
        );

      for (const nom of pendingNoms) {
        await db
          .update(nominationsTable)
          .set({
            ladbrokesWinOdds: ladsOdds.winOdds,
            ladbrokesPlaceOdds: ladsOdds.placeOdds,
          })
          .where(eq(nominationsTable.id, nom.id));
        nominationsUpdated++;
      }
    }
  }

  logger.info(
    { runnersUpdated, nominationsUpdated },
    "Sync: Ladbrokes odds applied to runners and pending nominations"
  );
}

// ── Route ────────────────────────────────────────────────────────────────────

router.post("/sync", async (req, res): Promise<void> => {
  logger.info("Starting data sync");

  const settings = await getSettings();
  const tracks = await db
    .select()
    .from(tracksTable)
    .where(eq(tracksTable.enabled, true));

  if (tracks.length === 0) {
    res.json(
      TriggerSyncResponse.parse({
        racesFound: 0,
        racesAdded: 0,
        runnersAdded: 0,
        nominationsGenerated: 0,
        message: "No enabled tracks found",
      })
    );
    return;
  }

  // Build the date window: today + next 6 days in Sydney local time.
  // Using Sydney time avoids selecting the wrong date around the UTC day boundary
  // (22:00–00:00 UTC is already "tomorrow" in Sydney during AEST).
  const dates = getSydneyDateStrings(7);

  let racesAdded = 0;
  let runnersAdded = 0;
  let dataSource: "live" | "ladbrokes" | "mock" = "mock";
  let liveError: string | undefined;

  // ── Attempt live TAB data ──────────────────────────────────────────────────
  const states = [...new Set(tracks.map((t) => t.state))];

  try {
    const { meetings } = await fetchLiveRaceCards(dates, states);
    const counts = await insertLiveRaceCards(meetings, tracks);
    racesAdded = counts.racesAdded;
    runnersAdded = counts.runnersAdded;
    dataSource = "live";
    logger.info(
      { racesAdded, runnersAdded, runnersUpdated: counts.runnersUpdated },
      "Sync: live TAB data inserted successfully"
    );
  } catch (tabErr) {
    // ── TAB failed — try Ladbrokes as primary source ───────────────────────
    const tabErrMsg = tabErr instanceof Error ? tabErr.message : String(tabErr);
    logger.warn({ err: tabErr }, "Sync: TAB fetch failed — trying Ladbrokes");

    try {
      const { meetings } = await fetchLiveRaceCardsFromLadbrokes(dates, states);
      const counts = await insertLiveRaceCards(meetings, tracks);
      racesAdded = counts.racesAdded;
      runnersAdded = counts.runnersAdded;
      dataSource = "ladbrokes";
      logger.info(
        { racesAdded, runnersAdded, runnersUpdated: counts.runnersUpdated },
        "Sync: Ladbrokes data inserted successfully"
      );
    } catch (ladsErr) {
      // ── Both live sources failed — fall back to mock ─────────────────────
      liveError = `TAB: ${tabErrMsg} | Ladbrokes: ${ladsErr instanceof Error ? ladsErr.message : String(ladsErr)}`;
      logger.warn({ tabErr, ladsErr }, "Sync: both live sources failed — falling back to mock");
      const counts = await insertMockRaceCards(tracks, dates);
      racesAdded = counts.racesAdded;
      runnersAdded = counts.runnersAdded;
      dataSource = "mock";
    }
  }

  // ── Fetch and store Ladbrokes odds (best-effort, bounded 30 s total) ────────
  // All dates are fetched in parallel. The entire Ladbrokes enrichment — fetch
  // + apply — must complete within LADBROKES_BUDGET_MS or it is aborted so the
  // selection engine is never delayed by an unresponsive odds feed.
  const LADBROKES_BUDGET_MS = 30_000;

  await Promise.race([
    // Actual work — parallel fetch across all dates
    (async () => {
      try {
        const results = await Promise.allSettled(
          dates.map((date) => fetchLadbrokesOdds(date))
        );

        // Merge successful day-maps; log and skip any that rejected.
        const combinedLadbrokesMap: LadbrokesOddsMap = new Map();
        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          if (result.status === "rejected") {
            logger.warn(
              { date: dates[i], err: result.reason },
              "Sync: Ladbrokes odds fetch failed for date — skipping"
            );
            continue;
          }
          for (const [dateKey, venueMap] of result.value) {
            if (!combinedLadbrokesMap.has(dateKey)) {
              combinedLadbrokesMap.set(dateKey, new Map());
            }
            const combined = combinedLadbrokesMap.get(dateKey)!;
            for (const [venue, racesMap] of venueMap) {
              combined.set(venue, racesMap);
            }
          }
        }

        if (combinedLadbrokesMap.size > 0) {
          await applyLadbrokesOdds(combinedLadbrokesMap, tracks);
        }
      } catch (err) {
        logger.warn({ err }, "Sync: Ladbrokes enrichment failed — prices will show as unavailable");
      }
    })(),

    // Hard deadline — resolves (not rejects) after budget expires so sync
    // always continues to the selection engine regardless of Ladbrokes health.
    new Promise<void>((resolve) =>
      setTimeout(() => {
        logger.warn(
          { budgetMs: LADBROKES_BUDGET_MS },
          "Sync: Ladbrokes budget exceeded — proceeding without Ladbrokes prices"
        );
        resolve();
      }, LADBROKES_BUDGET_MS)
    ),
  ]);

  // Run the selection engine regardless of data source
  const engineResult = await runSelectionEngine();

  // ── Email alert ─────────────────────────────────────────────────────────
  // Pull the full settings row to get notificationEmail and staking values.
  const settingsRow = await db.select().from(
    (await import("@workspace/db")).settingsTable
  ).limit(1);

  if (engineResult.nominationsGenerated > 0 && settingsRow.length > 0 && settingsRow[0].notificationEmail) {
    // Fetch the newly-created nominations with their race/runner details
    const { nominationsTable: nomTable, runnersTable: runTable, racesTable: raceTable } =
      await import("@workspace/db");
    const { eq: eqOp, and: andOp } = await import("drizzle-orm");

    const newNominations = await db
      .select({
        nominationId: nomTable.id,
        horseName: runTable.horseName,
        barrierNumber: runTable.barrierNumber,
        winOdds: runTable.winOdds,
        placeOdds: runTable.placeOdds,
        trackName: raceTable.trackName,
        raceNumber: raceTable.raceNumber,
        raceName: raceTable.raceName,
        raceDate: raceTable.raceDate,
        raceTime: raceTable.raceTime,
      })
      .from(nomTable)
      .innerJoin(runTable, eqOp(nomTable.runnerId, runTable.id))
      .innerJoin(raceTable, eqOp(runTable.raceId, raceTable.id))
      .where(eqOp(nomTable.status, "Pending"))
      .orderBy(raceTable.raceDate, raceTable.raceTime);

    // Only send for nominations created in this sync (latest ones)
    // We limit to the count the engine reported to avoid re-alerting old ones
    const toAlert = newNominations.slice(0, engineResult.nominationsGenerated);

    const summaryRows: NominationSummaryRow[] = toAlert.map((n) => ({
      track: n.trackName,
      raceNumber: n.raceNumber,
      raceName: n.raceName ?? "",
      raceDate: n.raceDate,
      raceTime: n.raceTime ?? "",
      horseName: n.horseName,
      barrierNumber: n.barrierNumber,
      winOdds: n.winOdds,
      placeOdds: n.placeOdds,
      winStake: settingsRow[0].winStake,
      placeStake: settingsRow[0].placeStake,
    }));

    // Fire-and-forget — don't await to keep the sync response fast
    sendNominationAlert(settingsRow[0].notificationEmail, summaryRows).catch((err) =>
      logger.error({ err }, "Unhandled error in sendNominationAlert")
    );
  }

  const result = {
    racesFound: engineResult.racesFound + racesAdded,
    racesAdded,
    runnersAdded,
    nominationsGenerated: engineResult.nominationsGenerated,
    nominationsRepriced: engineResult.nominationsRepriced,
    message: `Sync complete (source: ${dataSource}). Added ${racesAdded} races and ${runnersAdded} runners. Generated ${engineResult.nominationsGenerated} new nominations. Repriced ${engineResult.nominationsRepriced} pending nominations.`,
    ...(liveError ? { liveError } : {}),
  };

  logger.info(result, "Sync completed");
  res.json(TriggerSyncResponse.parse(result));
});

export default router;
