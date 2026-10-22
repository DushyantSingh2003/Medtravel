import { isLocale } from '@medtravel/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { redirect } from '../../i18n/navigation';
import { getSession } from '../../lib/auth/session';

/** The portal has no landing page: signed in goes to your portal, signed out goes to the login page. */
/** Reads the session and runtime configuration, so it must not be prerendered at build time. */
export const dynamic = 'force-dynamic';

export default async function PortalHomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const session = await getSession();
  return redirect({ href: session ? `/${session.portal}` : '/login', locale });
}
