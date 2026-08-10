import { useGetBetHistory, useGetTrackBreakdown, BetResultOutcome, BetResult, TrackPerformance } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Activity, TrendingUp, TrendingDown, Crosshair, DollarSign, ListOrdered, CalendarDays, Filter, ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine, ResponsiveContainer } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';

// ─── Types ───────────────────────────────────────────────────────────────────

type DateRange = 7 | 30 | 90 | 'all';

const DATE_RANGE_OPTIONS: { label: string; value: DateRange }[] = [
  { label: '7d', value: 7 },
  { label: '30d', value: 30 },
  { label: '90d', value: 90 },
  { label: 'All', value: 'all' },
];

// ─── KPI computation from raw history ────────────────────────────────────────

export function computeKpis(bets: BetResult[]) {
  if (!bets.length) return null;

  let totalOutlay = 0;
  let totalReturns = 0;
  let netProfitLossFromResult = 0;
  let wins = 0;
  let places = 0;
  // Derive implied odds from actual returns ÷ stake (matching server logic).
  // actualWinReturn / winStake gives the decimal win price paid.
  // actualPlaceReturn / placeStake gives the decimal place price paid.
  const impliedWinOdds: number[] = [];
  const impliedPlaceOdds: number[] = [];

  let currentStreak = 0;
  let longestWinStreak = 0;
  let currentLossStreak = 0;
  let longestLosingStreak = 0;

  for (const bet of bets) {
    totalOutlay += bet.totalOutlay;
    totalReturns += (bet.actualWinReturn ?? 0) + (bet.actualPlaceReturn ?? 0);
    netProfitLossFromResult += bet.netResult;

    const isWin = bet.outcome === BetResultOutcome.Won;
    const isPlace = bet.outcome === BetResultOutcome.Placed;

    if (isWin) {
      wins++;
      if (bet.winStake > 0 && (bet.actualWinReturn ?? 0) > 0) {
        impliedWinOdds.push((bet.actualWinReturn ?? 0) / bet.winStake);
      }
      if (bet.placeStake > 0 && (bet.actualPlaceReturn ?? 0) > 0) {
        impliedPlaceOdds.push((bet.actualPlaceReturn ?? 0) / bet.placeStake);
      }
      currentStreak++;
      currentLossStreak = 0;
      longestWinStreak = Math.max(longestWinStreak, currentStreak);
    } else if (isPlace) {
      places++;
      if (bet.placeStake > 0 && (bet.actualPlaceReturn ?? 0) > 0) {
        impliedPlaceOdds.push((bet.actualPlaceReturn ?? 0) / bet.placeStake);
      }
      currentStreak = 0;
      currentLossStreak++;
      longestLosingStreak = Math.max(longestLosingStreak, currentLossStreak);
    } else {
      currentStreak = 0;
      currentLossStreak++;
      longestLosingStreak = Math.max(longestLosingStreak, currentLossStreak);
    }
  }

  // Use the persisted netResult field — the same source as each Trade Log row —
  // so the badge can never disagree with the log totals.
  const netProfitLoss = netProfitLossFromResult;
  const roi = totalOutlay > 0 ? (netProfitLoss / totalOutlay) * 100 : 0;
  const winStrikeRate = (wins / bets.length) * 100;
  const placeStrikeRate = ((wins + places) / bets.length) * 100;
  const avgOddsWin = impliedWinOdds.length
    ? impliedWinOdds.reduce((a, b) => a + b, 0) / impliedWinOdds.length
    : 0;
  const avgOddsPlace = impliedPlaceOdds.length
    ? impliedPlaceOdds.reduce((a, b) => a + b, 0) / impliedPlaceOdds.length
    : 0;

  return {
    netProfitLoss,
    roi,
    totalBets: bets.length,
    winStrikeRate,
    placeStrikeRate,
    totalOutlay,
    totalReturns,
    avgOddsWin,
    avgOddsPlace,
    longestWinStreak,
    longestLosingStreak,
  };
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PerformanceDashboard() {
  const { data: trackBreakdown, isLoading: isTracksLoading } = useGetTrackBreakdown();
  const { data: history, isLoading: isHistoryLoading } = useGetBetHistory();

  const [dateRange, setDateRange] = useState<DateRange>('all');
  const [selectedTracks, setSelectedTracks] = useState<string[]>([]);
  const [trackPopoverOpen, setTrackPopoverOpen] = useState(false);

  // All unique track names from history
  const allTracks = useMemo(() => {
    if (!history?.length) return [];
    const names = Array.from(new Set(history.map((b) => b.trackName).filter(Boolean))) as string[];
    return names.sort();
  }, [history]);

  // Filtered history — typed as BetResult[]
  const filteredHistory = useMemo((): BetResult[] => {
    if (!history?.length) return [];

    let result: BetResult[] = history;

    // Date filter
    if (dateRange !== 'all') {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - dateRange);
      result = result.filter((b) => new Date(b.raceDate) >= cutoff);
    }

    // Track filter
    if (selectedTracks.length > 0) {
      result = result.filter((b) => selectedTracks.includes(b.trackName));
    }

    return result;
  }, [history, dateRange, selectedTracks]);

  const perf = useMemo(() => computeKpis(filteredHistory), [filteredHistory]);

  const isFiltered = dateRange !== 'all' || selectedTracks.length > 0;

  function clearFilters() {
    setDateRange('all');
    setSelectedTracks([]);
  }

  function toggleTrack(track: string) {
    setSelectedTracks((prev) =>
      prev.includes(track) ? prev.filter((t) => t !== track) : [...prev, track]
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Activity className="size-8 text-primary" />
            Trading Performance
          </h1>
          <p className="text-muted-foreground mt-2 font-mono text-sm">Live P&L metrics and historical bet log.</p>
        </div>
        {perf && (
          <Badge variant="outline" className={cn(
            "text-base px-4 py-1.5 font-mono border-2",
            perf.netProfitLoss > 0 ? "border-primary text-primary" : "border-destructive text-destructive"
          )}>
            Net: {perf.netProfitLoss > 0 ? '+' : ''}${perf.netProfitLoss.toFixed(2)}
          </Badge>
        )}
      </header>

      {/* ── Filters ── */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs uppercase font-mono text-muted-foreground flex items-center gap-1.5">
          <Filter className="size-3.5" />
          Filter
        </span>

        {/* Date range */}
        <div className="flex items-center gap-1 bg-secondary/40 rounded-lg p-1">
          {DATE_RANGE_OPTIONS.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => setDateRange(value)}
              className={cn(
                "px-3 py-1 rounded text-xs font-mono transition-colors",
                dateRange === value
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Track multi-select */}
        <Popover open={trackPopoverOpen} onOpenChange={setTrackPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-8 gap-1.5 text-xs font-mono",
                selectedTracks.length > 0 && "border-primary text-primary"
              )}
            >
              <Crosshair className="size-3" />
              {selectedTracks.length === 0
                ? 'All tracks'
                : selectedTracks.length === 1
                ? selectedTracks[0]
                : `${selectedTracks.length} tracks`}
              <ChevronDown className="size-3 ml-0.5 opacity-60" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2" align="start">
            <div className="text-xs font-mono text-muted-foreground uppercase mb-2 px-2 pt-1">Select tracks</div>
            {allTracks.length === 0 ? (
              <p className="text-xs text-muted-foreground px-2 py-4">No settled results yet — mark nominations as Won, Placed or Unplaced first.</p>
            ) : (
              <div className="max-h-64 overflow-y-auto space-y-1">
                {allTracks.map((track) => (
                  <label
                    key={track}
                    className="flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-secondary/60 cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedTracks.includes(track)}
                      onCheckedChange={() => toggleTrack(track)}
                      className="size-3.5"
                    />
                    <span className="text-xs truncate">{track}</span>
                  </label>
                ))}
              </div>
            )}
            {selectedTracks.length > 0 && (
              <div className="border-t border-border mt-2 pt-2 px-1">
                <button
                  onClick={() => setSelectedTracks([])}
                  className="text-xs text-muted-foreground hover:text-destructive transition-colors w-full text-left px-1"
                >
                  Clear track selection
                </button>
              </div>
            )}
          </PopoverContent>
        </Popover>

        {/* Clear all badge */}
        {isFiltered && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors font-mono"
          >
            <X className="size-3" />
            Clear filters
          </button>
        )}

        {/* Showing count */}
        {!isHistoryLoading && history?.length !== undefined && (
          <span className="text-xs text-muted-foreground font-mono ml-auto">
            {filteredHistory.length} / {history.length} bets
          </span>
        )}
      </div>

      {/* KPI Grid — computed from filtered history */}
      {isHistoryLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {[1,2,3,4,5,6,7,8,9,10].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
      ) : perf ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          <KpiCard title="Total ROI" value={`${perf.roi.toFixed(1)}%`} trend={perf.roi > 0 ? 'up' : 'down'} />
          <KpiCard title="Total Bets" value={perf.totalBets.toString()} />
          <KpiCard title="Win Strike" value={`${perf.winStrikeRate.toFixed(1)}%`} valueColor="text-primary" />
          <KpiCard title="Place Strike" value={`${perf.placeStrikeRate.toFixed(1)}%`} />
          <KpiCard title="Total Outlay" value={`$${perf.totalOutlay.toFixed(2)}`} />
          <KpiCard title="Total Returns" value={`$${perf.totalReturns.toFixed(2)}`} />
          <KpiCard title="Avg Win Odds" value={`$${perf.avgOddsWin.toFixed(2)}`} />
          <KpiCard title="Avg Place Odds" value={`$${perf.avgOddsPlace.toFixed(2)}`} />
          <KpiCard title="Best Streak" value={`${perf.longestWinStreak} Wins`} valueColor="text-primary" />
          <KpiCard title="Worst Streak" value={`${perf.longestLosingStreak} Losses`} valueColor="text-destructive" />
        </div>
      ) : !isHistoryLoading && !history?.length ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center space-y-2">
          <p className="text-foreground font-medium">No settled results recorded yet</p>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            The Performance page tracks races you've manually settled. Go to{' '}
            <strong>Nominations</strong>, open any card, press <strong>Edit</strong>, and mark it
            Won, Placed, or Unplaced — your stats will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="h-24 flex items-center justify-center text-muted-foreground text-sm border border-dashed border-border rounded-xl">
          No bets match the current filters.
        </div>
      )}

      {/* Cumulative P&L Chart */}
      <PnlChart history={filteredHistory} isLoading={isHistoryLoading} isFiltered={isFiltered} />

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Track Breakdown */}
        <Card className="lg:col-span-1 border-border bg-card flex flex-col">
          <CardHeader className="pb-4 border-b border-border bg-secondary/20">
            <CardTitle className="text-lg flex items-center gap-2">
              <Crosshair className="size-5 text-primary" />
              Track Edge
            </CardTitle>
            <CardDescription className="font-mono text-xs">P&L separated by circuit</CardDescription>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-auto max-h-[500px]">
            {isTracksLoading ? (
              <div className="p-6 space-y-4">
                {[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : trackBreakdown?.length ? (
              <div className="divide-y divide-border">
                {trackBreakdown.map((tb: TrackPerformance, i: number) => (
                  <div key={i} className="p-4 flex items-center justify-between hover:bg-secondary/20 transition-colors">
                    <div>
                      <div className="font-bold flex items-center gap-2">
                        {tb.trackName}
                        <span className="text-[10px] text-muted-foreground uppercase">{tb.state}</span>
                      </div>
                      <div className="text-xs font-mono text-muted-foreground mt-1">
                        {tb.totalBets} Bets • {tb.winStrikeRate.toFixed(0)}% W
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={cn("font-mono font-bold", tb.netProfitLoss > 0 ? "text-primary" : "text-destructive")}>
                        {tb.netProfitLoss > 0 ? '+' : ''}${tb.netProfitLoss.toFixed(2)}
                      </div>
                      <div className="text-xs font-mono mt-1 text-muted-foreground">
                        {tb.roi.toFixed(1)}% ROI
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-muted-foreground">No track data available.</div>
            )}
          </CardContent>
        </Card>

        {/* Bet History */}
        <Card className="lg:col-span-2 border-border bg-card flex flex-col">
          <CardHeader className="pb-4 border-b border-border bg-secondary/20 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <ListOrdered className="size-5 text-primary" />
                Trade Log
              </CardTitle>
              <CardDescription className="font-mono text-xs">
                Historical settled bets{isFiltered ? ` (filtered: ${filteredHistory.length})` : ''}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-auto max-h-[500px]">
            {isHistoryLoading ? (
               <div className="p-6 space-y-4">
               {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
             </div>
            ) : filteredHistory.length ? (
              <div className="w-full">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/50 font-mono text-xs uppercase text-muted-foreground sticky top-0 z-10 shadow-[0_1px_0_var(--border)]">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Date</th>
                      <th className="px-4 py-3 text-left font-medium">Runner / Track</th>
                      <th className="px-4 py-3 text-center font-medium">Pos</th>
                      <th className="px-4 py-3 text-right font-medium">Stakes (W/P)</th>
                      <th className="px-4 py-3 text-right font-medium">Returns</th>
                      <th className="px-4 py-3 text-right font-medium">Net</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredHistory.map((bet: BetResult) => {
                      const isWin = bet.outcome === BetResultOutcome.Won;
                      const isPlace = bet.outcome === BetResultOutcome.Placed;
                      const isLoss = bet.outcome === BetResultOutcome.Unplaced;
                      
                      return (
                        <tr key={bet.id} className="hover:bg-secondary/20 transition-colors group">
                          <td className="px-4 py-3 font-mono text-xs whitespace-nowrap text-muted-foreground">
                            {bet.raceDate.split('T')[0]}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-bold group-hover:text-primary transition-colors">{bet.horseName}</div>
                            <div className="text-xs text-muted-foreground">{bet.trackName}</div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge variant="outline" className={cn(
                              "font-mono rounded px-2 border-0 text-white",
                              isWin ? "bg-primary text-primary-foreground" : 
                              isPlace ? "bg-primary/40 text-primary-foreground" : 
                              "bg-destructive text-destructive-foreground"
                            )}>
                              {bet.finishPosition || '-'}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                            ${bet.winStake} / ${bet.placeStake}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                            <span className={isWin ? "text-primary" : ""}>${(bet.actualWinReturn || 0).toFixed(2)}</span>
                            {' / '}
                            <span className={isPlace || isWin ? "text-primary" : ""}>${(bet.actualPlaceReturn || 0).toFixed(2)}</span>
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold">
                            <span className={bet.netResult > 0 ? "text-primary" : "text-destructive"}>
                              {bet.netResult > 0 ? '+' : ''}${bet.netResult.toFixed(2)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-12 text-center text-muted-foreground flex flex-col items-center">
                <CalendarDays className="size-10 mb-3 opacity-20" />
                {isFiltered ? (
                  <>
                    <p>No bets match the current filters.</p>
                    <button onClick={clearFilters} className="text-xs mt-2 text-primary hover:underline">Clear filters</button>
                  </>
                ) : (
                  <>
                    <p>No historical trades found.</p>
                    <p className="text-xs mt-1">Pending nominations must be settled first.</p>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── P&L Chart helpers ────────────────────────────────────────────────────────

/** Pure function extracted from PnlChart useMemo so it can be unit-tested. */
export function buildChartData(history: BetResult[]) {
  if (!history?.length) return [];
  const sorted = [...history].sort(
    (a, b) => new Date(a.raceDate).getTime() - new Date(b.raceDate).getTime()
  );
  let running = 0;
  return sorted.map((bet) => {
    running += bet.netResult;
    return {
      date: bet.raceDate.split('T')[0],
      cumPnl: parseFloat(running.toFixed(2)),
      label: `${bet.horseName} @ ${bet.trackName}`,
    };
  });
}

// ─── P&L Chart ───────────────────────────────────────────────────────────────

const pnlChartConfig = {
  cumPnl: { label: 'Cumulative P&L', color: 'hsl(var(--primary))' },
};

function PnlChart({
  history,
  isLoading,
  isFiltered,
}: {
  history: BetResult[];
  isLoading: boolean;
  isFiltered: boolean;
}) {
  const chartData = useMemo(() => buildChartData(history), [history]);

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-4 border-b border-border bg-secondary/20">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="size-5 text-primary" />
              Cumulative P&amp;L
            </CardTitle>
            <CardDescription className="font-mono text-xs">
              {isFiltered
                ? `Running profit/loss for filtered selection (${history.length} bets)`
                : 'Running profit/loss across all settled bets'}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6 pb-4 px-2">
        {isLoading ? (
          <Skeleton className="h-56 w-full rounded-lg" />
        ) : chartData.length === 0 ? (
          <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">
            {isFiltered
              ? 'No bets match the current filters — adjust the date range or track selection.'
              : 'No settled bets yet — chart will appear once results are recorded.'}
          </div>
        ) : (
          <ChartContainer config={pnlChartConfig} className="h-56 w-full">
            <LineChart data={chartData} margin={{ top: 8, right: 24, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fontFamily: 'monospace' }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={(v) => `$${v}`}
                tick={{ fontSize: 10, fontFamily: 'monospace' }}
                tickLine={false}
                axisLine={false}
                width={56}
              />
              <ReferenceLine y={0} stroke="hsl(var(--border))" strokeDasharray="4 4" />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(label, payload) => {
                      const item = payload?.[0]?.payload;
                      return item ? `${item.date} — ${item.label}` : label;
                    }}
                    formatter={(value) => [`$${Number(value).toFixed(2)}`, 'Cumulative P&L']}
                  />
                }
              />
              <Line
                type="monotone"
                dataKey="cumPnl"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ r: 3, fill: 'hsl(var(--primary))', strokeWidth: 0 }}
                activeDot={{ r: 5, strokeWidth: 0 }}
              />
            </LineChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ title, value, trend, valueColor = "text-foreground" }: {
  title: string;
  value: string;
  trend?: 'up' | 'down';
  valueColor?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col justify-between hover:border-primary/50 transition-colors">
      <div className="text-xs uppercase tracking-wider text-muted-foreground font-mono mb-2">{title}</div>
      <div className="flex items-end justify-between">
        <div className={cn("text-2xl font-bold font-mono tracking-tight", valueColor)}>{value}</div>
        {trend && (
          <div className={cn(
            "flex items-center", 
            trend === 'up' ? "text-primary" : "text-destructive"
          )}>
            {trend === 'up' ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
          </div>
        )}
      </div>
    </div>
  );
}
