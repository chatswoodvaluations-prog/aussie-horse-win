import { Router } from "express";
import { db, racesTable, runnersTable, nominationsTable, betResultsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { GetRacesResponse, GetRaceResponse, GetRaceParams, RecordResultParams, RecordResultBody, RecordResultResponse } from "@workspace/api-zod";

const router = Router();

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
  const races = await db.select().from(racesTable).orderBy(racesTable.raceDate, racesTable.raceNumber);
  const result = await Promise.all(
    races.map(async (race) => {
      const runners = await db.select().from(runnersTable).where(eq(runnersTable.raceId, race.id));
      return buildRaceResponse(race, runners);
    })
  );
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

  // Insert bet result
  const [betResult] = await db.insert(betResultsTable).values({
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
});

export default router;
