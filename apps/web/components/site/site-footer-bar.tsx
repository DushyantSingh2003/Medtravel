import { BrandMark, SiteFooter } from '@medtravel/ui';
import { getTranslations } from 'next-intl/server';
import { Link } from '../../i18n/navigation';
import { FOOTER_COLUMNS, LEGAL_PAGES } from '../../lib/site-pages';

/** The public website's footer: link columns, legal links, copyright. Static, no client script. */
export async function SiteFooterBar() {
  const t = await getTranslations();
  const link = (page: string) => ({
    id: page,
    label: t(`site.pages.${page}.title`),
    href: `/${page}`,
  });

  return (
    <SiteFooter
      // Room at the bottom so the floating WhatsApp button never covers the legal links.
      className="pb-20 sm:pb-16"
      linkComponent={Link}
      brand={
        <Link href="/" className="inline-flex items-center gap-2 rounded-md">
          <BrandMark />
          <span className="text-lg font-semibold">{t('common.appName')}</span>
        </Link>
      }
      tagline={t('site.tagline')}
      navigationLabel={t('site.footerNavigation')}
      legalLabel={t('site.legalNavigation')}
      columns={[
        {
          id: 'patients',
          title: t('site.columns.patients'),
          links: FOOTER_COLUMNS.patients.map(link),
        },
        {
          id: 'company',
          title: t('site.columns.company'),
          links: FOOTER_COLUMNS.company.map(link),
        },
      ]}
      legal={LEGAL_PAGES.map(link)}
      copyright={t('site.copyright', { year: new Date().getFullYear() })}
    />
  );
}
