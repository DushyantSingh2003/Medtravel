import { isLocale } from '@medtravel/i18n';
import { PageHeader } from '@medtravel/ui';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { SecurityPanel } from '../../../../components/auth/security-panel';
import { Link } from '../../../../i18n/navigation';
import { requireAccountSession } from '../../../../lib/auth/session';

type Props = { params: Promise<{ locale: string }> };

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: 'auth.security' });
  return { title: t('title'), robots: { index: false, follow: false } };
}

export default async function Page({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const session = await requireAccountSession(locale);
  const [t, shell, portals] = await Promise.all([getTranslations('auth.security'), getTranslations('shell'), getTranslations('portals')]);
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        breadcrumbs={{
          label: shell('breadcrumb'),
          linkComponent: Link,
          items: [{ label: portals(session.portal), href: `/${session.portal}` }, { label: t('title') }],
        }}
      />
      <SecurityPanel user={session.user} />
    </div>
  );
}
