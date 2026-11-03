import { isLocale } from '@medtravel/i18n';
import { PageHeader } from '@medtravel/ui';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { UserDetail } from '../../../../../components/users/user-detail';
import { Link } from '../../../../../i18n/navigation';
import { requirePortalSession } from '../../../../../lib/auth/session';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: 'users' });
  return { title: t('title') };
}

export default async function Page({ params }: Props) {
  const { locale, id } = await params;
  if (!isLocale(locale) || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  setRequestLocale(locale);
  await requirePortalSession(locale, 'admin');
  const [t, shell, portals] = await Promise.all([
    getTranslations('users'),
    getTranslations('shell'),
    getTranslations('portals'),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        breadcrumbs={{
          label: shell('breadcrumb'),
          linkComponent: Link,
          items: [
            { label: portals('admin'), href: '/admin' },
            { label: t('title'), href: '/admin/users' },
          ],
        }}
      />
      <UserDetail id={id} />
    </div>
  );
}
