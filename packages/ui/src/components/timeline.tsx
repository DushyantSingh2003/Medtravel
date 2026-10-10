import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface TimelineItem {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  /** ISO timestamp for the machine-readable `datetime` attribute. */
  dateTime: string;
  /** The same moment, formatted for the viewer's locale and time zone by the caller. */
  timeLabel: string;
  icon?: ReactNode;
  tone?: 'default' | 'success' | 'warning' | 'destructive';
}

const dot: Record<NonNullable<TimelineItem['tone']>, string> = {
  default: 'bg-primary text-primary-foreground',
  success: 'bg-success text-success-foreground',
  warning: 'bg-warning text-warning-foreground',
  destructive: 'bg-destructive text-destructive-foreground',
};

export function Timeline({
  items,
  label,
  className,
}: {
  items: TimelineItem[];
  label: string;
  className?: string;
}) {
  return (
    <ol aria-label={label} className={cn('relative', className)}>
      {items.map((item, index) => (
        <li key={item.id} className="relative flex gap-3 pb-6 last:pb-0">
          {index < items.length - 1 ? (
            <span aria-hidden="true" className="absolute start-3 top-6 bottom-0 w-px bg-border" />
          ) : null}
          <span
            aria-hidden="true"
            className={cn(
              'relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full [&_svg]:size-3.5',
              dot[item.tone ?? 'default'],
            )}
          >
            {item.icon ?? <span className="size-2 rounded-full bg-current" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <p className="text-sm font-medium">{item.title}</p>
              <time dateTime={item.dateTime} className="text-xs text-muted-foreground">
                {item.timeLabel}
              </time>
            </div>
            {item.description ? (
              <p className="mt-0.5 text-sm text-muted-foreground">{item.description}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
