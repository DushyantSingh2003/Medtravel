import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Button } from '@medtravel/ui';
import { isLocale } from '@medtravel/i18n';

/**
 * Placeholder landing page. The five portals become route groups next to this file
 * (/patient, /ops, /hospital, /agent, /admin) once authentication exists (F-01 onward).
 */
export default async function PortalHomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations('portal');

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6">
      <h1 className="text-3xl font-semibold text-brand-800">{t('title')}</h1>
      <Button size="lg">{t('signIn')}</Button>
    </main>
  );
}
