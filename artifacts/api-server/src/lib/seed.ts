import { db, tracksTable, settingsTable, racesTable, runnersTable, nominationsTable, betResultsTable } from "@workspace/db";
import { logger } from "./logger";
import { evaluateRunner, getSettings } from "./selectionEngine";

const TRACKS = [
  // Victoria
  { name: "Bendigo", state: "VIC", type: "Regional" },
  { name: "Geelong", state: "VIC", type: "Provincial" },
  { name: "Wangaratta", state: "VIC", type: "Regional" },
  { name: "Mildura", state: "VIC", type: "Regional" },
  { name: "Ballarat", state: "VIC", type: "Provincial" },
  { name: "Cranbourne", state: "VIC", type: "Provincial" },
  // New South Wales
  { name: "Wagga Wagga", state: "NSW", type: "Regional" },
  { name: "Dubbo", state: "NSW", type: "Regional" },
  { name: "Scone", state: "NSW", type: "Regional" },
  { name: "Albury", state: "NSW", type: "Regional" },
  { name: "Tamworth", state: "NSW", type: "Regional" },
  { name: "Hawkesbury", state: "NSW", type: "Provincial" },
];

const JOCKEYS = [
  "Craig Williams", "Damian Lane", "Mark Zahra", "John Allen",
  "Jye McNeil", "Blake Shinn", "Hugh Bowman", "James McDonald",
  "Tommy Berry", "Nash Rawiller", "Zac Purton", "Kerrin McEvoy",
];
const TRAINERS = [
  "Gai Waterhouse", "Chris Waller", "Peter Moody", "David Hayes",
  "Ciaron Maher", "Michael Moroney", "Tony McEvoy", "Mark Newnham",
];

const SPEED_POSITIONS = ["Lead", "On-Pace", "Handy", "Midfield", "Back-Marker"] as const;

function randomElement<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randomBetween(min: number, max: number, decimals = 2) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

const HORSE_NAMES = [
  "Thunderbolt", "Silver Streak", "Golden Arrow", "Iron Duke",
  "Pacific Storm", "Desert Rose", "Red Ember", "Morning Glory",
  "Night Hawk", "Blue Horizon", "Steel Warrior", "Crimson Tide",
  "Wild Spirit", "Shadow Run", "Storm Chaser", "Bright Star",
  "Dark Knight", "River Queen", "Blazing Sun", "Ocean Drift",
  "Autumn Wind", "Spring Dancer", "Winter Dream", "Summer Blaze",
  "Rapid Fire", "Lucky Strike", "Northern Light", "Southern Cross",
  "Eagle Eye", "Swift Arrow", "Galloping Ghost", "Mighty Oak",
  "Celtic Spirit", "Dublin Rose", "Shannon's Pride", "Outback Sun",
  "Dusty Trail", "Bush Telegraph", "Red Dirt King", "Coral Queen",
  "Reef Runner", "Lagoon Blue", "Tropic Star", "Granite Peak",
  "Blue Mountain", "Valley View", "Ridge Rider", "Sunset King",
  "Midnight Blue", "Desert Wind", "River Dancer", "Mountain Storm",
  "Golden Gate", "Silver Lining", "Bronze Medal", "Black Diamond",
  "White Lightning", "Green Machine", "Purple Rain", "Blue Moon",
  "Red Alert", "Orange Blossom", "Yellow Brick", "Pink Panther",
  "Copper Canyon", "Iron Fist", "Steel Blade", "Silver Fox",
  "Golden Fleece", "Diamond Dave", "Ruby Red", "Sapphire Sky",
  "Emerald Isle", "Turquoise Blue", "Jade Dragon", "Pearl Diver",
  "Opal Dreams", "Amber Alert", "Crystal Clear", "Obsidian Run",
];

export async function seed() {
  logger.info("Seeding database...");

  // Insert tracks
  const insertedTracks = await db.insert(tracksTable).values(TRACKS).returning();
  logger.info({ count: insertedTracks.length }, "Inserted tracks");

  // Insert default settings with all tracks enabled
  const allTrackIds = insertedTracks.map((t) => t.id);
  await db.insert(settingsTable).values({
    fieldSizeMin: 8,
    fieldSizeMax: 11,
    minWinOdds: 5.0,
    maxWinOdds: 10.0,
    minPlaceOdds: 1.85,
    winStake: 5.0,
    placeStake: 20.0,
    enabledTrackIds: JSON.stringify(allTrackIds),
  });
  logger.info("Inserted default settings");

  const settings = await getSettings();

  // Generate upcoming races (next 7 days) for first 4 tracks
  const today = new Date();
  let raceIdCounter = 0;
  const horseNames = [...HORSE_NAMES];

  for (const track of insertedTracks.slice(0, 4)) {
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const date = new Date(today);
      date.setDate(date.getDate() + dayOffset);
      const raceDate = date.toISOString().split("T")[0];

      const numRaces = Math.floor(Math.random() * 3) + 5; // 5-7 races per meeting
      for (let raceNum = 1; raceNum <= numRaces; raceNum++) {
        // Vary field sizes: ensure some are in 8-11 range
        const fieldSize = dayOffset < 3
          ? [8, 9, 10, 11, 7, 12][Math.floor(Math.random() * 6)]  // mix of valid/invalid
          : Math.floor(Math.random() * 9) + 6;

        const distance = [1100, 1200, 1300, 1400, 1600][Math.floor(Math.random() * 5)];
        const baseHour = 11;
        const minutes = baseHour * 60 + raceNum * 33;
        const hour = Math.floor(minutes / 60);
        const minute = minutes % 60;
        const raceTime = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;

        const [race] = await db.insert(racesTable).values({
          trackId: track.id,
          trackName: track.name,
          state: track.state,
          raceNumber: raceNum,
          raceName: `Race ${raceNum} - ${distance}m`,
          raceDate,
          raceTime,
          fieldSize,
          distance,
        }).returning();

        raceIdCounter++;

        // Generate runners
        const usedNames = new Set<string>();
        for (let barrier = 1; barrier <= fieldSize; barrier++) {
          let horseName: string;
          do {
            horseName = horseNames[Math.floor(Math.random() * horseNames.length)];
          } while (usedNames.has(horseName));
          usedNames.add(horseName);

          const speedPos = SPEED_POSITIONS[Math.floor(Math.random() * SPEED_POSITIONS.length)];
          // Varied win odds: higher chance of being in $5-$10 range for interesting data
          const winOdds = randomBetween(3.0, 14.0);
          const placeOdds = parseFloat((winOdds * randomBetween(0.26, 0.37)).toFixed(2));

          const { passed, filterResults } = evaluateRunner(
            { barrierNumber: barrier, speedMapPosition: speedPos, winOdds, placeOdds },
            { fieldSize },
            settings
          );

          const [runner] = await db.insert(runnersTable).values({
            raceId: race.id,
            horseName,
            barrierNumber: barrier,
            speedMapPosition: speedPos,
            winOdds,
            placeOdds,
            jockey: randomElement(JOCKEYS),
            trainer: randomElement(TRAINERS),
            passed,
            filterResults: JSON.stringify(filterResults),
          }).returning();

          if (passed) {
            const projectedWinReturn = settings.winStake * winOdds + settings.placeStake * placeOdds;
            const projectedPlaceReturn = settings.placeStake * placeOdds;

            await db.insert(nominationsTable).values({
              raceId: race.id,
              runnerId: runner.id,
              trackName: track.name,
              state: track.state,
              raceNumber: raceNum,
              raceName: `Race ${raceNum} - ${distance}m`,
              raceDate,
              raceTime,
              horseName,
              barrierNumber: barrier,
              speedMapPosition: speedPos,
              winOdds,
              placeOdds,
              winStake: settings.winStake,
              placeStake: settings.placeStake,
              totalOutlay: settings.winStake + settings.placeStake,
              projectedWinReturn,
              projectedPlaceReturn,
              jockey: runner.jockey,
              trainer: runner.trainer,
              status: "Pending",
            });
          }
        }
      }
    }
  }

  // Seed some historical bet results for the performance page
  const historicalData = [
    { track: "Bendigo", date: "2026-07-20", horse: "Thunderbolt", pos: 1, field: 9, win: 42.50, place: 10.20, odds: 8.5, placeOdds: 2.04 },
    { track: "Geelong", date: "2026-07-21", horse: "Silver Streak", pos: 3, field: 10, win: 0, place: 36.20, odds: 6.2, placeOdds: 1.81 },
    { track: "Wagga Wagga", date: "2026-07-22", horse: "Golden Arrow", pos: 5, field: 11, win: 0, place: 0, odds: 7.0, placeOdds: 1.95 },
    { track: "Bendigo", date: "2026-07-23", horse: "Iron Duke", pos: 2, field: 9, win: 0, place: 40.60, odds: 9.5, placeOdds: 2.03 },
    { track: "Ballarat", date: "2026-07-24", horse: "Pacific Storm", pos: 1, field: 8, win: 47.50, place: 9.80, odds: 9.5, placeOdds: 1.96 },
    { track: "Hawkesbury", date: "2026-07-25", horse: "Desert Rose", pos: 4, field: 10, win: 0, place: 0, odds: 5.5, placeOdds: 1.87 },
    { track: "Dubbo", date: "2026-07-26", horse: "Red Ember", pos: 3, field: 9, win: 0, place: 34.80, odds: 6.0, placeOdds: 1.74 },
    { track: "Geelong", date: "2026-07-27", horse: "Morning Glory", pos: 1, field: 10, win: 35.00, place: 8.60, odds: 7.0, placeOdds: 1.72 },
    { track: "Cranbourne", date: "2026-07-28", horse: "Night Hawk", pos: 7, field: 11, win: 0, place: 0, odds: 8.0, placeOdds: 2.10 },
    { track: "Bendigo", date: "2026-07-29", horse: "Blue Horizon", pos: 2, field: 9, win: 0, place: 41.20, odds: 8.0, placeOdds: 2.06 },
    { track: "Wagga Wagga", date: "2026-07-30", horse: "Steel Warrior", pos: 1, field: 10, win: 30.00, place: 7.80, odds: 6.0, placeOdds: 1.56 },
    { track: "Scone", date: "2026-07-31", horse: "Crimson Tide", pos: 6, field: 11, win: 0, place: 0, odds: 7.5, placeOdds: 2.00 },
    { track: "Albury", date: "2026-08-01", horse: "Wild Spirit", pos: 3, field: 9, win: 0, place: 37.00, odds: 7.0, placeOdds: 1.85 },
    { track: "Tamworth", date: "2026-08-02", horse: "Shadow Run", pos: 1, field: 8, win: 52.50, place: 11.20, odds: 10.5, placeOdds: 2.24 },
    { track: "Geelong", date: "2026-08-03", horse: "Storm Chaser", pos: 4, field: 10, win: 0, place: 0, odds: 6.5, placeOdds: 1.91 },
    { track: "Bendigo", date: "2026-08-04", horse: "Bright Star", pos: 2, field: 9, win: 0, place: 43.00, odds: 9.0, placeOdds: 2.15 },
    { track: "Hawkesbury", date: "2026-08-05", horse: "Dark Knight", pos: 1, field: 11, win: 40.00, place: 9.40, odds: 8.0, placeOdds: 1.88 },
    { track: "Dubbo", date: "2026-08-06", horse: "River Queen", pos: 5, field: 10, win: 0, place: 0, odds: 5.0, placeOdds: 1.85 },
    { track: "Ballarat", date: "2026-08-07", horse: "Blazing Sun", pos: 3, field: 9, win: 0, place: 35.60, odds: 7.5, placeOdds: 1.78 },
    { track: "Wagga Wagga", date: "2026-08-08", horse: "Ocean Drift", pos: 2, field: 10, win: 0, place: 38.40, odds: 6.0, placeOdds: 1.92 },
  ];

  // We need real nomination/race/runner IDs. Let's insert them as standalone records
  // linking to placeholder IDs (nomination_id = 0 is fine for historical display)
  for (const h of historicalData) {
    const outcome: "Won" | "Placed" | "Unplaced" =
      h.pos === 1 ? "Won" : h.pos <= 3 ? "Placed" : "Unplaced";
    const winReturn = h.pos === 1 ? h.win : 0;
    const placeReturn = h.pos <= 3 ? h.place : 0;
    const netResult = winReturn + placeReturn - 25;

    // Insert a synthetic nomination
    const [nom] = await db.insert(nominationsTable).values({
      raceId: 0,
      runnerId: 0,
      trackName: h.track,
      state: TRACKS.find((t) => t.name === h.track)?.state ?? "VIC",
      raceNumber: 1,
      raceName: "Historical",
      raceDate: h.date,
      raceTime: "14:00",
      horseName: h.horse,
      barrierNumber: Math.floor(Math.random() * 5) + 1,
      speedMapPosition: randomElement(["Lead", "On-Pace", "Handy"]),
      winOdds: h.odds,
      placeOdds: h.placeOdds,
      winStake: 5,
      placeStake: 20,
      totalOutlay: 25,
      projectedWinReturn: 5 * h.odds + 20 * h.placeOdds,
      projectedPlaceReturn: 20 * h.placeOdds,
      status: outcome,
    }).returning();

    await db.insert(betResultsTable).values({
      nominationId: nom.id,
      raceId: 0,
      runnerId: 0,
      trackName: h.track,
      raceDate: h.date,
      horseName: h.horse,
      finishPosition: h.pos,
      fieldSize: h.field,
      winStake: 5,
      placeStake: 20,
      totalOutlay: 25,
      actualWinReturn: h.pos === 1 ? winReturn : null,
      actualPlaceReturn: h.pos <= 3 ? placeReturn : null,
      netResult,
      outcome,
    });
  }

  logger.info("Seeding complete");
}
