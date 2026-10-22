import { can, masterResourceSchema } from '@medtravel/contracts';
import { isLocale } from '@medtravel/i18n';
import { PageHeader } from '@medtravel/ui';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { MasterScreen } from '../../../../../components/masters/master-screen';
import { Link } from '../../../../../i18n/navigation';
import { requirePortalSession } from '../../../../../lib/auth/session';

// Rendered per request: it reads the session cookie.
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ locale: string; resource: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, resource } = await params;
  const parsed = masterResourceSchema.safeParse(resource);
  if (!isLocale(locale) || !parsed.success) return {};
  const t = await getTranslations({ locale, namespace: 'masters' });
  return { title: t(`resources.${parsed.data}.title`) };
}

export default async function Page({ params }: Props) {
  const { locale, resource } = await params;
  if (!isLocale(locale)) notFound();
  const parsed = masterResourceSchema.safeParse(resource);
  if (!parsed.success) notFound();
  setRequestLocale(locale);
  const session = await requirePortalSession(locale, 'admin');
  const [t, shell, portals] = await Promise.all([
    getTranslations('masters'),
    getTranslations('shell'),
    getTranslations('portals'),
  ]);
  const title = t(`resources.${parsed.data}.title`);
  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={t(`resources.${parsed.data}.description`)}
        breadcrumbs={{
          label: shell('breadcrumb'),
          linkComponent: Link,
          items: [
            { label: portals('admin'), href: '/admin' },
            { label: t('title'), href: '/admin/masters' },
            { label: title },
          ],
        }}
      />
      <MasterScreen resource={parsed.data} canManage={can(session.role, 'update', 'MasterData')} />
    </div>
  );
}
