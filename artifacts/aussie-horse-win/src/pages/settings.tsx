import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useGetSettings, useUpdateSettings, useGetTracks } from '@workspace/api-client-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { SlidersHorizontal, Map, Save, Settings2, Bell } from 'lucide-react';

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

export default function Settings() {
  const { data: settings, isLoading: isSettingsLoading } = useGetSettings();
  const { data: tracks, isLoading: isTracksLoading } = useGetTracks();
  const updateMutation = useUpdateSettings();

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
        notificationEmail: settings.notificationEmail ?? '',
      });
    }
  }, [settings, form]);

  const onSubmit = (data: FormValues) => {
    updateMutation.mutate({
      data: {
        ...data,
        // Send null to clear, or the email string — never send empty string to the API
        notificationEmail: data.notificationEmail ? data.notificationEmail : null,
      }
    }, {
      onSuccess: () => {
        toast.success('Settings saved successfully. Filter engine updated.');
      },
      onError: () => {
        toast.error('Failed to save settings.');
      }
    });
  };

  if (isSettingsLoading || isTracksLoading) {
    return <div className="p-8 text-center text-muted-foreground animate-pulse font-mono">LOADING_SYSTEM_CONFIG...</div>;
  }

  const vicTracks = tracks?.filter(t => t.state === 'VIC') || [];
  const nswTracks = tracks?.filter(t => t.state === 'NSW') || [];

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
          
          <div className="grid md:grid-cols-2 gap-8">
            <Card className="bg-card border-border">
              <CardHeader className="border-b border-border bg-secondary/20 pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <SlidersHorizontal className="size-5 text-primary" />
                  Race Filters
                </CardTitle>
                <CardDescription className="font-mono text-xs">Strict field and odds parameters</CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <FormLabel className="font-mono text-xs uppercase text-muted-foreground tracking-wider">Field Size Range</FormLabel>
                    <span className="font-mono text-primary font-bold">
                      {form.watch('fieldSizeMin')} - {form.watch('fieldSizeMax')} Runners
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <FormField
                      control={form.control}
                      name="fieldSizeMin"
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormControl>
                            <Input type="number" {...field} className="font-mono bg-background border-border text-center" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <span className="text-muted-foreground">to</span>
                    <FormField
                      control={form.control}
                      name="fieldSizeMax"
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormControl>
                            <Input type="number" {...field} className="font-mono bg-background border-border text-center" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                  {form.formState.errors.fieldSizeMin && (
                    <p className="text-[0.8rem] font-medium text-destructive">{form.formState.errors.fieldSizeMin.message}</p>
                  )}
                </div>

                <div className="space-y-4 pt-4 border-t border-border/50">
                  <div className="flex justify-between">
                    <FormLabel className="font-mono text-xs uppercase text-muted-foreground tracking-wider">Win Odds Window</FormLabel>
                    <span className="font-mono text-primary font-bold">
                      ${form.watch('minWinOdds')} - ${form.watch('maxWinOdds')}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <FormField
                      control={form.control}
                      name="minWinOdds"
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">$</span>
                            <FormControl>
                              <Input type="number" step="0.1" {...field} className="font-mono bg-background border-border pl-7" />
                            </FormControl>
                          </div>
                        </FormItem>
                      )}
                    />
                    <span className="text-muted-foreground">to</span>
                    <FormField
                      control={form.control}
                      name="maxWinOdds"
                      render={({ field }) => (
                        <FormItem className="flex-1">
                           <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">$</span>
                            <FormControl>
                              <Input type="number" step="0.1" {...field} className="font-mono bg-background border-border pl-7" />
                            </FormControl>
                          </div>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t border-border/50">
                  <FormField
                    control={form.control}
                    name="minPlaceOdds"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs uppercase text-muted-foreground tracking-wider">Minimum Place Odds</FormLabel>
                        <div className="relative mt-2">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">$</span>
                          <FormControl>
                            <Input type="number" step="0.1" {...field} className="font-mono bg-background border-border pl-7 w-32" />
                          </FormControl>
                        </div>
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardHeader className="border-b border-border bg-secondary/20 pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Map className="size-5 text-primary" />
                  Staking Plan
                </CardTitle>
                <CardDescription className="font-mono text-xs">Default outlay per nomination</CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <FormField
                  control={form.control}
                  name="winStake"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-xs uppercase text-muted-foreground tracking-wider">Win Stake</FormLabel>
                      <div className="relative mt-2">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">$</span>
                        <FormControl>
                          <Input type="number" {...field} className="font-mono bg-background border-border text-primary font-bold text-lg pl-7" />
                        </FormControl>
                      </div>
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="placeStake"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-xs uppercase text-muted-foreground tracking-wider">Place Stake</FormLabel>
                      <div className="relative mt-2">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">$</span>
                        <FormControl>
                          <Input type="number" {...field} className="font-mono bg-background border-border font-bold text-lg pl-7" />
                        </FormControl>
                      </div>
                    </FormItem>
                  )}
                />

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
              <FormField
                control={form.control}
                name="notificationEmail"
                render={({ field }) => (
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
                    <FormDescription className="font-mono text-xs text-muted-foreground mt-2">
                      An email listing track, race, horse, barrier, odds, and staking will be sent after any sync that produces new nominations.
                      Leave blank to disable alerts.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="border-b border-border bg-secondary/20 pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Map className="size-5 text-primary" />
                Target Circuits
              </CardTitle>
              <CardDescription className="font-mono text-xs">Enable or disable specific tracks</CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <FormField
                control={form.control}
                name="enabledTrackIds"
                render={() => (
                  <FormItem>
                    <div className="grid md:grid-cols-2 gap-8">
                      {/* VIC Tracks */}
                      <div>
                        <h4 className="font-mono font-bold text-sm mb-4 border-b border-border pb-2">VIC REGIONAL</h4>
                        <div className="space-y-3">
                          {vicTracks.map((track) => (
                            <FormField
                              key={track.id}
                              control={form.control}
                              name="enabledTrackIds"
                              render={({ field }) => {
                                return (
                                  <FormItem className="flex flex-row items-center justify-between p-3 rounded-lg border border-border/50 bg-background/50 hover:bg-secondary/20 transition-colors space-y-0">
                                    <div className="space-y-0.5">
                                      <FormLabel className="font-medium cursor-pointer">
                                        {track.name}
                                      </FormLabel>
                                    </div>
                                    <FormControl>
                                      <Switch
                                        checked={field.value?.includes(track.id)}
                                        onCheckedChange={(checked) => {
                                          const current = field.value || [];
                                          const updated = checked
                                            ? [...current, track.id]
                                            : current.filter((val) => val !== track.id);
                                          field.onChange(updated);
                                        }}
                                        className="data-[state=checked]:bg-primary"
                                      />
                                    </FormControl>
                                  </FormItem>
                                )
                              }}
                            />
                          ))}
                        </div>
                      </div>

                      {/* NSW Tracks */}
                      <div>
                        <h4 className="font-mono font-bold text-sm mb-4 border-b border-border pb-2">NSW REGIONAL</h4>
                        <div className="space-y-3">
                          {nswTracks.map((track) => (
                            <FormField
                              key={track.id}
                              control={form.control}
                              name="enabledTrackIds"
                              render={({ field }) => {
                                return (
                                  <FormItem className="flex flex-row items-center justify-between p-3 rounded-lg border border-border/50 bg-background/50 hover:bg-secondary/20 transition-colors space-y-0">
                                    <div className="space-y-0.5">
                                      <FormLabel className="font-medium cursor-pointer">
                                        {track.name}
                                      </FormLabel>
                                    </div>
                                    <FormControl>
                                      <Switch
                                        checked={field.value?.includes(track.id)}
                                        onCheckedChange={(checked) => {
                                          const current = field.value || [];
                                          const updated = checked
                                            ? [...current, track.id]
                                            : current.filter((val) => val !== track.id);
                                          field.onChange(updated);
                                        }}
                                        className="data-[state=checked]:bg-primary"
                                      />
                                    </FormControl>
                                  </FormItem>
                                )
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </FormItem>
                )}
              />
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
