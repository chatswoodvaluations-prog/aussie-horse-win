import { Router } from "express";
import { TriggerSyncResponse } from "@workspace/api-zod";
import { runSelectionEngine, getSettings } from "../lib/selectionEngine";
import { db, tracksTable, racesTable, runnersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

// Mock race data generator — creates realistic-looking upcoming race cards
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
    name = randomElement(HORSE_NAMES) + (Math.random() > 0.7 ? ` ${["II", "III", "Star", "Boy", "Girl", "King", "Queen"][Math.floor(Math.random() * 7)]}` : "");
  } while (used.has(name));
  used.add(name);
  return name;
}

router.post("/sync", async (req, res): Promise<void> => {
  logger.info("Starting data sync");

  const settings = await getSettings();
  const tracks = await db.select().from(tracksTable).where(eq(tracksTable.enabled, true));

  if (tracks.length === 0) {
    res.json(TriggerSyncResponse.parse({
      racesFound: 0,
      racesAdded: 0,
      runnersAdded: 0,
      nominationsGenerated: 0,
      message: "No enabled tracks found",
    }));
    return;
  }

  let racesAdded = 0;
  let runnersAdded = 0;

  // Generate race cards for the next 7 days for each enabled track
  const today = new Date();
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().split("T")[0]);
  }

  for (const track of tracks) {
    for (const date of dates) {
      // Check if we already have races for this track + date
      const existing = await db.select().from(racesTable)
        .where(eq(racesTable.trackId, track.id));
      const existingForDate = existing.filter((r) => r.raceDate === date);

      if (existingForDate.length > 0) continue;

      // Generate 5-8 races per meeting
      const numRaces = Math.floor(Math.random() * 4) + 5;
      for (let raceNum = 1; raceNum <= numRaces; raceNum++) {
        // Field size between 6 and 14 (varied to test filters)
        const fieldSize = Math.floor(Math.random() * 9) + 6;
        const distance = [1000, 1100, 1200, 1300, 1400, 1600, 1800, 2000, 2400][Math.floor(Math.random() * 9)];
        const hour = 11 + Math.floor(raceNum * 35 / 60);
        const minute = (raceNum * 35) % 60;
        const raceTime = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;

        const [insertedRace] = await db.insert(racesTable).values({
          trackId: track.id,
          trackName: track.name,
          state: track.state,
          raceNumber: raceNum,
          raceName: `Race ${raceNum} - ${distance}m`,
          raceDate: date,
          raceTime,
          fieldSize,
          distance,
        }).returning();

        racesAdded++;

        // Generate runners
        const usedNames = new Set<string>();
        for (let barrier = 1; barrier <= fieldSize; barrier++) {
          const speedIdx = Math.floor(Math.random() * SPEED_POSITIONS.length);
          const speedPos = SPEED_POSITIONS[speedIdx];

          // Varied odds: some in range, some outside to test filters
          const winOdds = randomBetween(2.5, 15.0);
          // Place odds typically 25-35% of win odds
          const placeOdds = parseFloat((winOdds * randomBetween(0.25, 0.38)).toFixed(2));

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

  // Run selection engine to evaluate and generate nominations
  const engineResult = await runSelectionEngine();

  const result = {
    racesFound: engineResult.racesFound + racesAdded,
    racesAdded,
    runnersAdded,
    nominationsGenerated: engineResult.nominationsGenerated,
    message: `Sync complete. Added ${racesAdded} races and ${runnersAdded} runners. Generated ${engineResult.nominationsGenerated} new nominations.`,
  };

  logger.info(result, "Sync completed");
  res.json(TriggerSyncResponse.parse(result));
});

export default router;
