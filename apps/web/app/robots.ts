import type { MetadataRoute } from 'next';
import { isSiteUrlConfigured, siteUrl } from '../lib/site-config';

/**
 * Crawlers are welcome only on a deployment that was given its real address. A build without
 * NEXT_PUBLIC_SITE_URL (a forgotten variable on staging) would otherwise advertise localhost URLs and
 * let search engines index a test site.
 */
export default function robots(): MetadataRoute.Robots {
  if (!isSiteUrlConfigured()) return { rules: { userAgent: '*', disallow: '/' } };
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: new URL('/sitemap.xml', siteUrl()).toString(),
  };
}
