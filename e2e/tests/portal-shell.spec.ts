import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { signInAs } from './support/auth.js';

/**
 * Portal shell acceptance (S-06): sign in with the stub login, land in the portal that belongs to the
 * role, and click through every placeholder page of every portal, in English and Arabic.
 *
 * Needs the API and portal running against a database seeded with SEED_DEV_USERS=true SEED_DEV_2FA=true (see portal-auth.spec.ts).
 */

const ROLE_PORTALS = [
  ['patient', 'patient'],
  ['attendant', 'patient'],
  ['agent', 'agent'],
  ['case_manager', 'ops'],
  ['ground_coordinator', 'ops'],
  ['interpreter', 'ops'],
  ['medical_reviewer', 'ops'],
  ['hospital_desk', 'hospital'],
  ['doctor', 'hospital'],
  ['finance', 'admin'],
  ['super_admin', 'admin'],
] as const;

/** One role per portal for the click-through, and how many screens the portal's menu has. */
const PORTAL_TOURS = [
  { portal: 'patient', role: 'patient', screens: 14 },
  { portal: 'ops', role: 'case_manager', screens: 18 },
  { portal: 'hospital', role: 'hospital_desk', screens: 13 },
  { portal: 'agent', role: 'agent', screens: 10 },
  { portal: 'admin', role: 'super_admin', screens: 24 },
] as const;

const LOCALES = ['en', 'ar'] as const;

/** Page errors and console errors, collected so a test can assert the page was clean. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

test.describe('sign-in and redirects', () => {
  test('a signed-out visitor is sent to the login page from the root and from every portal', async ({
    page,
  }) => {
    await page.goto('/en');
    await expect(page).toHaveURL(/\/en\/login$/);
    for (const portal of ['patient', 'ops', 'hospital', 'agent', 'admin']) {
      await page.goto(`/en/${portal}`);
      await expect(page).toHaveURL(/\/en\/login$/);
    }
    await page.goto('/en/ops/leads');
    await expect(page).toHaveURL(/\/en\/login$/);
  });

  test('the login page asks for an email address and a password, and offers the other ways in', async ({
    page,
  }) => {
    await page.goto('/en/login');
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
    await expect(page.locator('input[type=email]')).toBeVisible();
    await expect(page.locator('input[type=password]')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Forgot your password?' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in with a code instead' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Create a patient account' })).toBeVisible();
  });

  for (const [role, portal] of ROLE_PORTALS) {
    test(`${role} lands in the ${portal} portal`, async ({ page }) => {
      await signInAs(page, role);
      await expect(page).toHaveURL(new RegExp(`/en/${portal}$`));
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    });
  }

  test('a signed-in user who opens the login page or the root is sent to their portal', async ({
    page,
  }) => {
    await signInAs(page, 'doctor');
    await page.goto('/en/login');
    await expect(page).toHaveURL(/\/en\/hospital$/);
    await page.goto('/en');
    await expect(page).toHaveURL(/\/en\/hospital$/);
  });

  test('a user in the wrong portal is sent to their own, never shown another portal', async ({
    page,
  }) => {
    await signInAs(page, 'patient');
    for (const portal of ['ops', 'hospital', 'agent', 'admin']) {
      await page.goto(`/en/${portal}/${portal === 'ops' ? 'leads' : ''}`);
      await expect(page).toHaveURL(/\/en\/patient$/);
      await expect(page.getByRole('heading', { level: 1, name: 'My case' })).toBeVisible();
    }
  });

  test('signing out ends the session', async ({ page }) => {
    await signInAs(page, 'finance');
    await page.getByRole('button', { name: /Account menu/ }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/en\/login$/);
    await page.goto('/en/admin');
    await expect(page).toHaveURL(/\/en\/login$/);
  });

  test('a forged or stale session cookie is treated as signed out', async ({ page, context }) => {
    await context.addCookies([
      { name: 'mt_at', value: 'forged.token', url: 'http://localhost:3002' },
    ]);
    await page.goto('/en/admin');
    await expect(page).toHaveURL(/\/en\/login$/);
  });
});

test.describe('click through every placeholder page', () => {
  for (const locale of LOCALES) {
    for (const { portal, role, screens } of PORTAL_TOURS) {
      test(`${portal} portal, ${locale}: every menu item opens its page`, async ({ page }) => {
        test.setTimeout(120_000);
        const errors = watchErrors(page);
        await signInAs(page, role, locale);
        await expect(page).toHaveURL(new RegExp(`/${locale}/${portal}$`));

        const links = page.locator('[data-slot=app-shell] aside nav a');
        await expect(links).toHaveCount(screens);

        const targets = await links.evaluateAll((anchors) =>
          anchors.map((a) => ({
            href: a.getAttribute('href') ?? '',
            text: a.textContent?.trim() ?? '',
          })),
        );
        expect(new Set(targets.map((t) => t.href)).size).toBe(screens);

        for (const target of targets) {
          await page.locator(`[data-slot=app-shell] aside nav a[href="${target.href}"]`).click();
          await expect(page).toHaveURL(new RegExp(`${target.href}$`));
          await expect(page.getByRole('heading', { level: 1 })).toHaveText(target.text);
          // Screens that have been built (master data, audit log) no longer show the placeholder.
          if (!/\/admin\/(masters|audit)$/.test(target.href)) {
            await expect(page.getByRole('main').getByRole('heading', { level: 2 })).toBeVisible();
          }
          await expect(page.locator('aside nav a[aria-current=page]')).toHaveText(target.text);
          await expect(page.locator('html')).toHaveAttribute('lang', locale);
        }
        expect(errors).toEqual([]);
      });
    }
  }

  test('the cases screen opens a sample case (Case 360) and links back', async ({ page }) => {
    await signInAs(page, 'case_manager');
    await page.goto('/en/ops/cases');
    await page.getByRole('link', { name: 'Open a sample case' }).click();
    await expect(page).toHaveURL(/\/en\/ops\/cases\/CASE-2026-000001$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Case CASE-2026-000001' }),
    ).toBeVisible();
    await expect(page.locator('aside nav a[aria-current=page]')).toHaveText('Cases');
    await page.getByRole('link', { name: 'Back to cases' }).click();
    await expect(page).toHaveURL(/\/en\/ops\/cases$/);
  });

  test('the placeholder says which phase the screen is planned for', async ({ page }) => {
    await signInAs(page, 'patient');
    await page.goto('/en/patient/consult');
    await expect(page.getByText('Planned for phase 2')).toBeVisible();
    await page.goto('/en/patient/referrals');
    await expect(page.getByText('Planned for phase 3')).toBeVisible();
    await page.goto('/en/patient/payments');
    await expect(page.getByText('Planned for launch')).toBeVisible();
  });
});

test.describe('not found, loading and error states', () => {
  test('an unknown page inside a portal keeps the shell and offers a way home', async ({
    page,
  }) => {
    await signInAs(page, 'case_manager');
    await page.goto('/en/ops/does-not-exist');
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
    await expect(page.locator('[data-slot=app-shell] aside nav')).toBeVisible();
    await page.getByRole('link', { name: 'Go to the home page' }).click();
    await expect(page).toHaveURL(/\/en\/ops$/);
  });

  test('a malformed case number is a 404, not a page', async ({ page }) => {
    await signInAs(page, 'case_manager');
    await page.goto('/en/ops/cases/not-a-case');
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  });

  for (const locale of LOCALES) {
    test(`an unknown URL shows the ${locale} 404 page`, async ({ page }) => {
      await page.goto(`/${locale}/no/such/page`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        locale === 'en' ? 'Page not found' : 'الصفحة غير موجودة',
      );
      await expect(page.locator('html')).toHaveAttribute('dir', locale === 'en' ? 'ltr' : 'rtl');
    });
  }
});

test.describe('the shell', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('collapses to icons, keeps every link named, and remembers the choice after a reload', async ({
    page,
  }) => {
    await signInAs(page, 'case_manager');
    const aside = page.locator('[data-slot=app-shell] aside');
    const expanded = (await aside.boundingBox())!.width;
    await page.getByRole('button', { name: 'Collapse sidebar' }).click();
    await expect(aside).toHaveAttribute('data-collapsed', 'true');
    // The sidebar animates its width, so wait for it to settle.
    await expect.poll(async () => (await aside.boundingBox())!.width).toBeLessThan(expanded / 2);
    await expect(page.getByRole('link', { name: 'Lead inbox' })).toHaveCount(1);

    await page.reload();
    await expect(aside).toHaveAttribute('data-collapsed', 'true');
    await page.getByRole('button', { name: 'Expand sidebar' }).click();
    await expect(aside).toHaveAttribute('data-collapsed', 'false');
  });

  test('switches language in place: same page, Arabic, right to left', async ({ page }) => {
    await signInAs(page, 'case_manager');
    await page.goto('/en/ops/leads');
    await page.getByRole('button', { name: /Language/ }).click();
    await page.getByRole('menuitemradio', { name: 'العربية' }).click();
    await expect(page).toHaveURL(/\/ar\/ops\/leads$/);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('صندوق العملاء المحتملين');
    // The sidebar sits on the reading-start edge, which is the right in Arabic.
    const box = (await page.locator('[data-slot=app-shell] aside').boundingBox())!;
    expect(box.x + box.width).toBeGreaterThan(1200);
  });

  test('the top bar has search, notifications, language and the user menu', async ({ page }) => {
    await signInAs(page, 'agent');
    await expect(page.getByRole('search').getByRole('searchbox', { name: 'Search' })).toBeVisible();
    await page.getByRole('searchbox', { name: 'Search' }).fill('Asha');
    await page.keyboard.press('Enter');
    await expect(page.getByText('Search is not available yet.')).toBeVisible();

    await page.getByRole('button', { name: 'Notifications' }).click();
    await expect(page.getByText('You have no notifications.')).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: /Account menu/ }).click();
    await expect(page.getByText('Signed in as')).toBeVisible();
    await expect(page.getByRole('menu').getByText('Agent', { exact: true })).toBeVisible();
    await expect(page.getByRole('menu').getByText('Agent portal')).toBeVisible();
  });

  test('can be used from the keyboard: skip link, then the menu, then the page', async ({
    page,
  }) => {
    await signInAs(page, 'case_manager');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to main content' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.locator('main')).toBeFocused();
  });

  test('is never indexed', async ({ page, request }) => {
    await signInAs(page, 'case_manager');
    await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', /noindex/);
    const robots = await request.get('/robots.txt');
    expect(await robots.text()).toMatch(/Disallow: \//);
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
    const manifest = await request.get('/manifest.webmanifest');
    expect(manifest.status()).toBe(200);
    expect((await manifest.json()).icons).toHaveLength(2);
  });

  test('the page title is the screen name followed by the product name', async ({ page }) => {
    await signInAs(page, 'case_manager');
    await page.goto('/en/ops/leads');
    await expect(page).toHaveTitle('Lead inbox | MedTravel');
    await page.goto('/ar/ops/leads');
    await expect(page).toHaveTitle('صندوق العملاء المحتملين | ميد ترافل');
  });
});

test.describe('phone (360 px)', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  for (const locale of LOCALES) {
    test(`${locale}: the menu opens as a panel, navigates and closes`, async ({ page }) => {
      await signInAs(page, 'case_manager', locale);
      await expect(page.locator('[data-slot=app-shell] aside')).toBeHidden();
      await page
        .getByRole('button', { name: locale === 'en' ? 'Open menu' : 'فتح القائمة' })
        .click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await dialog.locator('a[href$="/ops/leads"]').click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/ops/leads$`));
      await expect(dialog).toBeHidden();
    });

    test(`${locale}: the panel closes after using the logo`, async ({ page }) => {
      await signInAs(page, 'case_manager', locale);
      await page.goto(`/${locale}/ops/leads`);
      await page
        .getByRole('button', { name: locale === 'en' ? 'Open menu' : 'فتح القائمة' })
        .click();
      const dialog = page.getByRole('dialog');
      await dialog.locator(`a[href$="/ops"]`).first().click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/ops$`));
      await expect(dialog).toBeHidden();
    });

    for (const { portal, role } of PORTAL_TOURS) {
      test(`${locale}: the ${portal} home fits the screen without sideways scrolling`, async ({
        page,
      }) => {
        await signInAs(page, role, locale);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);
      });
    }

    test(`${locale}: the login page fits the screen`, async ({ page }) => {
      await page.goto(`/${locale}/login`);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});

test.describe('accessibility', () => {
  const sizes = [
    { name: 'phone', width: 360, height: 740 },
    { name: 'desktop', width: 1280, height: 800 },
  ];
  for (const locale of LOCALES) {
    for (const size of sizes) {
      test(`${locale} ${size.name}: login, a portal home and a placeholder have no WCAG A/AA violations`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: size.width, height: size.height });
        const scan = async (label: string) => {
          const results = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
            .analyze();
          expect(results.violations.map((v) => `${label}: ${v.id} (${v.nodes.length})`)).toEqual(
            [],
          );
        };
        await page.goto(`/${locale}/login`);
        await scan('login');
        await signInAs(page, 'case_manager', locale);
        await scan('ops home');
        await page.goto(`/${locale}/ops/cases/CASE-2026-000001`);
        await scan('case');
        await page.goto(`/${locale}/ops/nope`);
        await scan('not found');
      });
    }
  }
});

test.describe('accessibility of every portal and of the shell controls', () => {
  const scan = async (page: Page, label: string) => {
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations.map((v) => `${label}: ${v.id} (${v.nodes.length})`)).toEqual([]);
  };

  for (const locale of LOCALES) {
    test(`${locale}: all five portal homes have no WCAG A/AA violations`, async ({ page }) => {
      for (const { portal, role } of PORTAL_TOURS) {
        await signInAs(page, role, locale);
        await scan(page, portal);
        await page.context().clearCookies();
      }
    });

    test(`${locale}: the collapsed sidebar, the open menus and the phone menu have none either`, async ({
      page,
    }) => {
      await signInAs(page, 'case_manager', locale);
      await page.getByRole('button', { name: /Collapse sidebar|طيّ الشريط الجانبي/ }).click();
      await scan(page, 'collapsed sidebar');
      await page.getByRole('button', { name: /Account menu|قائمة الحساب/ }).click();
      await scan(page, 'user menu');
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: /Notifications|الإشعارات/ }).click();
      await scan(page, 'notifications');
      await page.keyboard.press('Escape');

      await page.setViewportSize({ width: 360, height: 740 });
      await page.getByRole('button', { name: /Open menu|فتح القائمة/ }).click();
      await scan(page, 'phone menu');
    });

    test(`${locale}: landmarks have unique names (breadcrumb versus main navigation)`, async ({
      page,
    }) => {
      await signInAs(page, 'case_manager', locale);
      await page.goto(`/${locale}/ops/leads`);
      const results = await new AxeBuilder({ page }).withRules(['landmark-unique']).analyze();
      expect(results.violations.map((v) => v.id)).toEqual([]);
    });
  }
});
