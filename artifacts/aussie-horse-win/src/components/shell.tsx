import { Link, useLocation } from 'wouter';
import { Activity, Trophy, Settings as SettingsIcon, Flag, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTriggerSync } from '@workspace/api-client-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';

export function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const queryClient = useQueryClient();
  const syncMutation = useTriggerSync();

  const navItems = [
    { href: '/', label: 'Nominations', icon: Trophy },
    { href: '/races', label: 'Race Explorer', icon: Flag },
    { href: '/performance', label: 'Performance', icon: Activity },
    { href: '/settings', label: 'Settings', icon: SettingsIcon },
  ];

  const handleSync = () => {
    syncMutation.mutate(undefined, {
      onSuccess: (data) => {
        toast.success(data.message || 'Sync complete');
        queryClient.invalidateQueries();
      },
      onError: () => {
        toast.error('Failed to sync data');
      }
    });
  };

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden selection:bg-primary/30">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 border-r border-border bg-card flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="size-8 rounded bg-primary/20 flex items-center justify-center text-primary border border-primary/50">
              <Trophy className="size-4" />
            </div>
            <div>
              <h1 className="font-bold text-sm tracking-tight uppercase leading-none">AUSSIE HORSE</h1>
              <span className="text-[10px] text-primary font-mono tracking-widest leading-none">WIN TERMINAL</span>
            </div>
          </div>
        </div>

        <nav className="flex-1 py-6 px-3 space-y-1">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors duration-200 group",
                  isActive 
                    ? "bg-secondary text-primary" 
                    : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                )}
              >
                <item.icon className={cn(
                  "size-4 transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                )} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border">
          <Button 
            variant="outline" 
            className="w-full justify-start gap-2 bg-transparent hover:bg-secondary border-border hover:border-primary/50 hover:text-primary transition-all font-mono text-xs uppercase"
            onClick={handleSync}
            disabled={syncMutation.isPending}
          >
            <RefreshCw className={cn("size-3.5", syncMutation.isPending && "animate-spin")} />
            {syncMutation.isPending ? 'Syncing...' : 'Sync Data'}
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {/* Top subtle gradient glow for vibes */}
        <div className="absolute top-0 left-0 right-0 h-32 bg-primary/5 blur-[100px] pointer-events-none" />
        
        <div className="flex-1 overflow-y-auto p-6 md:p-8 lg:p-10 relative z-10">
          {children}
        </div>
      </main>
    </div>
  );
}