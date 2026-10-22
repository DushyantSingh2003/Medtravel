import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Public website shell acceptance (S-06): header with its six menus, language and currency
 * switchers, WhatsApp button, footer with legal links, 404 page, SEO defaults and favicons.
 *
 * The website must have been built with NEXT_PUBLIC_WHATSAPP_NUMBER set (see playwright.config.ts).
 */

const HEADER = [
  ['treatments', { en: 'Treatments', ar: 'العلاجات' }],
  ['hospitals', { en: 'Hospitals', ar: 'المستشفيات' }],
  ['doctors', { en: 'Doctors', ar: 'الأطباء' }],
  ['destinations', { en: 'Destinations', ar: 'الوجهات' }],
  ['cost-calculator', { en: 'Cost calculator', ar: 'حاسبة التكلفة' }],
  ['about', { en: 'About us', ar: 'من نحن' }],
] as const;

const ALL_PAGES = [
  ...HEADER.map(([slug]) => slug),
  'quote',
  'partner',
  'blog',
  'contact',
  'privacy',
  'terms',
  'refund-policy',
  'medical-disclaimer',
  'grievance',
];

const LEGAL = ['privacy', 'terms', 'refund-policy', 'medical-disclaimer', 'grievance'];
const LOCALES = ['en', 'ar'] as const;

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe('header', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  for (const locale of LOCALES) {
    test(`${locale}: the six menus link to their pages`, async ({ page }) => {
      await page.goto(`/${locale}`);
      const nav = page.getByRole('banner').getByRole('navigation');
      await expect(nav.getByRole('link')).toHaveCount(6);
      for (const [slug, label] of HEADER) {
        await expect(nav.getByRole('link', { name: label[locale] })).toHaveAttribute(
          'href',
          `/${locale}/${slug}`,
        );
      }
    });

    test(`${locale}: clicking each menu opens its page and marks it current`, async ({ page }) => {
      await page.goto(`/${locale}`);
      for (const [slug, label] of HEADER) {
        const nav = page.getByRole('banner').getByRole('navigation');
        await nav.getByRole('link', { name: label[locale] }).click();
        await expect(page).toHaveURL(new RegExp(`/${locale}/${slug}$`));
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(label[locale]);
        await expect(
          page.getByRole('banner').getByRole('navigation').locator('[aria-current=page]'),
        ).toHaveText(label[locale]);
      }
    });
  }

  test('the logo goes home and the call to action goes to the quote page', async ({ page }) => {
    await page.goto('/en/about');
    await page
      .getByRole('banner')
      .getByRole('link', { name: /MedTravel/ })
      .click();
    await expect(page).toHaveURL(/\/en$/);
    await page.getByRole('banner').getByRole('link', { name: 'Get a free quote' }).click();
    await expect(page).toHaveURL(/\/en\/quote$/);
  });

  test('switches language in place and flips the direction', async ({ page }) => {
    await page.goto('/en/hospitals');
    await page.getByRole('button', { name: /Language/ }).click();
    await page.getByRole('menuitemradio', { name: 'العربية' }).click();
    await expect(page).toHaveURL(/\/ar\/hospitals$/);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('المستشفيات');
    await page.getByRole('button', { name: /اللغة/ }).click();
    await page.getByRole('menuitemradio', { name: 'English' }).click();
    await expect(page).toHaveURL(/\/en\/hospitals$/);
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  });

  test('lets the visitor pick USD, EUR, INR or AED and remembers it', async ({ page, context }) => {
    await page.goto('/en');
    const button = () => page.getByRole('button', { name: /Currency/ });
    await expect(button()).toContainText('USD');
    await button().click();
    await expect(page.getByRole('menuitemradio')).toHaveCount(4);
    await page.getByRole('menuitemradio', { name: 'AED' }).click();
    await expect(button()).toContainText('AED');
    const cookie = (await context.cookies()).find((c) => c.name === 'mt_currency');
    expect(cookie?.value).toBe('AED');

    await page.goto('/ar/doctors');
    await expect(page.getByRole('button', { name: /العملة/ })).toContainText('AED');
  });

  test('a cookie with a made-up currency is ignored', async ({ page, context }) => {
    await context.addCookies([{ name: 'mt_currency', value: 'XXX', url: 'http://localhost:3000' }]);
    await page.goto('/en');
    await expect(page.getByRole('button', { name: /Currency/ })).toContainText('USD');
  });
});

test.describe('footer and WhatsApp', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  for (const locale of LOCALES) {
    test(`${locale}: the footer has link columns and the five legal links`, async ({ page }) => {
      await page.goto(`/${locale}`);
      const footer = page.getByRole('contentinfo');
      await expect(footer.getByRole('navigation').first().getByRole('link')).toHaveCount(10);
      await expect(footer.getByRole('navigation').last().getByRole('link')).toHaveCount(5);
      for (const slug of LEGAL) {
        await expect(footer.locator(`a[href="/${locale}/${slug}"]`).first()).toBeVisible();
      }
      // The year is the one the site was built in, so only its shape is checked.
      await expect(footer).toContainText(/©\s*\d{4}/);
    });
  }

  test('every footer link opens a page, not a 404', async ({ page }) => {
    await page.goto('/en');
    const hrefs = await page
      .getByRole('contentinfo')
      .getByRole('link')
      .evaluateAll((anchors) => anchors.map((a) => a.getAttribute('href') ?? ''));
    for (const href of hrefs.filter((h) => h.startsWith('/en/'))) {
      const response = await page.goto(href);
      expect(response?.status(), href).toBe(200);
      await expect(page.getByRole('heading', { level: 1 }), href).toBeVisible();
    }
  });

  test('a floating WhatsApp button opens a chat in a new tab', async ({ page }) => {
    await page.goto('/en');
    const button = page.getByRole('link', { name: 'Chat with us on WhatsApp' });
    await expect(button).toHaveAttribute('href', /^https:\/\/wa\.me\/\d{8,15}$/);
    await expect(button).toHaveAttribute('target', '_blank');
    await expect(button).toHaveAttribute('rel', /noopener/);
    // It floats: still in view after scrolling to the footer.
    await page.getByRole('contentinfo').scrollIntoViewIfNeeded();
    await expect(button).toBeInViewport();
  });

  test('the WhatsApp button sits on the reading-end side and never covers the legal links', async ({
    page,
  }) => {
    for (const locale of LOCALES) {
      await page.goto(`/${locale}`);
      await page.getByRole('contentinfo').scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const button = (await page.getByRole('link', { name: /WhatsApp|واتساب/ }).boundingBox())!;
      const width = page.viewportSize()!.width;
      if (locale === 'en') expect(button.x).toBeGreaterThan(width / 2);
      else expect(button.x + button.width).toBeLessThan(width / 2);
      const legal = page.getByRole('contentinfo').getByRole('navigation').last();
      for (const link of await legal.getByRole('link').all()) {
        const box = (await link.boundingBox())!;
        const overlaps =
          box.x < button.x + button.width &&
          box.x + box.width > button.x &&
          box.y < button.y + button.height &&
          box.y + box.height > button.y;
        expect(overlaps, `${locale} ${await link.textContent()}`).toBe(false);
      }
    }
  });
});

test.describe('phone (360 px)', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  for (const locale of LOCALES) {
    test(`${locale}: the menu opens as a panel with every menu and the quote button`, async ({
      page,
    }) => {
      await page.goto(`/${locale}`);
      await expect(page.getByRole('banner').getByRole('navigation')).toBeHidden();
      await page
        .getByRole('button', { name: locale === 'en' ? 'Open menu' : 'فتح القائمة' })
        .click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByRole('navigation').getByRole('link')).toHaveCount(6);
      await expect(
        dialog.getByRole('link', { name: locale === 'en' ? 'Get a free quote' : /مجاني/ }),
      ).toBeVisible();
      await dialog.getByRole('link', { name: HEADER[1][1][locale] }).click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/hospitals$`));
      await expect(dialog).toBeHidden();
    });

    test(`${locale}: the panel closes after the call to action and after the logo, not only the menu links`, async ({
      page,
    }) => {
      await page.goto(`/${locale}/about`);
      const open = () =>
        page.getByRole('button', { name: locale === 'en' ? 'Open menu' : 'فتح القائمة' }).click();
      await open();
      const dialog = page.getByRole('dialog');
      await dialog.locator('a[href$="/quote"]').click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/quote$`));
      await expect(dialog).toBeHidden();
      await open();
      await dialog.locator('a[href$="/' + locale + '"]').click();
      await expect(page).toHaveURL(new RegExp(`/${locale}$`));
      await expect(dialog).toBeHidden();
    });

    test(`${locale}: the home page, a placeholder and the 404 page fit the screen`, async ({
      page,
    }) => {
      for (const path of ['', '/treatments', '/privacy', '/no-such-page']) {
        await page.goto(`/${locale}${path}`);
        expect(await overflow(page), `${locale}${path}`).toBeLessThanOrEqual(0);
      }
    });
  }
});

test.describe('not found', () => {
  test('an unknown page is a real 404 that says so in both languages and offers a way home', async ({
    page,
  }) => {
    for (const path of [
      '/en/no-such-page',
      '/ar/no-such-page',
      '/en/a/b/c',
      '/en/treatments/knee-replacement',
      '/no-such-page',
    ]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(404);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found');
      await expect(page.getByRole('heading', { level: 2 })).toHaveText('الصفحة غير موجودة');
    }
    await page.getByRole('link', { name: 'Go to the home page' }).click();
    await expect(page).toHaveURL(/\/en$/);
  });
});

test.describe('search engines', () => {
  test('every page has a title with the product name, a description and a language alternate', async ({
    page,
  }) => {
    await page.goto('/en/treatments');
    await expect(page).toHaveTitle('Treatments | MedTravel');
    await expect(page.locator('meta[name=description]')).toHaveAttribute('content', /procedures/);
    await expect(page.locator('link[rel=alternate][hreflang=ar]')).toHaveAttribute(
      'href',
      /\/ar\/treatments$/,
    );
    await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute(
      'content',
      'MedTravel',
    );
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    await page.goto('/ar/treatments');
    await expect(page).toHaveTitle('العلاجات | ميد ترافل');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  });

  test('the home page title and description are set', async ({ page }) => {
    await page.goto('/en');
    await expect(page).toHaveTitle(/^MedTravel — /);
    await expect(page.locator('meta[name=description]')).toHaveAttribute(
      'content',
      /accredited hospitals/,
    );
  });

  test('robots.txt allows crawling and points at the sitemap, which lists every page in both languages', async ({
    request,
  }) => {
    const robots = await (await request.get('/robots.txt')).text();
    expect(robots).toMatch(/Allow: \//);
    expect(robots).toMatch(/Sitemap: .*\/sitemap\.xml/);
    const sitemap = await (await request.get('/sitemap.xml')).text();
    for (const locale of LOCALES) {
      expect(sitemap).toContain(`/${locale}</loc>`);
      for (const slug of ALL_PAGES)
        expect(sitemap, `${locale}/${slug}`).toContain(`/${locale}/${slug}</loc>`);
    }
    expect(sitemap).toContain('hreflang="ar"');
  });

  test('has a favicon set and a manifest', async ({ request }) => {
    for (const [path, type] of [
      ['/favicon.ico', /icon/],
      ['/icon.svg', /svg/],
      ['/apple-icon.png', /png/],
      ['/icon-192.png', /png/],
      ['/icon-512.png', /png/],
    ] as const) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(200);
      expect(response.headers()['content-type'], path).toMatch(type);
    }
    expect((await request.get('/manifest.webmanifest')).status()).toBe(200);
  });
});

test.describe('accessibility', () => {
  const sizes = [
    { name: 'phone', width: 360, height: 740 },
    { name: 'desktop', width: 1280, height: 800 },
  ];
  for (const locale of LOCALES) {
    for (const size of sizes) {
      test(`${locale} ${size.name}: home, a placeholder and the 404 page have no WCAG A/AA violations`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: size.width, height: size.height });
        for (const path of ['', '/treatments', '/no-such-page']) {
          await page.goto(`/${locale}${path}`);
          const results = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
            .analyze();
          expect(
            results.violations.map((v) => `${path || '/'}: ${v.id} (${v.nodes.length})`),
          ).toEqual([]);
        }
      });
    }
  }
});
