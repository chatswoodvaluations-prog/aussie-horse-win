import { Router } from "express";
import { db, racesTable, runnersTable, nominationsTable, betResultsTable } from "@workspace/db";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { GetRacesResponse, GetRaceResponse, GetRaceParams, RecordResultParams, RecordResultBody, RecordResultResponse } from "@workspace/api-zod";

const router = Router();

// Tracks nominationIds currently being processed to prevent concurrent duplicate writes
const inProgressNominationIds = new Set<number>();

function buildRaceResponse(race: typeof racesTable.$inferSelect, runners: typeof runnersTable.$inferSelect[]) {
  const qualifiedCount = runners.filter((r) => r.passed).length;
  return {
    id: race.id,
    trackName: race.trackName,
    state: race.state,
    raceNumber: race.raceNumber,
    raceName: race.raceName ?? null,
    raceDate: race.raceDate,
    raceTime: race.raceTime ?? null,
    fieldSize: race.fieldSize,
    distance: race.distance ?? null,
    qualifiedCount,
    dataSource: (race.dataSource as "live" | "mock" | null) ?? null,
    runners: runners.map((r) => ({
      id: r.id,
      raceId: r.raceId,
      horseName: r.horseName,
      barrierNumber: r.barrierNumber,
      speedMapPosition: r.speedMapPosition,
      winOdds: r.winOdds,
      placeOdds: r.placeOdds,
      jockey: r.jockey ?? null,
      trainer: r.trainer ?? null,
      passed: r.passed,
      filterResults: JSON.parse(r.filterResults) as {
        rule: string;
        passed: boolean;
        message: string;
      }[],
    })),
  };
}

router.get("/races", async (req, res): Promise<void> => {
  // Default window: 14 days back → 7 days forward (covers settling recent bets + upcoming races).
  // Callers can override with ?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD.
  const { dateFrom, dateTo } = req.query as { dateFrom?: string; dateTo?: string };

  const now = new Date();
  const fallbackFrom = new Date(now);
  fallbackFrom.setDate(fallbackFrom.getDate() - 14);
  const fallbackTo = new Date(now);
  fallbackTo.setDate(fallbackTo.getDate() + 7);

  const from = dateFrom ?? fallbackFrom.toISOString().slice(0, 10);
  const to   = dateTo   ?? fallbackTo.toISOString().slice(0, 10);

  const races = await db
    .select()
    .from(racesTable)
    .where(and(gte(racesTable.raceDate, from), lte(racesTable.raceDate, to)))
    .orderBy(racesTable.raceDate, racesTable.raceNumber);

  if (races.length === 0) {
    res.json(GetRacesResponse.parse([]));
    return;
  }

  // Fetch all runners in one query then group — avoids N+1 with thousands of races.
  const raceIds = races.map((r) => r.id);
  const allRunners = await db.select().from(runnersTable).where(inArray(runnersTable.raceId, raceIds));

  const runnersByRaceId = new Map<number, (typeof runnersTable.$inferSelect)[]>();
  for (const runner of allRunners) {
    const list = runnersByRaceId.get(runner.raceId) ?? [];
    list.push(runner);
    runnersByRaceId.set(runner.raceId, list);
  }

  const result = races.map((race) => buildRaceResponse(race, runnersByRaceId.get(race.id) ?? []));
  res.json(GetRacesResponse.parse(result));
});

router.get("/races/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid race id" });
    return;
  }

  const races = await db.select().from(racesTable).where(eq(racesTable.id, id));
  if (races.length === 0) {
    res.status(404).json({ error: "Race not found" });
    return;
  }

  const race = races[0];
  const runners = await db.select().from(runnersTable).where(eq(runnersTable.raceId, race.id));
  res.json(GetRaceResponse.parse(buildRaceResponse(race, runners)));
});

router.post("/races/:id/result", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const raceId = parseInt(raw, 10);
  if (isNaN(raceId)) {
    res.status(400).json({ error: "Invalid race id" });
    return;
  }

  const parsed = RecordResultBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid result body");
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { runnerId, finishPosition, actualWinReturn, actualPlaceReturn } = parsed.data;

  // Find the race
  const races = await db.select().from(racesTable).where(eq(racesTable.id, raceId));
  if (races.length === 0) {
    res.status(404).json({ error: "Race not found" });
    return;
  }
  const race = races[0];

  // Find nomination for this runner
  const nominations = await db.select().from(nominationsTable).where(eq(nominationsTable.runnerId, runnerId));
  if (nominations.length === 0) {
    res.status(404).json({ error: "Nomination not found for this runner" });
    return;
  }
  const nomination = nominations[0];

  // Guard against concurrent duplicate writes for the same nomination
  if (inProgressNominationIds.has(nomination.id)) {
    res.status(409).json({ error: "A result for this nomination is already being recorded. Please wait and try again." });
    return;
  }
  inProgressNominationIds.add(nomination.id);

  try {
  // Determine outcome
  let outcome: string;
  let status: string;
  if (finishPosition === 1) {
    outcome = "Won";
    status = "Won";
  } else if (finishPosition <= 3 && race.fieldSize >= 8) {
    outcome = "Placed";
    status = "Placed";
  } else {
    outcome = "Unplaced";
    status = "Unplaced";
  }

  const winReturn = actualWinReturn ?? 0;
  const placeReturn = actualPlaceReturn ?? 0;
  const netResult = winReturn + placeReturn - nomination.totalOutlay;

  // Upsert bet result — update if already exists for this nomination, insert otherwise
  const existing = await db.select().from(betResultsTable).where(eq(betResultsTable.nominationId, nomination.id));

  let betResult: typeof betResultsTable.$inferSelect;
  if (existing.length > 0) {
    const [updated] = await db.update(betResultsTable).set({
      finishPosition,
      actualWinReturn: actualWinReturn ?? null,
      actualPlaceReturn: actualPlaceReturn ?? null,
      netResult,
      outcome,
    }).where(eq(betResultsTable.nominationId, nomination.id)).returning();
    betResult = updated;
  } else {
    const [inserted] = await db.insert(betResultsTable).values({
      nominationId: nomination.id,
      raceId,
      runnerId,
      trackName: race.trackName,
      raceDate: race.raceDate,
      horseName: nomination.horseName,
      finishPosition,
      fieldSize: race.fieldSize,
      winStake: nomination.winStake,
      placeStake: nomination.placeStake,
      totalOutlay: nomination.totalOutlay,
      actualWinReturn: actualWinReturn ?? null,
      actualPlaceReturn: actualPlaceReturn ?? null,
      netResult,
      outcome,
    }).returning();
    betResult = inserted;
  }

  // Update nomination status
  await db.update(nominationsTable).set({ status }).where(eq(nominationsTable.id, nomination.id));

  const result = {
    id: betResult.id,
    nominationId: betResult.nominationId,
    raceId: betResult.raceId,
    runnerId: betResult.runnerId,
    trackName: betResult.trackName,
    raceDate: betResult.raceDate,
    horseName: betResult.horseName,
    finishPosition: betResult.finishPosition,
    fieldSize: betResult.fieldSize,
    winStake: betResult.winStake,
    placeStake: betResult.placeStake,
    totalOutlay: betResult.totalOutlay,
    actualWinReturn: betResult.actualWinReturn ?? null,
    actualPlaceReturn: betResult.actualPlaceReturn ?? null,
    netResult: betResult.netResult,
    outcome: betResult.outcome as "Won" | "Placed" | "Unplaced",
  };

    res.json(RecordResultResponse.parse(result));
  } finally {
    inProgressNominationIds.delete(nomination.id);
  }
});

export default router;
