import { db, tracksTable, racesTable, runnersTable, nominationsTable, settingsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
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

// ── Injectable DB adapter ─────────────────────────────────────────────────────
//
// SelectionEngineDb abstracts every database operation performed by
// runSelectionEngine.  The production Drizzle implementation is created
// internally via makeDrizzleSelectionEngineDb().  Tests may supply their own
// in-memory implementation without touching the real database.

export interface EngineTrack {
  id: number;
}

export interface EngineRace {
  id: number;
  trackId: number;
  trackName: string;
  state: string;
  raceNumber: number;
  raceName: string | null;
  raceDate: string;
  raceTime: string | null;
  fieldSize: number;
}

export interface EngineRunner {
  id: number;
  horseName: string;
  barrierNumber: number;
  speedMapPosition: string;
  winOdds: number;
  placeOdds: number;
  jockey: string | null;
  trainer: string | null;
  ladbrokesWinOdds?: number | null;
  ladbrokesPlaceOdds?: number | null;
}

export interface EngineNomination {
  id: number;
  status: string;
  winStake: number;
  placeStake: number;
}

export interface InsertNominationData {
  raceId: number;
  runnerId: number;
  trackName: string;
  state: string;
  raceNumber: number;
  raceName: string | null;
  raceDate: string;
  raceTime: string | null;
  horseName: string;
  barrierNumber: number;
  speedMapPosition: string;
  winOdds: number;
  placeOdds: number;
  ladbrokesWinOdds?: number | null;
  ladbrokesPlaceOdds?: number | null;
  winStake: number;
  placeStake: number;
  totalOutlay: number;
  projectedWinReturn: number;
  projectedPlaceReturn: number;
  jockey: string | null;
  trainer: string | null;
  status: string;
}

export interface EngineBatchRunner extends EngineRunner {
  raceId: number;
}

export interface EngineBatchNomination extends EngineNomination {
  runnerId: number;
}

export interface SelectionEngineDb {
  /** Returns current settings (never throws; returns defaults when no row exists). */
  getSettings(): Promise<Settings>;
  /** Returns all tracks whose `enabled` flag is true. */
  getEnabledTracks(): Promise<EngineTrack[]>;
  /** Returns every race row (caller filters by trackId). */
  getAllRaces(): Promise<EngineRace[]>;
  /** Batch-loads all runners for the given race IDs (avoids N+1). */
  getAllRunnersForRaces(raceIds: number[]): Promise<EngineBatchRunner[]>;
  /** Batch-loads all nominations for the given race IDs (avoids N+1). */
  getAllNominationsForRaces(raceIds: number[]): Promise<EngineBatchNomination[]>;
  /** Returns all runners for a given race. */
  getRunnersForRace(raceId: number): Promise<EngineRunner[]>;
  /** Persists the filter-evaluation result back to the runner row. */
  updateRunner(id: number, data: { passed: boolean; filterResults: string }): Promise<void>;
  /** Returns all nominations for a given runner (any status). */
  getNominationsForRunner(runnerId: number): Promise<EngineNomination[]>;
  /** Reprices a Pending nomination with fresh odds and derived projections. */
  updateNomination(
    id: number,
    data: {
      winOdds: number;
      placeOdds: number;
      projectedWinReturn: number;
      projectedPlaceReturn: number;
    }
  ): Promise<void>;
  /** Cancels a Pending nomination whose runner no longer passes filters. */
  cancelNomination(id: number): Promise<void>;
  /** Inserts a brand-new nomination for a qualifying runner. */
  insertNomination(data: InsertNominationData): Promise<void>;
}

// ── Drizzle (production) implementation ──────────────────────────────────────

function makeDrizzleSelectionEngineDb(): SelectionEngineDb {
  return {
    async getSettings() {
      return getSettings();
    },

    async getEnabledTracks() {
      const rows = await db
        .select({ id: tracksTable.id })
        .from(tracksTable)
        .where(eq(tracksTable.enabled, true));
      return rows;
    },

    async getAllRaces() {
      return db.select().from(racesTable);
    },

    async getAllRunnersForRaces(raceIds) {
      if (raceIds.length === 0) return [];
      const rows = await db.select().from(runnersTable).where(inArray(runnersTable.raceId, raceIds));
      return rows;
    },

    async getAllNominationsForRaces(raceIds) {
      if (raceIds.length === 0) return [];
      const rows = await db.select({
        id: nominationsTable.id,
        runnerId: nominationsTable.runnerId,
        status: nominationsTable.status,
        winStake: nominationsTable.winStake,
        placeStake: nominationsTable.placeStake,
      }).from(nominationsTable).where(inArray(nominationsTable.raceId, raceIds));
      return rows;
    },

    async getRunnersForRace(raceId) {
      return db.select().from(runnersTable).where(eq(runnersTable.raceId, raceId));
    },

    async updateRunner(id, data) {
      await db.update(runnersTable).set(data).where(eq(runnersTable.id, id));
    },

    async getNominationsForRunner(runnerId) {
      const rows = await db
        .select()
        .from(nominationsTable)
        .where(eq(nominationsTable.runnerId, runnerId));
      return rows.map((r) => ({
        id: r.id,
        status: r.status,
        winStake: r.winStake,
        placeStake: r.placeStake,
      }));
    },

    async updateNomination(id, data) {
      await db.update(nominationsTable).set(data).where(eq(nominationsTable.id, id));
    },

    async cancelNomination(id) {
      await db.update(nominationsTable).set({ status: "Cancelled" }).where(eq(nominationsTable.id, id));
    },

    async insertNomination(data) {
      await db.insert(nominationsTable).values(data);
    },
  };
}

// ── Standalone getSettings (used directly by settings routes etc.) ────────────

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

export async function runSelectionEngine(
  engineDb?: SelectionEngineDb
): Promise<{
  racesFound: number;
  racesAdded: number;
  runnersAdded: number;
  nominationsGenerated: number;
  nominationsRepriced: number;
  nominationsCancelled: number;
}> {
  const edb = engineDb ?? makeDrizzleSelectionEngineDb();

  const settings = await edb.getSettings();
  const enabledTrackIds = settings.enabledTrackIds;

  let tracks = await edb.getEnabledTracks();
  if (enabledTrackIds.length > 0) {
    tracks = tracks.filter((t) => enabledTrackIds.includes(t.id));
  }

  const trackIdSet = new Set(tracks.map((t) => t.id));
  const allRaces = await edb.getAllRaces();
  const races = allRaces.filter((r) => trackIdSet.has(r.trackId));

  if (races.length === 0) {
    return { racesFound: 0, racesAdded: 0, runnersAdded: 0, nominationsGenerated: 0, nominationsRepriced: 0, nominationsCancelled: 0 };
  }

  // ── Batch-load ALL runners and nominations in two queries (avoid N+1) ────────
  const raceIdSet = new Set(races.map((r) => r.id));
  const raceIdList = [...raceIdSet];

  const [allRunners, allNominations] = await Promise.all([
    edb.getAllRunnersForRaces(raceIdList),
    edb.getAllNominationsForRaces(raceIdList),
  ]);

  // Index for fast lookup
  const runnersByRace = new Map<number, typeof allRunners>();
  for (const runner of allRunners) {
    if (!runnersByRace.has(runner.raceId)) runnersByRace.set(runner.raceId, []);
    runnersByRace.get(runner.raceId)!.push(runner);
  }

  const nomsByRunner = new Map<number, typeof allNominations>();
  for (const nom of allNominations) {
    if (!nomsByRunner.has(nom.runnerId)) nomsByRunner.set(nom.runnerId, []);
    nomsByRunner.get(nom.runnerId)!.push(nom);
  }

  // ── Collect all writes, then flush in parallel ────────────────────────────────
  const runnerUpdates: Array<{ id: number; data: Parameters<typeof edb.updateRunner>[1] }> = [];
  const nominationUpdates: Array<{ id: number; data: Parameters<typeof edb.updateNomination>[1] }> = [];
  const nominationCancels: Array<{ id: number }> = [];
  const nominationInserts: Array<Parameters<typeof edb.insertNomination>[0]> = [];

  let nominationsGenerated = 0;
  let nominationsRepriced = 0;
  let nominationsCancelled = 0;

  for (const race of races) {
    const runners = runnersByRace.get(race.id) ?? [];

    for (const runner of runners) {
      const { passed, filterResults } = evaluateRunner(runner, race, settings);

      runnerUpdates.push({ id: runner.id, data: { passed, filterResults: JSON.stringify(filterResults) } });

      const existing = nomsByRunner.get(runner.id) ?? [];
      const pendingNoms = existing.filter((n) => n.status === "Pending");

      if (pendingNoms.length > 0) {
        for (const nom of pendingNoms) {
          if (!passed) {
            // Runner no longer qualifies — cancel the pending nomination so punters
            // are not left holding a stale selection that drifted outside the window.
            nominationCancels.push({ id: nom.id });
            nominationsCancelled++;
          } else {
            // Runner still qualifies — reprice with fresh odds.
            const projectedWinReturn = nom.winStake * runner.winOdds + nom.placeStake * runner.placeOdds;
            const projectedPlaceReturn = nom.placeStake * runner.placeOdds;
            nominationUpdates.push({
              id: nom.id,
              data: { winOdds: runner.winOdds, placeOdds: runner.placeOdds, projectedWinReturn, projectedPlaceReturn },
            });
            nominationsRepriced++;
          }
        }
      } else if (passed && existing.length === 0) {
        const projectedWinReturn = settings.winStake * runner.winOdds + settings.placeStake * runner.placeOdds;
        const projectedPlaceReturn = settings.placeStake * runner.placeOdds;
        nominationInserts.push({
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

  // Flush all writes in parallel (runner updates + nomination updates + cancels + inserts)
  await Promise.all([
    ...runnerUpdates.map(({ id, data }) => edb.updateRunner(id, data)),
    ...nominationUpdates.map(({ id, data }) => edb.updateNomination(id, data)),
    ...nominationCancels.map(({ id }) => edb.cancelNomination(id)),
    ...nominationInserts.map((data) => edb.insertNomination(data)),
  ]);

  logger.info({ nominationsGenerated, nominationsRepriced, nominationsCancelled }, "Selection engine run complete");

  return { racesFound: races.length, racesAdded: 0, runnersAdded: 0, nominationsGenerated, nominationsRepriced, nominationsCancelled };
}
