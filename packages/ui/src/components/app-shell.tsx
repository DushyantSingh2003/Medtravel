'use client';

import { Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useId, useState, type ElementType, type ReactNode } from 'react';
import { cn } from '../lib/cn';
import { useStoredFlag } from '../lib/use-stored-flag';
import { Button } from './button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from './sheet';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon?: ReactNode;
}

export interface NavSection {
  id: string;
  /** Heading of the group; omit for an unlabelled group. */
  label?: string;
  items: NavItem[];
}

export interface AppShellLabels {
  skipToContent: string;
  /** Name of the navigation landmark and the mobile menu. */
  navigation: string;
  openMenu: string;
  closeMenu: string;
  collapse: string;
  expand: string;
}

export interface AppShellProps {
  /** Logo and name, shown while the sidebar is expanded. */
  brand: ReactNode;
  /** Logo only, shown while the sidebar is collapsed. */
  brandCompact: ReactNode;
  sections: NavSection[];
  /** `id` of the current page's item; it is marked with `aria-current`. */
  activeId?: string;
  /** Search, notifications, language switcher, user menu: whatever sits in the top bar. */
  topBar: ReactNode;
  labels: AppShellLabels;
  /** Pass the router's Link so navigation stays client-side. Defaults to a plain anchor. */
  linkComponent?: ElementType;
  /** Where the collapsed/expanded choice is remembered in this browser. */
  storageKey?: string;
  /** Fill the parent instead of the viewport (the component gallery). */
  contained?: boolean;
  children: ReactNode;
}

const DEFAULT_STORAGE_KEY = 'app-shell:collapsed';

function NavLinks({
  sections,
  activeId,
  collapsed,
  linkComponent: LinkComponent,
  onNavigate,
}: {
  sections: NavSection[];
  activeId?: string;
  collapsed: boolean;
  linkComponent: ElementType;
  onNavigate?: () => void;
}) {
  return (
    <div className="space-y-4">
      {sections.map((section) => (
        <div key={section.id}>
          {section.label && !collapsed ? (
            <h2 className="px-3 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {section.label}
            </h2>
          ) : section.label ? (
            <div role="presentation" className="mx-3 mb-2 h-px bg-border" />
          ) : null}
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active = item.id === activeId;
              const link = (
                <LinkComponent
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  onClick={onNavigate}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                    'hover:bg-accent hover:text-accent-foreground',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                    '[&_svg]:size-4 [&_svg]:shrink-0',
                    active ? 'bg-accent font-medium text-accent-foreground' : 'text-foreground/80',
                    collapsed && 'justify-center px-0',
                  )}
                >
                  {item.icon}
                  <span className={cn('truncate', collapsed && 'sr-only')}>{item.label}</span>
                </LinkComponent>
              );
              return (
                <li key={item.id}>
                  {collapsed ? (
                    <Tooltip>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side="right">{item.label}</TooltipContent>
                    </Tooltip>
                  ) : (
                    link
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * The frame of every signed-in screen: a sidebar of navigation (collapsible on wide screens, a sheet
 * on phones), a top bar for the caller's controls, and the page. Holds no text of its own.
 */
export function AppShell({
  brand,
  brandCompact,
  sections,
  activeId,
  topBar,
  labels,
  linkComponent = 'a',
  storageKey = DEFAULT_STORAGE_KEY,
  contained,
  children,
}: AppShellProps) {
  const [collapsed, setCollapsed] = useStoredFlag(storageKey);
  const [menuOpen, setMenuOpen] = useState(false);
  const mainId = `${useId()}-main`;
  const toggle = () => setCollapsed(!collapsed);
  // Embedded in a page (the gallery) the shell must not add page-level landmarks of its own.
  const Aside = contained ? 'div' : 'aside';
  const Main = contained ? 'div' : 'main';

  return (
    <TooltipProvider delayDuration={200}>
      <div
        data-slot="app-shell"
        className={cn('flex bg-muted/30', contained ? 'h-full min-h-0' : 'min-h-dvh')}
      >
        <a
          href={`#${mainId}`}
          className="sr-only z-50 rounded-md bg-background px-4 py-2 text-sm font-medium shadow focus:not-sr-only focus:fixed focus:start-2 focus:top-2"
        >
          {labels.skipToContent}
        </a>

        <Aside
          data-collapsed={collapsed}
          className={cn(
            'hidden shrink-0 flex-col border-e bg-card transition-[width] duration-200 md:flex',
            contained ? 'h-full' : 'sticky top-0 h-dvh',
            collapsed ? 'w-[4.5rem]' : 'w-64',
          )}
        >
          <div
            className={cn(
              'flex h-14 shrink-0 items-center border-b px-4',
              collapsed && 'justify-center px-0',
            )}
          >
            {collapsed ? brandCompact : brand}
          </div>
          <nav aria-label={labels.navigation} className="flex-1 overflow-y-auto p-2">
            <NavLinks
              sections={sections}
              activeId={activeId}
              collapsed={collapsed}
              linkComponent={linkComponent}
            />
          </nav>
          <div className="border-t p-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggle}
              aria-expanded={!collapsed}
              aria-label={collapsed ? labels.expand : labels.collapse}
              className={cn('w-full', collapsed ? 'justify-center' : 'justify-start')}
            >
              {collapsed ? (
                <PanelLeftOpen className="rtl:-scale-x-100" aria-hidden="true" />
              ) : (
                <>
                  <PanelLeftClose className="rtl:-scale-x-100" aria-hidden="true" />
                  {labels.collapse}
                </>
              )}
            </Button>
          </div>
        </Aside>

        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetContent side="start" closeLabel={labels.closeMenu} className="gap-3 p-3">
            <SheetTitle className="flex h-10 items-center px-2">{brand}</SheetTitle>
            <SheetDescription className="sr-only">{labels.navigation}</SheetDescription>
            <nav aria-label={labels.navigation} className="-mx-1 flex-1 overflow-y-auto px-1">
              <NavLinks
                sections={sections}
                activeId={activeId}
                collapsed={false}
                linkComponent={linkComponent}
                onNavigate={() => setMenuOpen(false)}
              />
            </nav>
          </SheetContent>
        </Sheet>

        <div className={cn('flex min-w-0 flex-1 flex-col', contained && 'overflow-y-auto')}>
          <header className="sticky top-0 z-30 flex flex-wrap items-center gap-x-2 gap-y-1 border-b bg-background/95 px-3 py-2 backdrop-blur sm:px-4">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMenuOpen(true)}
              aria-label={labels.openMenu}
            >
              <Menu aria-hidden="true" />
            </Button>
            {topBar}
          </header>
          <Main id={mainId} tabIndex={-1} className="flex-1 p-4 outline-none sm:p-6">
            {children}
          </Main>
        </div>
      </div>
    </TooltipProvider>
  );
}
