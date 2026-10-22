import { NextIntlClientProvider } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { UiProvider, WhatsAppButton } from '@medtravel/ui';
import { LOCALES, directionOf, isLocale } from '@medtravel/i18n';
import { SiteFooterBar } from '../../components/site/site-footer-bar';
import { SiteHeaderBar } from '../../components/site/site-header-bar';
import { OG_LOCALES, siteUrl, whatsappLink } from '../../lib/site-config';
import '../globals.css';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale });
  const name = t('common.appName');
  return {
    metadataBase: siteUrl(),
    title: { default: `${name} — ${t('home.title')}`, template: `%s | ${name}` },
    description: t('site.description'),
    applicationName: name,
    openGraph: {
      type: 'website',
      siteName: name,
      locale: OG_LOCALES[locale],
      title: `${name} — ${t('home.title')}`,
      description: t('site.description'),
    },
    twitter: { card: 'summary' },
  };
}

/** Pre-render both locales at build time rather than on first request. */
export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  // Lets the static renderer know which locale this render is for.
  setRequestLocale(locale);
  const t = await getTranslations({ locale });
  const whatsapp = whatsappLink();

  return (
    <html lang={locale} dir={directionOf(locale)}>
      <body className="flex min-h-dvh flex-col bg-background text-foreground antialiased">
        <NextIntlClientProvider>
          <UiProvider
            dir={directionOf(locale)}
            labels={{
              notifications: t('common.notifications'),
              closeToast: t('common.closeToast'),
            }}
          >
            <SiteHeaderBar />
            <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
              {children}
            </main>
            <SiteFooterBar />
            {whatsapp ? <WhatsAppButton href={whatsapp} label={t('site.whatsapp')} /> : null}
          </UiProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
