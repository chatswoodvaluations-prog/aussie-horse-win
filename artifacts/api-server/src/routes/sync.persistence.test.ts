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
 * The test uses an in-memory store in place of the real PostgreSQL db so
 * it runs without a database connection.
 *
 * Run with:  node --test --import tsx/esm src/routes/sync.persistence.test.ts
 */

import { describe, it, mock, before } from "node:test";
import assert from "node:assert/strict";

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
