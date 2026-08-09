import { describe, it, expect } from 'vitest';
import { buildChartData } from './performance';
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
