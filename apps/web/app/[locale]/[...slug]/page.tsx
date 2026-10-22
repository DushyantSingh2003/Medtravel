import { isLocale, LOCALES } from '@medtravel/i18n';
import { Button, EmptyState, PageHeader } from '@medtravel/ui';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Link } from '../../../i18n/navigation';
import { languageAlternates } from '../../../lib/site-config';
import { SITE_PAGES, isSitePage } from '../../../lib/site-pages';

type Props = { params: Promise<{ locale: string; slug: string[] }> };

/** Every placeholder page is generated at build time, in both languages. */
export function generateStaticParams() {
  return LOCALES.flatMap((locale) => SITE_PAGES.map((page) => ({ locale, slug: [page] })));
}

/** Only the pages listed above exist; anything else is a real 404 from the static build. */
export const dynamicParams = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const [page] = slug;
  if (!isLocale(locale) || slug.length !== 1 || !isSitePage(page)) return {};
  const t = await getTranslations({ locale });
  return {
    title: t(`site.pages.${page}.title`),
    description: t(`site.pages.${page}.description`),
    alternates: { languages: languageAlternates(`/${page}`) },
  };
}

/**
 * Placeholder for a public page that has no content yet, so no menu or footer link is a dead end.
 * Anything that is not one of the known pages is a 404 (this is also the site's catch-all).
 */
export default async function SitePlaceholderPage({ params }: Props) {
  const { locale, slug } = await params;
  const [page] = slug;
  if (!isLocale(locale) || slug.length !== 1 || !isSitePage(page)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations();

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-10 sm:px-6 sm:py-16">
      <PageHeader
        title={t(`site.pages.${page}.title`)}
        description={t(`site.pages.${page}.description`)}
      />
      <EmptyState
        title={t('site.comingSoon')}
        description={t('site.comingSoonBody')}
        headingLevel={2}
        action={
          <Button asChild>
            <Link href="/quote">{t('site.getQuote')}</Link>
          </Button>
        }
      />
    </div>
  );
}
