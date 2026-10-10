import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { isLocale } from '@medtravel/i18n';
import { isUiGalleryEnabled } from '../../../lib/ui-gallery';
import { Gallery } from './_components/gallery';

// Read the flag per request: it must not be frozen at build time.
export const dynamic = 'force-dynamic';

export default async function UiGalleryPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale) || !isUiGalleryEnabled()) notFound();
  setRequestLocale(locale);
  return <Gallery />;
}
