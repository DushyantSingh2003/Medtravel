import { isLocale } from '@medtravel/i18n';
import { PageHeader } from '@medtravel/ui';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { MastersIndex } from '../../../../components/masters/masters-index';
import { Link } from '../../../../i18n/navigation';
import { requirePortalSession } from '../../../../lib/auth/session';

// The page reads the session cookie, so it must be rendered per request, never prerendered with the build's (signed-out) answer.
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: 'masters' });
  return { title: t('title') };
}

export default async function Page({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  await requirePortalSession(locale, 'admin');
  const [t, shell, portals] = await Promise.all([
    getTranslations('masters'),
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
          items: [{ label: portals('admin'), href: '/admin' }, { label: t('title') }],
        }}
      />
      <MastersIndex />
    </div>
  );
}
