import { BookOpen, RefreshCw, Trophy, Flag, Activity, Settings, ChevronRight, AlertCircle, CheckCircle2, Clock, DollarSign, BarChart2, ToggleLeft, Mail } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

function Section({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Icon className="size-4 text-primary shrink-0" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground space-y-3 leading-relaxed">
        {children}
      </CardContent>
    </Card>
  );
}

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="size-6 rounded-full bg-primary/15 border border-primary/30 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
        {number}
      </div>
      <div>
        <p className="font-medium text-foreground mb-1">{title}</p>
        <p className="text-sm text-muted-foreground leading-relaxed">{children}</p>
      </div>
    </div>
  );
}

function Callout({ type, children }: { type: 'info' | 'tip' | 'warning'; children: React.ReactNode }) {
  const styles = {
    info:    { icon: AlertCircle,    border: 'border-primary/30',   bg: 'bg-primary/5',   text: 'text-primary'   },
    tip:     { icon: CheckCircle2,   border: 'border-green-500/30', bg: 'bg-green-500/5', text: 'text-green-400' },
    warning: { icon: AlertCircle,    border: 'border-amber-500/30', bg: 'bg-amber-500/5', text: 'text-amber-400' },
  }[type];
  const Icon = styles.icon;
  return (
    <div className={`flex gap-2 rounded-md border ${styles.border} ${styles.bg} px-3 py-2.5`}>
      <Icon className={`size-4 shrink-0 mt-0.5 ${styles.text}`} />
      <p className="text-sm text-muted-foreground leading-relaxed">{children}</p>
    </div>
  );
}

function OddsExample({ label, win, place, stake }: { label: string; win: number; place: number; stake: number }) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2 text-xs font-mono">
      <div className="flex justify-between items-center mb-1">
        <span className="text-muted-foreground">{label}</span>
        <Badge variant="outline" className="text-[10px] text-primary border-primary/30">NOMINATED</Badge>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-1">
        <span className="text-muted-foreground">Win odds</span>
        <span className="text-primary font-semibold">${win.toFixed(2)}</span>
        <span className="text-muted-foreground">Place odds</span>
        <span className="text-foreground">${place.toFixed(2)}</span>
        <span className="text-muted-foreground">Win stake</span>
        <span className="text-foreground">${stake}</span>
        <span className="text-muted-foreground">Place stake</span>
        <span className="text-foreground">${stake * 4}</span>
      </div>
    </div>
  );
}

export default function GuidePage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <BookOpen className="size-5 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">User Guide</h1>
        </div>
        <p className="text-muted-foreground text-sm">
          Everything you need to know to get the most out of Aussie Horse Win Terminal.
        </p>
      </div>

      {/* What is this app */}
      <Section icon={Trophy} title="What is this app?">
        <p>
          Aussie Horse Win Terminal is a horse racing analysis tool. It automatically pulls live race data
          each day from Australian thoroughbred meetings and runs a selection engine that identifies
          horses with strong value odds — horses where the bookmaker price is statistically favourable.
        </p>
        <p>
          The app does <span className="text-foreground font-medium">not</span> guarantee winners. It
          surfaces <span className="text-foreground font-medium">statistically selected bets</span> based
          on odds ranges and field-size criteria that you configure. Think of it as a disciplined betting
          filter, not a tipster.
        </p>
        <Callout type="info">
          All bet amounts shown are <strong>suggested stakes</strong> based on your settings. You decide
          whether to place any bet. This tool is for adults who understand the risks involved in gambling.
        </Callout>
      </Section>

      {/* Getting started */}
      <Section icon={RefreshCw} title="Getting started — Sync Data">
        <p>
          The first thing to do each day is press <span className="font-medium text-foreground">Sync Data</span>.
          You'll find this button at the bottom of the left sidebar on desktop, or in the top-right corner
          on mobile.
        </p>
        <div className="space-y-3 pt-1">
          <Step number={1} title="Press Sync Data">
            The button fetches today's race cards from Ladbrokes — real tracks, real runners, real fixed
            odds. It takes about 60 seconds. A toast message will confirm when it's done.
          </Step>
          <Step number={2} title="Wait for nominations to appear">
            Once the sync finishes, the selection engine runs automatically and shows any horses that pass
            your criteria on the <span className="font-medium text-foreground">Nominations</span> page.
          </Step>
          <Step number={3} title="Sync runs automatically at 6 am AEST">
            If you have the server deployed, the daily sync runs on its own at 6 am every morning.
            You only need to press Sync manually if you want an immediate refresh mid-day.
          </Step>
        </div>
        <Callout type="tip">
          If you see <em>"source: mock"</em> in the sync message, today's fields haven't been published yet
          — try again after 7 am AEST when bookmakers post their morning markets.
        </Callout>
      </Section>

      {/* Nominations page */}
      <Section icon={Trophy} title="Nominations page">
        <p>
          This is the main page. Each card shows a horse the selection engine has identified as meeting
          your betting criteria.
        </p>
        <div className="space-y-2 pt-1">
          <div className="flex gap-2 items-start">
            <ChevronRight className="size-3.5 text-primary mt-1 shrink-0" />
            <p><span className="text-foreground font-medium">Track & Race number</span> — e.g. "FLEMINGTON R4" means Race 4 at Flemington.</p>
          </div>
          <div className="flex gap-2 items-start">
            <ChevronRight className="size-3.5 text-primary mt-1 shrink-0" />
            <p><span className="text-foreground font-medium">Win odds / Place odds</span> — fixed Ladbrokes prices at the time of the sync.</p>
          </div>
          <div className="flex gap-2 items-start">
            <ChevronRight className="size-3.5 text-primary mt-1 shrink-0" />
            <p><span className="text-foreground font-medium">Staking</span> — the suggested win and place bet amounts based on your Settings stakes.</p>
          </div>
          <div className="flex gap-2 items-start">
            <ChevronRight className="size-3.5 text-primary mt-1 shrink-0" />
            <p><span className="text-foreground font-medium">CARD / LADS columns</span> — CARD is the race card price; LADS is the Ladbrokes fixed-odds price. Green = better value.</p>
          </div>
          <div className="flex gap-2 items-start">
            <ChevronRight className="size-3.5 text-primary mt-1 shrink-0" />
            <p><span className="text-foreground font-medium">Status badge</span> — Pending (race not yet run), Won, Placed, or Unplaced.</p>
          </div>
        </div>
        <OddsExample label="FLEMINGTON R4 — Rapid Fire" win={8.50} place={2.04} stake={5} />
        <p className="text-xs">
          In the example above: $5 on the win returns $42.50 if successful. $20 on the place returns
          $40.80 if the horse finishes in the top 3. Total outlay $25.
        </p>
        <Callout type="tip">
          Use the <strong>Edit</strong> button on any card to manually mark the result after the race.
          This keeps your Performance stats accurate.
        </Callout>
      </Section>

      {/* Race Explorer */}
      <Section icon={Flag} title="Race Explorer">
        <p>
          The Race Explorer shows every race and runner in the database, not just nominated ones.
          Use it to browse upcoming meetings, check which tracks have data, and see the full field for
          any race.
        </p>
        <div className="space-y-2 pt-1">
          <div className="flex gap-2 items-start">
            <ChevronRight className="size-3.5 text-primary mt-1 shrink-0" />
            <p><span className="text-foreground font-medium">Filter by date</span> — use the date picker to browse past or upcoming race days.</p>
          </div>
          <div className="flex gap-2 items-start">
            <ChevronRight className="size-3.5 text-primary mt-1 shrink-0" />
            <p><span className="text-foreground font-medium">Filter by state</span> — narrow to VIC, NSW, QLD, SA, or WA meetings.</p>
          </div>
          <div className="flex gap-2 items-start">
            <ChevronRight className="size-3.5 text-primary mt-1 shrink-0" />
            <p><span className="text-foreground font-medium">Click a race</span> — expand the field to see every runner with their barrier, speed map position, and odds.</p>
          </div>
        </div>
      </Section>

      {/* Settings */}
      <Section icon={Settings} title="Settings — how to configure the selection engine">
        <p>
          Settings control exactly which horses get nominated. Changes take effect on the next Sync.
        </p>

        <div className="space-y-4 pt-1">
          <div>
            <p className="text-foreground font-medium flex items-center gap-1.5 mb-1">
              <BarChart2 className="size-3.5 text-primary" /> Field Size (min / max)
            </p>
            <p>
              Only consider races with a field between these two numbers. Smaller fields (8–12) tend
              to produce more reliable form. Very large fields (20+) increase variability.
              <br /><span className="text-xs text-muted-foreground/70">Recommended: 6 min, 14 max.</span>
            </p>
          </div>

          <div>
            <p className="text-foreground font-medium flex items-center gap-1.5 mb-1">
              <DollarSign className="size-3.5 text-primary" /> Win Odds Window (min / max)
            </p>
            <p>
              Only nominate horses whose win price falls inside this range. Too-short odds ($2) are
              over-bet by the market. Too-long odds ($20+) rarely win. The "sweet spot" for value
              tends to be $5–$12.
              <br /><span className="text-xs text-muted-foreground/70">Recommended: $5 min, $12 max.</span>
            </p>
          </div>

          <div>
            <p className="text-foreground font-medium flex items-center gap-1.5 mb-1">
              <DollarSign className="size-3.5 text-primary" /> Min Place Odds
            </p>
            <p>
              The minimum place price a horse must have to qualify. A horse with short place odds
              ($1.20) offers poor value even if it often runs in the money.
              <br /><span className="text-xs text-muted-foreground/70">Recommended: $1.60 min.</span>
            </p>
          </div>

          <div>
            <p className="text-foreground font-medium flex items-center gap-1.5 mb-1">
              <DollarSign className="size-3.5 text-primary" /> Stakes (Win / Place)
            </p>
            <p>
              The dollar amount suggested for each bet type on every nominated horse. These are shown
              on the nomination cards and used to calculate your projected returns and total outlay.
              <br /><span className="text-xs text-muted-foreground/70">Example: $5 win / $20 place means $25 total per horse.</span>
            </p>
          </div>

          <div>
            <p className="text-foreground font-medium flex items-center gap-1.5 mb-1">
              <ToggleLeft className="size-3.5 text-primary" /> Enabled Tracks
            </p>
            <p>
              Toggle individual tracks on or off. Only races at enabled tracks will produce nominations.
              Start by enabling a small number of tracks you're familiar with — fewer tracks means fewer
              bets and easier record-keeping.
            </p>
            <Callout type="tip">
              If no nominations are appearing, check that at least some tracks in the states where
              racing is on that day are toggled on.
            </Callout>
          </div>

          <div>
            <p className="text-foreground font-medium flex items-center gap-1.5 mb-1">
              <Mail className="size-3.5 text-primary" /> Notification Email
            </p>
            <p>
              Enter your email address here to receive an alert whenever the engine generates new
              nominations. Useful if you don't want to check the app manually each morning.
            </p>
          </div>
        </div>
      </Section>

      {/* Performance */}
      <Section icon={Activity} title="Performance tracker">
        <p>
          The Performance page shows your full betting history and key stats based on nominations
          that have been marked with a result.
        </p>
        <div className="space-y-2 pt-1">
          <div className="flex gap-2 items-start">
            <ChevronRight className="size-3.5 text-primary mt-1 shrink-0" />
            <p><span className="text-foreground font-medium">Total Qualified</span> — how many horses have been nominated in total.</p>
          </div>
          <div className="flex gap-2 items-start">
            <ChevronRight className="size-3.5 text-primary mt-1 shrink-0" />
            <p><span className="text-foreground font-medium">Total Outlay</span> — the cumulative amount staked across all nominated races.</p>
          </div>
          <div className="flex gap-2 items-start">
            <ChevronRight className="size-3.5 text-primary mt-1 shrink-0" />
            <p><span className="text-foreground font-medium">Wins / Placed</span> — how many nominated horses won outright vs finished in the place positions.</p>
          </div>
          <div className="flex gap-2 items-start">
            <ChevronRight className="size-3.5 text-primary mt-1 shrink-0" />
            <p><span className="text-foreground font-medium">Losses</span> — nominations where the horse finished outside the place positions.</p>
          </div>
        </div>
        <Callout type="info">
          Results are not settled automatically. After each race, go to the Nominations page, find the
          card, press <strong>Edit</strong>, and mark it Won, Placed, or Unplaced. This keeps your stats
          accurate.
        </Callout>
      </Section>

      {/* FAQ */}
      <Section icon={AlertCircle} title="Common questions">
        <div className="space-y-4">
          <div>
            <p className="text-foreground font-medium mb-1">Why are there no nominations today?</p>
            <p>
              The most common reasons: (1) no tracks are enabled in Settings, (2) today's race fields
              haven't been published yet by Ladbrokes — try after 7 am AEST, (3) no horses in the
              published fields fall within your odds window and field-size criteria.
            </p>
          </div>
          <div>
            <p className="text-foreground font-medium mb-1">The odds on the card look different to what the bookmaker is showing.</p>
            <p>
              Odds are captured at sync time and frozen on the card. Markets move throughout the day —
              the card shows the price that triggered the nomination, not the live current price.
              Always check the bookmaker's current price before placing any bet.
            </p>
          </div>
          <div>
            <p className="text-foreground font-medium mb-1">Why does it say "source: mock" after syncing?</p>
            <p>
              This means the live Ladbrokes feed wasn't available at that moment — the app fell back
              to placeholder data. Races published with mock data will not have real horse names or
              real odds. Try syncing again after 7 am AEST or check your server's internet connection.
            </p>
          </div>
          <div>
            <p className="text-foreground font-medium mb-1">The site shows "Not Secure" in the browser.</p>
            <p>
              The server is running on HTTP rather than HTTPS. To get the padlock, you need a domain
              name (e.g. yourdomain.com) pointed to the server's IP address — the administrator can
              then set up a free SSL certificate via Let's Encrypt. A bare IP address cannot get a
              certificate.
            </p>
          </div>
          <div>
            <p className="text-foreground font-medium mb-1">Can I use this on my phone?</p>
            <p>
              Yes — the web app is mobile-friendly and works in any browser. There is also a dedicated
              mobile app available separately with push notifications and an offline mode.
            </p>
          </div>
        </div>
      </Section>

      {/* Footer note */}
      <div className="rounded-lg border border-border bg-card/50 p-4 text-xs text-muted-foreground text-center">
        Aussie Horse Win Terminal is a personal research tool. Always gamble responsibly. If gambling
        is causing you distress, contact{' '}
        <a href="https://www.gamblinghelponline.org.au" target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
          Gambling Help Online
        </a>{' '}
        on 1800 858 858.
      </div>
    </div>
  );
}
