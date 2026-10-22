import type { MetadataRoute } from 'next';

/** The portal is for signed-in users only; search engines should index none of it. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', disallow: '/' } };
}
