import { db, tracksTable, racesTable, runnersTable, nominationsTable, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

export interface FilterResult {
  rule: string;
  passed: boolean;
  message: string;
}

export interface Settings {
  fieldSizeMin: number;
  fieldSizeMax: number;
  minWinOdds: number;
  maxWinOdds: number;
  minPlaceOdds: number;
  winStake: number;
  placeStake: number;
  enabledTrackIds: number[];
}

export async function getSettings(): Promise<Settings> {
  const rows = await db.select().from(settingsTable).limit(1);
  if (rows.length === 0) {
    // Return defaults — should never happen after seed
    return {
      fieldSizeMin: 8,
      fieldSizeMax: 11,
      minWinOdds: 5.0,
      maxWinOdds: 10.0,
      minPlaceOdds: 1.85,
      winStake: 5.0,
      placeStake: 20.0,
      enabledTrackIds: [],
    };
  }
  const s = rows[0];
  return {
    fieldSizeMin: s.fieldSizeMin,
    fieldSizeMax: s.fieldSizeMax,
    minWinOdds: s.minWinOdds,
    maxWinOdds: s.maxWinOdds,
    minPlaceOdds: s.minPlaceOdds,
    winStake: s.winStake,
    placeStake: s.placeStake,
    enabledTrackIds: JSON.parse(s.enabledTrackIds) as number[],
  };
}

export function evaluateRunner(
  runner: {
    barrierNumber: number;
    speedMapPosition: string;
    winOdds: number;
    placeOdds: number;
  },
  race: { fieldSize: number },
  settings: Settings
): { passed: boolean; filterResults: FilterResult[] } {
  const results: FilterResult[] = [];

  // 1. Field size rule
  const fieldOk =
    race.fieldSize >= settings.fieldSizeMin &&
    race.fieldSize <= settings.fieldSizeMax;
  results.push({
    rule: "Field Size",
    passed: fieldOk,
    message: fieldOk
      ? `Passed: Field size ${race.fieldSize} within ${settings.fieldSizeMin}–${settings.fieldSizeMax}`
      : `Failed: Field size ${race.fieldSize} outside ${settings.fieldSizeMin}–${settings.fieldSizeMax}`,
  });

  // 2. Odds window rule
  const oddsOk =
    runner.winOdds >= settings.minWinOdds &&
    runner.winOdds <= settings.maxWinOdds;
  results.push({
    rule: "Odds Window",
    passed: oddsOk,
    message: oddsOk
      ? `Passed: Win odds $${runner.winOdds.toFixed(2)} within $${settings.minWinOdds.toFixed(2)}–$${settings.maxWinOdds.toFixed(2)}`
      : `Failed: Win odds $${runner.winOdds.toFixed(2)} outside $${settings.minWinOdds.toFixed(2)}–$${settings.maxWinOdds.toFixed(2)}`,
  });

  // 3. Minimum place odds rule
  const placeOk = runner.placeOdds >= settings.minPlaceOdds;
  results.push({
    rule: "Place Odds",
    passed: placeOk,
    message: placeOk
      ? `Passed: Place odds $${runner.placeOdds.toFixed(2)} >= $${settings.minPlaceOdds.toFixed(2)}`
      : `Failed: Place odds $${runner.placeOdds.toFixed(2)} < $${settings.minPlaceOdds.toFixed(2)}`,
  });

  // 4. Speed map rule
  const pacePositions = ["Lead", "On-Pace", "Handy"];
  const paceOk = pacePositions.includes(runner.speedMapPosition);
  results.push({
    rule: "Speed Map",
    passed: paceOk,
    message: paceOk
      ? `Passed: Settles ${runner.speedMapPosition} (front runner)`
      : `Failed: Back-marker settling ${runner.speedMapPosition}`,
  });

  // 5. Barrier rule
  const barrierOk = runner.barrierNumber >= 1 && runner.barrierNumber <= 5;
  results.push({
    rule: "Barrier Draw",
    passed: barrierOk,
    message: barrierOk
      ? `Passed: Drawn in Barrier ${runner.barrierNumber} (inside draw)`
      : `Failed: Drawn in Barrier ${runner.barrierNumber} (outside draw > 5)`,
  });

  const passed = results.every((r) => r.passed);
  return { passed, filterResults: results };
}

export async function runSelectionEngine(): Promise<{
  racesFound: number;
  racesAdded: number;
  runnersAdded: number;
  nominationsGenerated: number;
}> {
  const settings = await getSettings();
  const enabledTrackIds = settings.enabledTrackIds;

  // Get enabled tracks
  let tracks = await db.select().from(tracksTable).where(eq(tracksTable.enabled, true));
  if (enabledTrackIds.length > 0) {
    tracks = tracks.filter((t) => enabledTrackIds.includes(t.id));
  }

  const trackIds = tracks.map((t) => t.id);

  // Get all upcoming races for enabled tracks
  const allRaces = await db.select().from(racesTable);
  const races = allRaces.filter((r) => trackIds.includes(r.trackId));

  let nominationsGenerated = 0;

  for (const race of races) {
    const runners = await db.select().from(runnersTable).where(eq(runnersTable.raceId, race.id));

    for (const runner of runners) {
      const { passed, filterResults } = evaluateRunner(runner, race, settings);

      // Update runner with latest filter evaluation
      await db
        .update(runnersTable)
        .set({
          passed,
          filterResults: JSON.stringify(filterResults),
        })
        .where(eq(runnersTable.id, runner.id));

      if (passed) {
        // Check if nomination already exists
        const existing = await db
          .select()
          .from(nominationsTable)
          .where(eq(nominationsTable.runnerId, runner.id));

        if (existing.length === 0) {
          const projectedWinReturn = settings.winStake * runner.winOdds + settings.placeStake * runner.placeOdds;
          const projectedPlaceReturn = settings.placeStake * runner.placeOdds;

          await db.insert(nominationsTable).values({
            raceId: race.id,
            runnerId: runner.id,
            trackName: race.trackName,
            state: race.state,
            raceNumber: race.raceNumber,
            raceName: race.raceName,
            raceDate: race.raceDate,
            raceTime: race.raceTime,
            horseName: runner.horseName,
            barrierNumber: runner.barrierNumber,
            speedMapPosition: runner.speedMapPosition,
            winOdds: runner.winOdds,
            placeOdds: runner.placeOdds,
            ladbrokesWinOdds: runner.ladbrokesWinOdds ?? null,
            ladbrokesPlaceOdds: runner.ladbrokesPlaceOdds ?? null,
            winStake: settings.winStake,
            placeStake: settings.placeStake,
            totalOutlay: settings.winStake + settings.placeStake,
            projectedWinReturn,
            projectedPlaceReturn,
            jockey: runner.jockey,
            trainer: runner.trainer,
            status: "Pending",
          });

          nominationsGenerated++;
        }
      }
    }
  }

  logger.info({ nominationsGenerated }, "Selection engine run complete");

  return {
    racesFound: races.length,
    racesAdded: 0,
    runnersAdded: 0,
    nominationsGenerated,
  };
}
