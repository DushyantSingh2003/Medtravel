import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Button } from '@medtravel/ui';
import { isLocale } from '@medtravel/i18n';
import { Link } from '../../i18n/navigation';
import { languageAlternates } from '../../lib/site-config';

export const generateMetadata = (): Metadata => ({
  alternates: { languages: languageAlternates('') },
});

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations();

  return (
    <div className="mx-auto flex max-w-3xl flex-col justify-center gap-6 px-6 py-16 sm:py-24">
      <h1 className="text-4xl font-semibold text-brand-800">{t('home.title')}</h1>
      <p className="text-lg text-muted-foreground">{t('home.subtitle')}</p>
      <div>
        <Button asChild size="lg">
          <Link href="/quote">{t('home.cta')}</Link>
        </Button>
      </div>
    </div>
  );
}
