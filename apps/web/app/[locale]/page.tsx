import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Button } from '@medtravel/ui';
import { isLocale } from '@medtravel/i18n';

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations('home');

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-4xl font-semibold text-brand-800">{t('title')}</h1>
      <p className="text-lg text-slate-600">{t('subtitle')}</p>
      <div>
        <Button size="lg">{t('cta')}</Button>
      </div>
    </main>
  );
}
