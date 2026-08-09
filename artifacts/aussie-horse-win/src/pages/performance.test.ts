import { describe, it, expect } from 'vitest';
import { buildChartData, computeKpis } from './performance';
import type { BetResult } from '@workspace/api-client-react';
import { BetResultOutcome } from '@workspace/api-client-react';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeBet(overrides: Partial<BetResult> & { netResult: number; raceDate: string }): BetResult {
  return {
    id: 1,
    nominationId: 1,
    raceId: 1,
    runnerId: 1,
    trackName: 'Flemington',
    horseName: 'Test Horse',
    finishPosition: 1,
    fieldSize: 10,
    winStake: 10,
    placeStake: 5,
    totalOutlay: 15,
    actualWinReturn: null,
    actualPlaceReturn: null,
    outcome: BetResultOutcome.Unplaced,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('buildChartData', () => {
  it('returns an empty array for empty history', () => {
    expect(buildChartData([])).toEqual([]);
  });

  it('last chart point cumPnl equals sum of all netResult values', () => {
    const bets = [
      makeBet({ netResult: -15, raceDate: '2026-01-01T00:00:00Z' }),
      makeBet({ netResult: 40, raceDate: '2026-01-02T00:00:00Z', outcome: BetResultOutcome.Won }),
      makeBet({ netResult: -15, raceDate: '2026-01-03T00:00:00Z' }),
      makeBet({ netResult: 25, raceDate: '2026-01-04T00:00:00Z', outcome: BetResultOutcome.Placed }),
    ];

    const data = buildChartData(bets);

    const sumNetResult = parseFloat(
      bets.reduce((acc, b) => acc + b.netResult, 0).toFixed(2)
    );
    expect(data).toHaveLength(bets.length);
    expect(data[data.length - 1].cumPnl).toBe(sumNetResult);
  });

  it('sorts by raceDate ascending before accumulating', () => {
    // Provide bets in reverse date order — result must still be correctly ordered
    const bets = [
      makeBet({ id: 2, netResult: 30, raceDate: '2026-02-01T00:00:00Z' }),
      makeBet({ id: 1, netResult: -10, raceDate: '2026-01-01T00:00:00Z' }),
    ];

    const data = buildChartData(bets);

    // First point should be the earlier date with -10 cumulative
    expect(data[0].date).toBe('2026-01-01');
    expect(data[0].cumPnl).toBe(-10);
    // Second point should accumulate 30 on top
    expect(data[1].date).toBe('2026-02-01');
    expect(data[1].cumPnl).toBe(20);
  });

  it('handles a single bet correctly', () => {
    const bet = makeBet({ netResult: 12.5, raceDate: '2026-03-15T10:00:00Z' });
    const data = buildChartData([bet]);

    expect(data).toHaveLength(1);
    expect(data[0].cumPnl).toBe(12.5);
    expect(data[0].date).toBe('2026-03-15');
    expect(data[0].label).toBe('Test Horse @ Flemington');
  });

  it('rounds cumPnl to 2 decimal places at each step', () => {
    // 0.1 + 0.2 is a classic floating-point case
    const bets = [
      makeBet({ netResult: 0.1, raceDate: '2026-01-01T00:00:00Z' }),
      makeBet({ netResult: 0.2, raceDate: '2026-01-02T00:00:00Z' }),
    ];

    const data = buildChartData(bets);

    expect(data[1].cumPnl).toBe(0.3);
  });

  it('last point matches when all bets are losses', () => {
    const bets = [
      makeBet({ netResult: -15, raceDate: '2026-01-01T00:00:00Z' }),
      makeBet({ netResult: -15, raceDate: '2026-01-02T00:00:00Z' }),
      makeBet({ netResult: -15, raceDate: '2026-01-03T00:00:00Z' }),
    ];

    const data = buildChartData(bets);

    expect(data[data.length - 1].cumPnl).toBe(-45);
  });
});

describe('computeKpis', () => {
  it('returns null for an empty history', () => {
    expect(computeKpis([])).toBeNull();
  });

  it('netProfitLoss equals the sum of all bet.netResult values', () => {
    const bets = [
      makeBet({ netResult: -15, raceDate: '2026-01-01T00:00:00Z', totalOutlay: 15, actualWinReturn: null, actualPlaceReturn: null }),
      makeBet({ netResult: 40, raceDate: '2026-01-02T00:00:00Z', outcome: BetResultOutcome.Won, totalOutlay: 15, winStake: 10, placeStake: 5, actualWinReturn: 50, actualPlaceReturn: 5 }),
      makeBet({ netResult: -15, raceDate: '2026-01-03T00:00:00Z', totalOutlay: 15, actualWinReturn: null, actualPlaceReturn: null }),
      makeBet({ netResult: 25, raceDate: '2026-01-04T00:00:00Z', outcome: BetResultOutcome.Placed, totalOutlay: 15, winStake: 10, placeStake: 5, actualWinReturn: null, actualPlaceReturn: 40 }),
    ];

    const kpis = computeKpis(bets);

    const expectedNetPnl = bets.reduce((acc, b) => acc + b.netResult, 0);
    expect(kpis).not.toBeNull();
    expect(kpis!.netProfitLoss).toBeCloseTo(expectedNetPnl, 10);
  });

  it('netProfitLoss matches sum of netResult when all bets are losses', () => {
    const bets = [
      makeBet({ netResult: -15, raceDate: '2026-01-01T00:00:00Z', totalOutlay: 15, actualWinReturn: null, actualPlaceReturn: null }),
      makeBet({ netResult: -15, raceDate: '2026-01-02T00:00:00Z', totalOutlay: 15, actualWinReturn: null, actualPlaceReturn: null }),
      makeBet({ netResult: -15, raceDate: '2026-01-03T00:00:00Z', totalOutlay: 15, actualWinReturn: null, actualPlaceReturn: null }),
    ];

    const kpis = computeKpis(bets);

    const expectedNetPnl = bets.reduce((acc, b) => acc + b.netResult, 0);
    expect(kpis).not.toBeNull();
    expect(kpis!.netProfitLoss).toBeCloseTo(expectedNetPnl, 10);
  });

  it('netProfitLoss matches sum of netResult for a single winning bet', () => {
    const bet = makeBet({
      netResult: 35,
      raceDate: '2026-03-15T10:00:00Z',
      outcome: BetResultOutcome.Won,
      totalOutlay: 15,
      winStake: 10,
      placeStake: 5,
      actualWinReturn: 45,
      actualPlaceReturn: 5,
    });

    const kpis = computeKpis([bet]);

    expect(kpis).not.toBeNull();
    expect(kpis!.netProfitLoss).toBeCloseTo(35, 10);
    expect(kpis!.totalBets).toBe(1);
  });

  it('badge value (netProfitLoss) equals sum of trade-log rows (netResult) — mixed outcomes', () => {
    // This is the core invariant: badge === sum of trade log
    const bets = [
      makeBet({ netResult: -15, raceDate: '2026-01-01T00:00:00Z', totalOutlay: 15, actualWinReturn: null, actualPlaceReturn: null }),
      makeBet({ netResult: 85, raceDate: '2026-01-02T00:00:00Z', outcome: BetResultOutcome.Won, totalOutlay: 15, winStake: 10, placeStake: 5, actualWinReturn: 95, actualPlaceReturn: 5 }),
      makeBet({ netResult: 10, raceDate: '2026-01-03T00:00:00Z', outcome: BetResultOutcome.Placed, totalOutlay: 15, winStake: 10, placeStake: 5, actualWinReturn: null, actualPlaceReturn: 25 }),
      makeBet({ netResult: -15, raceDate: '2026-01-04T00:00:00Z', totalOutlay: 15, actualWinReturn: null, actualPlaceReturn: null }),
    ];

    const kpis = computeKpis(bets);
    const tradeLogSum = bets.reduce((acc, b) => acc + b.netResult, 0);

    expect(kpis).not.toBeNull();
    expect(kpis!.netProfitLoss).toBeCloseTo(tradeLogSum, 10);
  });

  it('badge follows netResult even when it differs from actualReturns − totalOutlay', () => {
    // Regression: if the server-persisted netResult diverges from
    // (actualWinReturn + actualPlaceReturn − totalOutlay) due to rounding,
    // adjustments, or a future schema change, the badge must follow netResult
    // (matching the trade-log row) — not recompute from the raw return fields.
    const bets = [
      // netResult deliberately set to a value that does NOT equal returns − outlay
      // (returns − outlay = 50 + 5 − 15 = 40, but server settled it as 41.50)
      makeBet({
        netResult: 41.50,
        raceDate: '2026-06-01T00:00:00Z',
        outcome: BetResultOutcome.Won,
        totalOutlay: 15,
        winStake: 10,
        placeStake: 5,
        actualWinReturn: 50,
        actualPlaceReturn: 5,
      }),
      makeBet({
        netResult: -15,
        raceDate: '2026-06-02T00:00:00Z',
        totalOutlay: 15,
        actualWinReturn: null,
        actualPlaceReturn: null,
      }),
    ];

    const kpis = computeKpis(bets);
    const tradeLogSum = bets.reduce((acc, b) => acc + b.netResult, 0); // 41.50 + (−15) = 26.50
    const returnsMinusOutlay = (50 + 5 + 0 + 0) - (15 + 15);          // 25.00 — badge must NOT use this

    expect(kpis).not.toBeNull();
    expect(kpis!.netProfitLoss).toBeCloseTo(tradeLogSum, 10);       // 26.50 ✓
    expect(kpis!.netProfitLoss).not.toBeCloseTo(returnsMinusOutlay, 10); // must not be 25.00
  });
});
