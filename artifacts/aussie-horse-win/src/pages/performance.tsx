import { useGetPerformance, useGetTrackBreakdown, useGetBetHistory, BetResultOutcome } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Activity, TrendingUp, TrendingDown, Crosshair, DollarSign, ListOrdered, CalendarDays, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function PerformanceDashboard() {
  const { data: perf, isLoading: isPerfLoading } = useGetPerformance();
  const { data: trackBreakdown, isLoading: isTracksLoading } = useGetTrackBreakdown();
  const { data: history, isLoading: isHistoryLoading } = useGetBetHistory();

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

      {/* KPI Grid */}
      {isPerfLoading ? (
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
      ) : null}

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
                {trackBreakdown.map((tb, i) => (
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
              <CardDescription className="font-mono text-xs">Historical settled bets</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-auto max-h-[500px]">
            {isHistoryLoading ? (
               <div className="p-6 space-y-4">
               {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
             </div>
            ) : history?.length ? (
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
                    {history.map((bet) => {
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
                <p>No historical trades found.</p>
                <p className="text-xs mt-1">Pending nominations must be settled first.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({ title, value, trend, valueColor = "text-foreground" }: any) {
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