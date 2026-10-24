'use client';

import type { Locale, Portal, Role } from '@medtravel/contracts';
import { useLogout } from '@medtravel/api-client';
import { LOCALES, LOCALE_LABELS } from '@medtravel/i18n';
import {
  AppShell,
  BrandMark,
  Input,
  NotificationsMenu,
  Switcher,
  UserMenu,
  toast,
  type NavSection,
} from '@medtravel/ui';
import { LogOut, Search } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useTransition, type FormEvent, type ReactNode } from 'react';
import { Link, usePathname, useRouter } from '../../i18n/navigation';
import { PAGE_ICONS } from '../../lib/portal-icons';
import { PORTAL_DEFINITIONS } from '../../lib/portal-pages';
import { activePageKey, pageHref } from '../../lib/portal-routes';

const LANGUAGE_OPTIONS = LOCALES.map((value) => ({ value, label: LOCALE_LABELS[value] }));

/**
 * The signed-in frame: this portal's navigation, a top bar with search, notifications, language and
 * the user menu. The page itself is `children`.
 */
export function PortalShell({
  portal,
  role,
  children,
}: {
  portal: Portal;
  role: Role;
  children: ReactNode;
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, startSignOut] = useTransition();

  const definition = PORTAL_DEFINITIONS[portal];
  const sections: NavSection[] = definition.sections.map((section) => ({
    id: section,
    label: t(`navSections.${portal}.${section}`),
    items: definition.pages
      .filter((page) => page.section === section)
      .map((page) => {
        const Icon = PAGE_ICONS[page.icon];
        return {
          id: page.key,
          label: t(`nav.${portal}.${page.key}`),
          href: pageHref(portal, page),
          icon: <Icon aria-hidden="true" />,
        };
      }),
  }));

  const onSearch = (event: FormEvent) => {
    event.preventDefault();
    toast(t('shell.searchUnavailable'));
  };

  return (
    <AppShell
      linkComponent={Link}
      storageKey={`mt:${portal}:sidebar-collapsed`}
      sections={sections}
      activeId={activePageKey(portal, pathname)}
      labels={{
        skipToContent: t('shell.skipToContent'),
        navigation: t('shell.navigation'),
        openMenu: t('shell.openMenu'),
        closeMenu: t('shell.closeMenu'),
        collapse: t('shell.collapse'),
        expand: t('shell.expand'),
      }}
      brand={
        <Link href={`/${portal}`} className="flex min-w-0 items-center gap-2.5 rounded-md">
          <BrandMark />
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-sm font-semibold">{t('common.appName')}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {t(`portals.${portal}`)}
            </span>
          </span>
        </Link>
      }
      brandCompact={
        <Link href={`/${portal}`} aria-label={t('common.appName')} className="rounded-md">
          <BrandMark />
        </Link>
      }
      topBar={
        <>
          <form
            role="search"
            onSubmit={onSearch}
            className="relative order-last w-full sm:order-none sm:w-auto sm:max-w-md sm:flex-1"
          >
            <Search
              className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              aria-label={t('shell.search')}
              placeholder={t('shell.searchPlaceholder')}
              className="h-9 ps-9"
            />
          </form>
          <div className="ms-auto flex items-center gap-1">
            <NotificationsMenu
              items={[]}
              label={t('shell.notifications')}
              emptyLabel={t('shell.notificationsEmpty')}
              unreadLabel={(count) => t('shell.unread', { count })}
            />
            <Switcher
              label={t('shell.language')}
              value={locale}
              options={LANGUAGE_OPTIONS}
              onValueChange={(next) => router.replace(pathname, { locale: next as Locale })}
            />
            <UserMenu
              label={t('shell.userMenu')}
              heading={t('shell.signedInAs')}
              name={t(`roles.${role}`)}
              description={t(`portals.${portal}`)}
              linkComponent={Link}
              items={[
                {
                  id: 'sign-out',
                  label: t('shell.signOut'),
                  icon: <LogOut aria-hidden="true" />,
                  onSelect: () => startSignOut(() => signOut(locale)),
                },
              ]}
            />
          </div>
        </>
      }
    >
      <div aria-busy={signingOut || undefined} className="mx-auto w-full max-w-6xl">
        {children}
      </div>
    </AppShell>
  );
}
