import { afterEach, describe, expect, it, vi } from 'vitest';
import robots from './robots';

describe('robots.txt', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('keeps crawlers out of a build that was not given its real address', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    expect(robots()).toEqual({ rules: { userAgent: '*', disallow: '/' } });
  });

  it('welcomes crawlers and names the sitemap once the address is set', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://medtravel.example');
    expect(robots()).toEqual({
      rules: { userAgent: '*', allow: '/' },
      sitemap: 'https://medtravel.example/sitemap.xml',
    });
  });
});
