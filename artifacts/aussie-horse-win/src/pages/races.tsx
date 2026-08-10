import { useState, useMemo, useRef } from 'react';
import { useGetRaces, useGetNominations, useRecordResult, Race, Runner, Nomination } from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle2, XCircle, User, MapPin, CheckSquare, Pencil, Wifi, FlaskConical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatRaceDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return `${DAYS[d.getDay()]} ${day} ${MONTHS[month - 1]}`;
}

export default function RacesExplorer() {
  const { data: races, isLoading: isRacesLoading } = useGetRaces();
  const { data: nominations, isLoading: isNomsLoading } = useGetNominations();

  const isLoading = isRacesLoading || isNomsLoading;

  // Build a lookup: runnerId → nomination
  const nominationByRunnerId = useMemo(() => {
    const map = new Map<number, Nomination>();
    for (const nom of nominations ?? []) {
      map.set(nom.runnerId, nom);
    }
    return map;
  }, [nominations]);

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto">
        <header>
          <h1 className="text-3xl font-bold tracking-tight">Race Explorer</h1>
          <Skeleton className="h-4 w-64 mt-2" />
        </header>
        <div className="space-y-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
        </div>
      </div>
    );
  }

  if (!races?.length) {
    return (
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold tracking-tight mb-8">Race Explorer</h1>
        <div className="border border-dashed border-border rounded-xl p-12 text-center bg-card/30">
          <MapPin className="size-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-bold mb-1">No Upcoming Races</h3>
          <p className="text-sm text-muted-foreground">Check your filter settings or trigger a sync to load race cards.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Race Explorer</h1>
        <p className="text-muted-foreground mt-2 font-mono text-sm">Deep dive into every runner's filter evaluation.</p>
      </header>

      <Accordion type="multiple" className="space-y-3">
        {races.map((race) => (
          <RaceRow key={race.id} race={race} nominationByRunnerId={nominationByRunnerId} />
        ))}
      </Accordion>
    </div>
  );
}

function RaceRow({ race, nominationByRunnerId }: { race: Race; nominationByRunnerId: Map<number, Nomination> }) {
  const isSelected = race.qualifiedCount > 0;
  
  return (
    <AccordionItem value={`race-${race.id}`} className="border border-border rounded-lg bg-card overflow-hidden px-1">
      <AccordionTrigger className="px-4 py-4 hover:no-underline hover:bg-secondary/20 transition-colors [&[data-state=open]]:bg-secondary/10">
        <div className="flex flex-1 items-center justify-between text-left">
          <div className="flex items-center gap-4">
            <div className={cn(
              "size-10 rounded flex items-center justify-center font-bold text-lg font-mono border",
              isSelected ? "bg-primary/20 border-primary/50 text-primary" : "bg-secondary border-border text-muted-foreground"
            )}>
              R{race.raceNumber}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold">{race.trackName}</span>
                <Badge variant="outline" className="text-[10px] h-5 uppercase px-1.5 font-mono">
                  {race.state}
                </Badge>
                {race.dataSource === 'live' ? (
                  <Badge variant="outline" className="font-mono text-[10px] uppercase bg-blue-500/10 text-blue-400 border-blue-500/30 flex items-center gap-1">
                    <Wifi className="size-2.5" />
                    Live odds
                  </Badge>
                ) : race.dataSource === 'mock' ? (
                  <Badge variant="outline" className="font-mono text-[10px] uppercase bg-secondary text-muted-foreground border-border flex items-center gap-1">
                    <FlaskConical className="size-2.5" />
                    Simulated
                  </Badge>
                ) : null}
              </div>
              <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                <span className="font-mono">{formatRaceDate(race.raceDate)}{race.raceTime ? ` · ${race.raceTime}` : ''}</span>
                <span>•</span>
                <span>{race.distance}m</span>
                <span>•</span>
                <span>{race.fieldSize} Runners</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-6 mr-4">
            {isSelected ? (
              <Badge className="bg-primary hover:bg-primary text-primary-foreground font-mono px-3 py-1 text-sm border-0">
                {race.qualifiedCount} Qualified
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground border-dashed bg-transparent font-mono text-xs">
                No Qualifiers
              </Badge>
            )}
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="pt-0 pb-0 border-t border-border">
        <div className="bg-background/50 divide-y divide-border">
          {/* Table Header */}
          <div className="grid grid-cols-12 gap-4 px-6 py-3 text-xs uppercase tracking-wider text-muted-foreground bg-secondary/40 font-mono">
            <div className="col-span-1">No.</div>
            <div className="col-span-3">Runner</div>
            <div className="col-span-2">Map</div>
            <div className="col-span-2">Odds (W/P)</div>
            <div className="col-span-3">Filter Evaluation</div>
            <div className="col-span-1"></div>
          </div>
          
          {/* Table Body */}
          {race.runners.map((runner) => (
            <RunnerRow
              key={runner.id}
              runner={runner}
              nomination={nominationByRunnerId.get(runner.id)}
              raceId={race.id}
            />
          ))}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

function RunnerRow({ runner, nomination, raceId }: { runner: Runner; nomination?: Nomination; raceId: number }) {
  const [open, setOpen] = useState(false);
  const [finishPosition, setFinishPosition] = useState('');
  const [winReturn, setWinReturn] = useState('');
  const [placeReturn, setPlaceReturn] = useState('');
  const recordResult = useRecordResult();
  const queryClient = useQueryClient();
  // Guard against double-submission: tracks whether a request is already in-flight
  const isSubmittingRef = useRef(false);

  const isSettled = nomination && nomination.status !== 'Pending';

  const openDialog = () => {
    if (nomination) {
      // Pre-fill with existing actuals (for edit) or projected returns (for first entry)
      setFinishPosition('');
      setWinReturn(nomination.projectedWinReturn.toFixed(2));
      setPlaceReturn(nomination.projectedPlaceReturn.toFixed(2));
    }
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
    if (!finishPosition || !nomination) return;
    // Prevent a second request racing if the first is still in-flight
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    recordResult.mutate({
      id: raceId,
      data: {
        runnerId: runner.id,
        finishPosition: parseInt(finishPosition),
        actualWinReturn: winReturn ? parseFloat(winReturn) : null,
        actualPlaceReturn: placeReturn ? parseFloat(placeReturn) : null,
      }
    }, {
      onSuccess: () => {
        isSubmittingRef.current = false;
        toast.success(`Result recorded for ${runner.horseName}`);
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

  const statusColor = nomination?.status === 'Won'
    ? 'bg-primary text-primary-foreground'
    : nomination?.status === 'Placed'
    ? 'bg-primary/40 text-primary-foreground'
    : nomination?.status === 'Unplaced'
    ? 'bg-destructive text-destructive-foreground'
    : '';

  return (
    <div className={cn(
      "grid grid-cols-12 gap-4 px-6 py-4 items-start text-sm transition-colors hover:bg-secondary/20",
      runner.passed && "bg-primary/5"
    )}>
      <div className="col-span-1 font-mono font-bold text-muted-foreground flex items-center h-8">
        {runner.barrierNumber}
      </div>
      
      <div className="col-span-3">
        <div className={cn("font-bold", runner.passed && "text-primary")}>{runner.horseName}</div>
        {(runner.jockey || runner.trainer) && (
          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            <User className="size-3" />
            <span className="truncate">{runner.jockey || '-'} / {runner.trainer || '-'}</span>
          </div>
        )}
      </div>
      
      <div className="col-span-2 flex items-center h-8">
        <Badge variant="outline" className="font-mono text-xs font-normal">
          {runner.speedMapPosition}
        </Badge>
      </div>
      
      <div className="col-span-2 flex items-center gap-2 h-8 font-mono">
        <span className={cn(runner.passed ? "text-primary font-bold" : "")}>
          ${runner.winOdds.toFixed(2)}
        </span>
        <span className="text-muted-foreground text-xs">/ ${runner.placeOdds.toFixed(2)}</span>
      </div>
      
      <div className="col-span-3 space-y-1.5">
        {runner.filterResults.map((result, idx) => (
          <div key={idx} className="flex items-start gap-2 text-xs font-mono">
            {result.passed ? (
              <CheckCircle2 className="size-3.5 text-primary shrink-0 mt-0.5" />
            ) : (
              <XCircle className="size-3.5 text-destructive shrink-0 mt-0.5" />
            )}
            <span className={cn("leading-tight", result.passed ? "text-muted-foreground" : "text-destructive/90")}>
              {result.rule}: {result.message}
            </span>
          </div>
        ))}
        {runner.filterResults.length === 0 && (
          <span className="text-muted-foreground italic text-xs">No filters evaluated</span>
        )}
      </div>

      {/* Record Result button — only for nominated runners */}
      <div className="col-span-1 flex items-start justify-end pt-1">
        {nomination && (
          <Dialog open={open} onOpenChange={handleCloseDialog}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={openDialog}
                className={cn(
                  "h-7 text-[10px] font-mono px-2",
                  isSettled
                    ? "border-border text-muted-foreground hover:bg-secondary"
                    : "border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground"
                )}
              >
                {isSettled ? (
                  <>
                    <Pencil className="size-3 mr-1" />
                    EDIT
                  </>
                ) : (
                  <>
                    <CheckSquare className="size-3 mr-1" />
                    SETTLE
                  </>
                )}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md bg-card border-border">
              <DialogHeader>
                <DialogTitle className="font-mono flex items-center gap-2">
                  <CheckSquare className="size-5 text-primary" />
                  {isSettled ? 'Edit Result' : 'Record Result'}: {runner.horseName}
                </DialogTitle>
              </DialogHeader>
              {nomination && (
                <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground bg-secondary/30 px-3 py-2 rounded border border-border/50">
                  <span className="uppercase tracking-wider">{nomination.trackName}</span>
                  <span>·</span>
                  <span>R{nomination.raceNumber}</span>
                  {isSettled && (
                    <>
                      <span>·</span>
                      <Badge variant="outline" className={cn("text-[10px] h-5 px-1.5 font-mono border-0", statusColor)}>
                        {nomination.status}
                      </Badge>
                    </>
                  )}
                </div>
              )}
              <form onSubmit={handleRecordResult} className="space-y-4 mt-2">
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
        )}
      </div>
    </div>
  );
}
