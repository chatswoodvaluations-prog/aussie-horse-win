import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useGetSettings, useUpdateSettings, useGetTracks } from '@workspace/api-client-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { SlidersHorizontal, Map, Save, Settings2, Bell, Search, X } from 'lucide-react';

const formSchema = z.object({
  fieldSizeMin: z.coerce.number().min(4).max(24),
  fieldSizeMax: z.coerce.number().min(4).max(24),
  minWinOdds: z.coerce.number().min(1).max(100),
  maxWinOdds: z.coerce.number().min(1).max(100),
  minPlaceOdds: z.coerce.number().min(1).max(50),
  winStake: z.coerce.number().min(1),
  placeStake: z.coerce.number().min(1),
  enabledTrackIds: z.array(z.number()),
  notificationEmail: z.string().email('Enter a valid email address').or(z.literal('')).nullable().optional(),
}).refine(data => data.fieldSizeMin <= data.fieldSizeMax, {
  message: "Min field size cannot be greater than max",
  path: ["fieldSizeMin"],
}).refine(data => data.minWinOdds <= data.maxWinOdds, {
  message: "Min odds cannot be greater than max",
  path: ["minWinOdds"],
});

type FormValues = z.infer<typeof formSchema>;

const STATE_ORDER = ['VIC', 'NSW', 'QLD', 'SA', 'WA'] as const;
const TYPE_ORDER = ['Metro', 'Provincial', 'Regional'] as const;

const STATE_LABELS: Record<string, string> = {
  VIC: 'Victoria',
  NSW: 'New South Wales',
  QLD: 'Queensland',
  SA: 'South Australia',
  WA: 'Western Australia',
};

/** Styled label for use outside a <FormField> context */
function FieldLabel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`font-mono text-xs uppercase text-muted-foreground tracking-wider ${className}`}>
      {children}
    </p>
  );
}

export default function Settings() {
  const { data: settings, isLoading: isSettingsLoading } = useGetSettings();
  const { data: tracks, isLoading: isTracksLoading } = useGetTracks();
  const updateMutation = useUpdateSettings();

  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fieldSizeMin: 8,
      fieldSizeMax: 11,
      minWinOdds: 5,
      maxWinOdds: 10,
      minPlaceOdds: 2,
      winStake: 5,
      placeStake: 20,
      enabledTrackIds: [],
      notificationEmail: '',
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        fieldSizeMin: settings.fieldSizeMin,
        fieldSizeMax: settings.fieldSizeMax,
        minWinOdds: settings.minWinOdds,
        maxWinOdds: settings.maxWinOdds,
        minPlaceOdds: settings.minPlaceOdds,
        winStake: settings.winStake,
        placeStake: settings.placeStake,
        enabledTrackIds: settings.enabledTrackIds || [],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        notificationEmail: (settings as any).notificationEmail ?? '',
      });
    }
  }, [settings, form]);

  const onSubmit = (data: FormValues) => {
    updateMutation.mutate({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { ...data, notificationEmail: data.notificationEmail || null } as any,
    }, {
      onSuccess: () => toast.success('Settings saved successfully. Filter engine updated.'),
      onError:   () => toast.error('Failed to save settings.'),
    });
  };

  // Derive available states / types from live data
  const availableStates = useMemo(() => {
    if (!tracks) return [] as typeof STATE_ORDER[number][];
    const seen = new Set(tracks.map(t => t.state as string));
    return STATE_ORDER.filter(s => seen.has(s));
  }, [tracks]);

  const availableTypes = useMemo(() => {
    if (!tracks) return [] as typeof TYPE_ORDER[number][];
    const seen = new Set(tracks.map(t => t.type as string));
    return TYPE_ORDER.filter(t => seen.has(t));
  }, [tracks]);

  // Filtered tracks (for display)
  const filteredTracks = useMemo(() => {
    if (!tracks) return [];
    return tracks.filter(t => {
      const matchesSearch = !search || t.name.toLowerCase().includes(search.toLowerCase());
      const matchesState  = !stateFilter || t.state === stateFilter;
      const matchesType   = !typeFilter  || t.type  === typeFilter;
      return matchesSearch && matchesState && matchesType;
    });
  }, [tracks, search, stateFilter, typeFilter]);

  // Group filtered tracks by state
  const groupedTracks = useMemo(() => {
    return STATE_ORDER.map(state => ({
      state,
      tracks: filteredTracks.filter(t => t.state === state),
    })).filter(g => g.tracks.length > 0);
  }, [filteredTracks]);

  const enabledTrackIds = form.watch('enabledTrackIds') || [];

  const handleSelectAll = (ids: number[]) => {
    const current = form.getValues('enabledTrackIds') || [];
    form.setValue('enabledTrackIds', Array.from(new Set([...current, ...ids])));
  };

  const handleDeselectAll = (ids: number[]) => {
    const idsSet = new Set(ids);
    const current = form.getValues('enabledTrackIds') || [];
    form.setValue('enabledTrackIds', current.filter(id => !idsSet.has(id)));
  };

  const hasActiveFilters = search || stateFilter || typeFilter;
  const clearFilters = () => { setSearch(''); setStateFilter(null); setTypeFilter(null); };

  if (isSettingsLoading || isTracksLoading) {
    return <div className="p-8 text-center text-muted-foreground animate-pulse font-mono">LOADING_SYSTEM_CONFIG...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <header>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <Settings2 className="size-8 text-primary" />
          Engine Configuration
        </h1>
        <p className="text-muted-foreground mt-2 font-mono text-sm">Tune the strict +EV betting filters and staking plans.</p>
      </header>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">

          {/* ── Race Filters & Staking ───────────────────────────────────── */}
          <div className="grid md:grid-cols-2 gap-8">

            {/* Race Filters */}
            <Card className="bg-card border-border">
              <CardHeader className="border-b border-border bg-secondary/20 pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <SlidersHorizontal className="size-5 text-primary" />
                  Race Filters
                </CardTitle>
                <CardDescription className="font-mono text-xs">Strict field and odds parameters</CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-6">

                {/* Field size */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <FieldLabel>Field Size Range</FieldLabel>
                    <span className="font-mono text-primary font-bold text-sm">
                      {form.watch('fieldSizeMin')} – {form.watch('fieldSizeMax')} Runners
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <FormField control={form.control} name="fieldSizeMin" render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormControl>
                          <Input type="number" {...field} className="font-mono bg-background border-border text-center" />
                        </FormControl>
                      </FormItem>
                    )} />
                    <span className="text-muted-foreground">to</span>
                    <FormField control={form.control} name="fieldSizeMax" render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormControl>
                          <Input type="number" {...field} className="font-mono bg-background border-border text-center" />
                        </FormControl>
                      </FormItem>
                    )} />
                  </div>
                  {form.formState.errors.fieldSizeMin && (
                    <p className="text-[0.8rem] font-medium text-destructive">{form.formState.errors.fieldSizeMin.message}</p>
                  )}
                </div>

                {/* Win odds */}
                <div className="space-y-4 pt-4 border-t border-border/50">
                  <div className="flex justify-between items-center">
                    <FieldLabel>Win Odds Window</FieldLabel>
                    <span className="font-mono text-primary font-bold text-sm">
                      ${form.watch('minWinOdds')} – ${form.watch('maxWinOdds')}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <FormField control={form.control} name="minWinOdds" render={({ field }) => (
                      <FormItem className="flex-1">
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">$</span>
                          <FormControl>
                            <Input type="number" step="0.1" {...field} className="font-mono bg-background border-border pl-7" />
                          </FormControl>
                        </div>
                      </FormItem>
                    )} />
                    <span className="text-muted-foreground">to</span>
                    <FormField control={form.control} name="maxWinOdds" render={({ field }) => (
                      <FormItem className="flex-1">
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">$</span>
                          <FormControl>
                            <Input type="number" step="0.1" {...field} className="font-mono bg-background border-border pl-7" />
                          </FormControl>
                        </div>
                      </FormItem>
                    )} />
                  </div>
                </div>

                {/* Min place odds */}
                <div className="space-y-2 pt-4 border-t border-border/50">
                  <FormField control={form.control} name="minPlaceOdds" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-xs uppercase text-muted-foreground tracking-wider">Minimum Place Odds</FormLabel>
                      <div className="relative mt-2">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">$</span>
                        <FormControl>
                          <Input type="number" step="0.1" {...field} className="font-mono bg-background border-border pl-7 w-32" />
                        </FormControl>
                      </div>
                    </FormItem>
                  )} />
                </div>

              </CardContent>
            </Card>

            {/* Staking Plan */}
            <Card className="bg-card border-border">
              <CardHeader className="border-b border-border bg-secondary/20 pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Map className="size-5 text-primary" />
                  Staking Plan
                </CardTitle>
                <CardDescription className="font-mono text-xs">Default outlay per nomination</CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <FormField control={form.control} name="winStake" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono text-xs uppercase text-muted-foreground tracking-wider">Win Stake</FormLabel>
                    <div className="relative mt-2">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">$</span>
                      <FormControl>
                        <Input type="number" {...field} className="font-mono bg-background border-border text-primary font-bold text-lg pl-7" />
                      </FormControl>
                    </div>
                  </FormItem>
                )} />

                <FormField control={form.control} name="placeStake" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono text-xs uppercase text-muted-foreground tracking-wider">Place Stake</FormLabel>
                    <div className="relative mt-2">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">$</span>
                      <FormControl>
                        <Input type="number" {...field} className="font-mono bg-background border-border font-bold text-lg pl-7" />
                      </FormControl>
                    </div>
                  </FormItem>
                )} />

                <div className="pt-6 border-t border-border mt-4">
                  <div className="flex justify-between items-center p-4 bg-primary/10 border border-primary/20 rounded-lg">
                    <span className="font-mono text-sm uppercase text-primary">Total Outlay per Race</span>
                    <span className="font-mono text-xl font-bold text-primary">
                      ${Number(form.watch('winStake') || 0) + Number(form.watch('placeStake') || 0)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── Notifications ─────────────────────────────────────────────── */}
          <Card className="bg-card border-border">
            <CardHeader className="border-b border-border bg-secondary/20 pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Bell className="size-5 text-primary" />
                Selection Alerts
              </CardTitle>
              <CardDescription className="font-mono text-xs">
                Get notified when new qualifying selections are found after a sync
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <FormField control={form.control} name="notificationEmail" render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-mono text-xs uppercase text-muted-foreground tracking-wider">
                    Alert Email Address
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="you@example.com"
                      {...field}
                      value={field.value ?? ''}
                      className="font-mono bg-background border-border max-w-sm mt-2"
                    />
                  </FormControl>
                  <p className="font-mono text-xs text-muted-foreground mt-2">
                    An email listing track, race, horse, barrier, odds, and staking will be sent after any sync that produces new nominations.
                    Leave blank to disable alerts.
                  </p>
                </FormItem>
              )} />
            </CardContent>
          </Card>

          {/* ── Target Circuits ───────────────────────────────────────────── */}
          <Card className="bg-card border-border">
            <CardHeader className="border-b border-border bg-secondary/20 pb-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Map className="size-5 text-primary" />
                    Target Circuits
                  </CardTitle>
                  <CardDescription className="font-mono text-xs mt-1">Enable or disable specific tracks</CardDescription>
                </div>
                <span className="font-mono text-xs text-muted-foreground shrink-0 pt-1">
                  {enabledTrackIds.length} / {tracks?.length ?? 0} enabled
                </span>
              </div>
            </CardHeader>

            {/* Search & filter toolbar */}
            <div className="px-6 py-4 border-b border-border space-y-3">
              {/* Search input */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search tracks…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-9 py-2 text-sm bg-background border border-border rounded-md font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>

              {/* State filter */}
              <div className="flex flex-wrap gap-2 items-center">
                <span className="font-mono text-xs text-muted-foreground uppercase tracking-wider">State:</span>
                {(['All', ...availableStates] as string[]).map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStateFilter(s === 'All' ? null : s)}
                    className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition-colors ${
                      (s === 'All' && !stateFilter) || stateFilter === s
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-secondary-foreground hover:bg-secondary/70'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>

              {/* Type filter */}
              <div className="flex flex-wrap gap-2 items-center">
                <span className="font-mono text-xs text-muted-foreground uppercase tracking-wider">Type:</span>
                {(['All', ...availableTypes] as string[]).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTypeFilter(t === 'All' ? null : t)}
                    className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition-colors ${
                      (t === 'All' && !typeFilter) || typeFilter === t
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-secondary-foreground hover:bg-secondary/70'
                    }`}
                  >
                    {t}
                  </button>
                ))}
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono text-muted-foreground hover:text-foreground hover:bg-secondary/70 transition-colors"
                  >
                    <X className="size-3" />
                    Clear
                  </button>
                )}
              </div>
            </div>

            <CardContent className="p-6">
              {groupedTracks.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground font-mono text-sm">
                  No tracks match your search.
                </div>
              ) : (
                <div className="space-y-8">
                  {groupedTracks.map(({ state, tracks: stateTracks }) => {
                    const stateTrackIds = stateTracks.map(t => t.id);
                    const allEnabled  = stateTrackIds.every(id => enabledTrackIds.includes(id));
                    const someEnabled = stateTrackIds.some(id => enabledTrackIds.includes(id));

                    const byType = TYPE_ORDER.map(type => ({
                      type,
                      tracks: stateTracks.filter(t => t.type === type),
                    })).filter(g => g.tracks.length > 0);

                    return (
                      <div key={state}>
                        {/* State header */}
                        <div className="flex items-center justify-between mb-4 pb-2 border-b border-border">
                          <div className="flex items-center gap-2">
                            <h4 className="font-mono font-bold text-sm">{state}</h4>
                            <span className="text-xs text-muted-foreground font-mono">{STATE_LABELS[state]}</span>
                            <Badge variant="outline" className="font-mono text-xs ml-1">
                              {stateTrackIds.filter(id => enabledTrackIds.includes(id)).length}/{stateTracks.length}
                            </Badge>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleSelectAll(stateTrackIds)}
                              disabled={allEnabled}
                              className="text-xs font-mono text-primary hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-default"
                            >
                              All on
                            </button>
                            <span className="text-muted-foreground text-xs">·</span>
                            <button
                              type="button"
                              onClick={() => handleDeselectAll(stateTrackIds)}
                              disabled={!someEnabled}
                              className="text-xs font-mono text-muted-foreground hover:text-foreground hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-default"
                            >
                              All off
                            </button>
                          </div>
                        </div>

                        {/* Type sub-groups */}
                        <div className="space-y-5">
                          {byType.map(({ type, tracks: typeTracks }) => (
                            <div key={type}>
                              <p className="font-mono text-xs text-muted-foreground uppercase tracking-wider mb-2">{type}</p>
                              <div className="grid sm:grid-cols-2 gap-2">
                                {typeTracks.map(track => (
                                  <FormField
                                    key={track.id}
                                    control={form.control}
                                    name="enabledTrackIds"
                                    render={({ field }) => (
                                      <FormItem className="flex flex-row items-center justify-between p-3 rounded-lg border border-border/50 bg-background/50 hover:bg-secondary/20 transition-colors space-y-0">
                                        <FormLabel className="font-medium cursor-pointer text-sm">
                                          {track.name}
                                        </FormLabel>
                                        <FormControl>
                                          <Switch
                                            checked={field.value?.includes(track.id)}
                                            onCheckedChange={(checked) => {
                                              const current = field.value || [];
                                              field.onChange(
                                                checked
                                                  ? [...current, track.id]
                                                  : current.filter(v => v !== track.id)
                                              );
                                            }}
                                            className="data-[state=checked]:bg-primary"
                                          />
                                        </FormControl>
                                      </FormItem>
                                    )}
                                  />
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>

            <CardFooter className="bg-secondary/20 border-t border-border p-4 flex justify-end">
              <Button
                type="submit"
                size="lg"
                className="bg-primary text-primary-foreground hover:bg-primary/90 font-mono font-bold tracking-wide"
                disabled={updateMutation.isPending}
              >
                <Save className="size-4 mr-2" />
                {updateMutation.isPending ? 'SAVING...' : 'SAVE CONFIGURATION'}
              </Button>
            </CardFooter>
          </Card>

        </form>
      </Form>
    </div>
  );
}
