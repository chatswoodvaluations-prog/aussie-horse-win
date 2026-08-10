import { cn } from '@/lib/utils';
import { Loader2Icon } from 'lucide-react';

function Spinner({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  // Cast needed to bridge the dual @types/react version mismatch between
  // the app and lucide-react; the props are structurally identical at runtime.
  const Icon = Loader2Icon as React.ComponentType<React.SVGProps<SVGSVGElement>>;
  return (
    <Icon
      role="status"
      aria-label="Loading"
      className={cn('size-4 animate-spin', className)}
      {...props}
    />
  );
}

export { Spinner };
