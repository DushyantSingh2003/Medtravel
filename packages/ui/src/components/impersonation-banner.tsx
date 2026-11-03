import type { ReactNode } from 'react';
import { Button } from './button';
import { cn } from '../lib/cn';

export interface ImpersonationBannerProps {
  /** What is going on, already translated: who the admin is viewing as, and that it is read-only. */
  message: ReactNode;
  stopLabel: string;
  onStop: () => void;
  /** The stop request is in flight. */
  busy?: boolean;
  className?: string;
}

/**
 * The bar shown across the top for as long as a super admin is looking at the product as someone else. It cannot be missed
 * and cannot be dismissed: the only way out is to stop.
 */
export function ImpersonationBanner({
  message,
  stopLabel,
  onStop,
  busy,
  className,
}: ImpersonationBannerProps) {
  return (
    <div
      role="status"
      data-slot="impersonation-banner"
      className={cn(
        'sticky top-0 z-40 flex flex-wrap items-center justify-between gap-2 border-b border-warning bg-warning px-4 py-2 text-sm font-medium text-warning-foreground',
        className,
      )}
    >
      <span className="min-w-0">{message}</span>
      <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={onStop}>
        {stopLabel}
      </Button>
    </div>
  );
}
