import { isLocale } from '@medtravel/i18n';
import { PageHeader } from '@medtravel/ui';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { LeadsScreen } from '../../../../components/leads/leads-screen';
import { Link } from '../../../../i18n/navigation';
import { requirePortalSession } from '../../../../lib/auth/session';

// Rendered per request: it reads the session cookie.
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: 'leads' });
  return { title: t('title') };
}

export default async function Page({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  await requirePortalSession(locale, 'ops');
  const [t, shell, portals] = await Promise.all([
    getTranslations('leads'),
    getTranslations('shell'),
    getTranslations('portals'),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        breadcrumbs={{
          label: shell('breadcrumb'),
          linkComponent: Link,
          items: [{ label: portals('ops'), href: '/ops' }, { label: t('title') }],
        }}
      />
      <LeadsScreen />
    </div>
  );
}
