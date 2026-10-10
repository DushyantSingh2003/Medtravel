import { ChevronRight } from 'lucide-react';
import { Fragment, type ElementType } from 'react';
import { cn } from '../lib/cn';

export interface BreadcrumbItem {
  label: string;
  /** Omit for the current page. */
  href?: string;
}

export interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  /** Accessible name of the navigation landmark, e.g. "Breadcrumb". */
  label: string;
  /** Pass the router's Link so navigation stays client-side. Defaults to a plain anchor. */
  linkComponent?: ElementType;
  className?: string;
}

export function Breadcrumbs({
  items,
  label,
  linkComponent: LinkComponent = 'a',
  className,
}: BreadcrumbsProps) {
  return (
    <nav aria-label={label} className={className}>
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <Fragment key={`${item.label}-${index}`}>
              <li className="inline-flex items-center">
                {item.href && !last ? (
                  <LinkComponent
                    href={item.href}
                    className={cn('rounded-sm hover:text-foreground hover:underline')}
                  >
                    {item.label}
                  </LinkComponent>
                ) : (
                  <span
                    aria-current={last ? 'page' : undefined}
                    className={cn(last && 'font-medium text-foreground')}
                  >
                    {item.label}
                  </span>
                )}
              </li>
              {!last ? (
                <li role="presentation" aria-hidden="true" className="inline-flex">
                  <ChevronRight className="size-3.5 rtl:rotate-180" />
                </li>
              ) : null}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
