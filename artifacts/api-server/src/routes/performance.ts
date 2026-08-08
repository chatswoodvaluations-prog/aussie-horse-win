import { Router } from "express";
import { db, betResultsTable } from "@workspace/db";
import { GetPerformanceResponse, GetBetHistoryResponse, GetTrackBreakdownResponse } from "@workspace/api-zod";

const router = Router();

router.get("/performance", async (req, res): Promise<void> => {
  const results = await db.select().from(betResultsTable).orderBy(betResultsTable.raceDate);

  const totalBets = results.length;
  const totalOutlay = results.reduce((s, r) => s + r.totalOutlay, 0);
  const totalReturns = results.reduce((s, r) => s + (r.actualWinReturn ?? 0) + (r.actualPlaceReturn ?? 0), 0);
  const netProfitLoss = totalReturns - totalOutlay;

  const wins = results.filter((r) => r.outcome === "Won");
  const placed = results.filter((r) => r.outcome === "Placed" || r.outcome === "Won");
  const totalWins = wins.length;
  const totalPlaced = results.filter((r) => r.outcome === "Placed").length;
  const totalUnplaced = results.filter((r) => r.outcome === "Unplaced").length;

  const winStrikeRate = totalBets > 0 ? (totalWins / totalBets) * 100 : 0;
  const placeStrikeRate = totalBets > 0 ? (placed.length / totalBets) * 100 : 0;
  const roi = totalOutlay > 0 ? ((netProfitLoss / totalOutlay) * 100) : 0;

  const avgOddsWin = wins.length > 0
    ? wins.reduce((s, r) => s + (r.actualWinReturn ?? 0) / r.winStake, 0) / wins.length
    : 0;
  const placedResults = placed.filter((r) => (r.actualPlaceReturn ?? 0) > 0);
  const avgOddsPlace = placedResults.length > 0
    ? placedResults.reduce((s, r) => s + (r.actualPlaceReturn ?? 0) / r.placeStake, 0) / placedResults.length
    : 0;

  // Calculate streaks
  let longestWinStreak = 0, longestLosingStreak = 0;
  let currentWin = 0, currentLoss = 0;
  for (const r of results) {
    if (r.outcome === "Won") {
      currentWin++;
      currentLoss = 0;
      if (currentWin > longestWinStreak) longestWinStreak = currentWin;
    } else {
      currentLoss++;
      currentWin = 0;
      if (currentLoss > longestLosingStreak) longestLosingStreak = currentLoss;
    }
  }

  const performance = {
    totalBets,
    totalOutlay,
    totalReturns,
    netProfitLoss,
    winStrikeRate,
    placeStrikeRate,
    roi,
    avgOddsWin,
    avgOddsPlace,
    longestWinStreak,
    longestLosingStreak,
    totalWins,
    totalPlaced,
    totalUnplaced,
  };

  res.json(GetPerformanceResponse.parse(performance));
});

router.get("/performance/history", async (req, res): Promise<void> => {
  const results = await db.select().from(betResultsTable).orderBy(betResultsTable.raceDate);
  res.json(GetBetHistoryResponse.parse(results.map((r) => ({
    id: r.id,
    nominationId: r.nominationId,
    raceId: r.raceId,
    runnerId: r.runnerId,
    trackName: r.trackName,
    raceDate: r.raceDate,
    horseName: r.horseName,
    finishPosition: r.finishPosition,
    fieldSize: r.fieldSize,
    winStake: r.winStake,
    placeStake: r.placeStake,
    totalOutlay: r.totalOutlay,
    actualWinReturn: r.actualWinReturn ?? null,
    actualPlaceReturn: r.actualPlaceReturn ?? null,
    netResult: r.netResult,
    outcome: r.outcome as "Won" | "Placed" | "Unplaced",
  }))));
});

router.get("/performance/track-breakdown", async (req, res): Promise<void> => {
  const results = await db.select().from(betResultsTable);

  // Group by track
  const trackMap: Record<string, {
    state: string;
    results: typeof results;
  }> = {};

  for (const r of results) {
    if (!trackMap[r.trackName]) {
      trackMap[r.trackName] = { state: "", results: [] };
    }
    trackMap[r.trackName].results.push(r);
  }

  const breakdown = Object.entries(trackMap).map(([trackName, data]) => {
    const bets = data.results;
    const totalBets = bets.length;
    const totalOutlay = bets.reduce((s, r) => s + r.totalOutlay, 0);
    const totalReturns = bets.reduce((s, r) => s + (r.actualWinReturn ?? 0) + (r.actualPlaceReturn ?? 0), 0);
    const netProfitLoss = totalReturns - totalOutlay;
    const wins = bets.filter((r) => r.outcome === "Won").length;
    const placed = bets.filter((r) => r.outcome === "Placed" || r.outcome === "Won").length;
    return {
      trackName,
      state: data.state,
      totalBets,
      totalOutlay,
      totalReturns,
      netProfitLoss,
      winStrikeRate: totalBets > 0 ? (wins / totalBets) * 100 : 0,
      placeStrikeRate: totalBets > 0 ? (placed / totalBets) * 100 : 0,
      roi: totalOutlay > 0 ? ((netProfitLoss / totalOutlay) * 100) : 0,
    };
  });

  res.json(GetTrackBreakdownResponse.parse(breakdown));
});

export default router;
