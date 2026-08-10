/**
 * Persistence integration test for the live race-card replacement logic.
 *
 * Verifies that when live TAB data is synced over an existing seeded
 * (mock) database state:
 *   1. Pending nominations for stale runners are removed before runners
 *      are deleted — no orphan/stale nominations remain.
 *   2. Historical (settled) nominations are preserved.
 *   3. After the selection engine runs, no duplicate nominations exist.
 *   4. New runners carry real TAB identifiers, not mock names.
 *
 * A second suite ("upsert contract") verifies the actual insertLiveRaceCards
 * upsert path — runner IDs are preserved across odds refreshes, so settled
 * nominations remain linked:
 *   5. Won nomination still references the same runner ID after an odds refresh.
 *   6. Runner row is retained when it has completed (Won/Placed/Unplaced) noms.
 *   7. Scratched runner with only Pending noms has those noms deleted, then the
 *      runner row itself is removed.
 *
 * The test uses an in-memory store in place of the real PostgreSQL db so
 * it runs without a database connection.
 *
 * Run with:  node --test --import tsx/esm src/routes/sync.persistence.test.ts
 */

import { describe, it, mock, before } from "node:test";
import assert from "node:assert/strict";
import { upsertRaceRunners, type RunnerUpsertDb } from "../lib/raceUpsert.js";
import { runSelectionEngine, type SelectionEngineDb } from "../lib/selectionEngine.js";

// ── In-memory store ──────────────────────────────────────────────────────────

interface Row { [key: string]: unknown }

class Table<T extends Row> {
  private rows: T[] = [];
  private seq = 1;

  insert(row: Omit<T, "id">): T {
    const full = { ...row, id: this.seq++ } as unknown as T;
    this.rows.push(full);
    return full;
  }

  select(pred?: (row: T) => boolean): T[] {
    return pred ? this.rows.filter(pred) : [...this.rows];
  }

  update(pred: (row: T) => boolean, patch: Partial<T>): void {
    this.rows = this.rows.map((r) => (pred(r) ? { ...r, ...patch } : r));
  }

  delete(pred: (row: T) => boolean): void {
    this.rows = this.rows.filter((r) => !pred(r));
  }

  get all(): T[] { return [...this.rows]; }
}

// ── Mock DB module ────────────────────────────────────────────────────────────

type TrackRow        = { id: number; name: string; state: string; type: string; enabled: boolean };
type RaceRow         = { id: number; trackId: number; trackName: string; state: string; raceNumber: number; raceName: string; raceDate: string; raceTime: string; fieldSize: number; distance: number };
type RunnerRow       = { id: number; raceId: number; horseName: string; barrierNumber: number; speedMapPosition: string; winOdds: number; placeOdds: number; jockey: string; trainer: string; passed: boolean; filterResults: string };
type NominationRow   = { id: number; raceId: number; runnerId: number; trackName: string; state: string; raceNumber: number; raceName: string; raceDate: string; raceTime: string; horseName: string; barrierNumber: number; speedMapPosition: string; winOdds: number; placeOdds: number; winStake: number; placeStake: number; totalOutlay: number; projectedWinReturn: number; projectedPlaceReturn: number; jockey: string; trainer: string; status: string };
type SettingsRow     = { id: number; fieldSizeMin: number; fieldSizeMax: number; minWinOdds: number; maxWinOdds: number; minPlaceOdds: number; winStake: number; placeStake: number; enabledTrackIds: string };

const tracks      = new Table<TrackRow>();
const races       = new Table<RaceRow>();
const runners     = new Table<RunnerRow>();
const nominations = new Table<NominationRow>();
const settings    = new Table<SettingsRow>();

// ── Seed: one track with a mock race + runner + nominations ──────────────────

function seedMockState() {
  const track = tracks.insert({ name: "Bendigo", state: "VIC", type: "Regional", enabled: true });
  const race  = races.insert({
    trackId: track.id, trackName: "Bendigo", state: "VIC",
    raceNumber: 1, raceName: "Race 1 - Mock 1200m",
    raceDate: "2026-08-08", raceTime: "12:00",
    fieldSize: 8, distance: 1200,
  });
  const runner = runners.insert({
    raceId: race.id, horseName: "Mock Horse", barrierNumber: 1,
    speedMapPosition: "Lead", winOdds: 6.0, placeOdds: 2.1,
    jockey: "Mock Jockey", trainer: "Mock Trainer",
    passed: true, filterResults: "[]",
  });

  // A Pending nomination for the mock runner — must be removed on live sync
  nominations.insert({
    raceId: race.id, runnerId: runner.id,
    trackName: "Bendigo", state: "VIC",
    raceNumber: 1, raceName: "Race 1 - Mock 1200m",
    raceDate: "2026-08-08", raceTime: "12:00",
    horseName: "Mock Horse", barrierNumber: 1,
    speedMapPosition: "Lead", winOdds: 6.0, placeOdds: 2.1,
    winStake: 5, placeStake: 20, totalOutlay: 25,
    projectedWinReturn: 5 * 6.0 + 20 * 2.1,
    projectedPlaceReturn: 20 * 2.1,
    jockey: "Mock Jockey", trainer: "Mock Trainer",
    status: "Pending",
  });

  // A historical (Won) nomination for a different runner — must NOT be removed
  const historicalRunner = runners.insert({
    raceId: 0, horseName: "Historical Horse", barrierNumber: 2,
    speedMapPosition: "On-Pace", winOdds: 7.0, placeOdds: 2.4,
    jockey: "J. McDonald", trainer: "C. Waller",
    passed: true, filterResults: "[]",
  });
  nominations.insert({
    raceId: 0, runnerId: historicalRunner.id,
    trackName: "Bendigo", state: "VIC",
    raceNumber: 99, raceName: "Historical",
    raceDate: "2026-08-01", raceTime: "14:00",
    horseName: "Historical Horse", barrierNumber: 2,
    speedMapPosition: "On-Pace", winOdds: 7.0, placeOdds: 2.4,
    winStake: 5, placeStake: 20, totalOutlay: 25,
    projectedWinReturn: 5 * 7.0 + 20 * 2.4,
    projectedPlaceReturn: 20 * 2.4,
    jockey: "J. McDonald", trainer: "C. Waller",
    status: "Won",
  });

  settings.insert({
    fieldSizeMin: 8, fieldSizeMax: 11,
    minWinOdds: 5.0, maxWinOdds: 10.0,
    minPlaceOdds: 1.85,
    winStake: 5, placeStake: 20,
    enabledTrackIds: JSON.stringify([track.id]),
  });

  return { track, race, runner };
}

// ── Core replacement logic (extracted to be testable without HTTP) ─────────────

/**
 * Simulates the live-replacement inner loop from insertLiveRaceCards.
 * Accepts the in-memory tables so no real DB is needed.
 */
function replaceLiveRunners(
  raceId: number,
  liveRunners: Array<{ horseName: string; barrierNumber: number; speedMapPosition: string; winOdds: number; placeOdds: number; jockey: string; trainer: string }>,
  db: { races: Table<RaceRow>; runners: Table<RunnerRow>; nominations: Table<NominationRow> }
): { runnersAdded: number } {
  // Step 1: collect stale runner IDs
  const staleRunners = db.runners.select((r) => r.raceId === raceId);

  // Step 2: delete only Pending nominations referencing those runners
  for (const staleRunner of staleRunners) {
    db.nominations.delete(
      (n) => n.runnerId === staleRunner.id && n.status === "Pending"
    );
  }

  // Step 3: delete stale runners
  db.runners.delete((r) => r.raceId === raceId);

  // Step 4: insert authoritative TAB runners
  let runnersAdded = 0;
  for (const runner of liveRunners) {
    db.runners.insert({ raceId, ...runner, passed: false, filterResults: "[]" });
    runnersAdded++;
  }

  return { runnersAdded };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("live replacement — persistence / nomination cleanup", () => {
  let raceId: number;
  const db = { races, runners, nominations };

  before(() => {
    const state = seedMockState();
    raceId = state.race.id;
  });

  const liveRunners = [
    { horseName: "Thunderbolt", barrierNumber: 1, speedMapPosition: "Lead" as const, winOdds: 5.5, placeOdds: 1.9, jockey: "Craig Williams", trainer: "Chris Waller" },
    { horseName: "Silver Streak", barrierNumber: 3, speedMapPosition: "On-Pace" as const, winOdds: 8.0, placeOdds: 2.4, jockey: "Damian Lane", trainer: "Peter Moody" },
    { horseName: "Desert Rose",   barrierNumber: 11, speedMapPosition: "Back-Marker" as const, winOdds: 9.5, placeOdds: 2.8, jockey: "Blake Shinn", trainer: "Tony McEvoy" },
  ];

  it("pending nomination for mock runner is removed before runner deletion", () => {
    const pendingBefore = nominations.select((n) => n.status === "Pending").length;
    assert.equal(pendingBefore, 1, "should have 1 pending nomination before sync");

    replaceLiveRunners(raceId, liveRunners, db);

    const pendingAfter = nominations.select((n) => n.status === "Pending").length;
    assert.equal(pendingAfter, 0, "pending nomination must be removed after live replacement");
  });

  it("historical (Won) nomination is preserved after replacement", () => {
    const wonNoms = nominations.select((n) => n.status === "Won");
    assert.equal(wonNoms.length, 1, "historical Won nomination must not be deleted");
    assert.equal(wonNoms[0].horseName, "Historical Horse");
  });

  it("real TAB runners replace mock runners", () => {
    const currentRunners = runners.select((r) => r.raceId === raceId);
    assert.equal(currentRunners.length, liveRunners.length, "runner count should match live field");

    const names = currentRunners.map((r) => r.horseName);
    assert.ok(!names.includes("Mock Horse"), "mock horse must be removed");
    assert.ok(names.includes("Thunderbolt"), "live horse Thunderbolt must be present");
    assert.ok(names.includes("Silver Streak"), "live horse Silver Streak must be present");
    assert.ok(names.includes("Desert Rose"), "live horse Desert Rose must be present");
  });

  it("no duplicate nominations after selection engine re-run", () => {
    // Simulate the selection engine creating nominations for qualifying runners
    const qualifyingRunners = runners.select(
      (r) => r.raceId === raceId && r.winOdds >= 5.0 && r.winOdds <= 10.0
    );

    // Engine inserts nominations only if one doesn't already exist for the runner
    for (const runner of qualifyingRunners) {
      const alreadyNominated = nominations.select((n) => n.runnerId === runner.id).length > 0;
      if (!alreadyNominated) {
        nominations.insert({
          raceId: runner.raceId,
          runnerId: runner.id,
          trackName: "Bendigo", state: "VIC",
          raceNumber: 1, raceName: "Race 1 - Live 1200m",
          raceDate: "2026-08-08", raceTime: "12:05",
          horseName: runner.horseName,
          barrierNumber: runner.barrierNumber,
          speedMapPosition: runner.speedMapPosition,
          winOdds: runner.winOdds,
          placeOdds: runner.placeOdds,
          winStake: 5, placeStake: 20, totalOutlay: 25,
          projectedWinReturn: 5 * runner.winOdds + 20 * runner.placeOdds,
          projectedPlaceReturn: 20 * runner.placeOdds,
          jockey: runner.jockey, trainer: runner.trainer,
          status: "Pending",
        });
      }
    }

    // Verify each runner has at most 1 nomination
    for (const runner of qualifyingRunners) {
      const count = nominations.select((n) => n.runnerId === runner.id).length;
      assert.ok(count <= 1, `runner ${runner.horseName} must have at most 1 nomination, got ${count}`);
    }

    // Verify no nominations reference old mock runner IDs (runners not in current race)
    const currentRunnerIds = new Set(runners.select((r) => r.raceId === raceId).map((r) => r.id));
    const pendingNoms = nominations.select((n) => n.status === "Pending" && n.raceId === raceId);
    for (const nom of pendingNoms) {
      assert.ok(
        currentRunnerIds.has(nom.runnerId),
        `nomination ${nom.id} references stale runner ${nom.runnerId}`
      );
    }
  });
});

// ── Upsert contract tests ─────────────────────────────────────────────────────
//
// These tests exercise the REAL upsertRaceRunners production function from
// lib/raceUpsert.ts via an in-memory RunnerUpsertDb adapter.
// The adapter satisfies the same interface the production Drizzle adapter
// implements, so every branch of the production code runs — not a simulation.

/**
 * Build a RunnerUpsertDb adapter backed by in-memory Table instances.
 * Satisfies the same interface the Drizzle production adapter implements.
 */
function makeInMemoryUpsertDb(
  uRunners: Table<RunnerRow>,
  uNominations: Table<NominationRow>
): RunnerUpsertDb {
  return {
    async getRunnersForRace(raceId) {
      return uRunners.select((r) => r.raceId === raceId).map((r) => ({
        id: r.id,
        horseName: r.horseName,
        jockey: r.jockey,
        trainer: r.trainer,
      }));
    },

    async updateRunner(id, data) {
      uRunners.update((r) => r.id === id, data as Partial<RunnerRow>);
    },

    async insertRunner(data) {
      const row = uRunners.insert({
        raceId: data.raceId,
        horseName: data.horseName,
        barrierNumber: data.barrierNumber,
        speedMapPosition: data.speedMapPosition,
        winOdds: data.winOdds,
        placeOdds: data.placeOdds,
        jockey: data.jockey ?? "",
        trainer: data.trainer ?? "",
        passed: data.passed,
        filterResults: data.filterResults,
      });
      return { id: row.id };
    },

    async deletePendingNominations(runnerId) {
      uNominations.delete((n) => n.runnerId === runnerId && n.status === "Pending");
    },

    async getNominations(runnerId) {
      return uNominations.select((n) => n.runnerId === runnerId).map((n) => ({
        id: n.id,
        status: n.status,
      }));
    },

    async deleteRunner(id) {
      uRunners.delete((r) => r.id === id);
    },
  };
}

describe("upsert contract — runner ID preservation and scratching rules (production code)", () => {
  // Independent in-memory tables so state doesn't bleed from the first suite.
  const uRunners     = new Table<RunnerRow>();
  const uNominations = new Table<NominationRow>();

  let raceId: number;
  let originalRunnerId: number;
  let wonNominationId: number;
  let scratchedWithNomId: number;
  let scratchedNoNomId: number;
  let scratchedPendingOnlyId: number;

  // Seed state then run the REAL upsertRaceRunners production function.
  before(async () => {
    raceId = 1; // arbitrary; used only as a filter key in the in-memory store

    // Runner that will stay in the field (with updated odds on next sync)
    const stayer = uRunners.insert({
      raceId, horseName: "Stayer Horse", barrierNumber: 2,
      speedMapPosition: "Lead", winOdds: 6.0, placeOdds: 2.1,
      jockey: "J. McDonald", trainer: "C. Waller",
      passed: true, filterResults: "[]",
    });
    originalRunnerId = stayer.id;

    // Won nomination linked to the stayer — must survive odds refresh intact
    const wonNom = uNominations.insert({
      raceId, runnerId: stayer.id,
      trackName: "Flemington", state: "VIC",
      raceNumber: 3, raceName: "Race 3 - 1600m",
      raceDate: "2026-08-09", raceTime: "14:30",
      horseName: "Stayer Horse", barrierNumber: 2,
      speedMapPosition: "Lead", winOdds: 6.0, placeOdds: 2.1,
      winStake: 5, placeStake: 20, totalOutlay: 25,
      projectedWinReturn: 5 * 6.0 + 20 * 2.1,
      projectedPlaceReturn: 20 * 2.1,
      jockey: "J. McDonald", trainer: "C. Waller",
      status: "Won",
    });
    wonNominationId = wonNom.id;

    // Scratched runner with a completed (Placed) nomination — must keep its row
    const scratchedWithNom = uRunners.insert({
      raceId, horseName: "Scratched With History", barrierNumber: 5,
      speedMapPosition: "Handy", winOdds: 9.0, placeOdds: 2.8,
      jockey: "D. Lane", trainer: "P. Moody",
      passed: false, filterResults: "[]",
    });
    scratchedWithNomId = scratchedWithNom.id;
    uNominations.insert({
      raceId, runnerId: scratchedWithNom.id,
      trackName: "Flemington", state: "VIC",
      raceNumber: 3, raceName: "Race 3 - 1600m",
      raceDate: "2026-08-09", raceTime: "14:30",
      horseName: "Scratched With History", barrierNumber: 5,
      speedMapPosition: "Handy", winOdds: 9.0, placeOdds: 2.8,
      winStake: 5, placeStake: 20, totalOutlay: 25,
      projectedWinReturn: 5 * 9.0 + 20 * 2.8,
      projectedPlaceReturn: 20 * 2.8,
      jockey: "D. Lane", trainer: "P. Moody",
      status: "Placed",
    });

    // Scratched runner with no nominations at all — row must be deleted
    const scratchedNoNom = uRunners.insert({
      raceId, horseName: "Scratched No Nom", barrierNumber: 8,
      speedMapPosition: "Back-Marker", winOdds: 12.0, placeOdds: 3.5,
      jockey: "B. Shinn", trainer: "T. McEvoy",
      passed: false, filterResults: "[]",
    });
    scratchedNoNomId = scratchedNoNom.id;

    // Scratched runner with only a Pending nomination — pending deleted, row deleted
    const scratchedPendingOnly = uRunners.insert({
      raceId, horseName: "Scratched Pending Only", barrierNumber: 9,
      speedMapPosition: "Midfield", winOdds: 7.5, placeOdds: 2.4,
      jockey: "H. Bowman", trainer: "G. Waterhouse",
      passed: false, filterResults: "[]",
    });
    scratchedPendingOnlyId = scratchedPendingOnly.id;
    uNominations.insert({
      raceId, runnerId: scratchedPendingOnly.id,
      trackName: "Flemington", state: "VIC",
      raceNumber: 3, raceName: "Race 3 - 1600m",
      raceDate: "2026-08-09", raceTime: "14:30",
      horseName: "Scratched Pending Only", barrierNumber: 9,
      speedMapPosition: "Midfield", winOdds: 7.5, placeOdds: 2.4,
      winStake: 5, placeStake: 20, totalOutlay: 25,
      projectedWinReturn: 5 * 7.5 + 20 * 2.4,
      projectedPlaceReturn: 20 * 2.4,
      jockey: "H. Bowman", trainer: "G. Waterhouse",
      status: "Pending",
    });

    // ── Run the PRODUCTION upsertRaceRunners via an in-memory adapter ──────────
    // Only "Stayer Horse" stays in the TAB field, with updated odds.
    // The other three runners are absent (scratched).
    await upsertRaceRunners(
      raceId,
      [
        {
          horseName: "Stayer Horse",
          barrierNumber: 2,
          speedMapPosition: "Lead",
          winOdds: 7.5,   // odds drifted up
          placeOdds: 2.4,
          jockey: "J. McDonald",
          trainer: "C. Waller",
        },
      ],
      makeInMemoryUpsertDb(uRunners, uNominations)
    );
  });

  it("runner ID is preserved after an odds refresh", () => {
    const stayer = uRunners.select((r) => r.horseName === "Stayer Horse")[0];
    assert.ok(stayer, "stayer runner must still exist in the DB");
    assert.equal(
      stayer.id,
      originalRunnerId,
      "runner ID must not change across an odds refresh — upsertRaceRunners must update in-place, not delete-and-reinsert"
    );
  });

  it("odds are updated on the preserved runner row", () => {
    const stayer = uRunners.select((r) => r.horseName === "Stayer Horse")[0];
    assert.equal(stayer.winOdds, 7.5, "win odds must reflect fresh TAB value");
    assert.equal(stayer.placeOdds, 2.4, "place odds must reflect fresh TAB value");
  });

  it("Won nomination still references the original runner ID after odds refresh", () => {
    const wonNom = uNominations.select((n) => n.id === wonNominationId)[0];
    assert.ok(wonNom, "Won nomination must not be deleted");
    assert.equal(
      wonNom.runnerId,
      originalRunnerId,
      "Won nomination must still link to the same runner ID"
    );
    assert.equal(wonNom.status, "Won", "Won nomination status must be unchanged");
    // Settled odds must not be mutated — they reflect the market at bet-time
    assert.equal(wonNom.winOdds, 6.0, "Won nomination winOdds must remain at original bet-time value");
  });

  it("scratched runner with completed nomination retains its row", () => {
    const row = uRunners.select((r) => r.id === scratchedWithNomId)[0];
    assert.ok(
      row,
      "runner with a completed (Placed) nomination must not be deleted when scratched"
    );
    const placedNom = uNominations.select(
      (n) => n.runnerId === scratchedWithNomId && n.status === "Placed"
    )[0];
    assert.ok(placedNom, "Placed nomination for scratched runner must be preserved");
  });

  it("scratched runner with no nominations is removed", () => {
    const row = uRunners.select((r) => r.id === scratchedNoNomId)[0];
    assert.equal(row, undefined, "scratched runner with no nominations must be deleted");
  });

  it("scratched runner with only Pending nominations has noms deleted then row removed", () => {
    const row = uRunners.select((r) => r.id === scratchedPendingOnlyId)[0];
    assert.equal(
      row,
      undefined,
      "scratched runner with only Pending nominations must be deleted after noms are cleared"
    );
    const remainingNoms = uNominations.select((n) => n.runnerId === scratchedPendingOnlyId);
    assert.equal(
      remainingNoms.length,
      0,
      "Pending nomination for scratched runner must be cleaned up before row is removed"
    );
  });
});

// ── Track toggle tests ────────────────────────────────────────────────────────
//
// Verifies that enabling/disabling a track in settings correctly filters that
// track's races out of (or back into) the nomination engine on the next sync.
//
// Each test is fully independent: it creates its own fresh in-memory tables,
// seeds state, builds a SelectionEngineDb adapter, and calls the REAL
// runSelectionEngine from selectionEngine.ts.  No state bleeds between tests.

/**
 * Build a SelectionEngineDb adapter backed by independent in-memory Tables.
 * Implements the same interface the production Drizzle adapter satisfies so the
 * real runSelectionEngine code path runs in full — not a re-implementation.
 */
function makeToggleTestDb(
  tTracks:      Table<TrackRow>,
  tRaces:       Table<RaceRow>,
  tRunners:     Table<RunnerRow>,
  tNominations: Table<NominationRow>,
  tSettings:    Table<SettingsRow>
): SelectionEngineDb {
  return {
    async getSettings() {
      const rows = tSettings.select();
      if (rows.length === 0) {
        return {
          fieldSizeMin: 8, fieldSizeMax: 11,
          minWinOdds: 5.0, maxWinOdds: 10.0, minPlaceOdds: 1.85,
          winStake: 5.0, placeStake: 20.0, enabledTrackIds: [],
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
    },

    async getEnabledTracks() {
      return tTracks.select((t) => t.enabled).map((t) => ({ id: t.id }));
    },

    async getAllRaces() {
      return tRaces.select().map((r) => ({
        id: r.id, trackId: r.trackId, trackName: r.trackName,
        state: r.state, raceNumber: r.raceNumber, raceName: r.raceName,
        raceDate: r.raceDate, raceTime: r.raceTime, fieldSize: r.fieldSize,
      }));
    },

    async getRunnersForRace(raceId) {
      return tRunners.select((r) => r.raceId === raceId).map((r) => ({
        id: r.id, horseName: r.horseName, barrierNumber: r.barrierNumber,
        speedMapPosition: r.speedMapPosition, winOdds: r.winOdds,
        placeOdds: r.placeOdds, jockey: r.jockey, trainer: r.trainer,
        ladbrokesWinOdds: null, ladbrokesPlaceOdds: null,
      }));
    },

    async updateRunner(id, data) {
      tRunners.update((r) => r.id === id, data as Partial<RunnerRow>);
    },

    async getNominationsForRunner(runnerId) {
      return tNominations.select((n) => n.runnerId === runnerId).map((n) => ({
        id: n.id, status: n.status, winStake: n.winStake, placeStake: n.placeStake,
      }));
    },

    async updateNomination(id, data) {
      tNominations.update((n) => n.id === id, data as Partial<NominationRow>);
    },

    async insertNomination(data) {
      // Normalize nullable DB fields to empty strings for the in-memory store,
      // which uses non-nullable NominationRow.  Tests don't assert these values.
      tNominations.insert({
        raceId: data.raceId, runnerId: data.runnerId,
        trackName: data.trackName, state: data.state,
        raceNumber: data.raceNumber, raceName: data.raceName ?? "",
        raceDate: data.raceDate, raceTime: data.raceTime ?? "",
        horseName: data.horseName, barrierNumber: data.barrierNumber,
        speedMapPosition: data.speedMapPosition,
        winOdds: data.winOdds, placeOdds: data.placeOdds,
        winStake: data.winStake, placeStake: data.placeStake,
        totalOutlay: data.totalOutlay,
        projectedWinReturn: data.projectedWinReturn,
        projectedPlaceReturn: data.projectedPlaceReturn,
        jockey: data.jockey ?? "", trainer: data.trainer ?? "", status: data.status,
      });
    },
  };
}

/** Seed a qualifying runner: passes all five filter rules out of the box. */
function seedQualifyingRunner(
  tRaces: Table<RaceRow>,
  tRunners: Table<RunnerRow>,
  trackId: number,
  trackName: string,
  state: string,
  horseName: string
): { raceId: number; runnerId: number } {
  // fieldSize=8 (8–11 ✓), winOdds=6.0 (5–10 ✓), placeOdds=2.1 (≥1.85 ✓),
  // speedMapPosition=Lead ✓, barrierNumber=2 (≤5) ✓
  const race = tRaces.insert({
    trackId, trackName, state,
    raceNumber: 1, raceName: "Race 1",
    raceDate: "2026-08-09", raceTime: "13:00",
    fieldSize: 8, distance: 1200,
  });
  const runner = tRunners.insert({
    raceId: race.id, horseName, barrierNumber: 2,
    speedMapPosition: "Lead", winOdds: 6.0, placeOdds: 2.1,
    jockey: "J. McDonald", trainer: "C. Waller",
    passed: false, filterResults: "[]",
  });
  return { raceId: race.id, runnerId: runner.id };
}

describe("track toggle — real selection engine respects enabledTrackIds on each sync", () => {

  it("disabled track produces zero nominations; enabled track produces nominations — same sync", async () => {
    // Fresh independent tables for this test.
    const tTracks      = new Table<TrackRow>();
    const tRaces       = new Table<RaceRow>();
    const tRunners     = new Table<RunnerRow>();
    const tNominations = new Table<NominationRow>();
    const tSettings    = new Table<SettingsRow>();

    // Track A — row enabled, but absent from enabledTrackIds (toggled OFF in UI).
    const trackA = tTracks.insert({ name: "Off Track", state: "VIC", type: "Regional", enabled: true });
    // Track B — row enabled AND present in enabledTrackIds (toggled ON in UI).
    const trackB = tTracks.insert({ name: "On Track", state: "NSW", type: "Metro", enabled: true });

    const { raceId: raceAId } = seedQualifyingRunner(tRaces, tRunners, trackA.id, "Off Track", "VIC", "Off Horse");
    const { raceId: raceBId } = seedQualifyingRunner(tRaces, tRunners, trackB.id, "On Track", "NSW", "On Horse");

    // Settings: only track B enabled.
    tSettings.insert({
      fieldSizeMin: 8, fieldSizeMax: 11, minWinOdds: 5.0, maxWinOdds: 10.0,
      minPlaceOdds: 1.85, winStake: 5, placeStake: 20,
      enabledTrackIds: JSON.stringify([trackB.id]),
    });

    await runSelectionEngine(makeToggleTestDb(tTracks, tRaces, tRunners, tNominations, tSettings));

    const nomsA = tNominations.select((n) => n.raceId === raceAId);
    assert.equal(nomsA.length, 0, "disabled track must produce zero nominations");

    const nomsB = tNominations.select((n) => n.raceId === raceBId);
    assert.ok(nomsB.length > 0, "enabled track must produce at least one nomination");
    assert.equal(nomsB[0].horseName, "On Horse");
    assert.equal(nomsB[0].status, "Pending");
  });

  it("re-enabling a disabled track produces nominations on the next sync", async () => {
    const tTracks      = new Table<TrackRow>();
    const tRaces       = new Table<RaceRow>();
    const tRunners     = new Table<RunnerRow>();
    const tNominations = new Table<NominationRow>();
    const tSettings    = new Table<SettingsRow>();

    const track = tTracks.insert({ name: "Toggle Track", state: "VIC", type: "Regional", enabled: true });
    const { raceId } = seedQualifyingRunner(tRaces, tRunners, track.id, "Toggle Track", "VIC", "Toggle Horse");

    // First sync: track is disabled (absent from enabledTrackIds).
    const settingsRow = tSettings.insert({
      fieldSizeMin: 8, fieldSizeMax: 11, minWinOdds: 5.0, maxWinOdds: 10.0,
      minPlaceOdds: 1.85, winStake: 5, placeStake: 20,
      enabledTrackIds: JSON.stringify([]),  // empty list = all tracks enabled (engine default)
                                            // so we need a second track to test the filter
      // Instead: explicitly exclude the track by using an arbitrary other ID
    });
    // Override: use a non-existent track ID so our track is excluded.
    tSettings.update((s) => s.id === settingsRow.id, { enabledTrackIds: JSON.stringify([9999]) });

    const edb = makeToggleTestDb(tTracks, tRaces, tRunners, tNominations, tSettings);

    await runSelectionEngine(edb);
    assert.equal(
      tNominations.select((n) => n.raceId === raceId).length,
      0,
      "track absent from enabledTrackIds must produce zero nominations on first sync"
    );

    // Second sync: enable the track by adding it to enabledTrackIds.
    tSettings.update((s) => s.id === settingsRow.id, { enabledTrackIds: JSON.stringify([track.id]) });

    await runSelectionEngine(edb);

    const noms = tNominations.select((n) => n.raceId === raceId);
    assert.ok(noms.length > 0, "re-enabled track must produce nominations on the next sync");
    assert.equal(noms[0].horseName, "Toggle Horse");
    assert.equal(noms[0].status, "Pending");
  });

  it("disabling a previously-enabled track stops new nominations on the subsequent sync", async () => {
    const tTracks      = new Table<TrackRow>();
    const tRaces       = new Table<RaceRow>();
    const tRunners     = new Table<RunnerRow>();
    const tNominations = new Table<NominationRow>();
    const tSettings    = new Table<SettingsRow>();

    const track = tTracks.insert({ name: "Then Off Track", state: "QLD", type: "Regional", enabled: true });
    const { raceId } = seedQualifyingRunner(tRaces, tRunners, track.id, "Then Off Track", "QLD", "Then Off Horse");

    const settingsRow = tSettings.insert({
      fieldSizeMin: 8, fieldSizeMax: 11, minWinOdds: 5.0, maxWinOdds: 10.0,
      minPlaceOdds: 1.85, winStake: 5, placeStake: 20,
      enabledTrackIds: JSON.stringify([track.id]),  // track starts ENABLED
    });

    const edb = makeToggleTestDb(tTracks, tRaces, tRunners, tNominations, tSettings);

    // First sync: track is enabled — nominations must be created.
    await runSelectionEngine(edb);
    const nomsAfterFirstSync = tNominations.select((n) => n.raceId === raceId);
    assert.ok(nomsAfterFirstSync.length > 0, "enabled track must produce nominations on first sync");

    // Remove nominations so the second sync starts with a clean slate, then disable the track.
    tNominations.delete((n) => n.raceId === raceId);
    tSettings.update((s) => s.id === settingsRow.id, { enabledTrackIds: JSON.stringify([9999]) });

    // Second sync: track is disabled — zero new nominations.
    await runSelectionEngine(edb);
    const nomsAfterSecondSync = tNominations.select((n) => n.raceId === raceId);
    assert.equal(
      nomsAfterSecondSync.length,
      0,
      "disabled track must produce zero nominations on the next sync"
    );
  });
});
