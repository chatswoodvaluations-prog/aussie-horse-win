import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Activity, Trophy, Settings as SettingsIcon, Flag, RefreshCw, Menu, X, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTriggerSync } from '@workspace/api-client-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';

const NAV_ITEMS = [
  { href: '/',            label: 'Nominations',    icon: Trophy },
  { href: '/races',       label: 'Race Explorer',  icon: Flag },
  { href: '/performance', label: 'Performance',    icon: Activity },
  { href: '/settings',    label: 'Settings',       icon: SettingsIcon },
  { href: '/guide',       label: 'Guide',          icon: BookOpen },
];

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <div className="size-8 rounded bg-primary/20 flex items-center justify-center text-primary border border-primary/50 shrink-0">
        <Trophy className="size-4" />
      </div>
      <div className="leading-none">
        <p className="font-bold text-sm tracking-tight uppercase leading-none">AUSSIE HORSE</p>
        <span className="text-[10px] text-primary font-mono tracking-widest">WIN TERMINAL</span>
      </div>
    </div>
  );
}

function SyncButton({ compact = false }: { compact?: boolean }) {
  const queryClient = useQueryClient();
  const syncMutation = useTriggerSync();

  const handleSync = () => {
    syncMutation.mutate(undefined, {
      onSuccess: (data) => {
        toast.success(data.message || 'Sync complete');
        queryClient.invalidateQueries();
      },
      onError: () => toast.error('Failed to sync data'),
    });
  };

  if (compact) {
    return (
      <button
        onClick={handleSync}
        disabled={syncMutation.isPending}
        className="size-9 flex items-center justify-center rounded-md border border-border hover:border-primary/50 hover:text-primary transition-all disabled:opacity-50"
        title="Sync Data"
      >
        <RefreshCw className={cn('size-4', syncMutation.isPending && 'animate-spin')} />
      </button>
    );
  }

  return (
    <Button
      variant="outline"
      className="w-full justify-start gap-2 bg-transparent hover:bg-secondary border-border hover:border-primary/50 hover:text-primary transition-all font-mono text-xs uppercase"
      onClick={handleSync}
      disabled={syncMutation.isPending}
    >
      <RefreshCw className={cn('size-3.5', syncMutation.isPending && 'animate-spin')} />
      {syncMutation.isPending ? 'Syncing…' : 'Sync Data'}
    </Button>
  );
}

/** Sidebar nav links — used in both the permanent desktop sidebar and the mobile drawer */
function NavLinks({ location, onNavigate }: { location: string; onNavigate?: () => void }) {
  return (
    <nav className="flex-1 py-6 px-3 space-y-1">
      {NAV_ITEMS.map((item) => {
        const isActive = location === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors duration-200 group',
              isActive
                ? 'bg-secondary text-primary'
                : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground',
            )}
          >
            <item.icon
              className={cn(
                'size-4 transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
              )}
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Bottom tab bar — mobile only */
function BottomTabBar({ location }: { location: string }) {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-card border-t border-border flex safe-area-pb">
      {NAV_ITEMS.map((item) => {
        const isActive = location === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex-1 flex flex-col items-center justify-center gap-1 py-2 text-[10px] font-mono tracking-wide transition-colors',
              isActive ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            <item.icon className="size-5" />
            <span>{item.label.split(' ')[0]}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Slide-in drawer — mobile nav */
function MobileDrawer({
  open,
  onClose,
  location,
}: {
  open: boolean;
  onClose: () => void;
  location: string;
}) {
  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity duration-300',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        className={cn(
          'fixed top-0 left-0 bottom-0 z-50 w-72 bg-card border-r border-border flex flex-col transition-transform duration-300 ease-out',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
      >
        {/* Drawer header */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-border">
          <Logo />
          <button
            onClick={onClose}
            className="size-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            aria-label="Close menu"
          >
            <X className="size-5" />
          </button>
        </div>

        <NavLinks location={location} onNavigate={onClose} />

        <div className="p-4 border-t border-border">
          <SyncButton />
        </div>
      </div>
    </>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);

  /* ── Mobile layout ────────────────────────────────────────────────────── */
  if (isMobile) {
    return (
      <div className="flex flex-col h-screen w-full bg-background selection:bg-primary/30">
        {/* Top header */}
        <header className="h-14 shrink-0 flex items-center justify-between px-4 border-b border-border bg-card z-30">
          <button
            onClick={() => setDrawerOpen(true)}
            className="size-9 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            aria-label="Open menu"
            aria-expanded={drawerOpen}
          >
            <Menu className="size-5" />
          </button>

          <Logo />

          <SyncButton compact />
        </header>

        {/* Slide-out drawer */}
        <MobileDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          location={location}
        />

        {/* Scrollable page content — padded above tabs */}
        <main className="flex-1 overflow-y-auto relative">
          <div className="absolute top-0 left-0 right-0 h-32 bg-primary/5 blur-[100px] pointer-events-none" />
          <div className="relative z-10 p-4 pb-24">
            {children}
          </div>
        </main>

        {/* Bottom tab bar */}
        <BottomTabBar location={location} />
      </div>
    );
  }

  /* ── Desktop layout ───────────────────────────────────────────────────── */
  return (
    <div className="flex h-screen w-full bg-background overflow-hidden selection:bg-primary/30">
      {/* Permanent sidebar */}
      <aside className="w-64 flex-shrink-0 border-r border-border bg-card flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-border">
          <Logo />
        </div>

        <NavLinks location={location} />

        <div className="p-4 border-t border-border">
          <SyncButton />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <div className="absolute top-0 left-0 right-0 h-32 bg-primary/5 blur-[100px] pointer-events-none" />
        <div className="flex-1 overflow-y-auto p-6 md:p-8 lg:p-10 relative z-10">
          {children}
        </div>
      </main>
    </div>
  );
}
