import { NextIntlClientProvider } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { UiProvider } from '@medtravel/ui';
import { LOCALES, directionOf, isLocale } from '@medtravel/i18n';
import '../globals.css';

export const metadata: Metadata = {
  title: 'MedTravel portal',
  description:
    'Patient, operations, hospital, agent and admin portals.',
};

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

  return (
    <html lang={locale} dir={directionOf(locale)}>
      <body className="bg-background text-foreground antialiased">
        <NextIntlClientProvider>
          <UiProvider dir={directionOf(locale)}>{children}</UiProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
