import { isLocale } from '@medtravel/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { PortalShell } from '../../../components/portal/portal-shell';
import { requireAccountSession } from '../../../lib/auth/session';

type Props = { children: ReactNode; params: Promise<{ locale: string }> };

/** The account pages belong to every portal, so they wear the shell of the signed-in user's own. */
export default async function Layout({ children, params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const session = await requireAccountSession(locale);
  return (
    <PortalShell portal={session.portal} role={session.role}>
      {children}
    </PortalShell>
  );
}
