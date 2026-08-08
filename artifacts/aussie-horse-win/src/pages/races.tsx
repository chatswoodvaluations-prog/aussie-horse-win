import { useState, useMemo } from 'react';
import { useGetRaces, Race, Runner } from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2, XCircle, ChevronDown, User, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function RacesExplorer() {
  const { data: races, isLoading } = useGetRaces();

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
          <RaceRow key={race.id} race={race} />
        ))}
      </Accordion>
    </div>
  );
}

function RaceRow({ race }: { race: Race }) {
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
              </div>
              <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                <span className="font-mono">{race.raceTime || race.raceDate}</span>
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
            <div className="col-span-4">Filter Evaluation</div>
          </div>
          
          {/* Table Body */}
          {race.runners.map((runner) => (
            <RunnerRow key={runner.id} runner={runner} />
          ))}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

function RunnerRow({ runner }: { runner: Runner }) {
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
      
      <div className="col-span-4 space-y-1.5">
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
    </div>
  );
}
