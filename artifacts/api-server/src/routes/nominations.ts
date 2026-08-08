import { Router } from "express";
import { db, nominationsTable, racesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { GetNominationsResponse, GetNominationsSummaryResponse } from "@workspace/api-zod";

const router = Router();

router.get("/nominations", async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(nominationsTable)
    .leftJoin(racesTable, eq(nominationsTable.raceId, racesTable.id))
    .orderBy(nominationsTable.raceDate, nominationsTable.raceNumber);

  res.json(GetNominationsResponse.parse(rows.map(({ nominations, races }) => ({
    id: nominations.id,
    raceId: nominations.raceId,
    runnerId: nominations.runnerId,
    trackName: nominations.trackName,
    state: nominations.state,
    raceNumber: nominations.raceNumber,
    raceName: nominations.raceName ?? null,
    raceDate: nominations.raceDate,
    raceTime: nominations.raceTime ?? null,
    horseName: nominations.horseName,
    barrierNumber: nominations.barrierNumber,
    speedMapPosition: nominations.speedMapPosition,
    winOdds: nominations.winOdds,
    placeOdds: nominations.placeOdds,
    winStake: nominations.winStake,
    placeStake: nominations.placeStake,
    totalOutlay: nominations.totalOutlay,
    projectedWinReturn: nominations.projectedWinReturn,
    projectedPlaceReturn: nominations.projectedPlaceReturn,
    jockey: nominations.jockey ?? null,
    trainer: nominations.trainer ?? null,
    status: nominations.status as "Pending" | "Won" | "Placed" | "Unplaced",
    dataSource: races?.dataSource ?? null,
  }))));
});

router.get("/nominations/summary", async (req, res): Promise<void> => {
  const nominations = await db.select().from(nominationsTable);

  const totalNominations = nominations.length;
  const totalOutlay = nominations.reduce((sum, n) => sum + n.totalOutlay, 0);

  // By track
  const trackMap: Record<string, number> = {};
  const stateMap: Record<string, number> = {};
  let pendingCount = 0, wonCount = 0, placedCount = 0, unplacedCount = 0;

  for (const n of nominations) {
    trackMap[n.trackName] = (trackMap[n.trackName] ?? 0) + 1;
    stateMap[n.state] = (stateMap[n.state] ?? 0) + 1;
    if (n.status === "Pending") pendingCount++;
    else if (n.status === "Won") wonCount++;
    else if (n.status === "Placed") placedCount++;
    else if (n.status === "Unplaced") unplacedCount++;
  }

  const summary = {
    totalNominations,
    totalOutlay,
    byTrack: Object.entries(trackMap).map(([trackName, count]) => ({ trackName, count })),
    byState: Object.entries(stateMap).map(([state, count]) => ({ state, count })),
    pendingCount,
    wonCount,
    placedCount,
    unplacedCount,
  };

  res.json(GetNominationsSummaryResponse.parse(summary));
});

export default router;
