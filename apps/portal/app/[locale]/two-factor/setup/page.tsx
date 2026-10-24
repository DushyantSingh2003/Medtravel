import { isLocale } from '@medtravel/i18n';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { AuthCard } from '../../../../components/auth/auth-card';
import { authMetadata, type AuthPageProps } from '../../../../components/auth/auth-page';
import { TwoFactorSetup } from '../../../../components/auth/two-factor-setup';
import { redirect } from '../../../../i18n/navigation';
import { requireAnySession } from '../../../../lib/auth/session';

export const dynamic = 'force-dynamic';

export const generateMetadata = (props: AuthPageProps) =>
  authMetadata(props, 'twoFactorSetup.title');

/** Reachable with a limited session: it is where staff, hospital and admin users are sent until they have a second factor. */
export default async function Page({ params }: AuthPageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const session = await requireAnySession(locale);
  if (session.user.twoFactorEnabled) redirect({ href: '/account/security', locale });
  const t = await getTranslations();
  return (
    <AuthCard
      appName={t('common.appName')}
      title={t('auth.twoFactorSetup.title')}
      description={session.user.twoFactorRequired ? t('auth.twoFactorSetup.intro') : undefined}
    >
      <TwoFactorSetup destination={`/${session.portal}`} />
    </AuthCard>
  );
}
