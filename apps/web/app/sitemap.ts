import type { MetadataRoute } from 'next';
import { LOCALES } from '@medtravel/i18n';
import { languageAlternates, siteUrl } from '../lib/site-config';
import { SITE_PAGES } from '../lib/site-pages';

/** The home page and every public page, once per language, each pointing at its translations. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const absolute = (path: string) => new URL(path, base).toString();
  const paths = ['', ...SITE_PAGES.map((page) => `/${page}`)];
  return paths.flatMap((path) =>
    LOCALES.map((locale) => ({
      url: absolute(`/${locale}${path}`),
      alternates: {
        languages: Object.fromEntries(
          Object.entries(languageAlternates(path)).map(([lang, href]) => [lang, absolute(href)]),
        ),
      },
    })),
  );
}
