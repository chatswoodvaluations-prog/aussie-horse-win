import { useState, useRef, useEffect } from 'react';
import { useGetNominations, useGetNominationsSummary, useRecordResult, NominationStatus, Nomination } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Coins, MapPin, Hash, TrendingUp, AlertCircle, Clock, CheckSquare, Pencil, Wifi, FlaskConical, ChevronDown, ChevronUp, PlayCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const HOW_IT_WORKS_SEEN_KEY = 'ahw_how_it_works_seen';

function HowItWorksBanner() {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(HOW_IT_WORKS_SEEN_KEY) !== 'true';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    if (open) {
      // Mark as seen once the user expands the banner
      try {
        localStorage.setItem(HOW_IT_WORKS_SEEN_KEY, 'true');
      } catch {
        // ignore
      }
    }
  }, [open]);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen(prev => !prev)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-secondary/40 transition-colors group"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2.5 text-sm font-mono font-semibold text-muted-foreground group-hover:text-foreground transition-colors">
          <PlayCircle className="size-4 text-primary" />
          <span className="uppercase tracking-wider">How it works</span>
          <span className="text-[10px] font-normal text-muted-foreground/60 ml-1">32s explainer</span>
        </div>
        {open
          ? <ChevronUp className="size-4 text-muted-foreground" />
          : <ChevronDown className="size-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="border-t border-border">
          <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
            <iframe
              src="/aussie-horse-win-video/"
              title="How Aussie Horse Win works"
              className="absolute inset-0 w-full h-full"
              allow="autoplay"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function Nominations() {
  const { data: nominations, isLoading: isNomsLoading } = useGetNominations();
  const { data: summary, isLoading: isSummaryLoading } = useGetNominationsSummary();

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Weekly Nominations</h1>
        <p className="text-muted-foreground mt-2 font-mono text-sm">Strict +EV selections across regional circuits.</p>
      </header>

      <HowItWorksBanner />

      {isSummaryLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28 rounded-lg" />)}
        </div>
      ) : summary ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard 
            title="Total Qualified" 
            value={summary.totalNominations.toString()} 
            icon={TrendingUp}
            trend={`${summary.pendingCount} pending`}
          />
          <StatCard 
            title="Total Outlay" 
            value={`$${summary.totalOutlay.toFixed(2)}`} 
            icon={Coins} 
            valueColor="text-foreground"
          />
          <StatCard 
            title="Wins / Placed" 
            value={`${summary.wonCount} / ${summary.placedCount}`} 
            icon={TrophyIcon} 
            valueColor="text-primary"
          />
          <StatCard 
            title="Losses" 
            value={summary.unplacedCount.toString()} 
            icon={AlertCircle} 
            valueColor="text-destructive"
          />
        </div>
      ) : null}

      <div>
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <Clock className="size-5 text-primary" /> Active Card
        </h2>

        {isNomsLoading ? (
          <div className="grid gap-4 xl:gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-64 rounded-xl" />)}
          </div>
        ) : !nominations?.length ? (
          <div className="border border-dashed border-border rounded-xl p-12 text-center bg-card/30 flex flex-col items-center">
            <div className="size-12 rounded-full bg-secondary flex items-center justify-center mb-4 text-muted-foreground">
              <TrendingUp className="size-6" />
            </div>
            <h3 className="text-lg font-bold mb-1">No Nominations Found</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              The filter engine hasn't found any runners matching the strict criteria this week. Sync data or adjust filter settings.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 xl:gap-6 md:grid-cols-2 lg:grid-cols-3">
            {nominations.map(nom => (
              <NominationCard key={nom.id} nom={nom} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, trend, valueColor = "text-foreground" }: any) {
  return (
    <Card className="bg-card border-card-border overflow-hidden relative group">
      <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
        <Icon className="size-16" />
      </div>
      <CardContent className="p-6 relative z-10">
        <p className="text-sm font-medium text-muted-foreground mb-1 font-mono uppercase tracking-wider">{title}</p>
        <div className={cn("text-3xl font-bold tracking-tight font-mono mb-2", valueColor)}>
          {value}
        </div>
        {trend && (
          <p className="text-xs text-amber-500 font-mono bg-amber-500/10 inline-flex px-2 py-0.5 rounded">
            {trend}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function NominationCard({ nom }: { nom: Nomination }) {
  const [open, setOpen] = useState(false);
  const [finishPosition, setFinishPosition] = useState('');
  const [winReturn, setWinReturn] = useState('');
  const [placeReturn, setPlaceReturn] = useState('');
  const recordResult = useRecordResult();
  const queryClient = useQueryClient();
  // Guard against double-submission: tracks whether a request is already in-flight
  const isSubmittingRef = useRef(false);

  const isPending = nom.status === NominationStatus.Pending;
  const isWon = nom.status === NominationStatus.Won;
  const isPlaced = nom.status === NominationStatus.Placed;
  const isUnplaced = nom.status === NominationStatus.Unplaced;
  const isSettled = !isPending;

  const statusColor = isWon ? 'bg-primary/20 text-primary border-primary/50 shadow-[0_0_10px_rgba(0,255,102,0.1)]' 
    : isPlaced ? 'bg-primary/10 text-primary/80 border-primary/30'
    : isUnplaced ? 'bg-destructive/10 text-destructive border-destructive/30'
    : 'bg-amber-500/10 text-amber-500 border-amber-500/30';

  const openDialog = () => {
    setFinishPosition('');
    // Pre-fill returns with projected values as a starting point
    setWinReturn(nom.projectedWinReturn.toFixed(2));
    setPlaceReturn(nom.projectedPlaceReturn.toFixed(2));
    isSubmittingRef.current = false;
    setOpen(true);
  };

  const handleCloseDialog = (nextOpen: boolean) => {
    if (!nextOpen) {
      // Reset guard when dialog closes so it's clean for next open
      isSubmittingRef.current = false;
    }
    setOpen(nextOpen);
  };

  const handleRecordResult = (e: React.FormEvent) => {
    e.preventDefault();
    if (!finishPosition) return;
    // Prevent a second request racing if the first is still in-flight
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    recordResult.mutate({
      id: nom.raceId,
      data: {
        runnerId: nom.runnerId,
        finishPosition: parseInt(finishPosition),
        actualWinReturn: winReturn ? parseFloat(winReturn) : null,
        actualPlaceReturn: placeReturn ? parseFloat(placeReturn) : null,
      }
    }, {
      onSuccess: () => {
        isSubmittingRef.current = false;
        toast.success(`Result recorded for ${nom.horseName}`);
        setOpen(false);
        queryClient.invalidateQueries();
      },
      onError: (err: any) => {
        isSubmittingRef.current = false;
        if (err?.status === 409) {
          toast.error('Another save is already in progress — please wait a moment and try again.');
        } else {
          toast.error('Failed to record result');
        }
      }
    });
  };

  return (
    <Card className={cn(
      "border bg-card hover:border-border/80 transition-all duration-300 flex flex-col",
      isWon && "border-primary/50",
      isUnplaced && "opacity-75 grayscale-[0.5]"
    )}>
      <CardHeader className="p-4 pb-0 flex flex-row items-start justify-between space-y-0">
        <div className="flex-1">
          <div className="flex justify-between items-start mb-2">
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className={cn("font-mono text-[10px] uppercase", statusColor)}>
                {nom.status}
              </Badge>
              {nom.dataSource === 'live' ? (
                <Badge variant="outline" className="font-mono text-[10px] uppercase bg-blue-500/10 text-blue-400 border-blue-500/30 flex items-center gap-1">
                  <Wifi className="size-2.5" />
                  Live TAB odds
                </Badge>
              ) : nom.dataSource === 'mock' ? (
                <Badge variant="outline" className="font-mono text-[10px] uppercase bg-secondary text-muted-foreground border-border flex items-center gap-1">
                  <FlaskConical className="size-2.5" />
                  Simulated
                </Badge>
              ) : null}
            </div>

            {/* SETTLE for pending, EDIT RESULT for settled */}
            <Dialog open={open} onOpenChange={handleCloseDialog}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={openDialog}
                  className={cn(
                    "h-6 text-[10px] font-mono",
                    isPending
                      ? "border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground"
                      : "border-border text-muted-foreground hover:bg-secondary"
                  )}
                >
                  {isPending ? (
                    <>
                      <CheckSquare className="size-3 mr-1" />
                      SETTLE
                    </>
                  ) : (
                    <>
                      <Pencil className="size-3 mr-1" />
                      EDIT
                    </>
                  )}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md bg-card border-border">
                <DialogHeader>
                  <DialogTitle className="font-mono flex items-center gap-2">
                    <CheckSquare className="size-5 text-primary" />
                    {isSettled ? 'Edit Result' : 'Settle Bet'}: {nom.horseName}
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleRecordResult} className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label className="font-mono text-xs text-muted-foreground uppercase">Finish Position</Label>
                    <Input 
                      type="number" 
                      min="1" 
                      required 
                      value={finishPosition} 
                      onChange={e => setFinishPosition(e.target.value)} 
                      className="font-mono bg-background text-lg font-bold"
                      placeholder="e.g. 1"
                      autoFocus
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="font-mono text-xs text-muted-foreground uppercase">Actual Win Return</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">$</span>
                        <Input 
                          type="number" 
                          step="0.01" 
                          value={winReturn} 
                          onChange={e => setWinReturn(e.target.value)} 
                          className="font-mono bg-background pl-7"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="font-mono text-xs text-muted-foreground uppercase">Actual Place Return</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">$</span>
                        <Input 
                          type="number" 
                          step="0.01" 
                          value={placeReturn} 
                          onChange={e => setPlaceReturn(e.target.value)} 
                          className="font-mono bg-background pl-7"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="pt-4 border-t border-border flex justify-end">
                    <Button type="submit" className="font-mono font-bold" disabled={recordResult.isPending}>
                      {recordResult.isPending ? 'SAVING...' : isSettled ? 'UPDATE RESULT' : 'CONFIRM RESULT'}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="size-3.5" />
                <span className="font-mono uppercase text-xs tracking-wider">{nom.trackName}</span>
              </div>
              <CardTitle className="text-lg mt-1 font-bold">R{nom.raceNumber}: {nom.horseName}</CardTitle>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground font-mono mb-1">{nom.raceDate.split('T')[0]}</div>
              {nom.raceTime && <div className="text-xs font-mono">{nom.raceTime}</div>}
            </div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-4 pt-4 flex-1 flex flex-col">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 mb-6 bg-secondary/30 p-3 rounded-md">
          <div>
            <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider font-mono">Barrier</div>
            <div className="font-mono flex items-center gap-1.5 font-bold">
              <Hash className="size-3.5 text-muted-foreground" />
              {nom.barrierNumber}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider font-mono">Map</div>
            <div className="font-mono text-sm font-bold">{nom.speedMapPosition}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider font-mono">Win Odds</div>
            <div className="font-mono text-primary font-bold">${nom.winOdds.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider font-mono">Place Odds</div>
            <div className="font-mono font-bold text-foreground/80">${nom.placeOdds.toFixed(2)}</div>
          </div>
        </div>

        <div className="mt-auto border-t border-border pt-4">
          <div className="flex justify-between items-end mb-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">Staking</div>
            <div className="font-mono text-xs font-bold bg-secondary/50 px-2 py-0.5 rounded border border-border">${nom.totalOutlay.toFixed(2)} Total</div>
          </div>
          <div className="flex gap-2 text-xs font-mono">
            <div className="flex-1 bg-secondary/30 p-2 rounded flex justify-between items-center border border-border/50">
              <span className="text-muted-foreground">W</span>
              <span className="font-bold">${nom.winStake.toFixed(2)}</span>
            </div>
            <div className="flex-1 bg-secondary/30 p-2 rounded flex justify-between items-center border border-border/50">
              <span className="text-muted-foreground">P</span>
              <span className="font-bold">${nom.placeStake.toFixed(2)}</span>
            </div>
          </div>
          
          {isPending && (
            <div className="mt-3 flex justify-between text-[11px] font-mono text-primary/70 bg-primary/5 px-2 py-1.5 rounded border border-primary/20">
              <span className="uppercase tracking-wider">Proj. Return</span>
              <span className="font-bold">${(nom.projectedWinReturn).toFixed(2)} / ${(nom.projectedPlaceReturn).toFixed(2)}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function TrophyIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7c0 3.31 2.69 6 6 6s6-2.69 6-6V2Z" />
    </svg>
  );
}
