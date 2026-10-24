import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  DEV_TWO_FACTOR_SECRET,
  UNENROLLED_EMAIL,
  currentCode,
  devEmail,
  signInAs,
  submitLogin,
} from './support/auth.js';

/**
 * Authentication acceptance (F-03): every seed role signs in and lands in its own portal (portal-shell.spec.ts goes through
 * all eleven); staff cannot skip two-factor; the one-time-code, sign-up, reset and account-security pages work.
 *
 * Needs the API and the portal running against a database seeded with SEED_DEV_USERS=true and SEED_DEV_2FA=true, with the
 * API's AUTH_DEV_SKIP_2FA off, and AUTH_RATE_LIMIT_MULTIPLIER raised (many tests sign in as the same few users).
 */

/** The message on the form; Next's route announcer is also a role=alert, so it is excluded. */
const formAlert = (page: Page) => page.locator('[role=alert]:not(#__next-route-announcer__)');

const unique = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Registers a patient through the sign-up page and returns the address; the account can sign in right away. */
async function registerPatient(page: Page, password = 'Strong-pass-12') {
  const email = `${unique('e2e')}@example.com`;
  await page.goto('/en/register');
  await page.getByLabel(/Full name/).fill('E2E Patient');
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill(password);
  await page.locator('form button[type=submit]').click();
  await expect(page.getByRole('status')).toContainText(email);
  return { email, password };
}

test.describe('password sign-in', () => {
  test('a wrong password is refused with one message, and nothing signs in', async ({ page }) => {
    await submitLogin(page, devEmail('patient'), 'Wrong-password-1');
    await expect(formAlert(page)).toHaveText('Incorrect email, password or code.');
    await expect(page).toHaveURL(/\/en\/login$/);
    await submitLogin(page, 'nobody@example.com', 'Wrong-password-1');
    await expect(formAlert(page)).toHaveText('Incorrect email, password or code.');
  });

  test('the form checks the fields before sending anything', async ({ page }) => {
    await page.goto('/en/login');
    await page.locator('form button[type=submit]').click();
    await expect(page.locator('input[type=email]')).toHaveAttribute('aria-invalid', 'true');
  });

  test('the session survives a lost access cookie: the portal swaps the refresh cookie for a new one', async ({
    page,
    context,
  }) => {
    await signInAs(page, 'patient');
    const before = await context.cookies();
    expect(before.some((cookie) => cookie.name === 'mt_at')).toBe(true);
    await context.clearCookies({ name: 'mt_at' });
    await page.goto('/en/patient');
    await expect(page).toHaveURL(/\/en\/patient$/);
    await expect(page.getByRole('heading', { level: 1, name: 'My case' })).toBeVisible();
    expect((await context.cookies()).some((cookie) => cookie.name === 'mt_at')).toBe(true);
  });

  test('signing out ends the session for good', async ({ page, context }) => {
    await signInAs(page, 'patient');
    await page.getByRole('button', { name: /Account menu/ }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/en\/login$/);
    await page.goto('/en/patient');
    await expect(page).toHaveURL(/\/en\/login$/);
    expect(
      (await context.cookies())
        .filter((cookie) => cookie.name.startsWith('mt_'))
        .map((c) => c.name),
    ).toEqual([]);
  });
});

test.describe('two-factor authentication', () => {
  test('a user with two-step verification is asked for the code, and a wrong one is refused', async ({
    page,
  }) => {
    await submitLogin(page, 'admin-2fa@dev.medtravel.test');
    await expect(page).toHaveURL(/\/en\/login\/two-factor$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Two-step verification' }),
    ).toBeVisible();
    await page.locator('input[autocomplete=one-time-code]').fill('000000');
    await page.locator('form button[type=submit]').click();
    await expect(formAlert(page)).toHaveText('That code is not right.');

    await page
      .locator('input[autocomplete=one-time-code]')
      .fill(currentCode(DEV_TWO_FACTOR_SECRET));
    await page.locator('form button[type=submit]').click();
    await expect(page).toHaveURL(/\/en\/admin$/);
  });

  test('a backup-code option is offered', async ({ page }) => {
    await submitLogin(page, 'admin-2fa@dev.medtravel.test');
    await page.getByRole('button', { name: 'Use a backup code instead' }).click();
    await expect(page.getByLabel(/Backup code/)).toBeVisible();
  });

  test('staff who have not set it up are held at the set-up page and cannot reach their portal', async ({
    page,
  }) => {
    await submitLogin(page, UNENROLLED_EMAIL);
    await page.waitForURL(/\/en\/(two-factor\/setup|login\/two-factor)$/);
    test.skip(
      page.url().includes('/login/two-factor'),
      'This user was enrolled by an earlier run; reseed a fresh database to repeat',
    );

    await expect(
      page.getByRole('heading', { level: 1, name: 'Set up two-step verification' }),
    ).toBeVisible();
    for (const path of ['/en/ops', '/en/ops/leads', '/en/admin', '/en/account/security', '/en']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/en\/two-factor\/setup$/);
    }

    const secret = (await page.locator('bdi.font-mono').innerText()).trim();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    await expect(page.getByAltText('QR code for your authenticator app')).toBeVisible();
    await page.locator('input[autocomplete=one-time-code]').fill('000000');
    await page.getByRole('button', { name: 'Turn on' }).click();
    await expect(formAlert(page)).toContainText('That code is not right');

    await page.locator('input[autocomplete=one-time-code]').fill(currentCode(secret));
    await page.getByRole('button', { name: 'Turn on' }).click();
    await expect(page.getByRole('heading', { name: 'Save your backup codes' })).toBeVisible();
    await expect(page.locator('ul[dir=ltr] li')).toHaveCount(10);
    // The way on stays shut until the codes are marked as saved.
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/\/en\/ops$/);
  });
});

test.describe('sign-up, codes and resets', () => {
  test('a patient signs up, signs in straight away, and lands in the patient portal', async ({
    page,
  }) => {
    const { email, password } = await registerPatient(page);
    await submitLogin(page, email, password);
    await expect(page).toHaveURL(/\/en\/patient$/);
  });

  test('a sign-in code can be requested for an email address, without revealing whether it has an account', async ({
    page,
  }) => {
    await page.goto('/en/login/code');
    await page.getByLabel(/Email address or phone number/).fill(`${unique('nobody')}@example.com`);
    await page.getByRole('button', { name: 'Send me a code' }).click();
    await expect(page.getByRole('status')).toContainText('we sent a code to');
    await page.getByLabel(/6-digit code/).fill('123456');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(formAlert(page)).toHaveText('That code is wrong or has expired.');
  });

  test('forgot password answers the same for any address', async ({ page }) => {
    for (const address of [devEmail('patient'), 'nobody@example.com']) {
      await page.goto('/en/forgot-password');
      await page.locator('input[type=email]').fill(address);
      await page.locator('form button[type=submit]').click();
      await expect(page.getByRole('status')).toContainText('If that address has an account');
    }
  });

  test('pages that need a link say so when the link is missing or wrong', async ({ page }) => {
    await page.goto('/en/reset-password');
    await expect(formAlert(page)).toContainText('not valid any more');
    await page.goto('/en/accept-invitation?token=' + 'x'.repeat(43));
    await expect(formAlert(page)).toContainText('invitation is not valid any more');
    await page.goto('/en/verify-email?token=' + 'x'.repeat(43));
    await expect(formAlert(page)).toContainText('not valid any more');
    await page.goto('/en/magic?token=' + 'x'.repeat(43));
    await expect(formAlert(page)).toContainText('expired or was already used');
  });
});

test.describe('account security', () => {
  test('shows this device, and lets a patient change the password and sign in with the new one', async ({
    page,
  }) => {
    const { email, password } = await registerPatient(page);
    await submitLogin(page, email, password);
    await expect(page).toHaveURL(/\/en\/patient$/);
    await page.goto('/en/account/security');
    await expect(page.getByRole('heading', { level: 1, name: 'Account security' })).toBeVisible();
    await expect(page.getByText('This device')).toBeVisible();
    await expect(page.getByText('Not confirmed yet')).toBeVisible();

    const next = 'Another-pass-99';
    await page.getByLabel('Current password').fill(password);
    await page.getByLabel('New password').fill(next);
    await page.getByRole('button', { name: 'Change password' }).click();
    await expect(page.getByText('Password changed')).toBeVisible();

    await page.getByRole('button', { name: /Account menu/ }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await submitLogin(page, email, next);
    await expect(page).toHaveURL(/\/en\/patient$/);
  });

  test('lists a second device and signs it out', async ({ page, browser }) => {
    const { email, password } = await registerPatient(page);
    await submitLogin(page, email, password);
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await submitLogin(otherPage, email, password);
    await expect(otherPage).toHaveURL(/\/en\/patient$/);

    await page.goto('/en/account/security');
    await expect(page.getByRole('listitem').filter({ hasText: /Chrome|Unknown/ })).toHaveCount(2);
    await page.getByRole('button', { name: 'Sign out all other devices' }).click();
    await expect(page.getByRole('listitem').filter({ hasText: /Chrome|Unknown/ })).toHaveCount(1);
    await otherPage.goto('/en/patient');
    await expect(otherPage).toHaveURL(/\/en\/login$/);
    await other.close();
  });

  test('staff cannot turn two-step verification off', async ({ page }) => {
    await signInAs(page, 'case_manager');
    await page.goto('/en/account/security');
    await expect(page.getByText('Required for your role')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Turn off' })).toHaveCount(0);
  });
});

test.describe('accessibility and layout', () => {
  for (const locale of ['en', 'ar'] as const) {
    for (const path of ['login', 'login/code', 'forgot-password', 'register']) {
      test(`/${locale}/${path} has no axe violations and reads in the right direction`, async ({
        page,
      }) => {
        await page.goto(`/${locale}/${path}`);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
        expect(results.violations.map((violation) => violation.id)).toEqual([]);
      });
    }
  }

  test('the sign-in page fits a 360 px phone', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/ar/login');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('the account security page has no axe violations', async ({ page }) => {
    await signInAs(page, 'patient');
    await page.goto('/en/account/security');
    await expect(page.getByText('This device')).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });
});
