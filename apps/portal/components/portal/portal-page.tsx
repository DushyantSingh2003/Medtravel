import type { Portal } from '@medtravel/contracts';
import { isLocale } from '@medtravel/i18n';
import { Badge, Button, EmptyState, PageHeader } from '@medtravel/ui';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Link } from '../../i18n/navigation';
import { requirePortalSession } from '../../lib/auth/session';
import { PAGE_ICONS } from '../../lib/portal-icons';
import { resolveRoute } from '../../lib/portal-routes';

interface PortalPageProps {
  params: Promise<{ locale: string; slug?: string[] }>;
}

/** Sample case the "Cases" placeholder links to, so the Case 360 route can be clicked through. */
const SAMPLE_CASE_ID = 'CASE-2026-000001';

/** Placeholder for every screen of a portal, until the screen's own task builds it. */
export async function PortalPage({ portal, params }: PortalPageProps & { portal: Portal }) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  await requirePortalSession(locale, portal);

  const route = resolveRoute(portal, slug);
  if (!route) notFound();

  const t = await getTranslations();
  const { page } = route;
  const Icon = PAGE_ICONS[page.icon];
  const title = t(`nav.${portal}.${page.key}`);
  const isCase = route.kind === 'case';

  return (
    <div className="space-y-6">
      <PageHeader
        title={isCase ? t('placeholder.caseId', { id: route.caseId }) : title}
        description={t(`pages.${portal}.${page.key}`)}
        breadcrumbs={{
          label: t('shell.navigation'),
          linkComponent: Link,
          items: [
            { label: t(`portals.${portal}`), href: `/${portal}` },
            ...(isCase ? [{ label: title, href: `/${portal}/${page.key}` }] : []),
            { label: isCase ? route.caseId : title },
          ],
        }}
        actions={<Badge variant="outline">{t(`priority.${page.priority}`)}</Badge>}
      />
      <EmptyState
        icon={<Icon />}
        title={t('placeholder.title')}
        description={t('placeholder.body')}
        headingLevel={2}
        action={
          portal === 'ops' && page.key === 'cases' && !isCase ? (
            <Button asChild variant="outline">
              <Link href={`/ops/cases/${SAMPLE_CASE_ID}`}>{t('placeholder.openSampleCase')}</Link>
            </Button>
          ) : isCase ? (
            <Button asChild variant="outline">
              <Link href="/ops/cases">{t('placeholder.backToCases')}</Link>
            </Button>
          ) : undefined
        }
      />
    </div>
  );
}

/** Browser-tab title: the page's name, completed by the layout's title template. */
export async function portalPageMetadata(
  portal: Portal,
  { params }: PortalPageProps,
): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const route = resolveRoute(portal, slug);
  if (!route) return {};
  const t = await getTranslations({ locale });
  return { title: t(`nav.${portal}.${route.page.key}`) };
}
