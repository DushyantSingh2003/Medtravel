import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Card, CardContent } from './card';
import { Skeleton } from './skeleton';

export interface StatCardProps {
  label: string;
  /** Pre-formatted by the caller (numbers, currency and dates are locale-specific). */
  value: string;
  icon?: ReactNode;
  /** Change versus the previous period, already formatted, e.g. "+12%". */
  delta?: {
    value: string;
    trend: 'up' | 'down' | 'flat';
    /** Whether "up" is good news. Default true. */ upIsGood?: boolean;
    /** Spoken description, e.g. "up 12 percent versus last week". */ srLabel?: string;
  };
  loading?: boolean;
  className?: string;
}

export function StatCard({ label, value, icon, delta, loading, className }: StatCardProps) {
  const good = delta
    ? delta.trend === 'flat'
      ? null
      : (delta.trend === 'up') === (delta.upIsGood ?? true)
    : null;
  const Arrow =
    delta?.trend === 'up' ? ArrowUpRight : delta?.trend === 'down' ? ArrowDownRight : ArrowRight;
  return (
    <Card data-slot="stat-card" className={className}>
      <CardContent className="flex items-start justify-between gap-3 p-4 pt-4 sm:p-5 sm:pt-5">
        <div className="min-w-0 space-y-1">
          <p className="truncate text-sm text-muted-foreground">{label}</p>
          {loading ? (
            <Skeleton className="h-8 w-24" />
          ) : (
            <p className="text-2xl font-semibold tabular-nums">{value}</p>
          )}
          {delta && !loading ? (
            <p
              className={cn(
                'inline-flex items-center gap-1 text-xs font-medium',
                good === true && 'text-success',
                good === false && 'text-destructive',
                good === null && 'text-muted-foreground',
              )}
            >
              <Arrow
                className={cn(
                  'size-3.5',
                  !delta.trend || delta.trend === 'flat' ? 'rtl:-scale-x-100' : undefined,
                )}
                aria-hidden="true"
              />
              <span aria-hidden={delta.srLabel ? true : undefined}>{delta.value}</span>
              {delta.srLabel ? <span className="sr-only">{delta.srLabel}</span> : null}
            </p>
          ) : null}
        </div>
        {icon ? (
          <div
            className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground [&_svg]:size-5"
            aria-hidden="true"
          >
            {icon}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
