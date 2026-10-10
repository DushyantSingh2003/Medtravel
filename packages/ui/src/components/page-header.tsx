import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Breadcrumbs, type BreadcrumbsProps } from './breadcrumbs';

export interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: BreadcrumbsProps;
  /** Buttons or menus aligned to the end of the header; they wrap below the title on phones. */
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header data-slot="page-header" className={cn('flex flex-col gap-3', className)}>
      {breadcrumbs ? <Breadcrumbs {...breadcrumbs} /> : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl leading-tight font-semibold tracking-tight">{title}</h1>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
