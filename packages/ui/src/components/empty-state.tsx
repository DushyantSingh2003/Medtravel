import { AlertTriangle, Inbox } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Button } from './button';

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  /** Usually a Button; rendered below the text. */
  action?: ReactNode;
  className?: string;
}

/** Shown when a list or screen has nothing to display yet. */
export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn('flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-8 text-center', className)}
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-6" aria-hidden="true">
        {icon ?? <Inbox />}
      </div>
      <div className="space-y-1">
        <h3 className="text-base font-semibold">{title}</h3>
        {description ? <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export interface ErrorStateProps {
  title: string;
  description?: string;
  /** When both are given a retry button is shown. */
  retryLabel?: string;
  onRetry?: () => void;
  className?: string;
}

/** Shown when loading failed. Announced to screen readers as an alert. */
export function ErrorState({ title, description, retryLabel, onRetry, className }: ErrorStateProps) {
  return (
    <div
      role="alert"
      data-slot="error-state"
      className={cn('flex flex-col items-center justify-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center', className)}
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive" aria-hidden="true">
        <AlertTriangle className="size-6" />
      </div>
      <div className="space-y-1">
        <h3 className="text-base font-semibold">{title}</h3>
        {description ? <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {retryLabel && onRetry ? (
        <Button variant="outline" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
