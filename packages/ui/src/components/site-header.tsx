'use client';

import { Menu } from 'lucide-react';
import { useState, type ElementType, type ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Button } from './button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from './sheet';

export interface SiteNavItem {
  id: string;
  label: string;
  href: string;
}

export interface SiteHeaderLabels {
  skipToContent: string;
  navigation: string;
  openMenu: string;
  closeMenu: string;
}

export interface SiteHeaderProps {
  /** Logo and name, linking home. */
  brand: ReactNode;
  nav: SiteNavItem[];
  /** `id` of the current section, marked with `aria-current`. */
  activeId?: string;
  /** Language and currency switchers, sign in, the call to action. Shown in the bar on wide screens. */
  actions: ReactNode;
  /** What the mobile menu shows below the links; usually the same switchers and button. */
  mobileActions?: ReactNode;
  labels: SiteHeaderLabels;
  linkComponent?: ElementType;
  /** Id of the page's `<main>`; the skip link jumps to it. Pass `null` when the header is embedded (the gallery). */
  mainId?: string | null;
  className?: string;
}

/** The public website's top bar: logo, menu, switchers, call to action. Menu opens as a sheet on phones. */
export function SiteHeader({
  brand,
  nav,
  activeId,
  actions,
  mobileActions,
  labels,
  linkComponent: LinkComponent = 'a',
  mainId = 'main-content',
  className,
}: SiteHeaderProps) {
  const [open, setOpen] = useState(false);
  const linkClasses = (active: boolean) =>
    cn(
      'rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground',
      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
      active ? 'text-primary' : 'text-foreground/80',
    );

  return (
    <header
      data-slot="site-header"
      className={cn('sticky top-0 z-40 border-b bg-background/95 backdrop-blur', className)}
    >
      {mainId ? (
        <a
          href={`#${mainId}`}
          className="sr-only z-50 rounded-md bg-background px-4 py-2 text-sm font-medium shadow focus:not-sr-only focus:fixed focus:start-2 focus:top-2"
        >
          {labels.skipToContent}
        </a>
      ) : null}
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:px-6">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={() => setOpen(true)}
          aria-label={labels.openMenu}
        >
          <Menu aria-hidden="true" />
        </Button>
        <div className="min-w-0 shrink-0">{brand}</div>
        <nav aria-label={labels.navigation} className="ms-4 hidden lg:block">
          <ul className="flex items-center gap-1">
            {nav.map((item) => (
              <li key={item.id}>
                <LinkComponent
                  href={item.href}
                  aria-current={item.id === activeId ? 'page' : undefined}
                  className={linkClasses(item.id === activeId)}
                >
                  {item.label}
                </LinkComponent>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ms-auto flex items-center gap-1 sm:gap-2">{actions}</div>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="start"
          closeLabel={labels.closeMenu}
          // Any link or button-link in the panel (the logo and the call to action too) closes it.
          onClick={(event) => {
            if ((event.target as HTMLElement).closest('a')) setOpen(false);
          }}
        >
          <SheetTitle className="flex h-10 items-center">{brand}</SheetTitle>
          <SheetDescription className="sr-only">{labels.navigation}</SheetDescription>
          <nav aria-label={labels.navigation} className="flex-1 overflow-y-auto">
            <ul className="space-y-1">
              {nav.map((item) => (
                <li key={item.id}>
                  <LinkComponent
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={item.id === activeId ? 'page' : undefined}
                    className={cn(linkClasses(item.id === activeId), 'block text-base')}
                  >
                    {item.label}
                  </LinkComponent>
                </li>
              ))}
            </ul>
          </nav>
          {mobileActions ? (
            <div className="flex flex-col gap-2 border-t pt-4">{mobileActions}</div>
          ) : null}
        </SheetContent>
      </Sheet>
    </header>
  );
}
