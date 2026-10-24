import { isLocale } from '@medtravel/i18n';
import type { Locale } from '@medtravel/contracts';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { redirect } from '../../i18n/navigation';
import { getSession, homeOf } from '../../lib/auth/session';
import { AuthCard } from './auth-card';

export interface AuthPageProps {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ token?: string | string[] }>;
}

/** The token in an emailed link's query string, or null. */
export async function tokenOf(searchParams: AuthPageProps['searchParams']): Promise<string | null> {
  const token = (await searchParams)?.token;
  return typeof token === 'string' && token.length > 0 ? token : null;
}

/** Tab title for a sign-in page. Never indexed, and a page whose address carries a token never leaks it in a Referer. */
export async function authMetadata(
  { params }: Pick<AuthPageProps, 'params'>,
  titleKey: string,
  carriesToken = false,
): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: 'auth' });
  return {
    title: t(titleKey),
    robots: { index: false, follow: false },
    ...(carriesToken ? { referrer: 'no-referrer' as const } : {}),
  };
}

/**
 * Everything a sign-in page shares: check the language, send an already signed-in visitor to where they belong (unless the
 * page is for signed-in users), and wrap the form in the card with its title.
 */
export async function renderAuthPage({
  params,
  titleKey,
  descriptionKey,
  children,
  footer,
  redirectSignedIn = true,
}: {
  params: AuthPageProps['params'];
  titleKey: string;
  descriptionKey?: string;
  children: (locale: Locale) => ReactNode;
  footer?: ReactNode;
  redirectSignedIn?: boolean;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  if (redirectSignedIn) {
    const session = await getSession();
    if (session) redirect({ href: homeOf(session), locale });
  }
  const t = await getTranslations();
  return (
    <AuthCard
      appName={t('common.appName')}
      title={t(`auth.${titleKey}`)}
      {...(descriptionKey ? { description: t(`auth.${descriptionKey}`) } : {})}
      footer={footer}
    >
      {children(locale)}
    </AuthCard>
  );
}
