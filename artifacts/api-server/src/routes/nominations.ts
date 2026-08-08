import { Router } from "express";
import { db, nominationsTable } from "@workspace/db";
import { GetNominationsResponse, GetNominationsSummaryResponse } from "@workspace/api-zod";

const router = Router();

router.get("/nominations", async (req, res): Promise<void> => {
  const nominations = await db.select().from(nominationsTable).orderBy(nominationsTable.raceDate, nominationsTable.raceNumber);
  res.json(GetNominationsResponse.parse(nominations.map((n) => ({
    id: n.id,
    raceId: n.raceId,
    runnerId: n.runnerId,
    trackName: n.trackName,
    state: n.state,
    raceNumber: n.raceNumber,
    raceName: n.raceName ?? null,
    raceDate: n.raceDate,
    raceTime: n.raceTime ?? null,
    horseName: n.horseName,
    barrierNumber: n.barrierNumber,
    speedMapPosition: n.speedMapPosition,
    winOdds: n.winOdds,
    placeOdds: n.placeOdds,
    winStake: n.winStake,
    placeStake: n.placeStake,
    totalOutlay: n.totalOutlay,
    projectedWinReturn: n.projectedWinReturn,
    projectedPlaceReturn: n.projectedPlaceReturn,
    jockey: n.jockey ?? null,
    trainer: n.trainer ?? null,
    status: n.status as "Pending" | "Won" | "Placed" | "Unplaced",
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
