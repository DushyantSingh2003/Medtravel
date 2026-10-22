import type { ElementType, ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface FooterLink {
  id: string;
  label: string;
  href: string;
}

export interface FooterColumn {
  id: string;
  title: string;
  links: FooterLink[];
}

export interface SiteFooterProps {
  brand: ReactNode;
  tagline?: string;
  columns: FooterColumn[];
  /** Privacy, terms and the other legal pages, shown along the bottom. */
  legal: FooterLink[];
  copyright: string;
  /** Name of the link-columns landmark, e.g. "Footer". */
  navigationLabel: string;
  legalLabel: string;
  linkComponent?: ElementType;
  className?: string;
}

/** The public website's footer: brand, link columns, legal links and the copyright line. */
export function SiteFooter({
  brand,
  tagline,
  columns,
  legal,
  copyright,
  navigationLabel,
  legalLabel,
  linkComponent: LinkComponent = 'a',
  className,
}: SiteFooterProps) {
  const link = 'rounded-sm text-sm text-muted-foreground hover:text-foreground hover:underline';
  return (
    <footer data-slot="site-footer" className={cn('border-t bg-muted/40', className)}>
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="grid gap-8 md:grid-cols-[1fr_2fr]">
          <div className="space-y-3">
            {brand}
            {tagline ? <p className="max-w-xs text-sm text-muted-foreground">{tagline}</p> : null}
          </div>
          <nav aria-label={navigationLabel} className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {columns.map((column) => (
              <div key={column.id}>
                <h2 className="mb-3 text-sm font-semibold">{column.title}</h2>
                <ul className="space-y-2">
                  {column.links.map((item) => (
                    <li key={item.id}>
                      <LinkComponent href={item.href} className={link}>
                        {item.label}
                      </LinkComponent>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
        <div className="mt-10 flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">{copyright}</p>
          <nav aria-label={legalLabel}>
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {legal.map((item) => (
                <li key={item.id}>
                  <LinkComponent href={item.href} className={cn(link, 'text-xs')}>
                    {item.label}
                  </LinkComponent>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </footer>
  );
}
