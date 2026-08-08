import { Router } from "express";
import { TriggerSyncResponse } from "@workspace/api-zod";
import { runSelectionEngine, getSettings } from "../lib/selectionEngine";
import { db, tracksTable, racesTable, runnersTable, nominationsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { fetchLiveRaceCards, getSydneyDateStrings, type LiveMeeting } from "../lib/tabFetcher";

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
        // Race already exists (possibly seeded with mock data).
        // Replace it completely: delete all current runners and re-insert the
        // authoritative TAB runner set.  This prevents mock horse names / odds
        // from persisting alongside live market data.
        raceId = existingRaces[0].id;

        // Update race-level metadata (time, distance, field size) from TAB
        await db
          .update(racesTable)
          .set({
            raceName: race.raceName,
            raceTime: race.raceTime,
            fieldSize: race.fieldSize,
            distance: race.distance,
          })
          .where(eq(racesTable.id, raceId));

        // Remove pending nominations that reference the soon-to-be-deleted runners.
        // Historical records (Won, Placed, Unplaced) are preserved — they represent
        // completed bets and must not be discarded.
        const staleRunners = await db
          .select()
          .from(runnersTable)
          .where(eq(runnersTable.raceId, raceId));
        for (const staleRunner of staleRunners) {
          await db
            .delete(nominationsTable)
            .where(
              and(
                eq(nominationsTable.runnerId, staleRunner.id),
                eq(nominationsTable.status, "Pending")
              )
            );
        }

        // Remove all existing runners for this race
        await db.delete(runnersTable).where(eq(runnersTable.raceId, raceId));

        // Insert the real TAB runners
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
          runnersUpdated++;
        }
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

// ── Route ────────────────────────────────────────────────────────────────────

router.post("/sync", async (req, res): Promise<void> => {
  logger.info("Starting data sync");

  await getSettings();
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
  let dataSource: "live" | "mock" = "mock";

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
  } catch (err) {
    // ── Fall back to mock generator ──────────────────────────────────────────
    logger.warn(
      { err },
      "Sync: TAB live fetch failed — falling back to mock data generator"
    );
    const counts = await insertMockRaceCards(tracks, dates);
    racesAdded = counts.racesAdded;
    runnersAdded = counts.runnersAdded;
    dataSource = "mock";
  }

  // Run the selection engine regardless of data source
  const engineResult = await runSelectionEngine();

  const result = {
    racesFound: engineResult.racesFound + racesAdded,
    racesAdded,
    runnersAdded,
    nominationsGenerated: engineResult.nominationsGenerated,
    message: `Sync complete (source: ${dataSource}). Added ${racesAdded} races and ${runnersAdded} runners. Generated ${engineResult.nominationsGenerated} new nominations.`,
  };

  logger.info(result, "Sync completed");
  res.json(TriggerSyncResponse.parse(result));
});

export default router;
