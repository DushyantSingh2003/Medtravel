import type { Portal } from '@medtravel/contracts';
import { isLocale } from '@medtravel/i18n';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { requirePortalSession } from '../../lib/auth/session';
import { PermissionsProvider } from '../../lib/permissions/permissions';
import { PortalShell } from './portal-shell';

interface LayoutProps {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}

/** Layout shared by the five portals: session check, then the shell with that portal's menu. */
export async function PortalLayout({ portal, children, params }: LayoutProps & { portal: Portal }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const session = await requirePortalSession(locale, portal);
  return (
    <PermissionsProvider role={session.role}>
      <PortalShell portal={portal} role={session.role}>
        {children}
      </PortalShell>
    </PermissionsProvider>
  );
}

/** The portal's name in the tab, with the product name after page titles. Never indexed. */
export async function portalLayoutMetadata(
  portal: Portal,
  { params }: Pick<LayoutProps, 'params'>,
): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale });
  return {
    title: { default: t(`portals.${portal}`), template: `%s | ${t('common.appName')}` },
    robots: { index: false, follow: false },
  };
}
