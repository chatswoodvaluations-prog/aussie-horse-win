/**
 * raceUpsert.ts
 *
 * Core logic for the "upsert runners for an existing race" operation extracted
 * from insertLiveRaceCards in routes/sync.ts.
 *
 * The function accepts a lightweight database adapter interface so it can be
 * exercised in tests without a real PostgreSQL connection while still running
 * the exact same production code path.
 *
 * Production callers wrap the Drizzle `db` object with `makeDrizzleUpsertDb`.
 * Test callers supply an in-memory implementation of the same interface.
 */

import { db as drizzleDb, runnersTable, nominationsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

// ── Adapter interface ─────────────────────────────────────────────────────────

export interface ExistingRunner {
  id: number;
  horseName: string;
  jockey: string | null;
  trainer: string | null;
}

export interface TabRunner {
  horseName: string;
  barrierNumber: number;
  speedMapPosition: string;
  winOdds: number;
  placeOdds: number;
  jockey?: string | null;
  trainer?: string | null;
}

export interface RunnerUpsertDb {
  /** Return all runner rows currently stored for the given race. */
  getRunnersForRace(raceId: number): Promise<ExistingRunner[]>;

  /**
   * Update an existing runner row in-place, preserving its primary key.
   * This is the upsert contract that keeps settled nominations linked.
   */
  updateRunner(
    id: number,
    data: {
      winOdds: number;
      placeOdds: number;
      barrierNumber: number;
      speedMapPosition: string;
      jockey: string | null;
      trainer: string | null;
      passed: boolean;
      filterResults: string;
    }
  ): Promise<void>;

  /**
   * Insert a brand-new runner row (late entry / scratching replacement).
   * Returns the newly assigned primary key so it can be tracked as "seen".
   */
  insertRunner(
    data: {
      raceId: number;
      horseName: string;
      barrierNumber: number;
      speedMapPosition: string;
      winOdds: number;
      placeOdds: number;
      jockey?: string | null;
      trainer?: string | null;
      passed: boolean;
      filterResults: string;
    }
  ): Promise<{ id: number }>;

  /**
   * Delete all Pending nominations for a scratched runner.
   * Settled records (Won/Placed/Unplaced) must NOT be touched.
   */
  deletePendingNominations(runnerId: number): Promise<void>;

  /**
   * Return all nominations (any status) for a runner.
   * Used to decide whether a scratched runner's row can be safely deleted.
   */
  getNominations(runnerId: number): Promise<{ id: number; status: string }[]>;

  /** Delete a runner row. Only called when no nominations remain. */
  deleteRunner(id: number): Promise<void>;
}

// ── Production adapter (Drizzle) ──────────────────────────────────────────────

export function makeDrizzleUpsertDb(): RunnerUpsertDb {
  return {
    async getRunnersForRace(raceId) {
      return drizzleDb
        .select({
          id: runnersTable.id,
          horseName: runnersTable.horseName,
          jockey: runnersTable.jockey,
          trainer: runnersTable.trainer,
        })
        .from(runnersTable)
        .where(eq(runnersTable.raceId, raceId));
    },

    async updateRunner(id, data) {
      await drizzleDb
        .update(runnersTable)
        .set(data)
        .where(eq(runnersTable.id, id));
    },

    async insertRunner(data) {
      const [inserted] = await drizzleDb
        .insert(runnersTable)
        .values(data)
        .returning({ id: runnersTable.id });
      return inserted;
    },

    async deletePendingNominations(runnerId) {
      await drizzleDb
        .delete(nominationsTable)
        .where(
          and(
            eq(nominationsTable.runnerId, runnerId),
            eq(nominationsTable.status, "Pending")
          )
        );
    },

    async getNominations(runnerId) {
      return drizzleDb
        .select({ id: nominationsTable.id, status: nominationsTable.status })
        .from(nominationsTable)
        .where(eq(nominationsTable.runnerId, runnerId));
    },

    async deleteRunner(id) {
      await drizzleDb
        .delete(runnersTable)
        .where(eq(runnersTable.id, id));
    },
  };
}

// ── Core upsert logic ─────────────────────────────────────────────────────────

/**
 * Upsert the runners for an *existing* race using fresh TAB field data.
 *
 * Contract:
 * - Runners already in the DB are updated in-place (ID preserved) so that
 *   historical nominations (Won/Placed/Unplaced) remain linked.
 * - Runners new to the TAB field (late entries, scratching replacements) are
 *   inserted as fresh rows.
 * - Runners absent from the new TAB field (scratched):
 *     • Their Pending nominations are deleted first.
 *     • Their row is deleted only when no nominations at all remain.
 *     • Rows with settled (Won/Placed/Unplaced) nominations are retained.
 */
export async function upsertRaceRunners(
  raceId: number,
  tabRunners: TabRunner[],
  adapter: RunnerUpsertDb
): Promise<{ runnersAdded: number; runnersUpdated: number }> {
  const existingRunners = await adapter.getRunnersForRace(raceId);

  // Build a lookup keyed by lower-cased horse name for fast matching
  const existingByName = new Map(
    existingRunners.map((r) => [r.horseName.toLowerCase(), r])
  );

  const seenRunnerIds = new Set<number>();
  let runnersAdded = 0;
  let runnersUpdated = 0;

  for (const tabRunner of tabRunners) {
    const existing = existingByName.get(tabRunner.horseName.toLowerCase());

    if (existing) {
      // Runner already in DB — update odds and reset filter evaluation so the
      // selection engine picks up the fresh prices.  ID is preserved so that
      // historical nominations (Won/Placed/Unplaced) remain correctly linked.
      await adapter.updateRunner(existing.id, {
        winOdds: tabRunner.winOdds,
        placeOdds: tabRunner.placeOdds,
        barrierNumber: tabRunner.barrierNumber,
        speedMapPosition: tabRunner.speedMapPosition,
        jockey: tabRunner.jockey ?? existing.jockey ?? null,
        trainer: tabRunner.trainer ?? existing.trainer ?? null,
        // Reset so runSelectionEngine re-evaluates with fresh odds
        passed: false,
        filterResults: "[]",
      });

      seenRunnerIds.add(existing.id);
      runnersUpdated++;
    } else {
      // New scratching replacement or late entry — insert fresh row
      const inserted = await adapter.insertRunner({
        raceId,
        horseName: tabRunner.horseName,
        barrierNumber: tabRunner.barrierNumber,
        speedMapPosition: tabRunner.speedMapPosition,
        winOdds: tabRunner.winOdds,
        placeOdds: tabRunner.placeOdds,
        jockey: tabRunner.jockey ?? null,
        trainer: tabRunner.trainer ?? null,
        passed: false,
        filterResults: "[]",
      });

      seenRunnerIds.add(inserted.id);
      runnersAdded++;
    }
  }

  // Remove runners that are no longer in the TAB field (scratched).
  // Only delete runner rows that have no completed nominations — pending
  // nominations are removed since the runner is gone from the field.
  for (const stale of existingRunners) {
    if (seenRunnerIds.has(stale.id)) continue;

    // Delete any Pending nominations for this scratched runner first
    await adapter.deletePendingNominations(stale.id);

    // Only remove the runner row if no nominations remain at all
    const remainingNoms = await adapter.getNominations(stale.id);
    if (remainingNoms.length === 0) {
      await adapter.deleteRunner(stale.id);
    }
  }

  return { runnersAdded, runnersUpdated };
}
