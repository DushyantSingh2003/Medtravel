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
  /** Heading level of the title (default 3). `null` renders a bold paragraph, for use inside a table cell. */
  headingLevel?: 2 | 3 | 4 | 5 | 6 | null;
  className?: string;
}

function Title({ level, children }: { level: 2 | 3 | 4 | 5 | 6 | null; children: ReactNode }) {
  const className = 'text-base font-semibold';
  if (level === null) return <p className={className}>{children}</p>;
  const Tag = `h${level}` as const;
  return <Tag className={className}>{children}</Tag>;
}

/** Shown when a list or screen has nothing to display yet. */
export function EmptyState({
  title,
  description,
  icon,
  action,
  headingLevel = 3,
  className,
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-8 text-center',
        className,
      )}
    >
      <div
        className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-6"
        aria-hidden="true"
      >
        {icon ?? <Inbox />}
      </div>
      <div className="space-y-1">
        <Title level={headingLevel}>{title}</Title>
        {description ? (
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>
        ) : null}
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
  /** Heading level of the title (default 3). `null` renders a bold paragraph. */
  headingLevel?: 2 | 3 | 4 | 5 | 6 | null;
  className?: string;
}

/** Shown when loading failed. Announced to screen readers as an alert. */
export function ErrorState({
  title,
  description,
  retryLabel,
  onRetry,
  headingLevel = 3,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      data-slot="error-state"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center',
        className,
      )}
    >
      <div
        className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive"
        aria-hidden="true"
      >
        <AlertTriangle className="size-6" />
      </div>
      <div className="space-y-1">
        <Title level={headingLevel}>{title}</Title>
        {description ? (
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {retryLabel && onRetry ? (
        <Button variant="outline" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
