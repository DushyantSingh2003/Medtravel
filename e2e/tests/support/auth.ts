import type { Page } from '@playwright/test';
import { generateSync } from 'otplib';

/** The development users (docs/dev-users.md), created by `pnpm db:seed` with SEED_DEV_USERS=true and SEED_DEV_2FA=true. */
export const DEV_PASSWORD = 'Dev@12345';
export const DEV_TWO_FACTOR_SECRET = 'KRSXG5CTMVRXEZLUKN2XAZLSKRSXG5CT';
export const devEmail = (role: string) => `${role.replace(/_/g, '-')}@dev.medtravel.test`;
export const UNENROLLED_EMAIL = 'staff-setup@dev.medtravel.test';

/** The code the authenticator app would show right now for the shared development secret. */
export const currentCode = (secret = DEV_TWO_FACTOR_SECRET) => generateSync({ secret });

type Locale = 'en' | 'ar';

/** Fills in the sign-in form with an email and password and submits it. */
export async function submitLogin(
  page: Page,
  email: string,
  password = DEV_PASSWORD,
  locale: Locale = 'en',
) {
  await page.goto(`/${locale}/login`);
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill(password);
  await page.locator('form button[type=submit]').click();
}

/**
 * Signs in as a development user of `role` and waits for the portal. Roles that must use two-factor are asked for a code,
 * which is computed from the shared secret, exactly as an authenticator app would.
 */
export async function signInAs(page: Page, role: string, locale: Locale = 'en') {
  await submitLogin(page, devEmail(role), DEV_PASSWORD, locale);
  await page.waitForURL(/\/(login\/two-factor|patient|agent|ops|hospital|admin)(\/|$)/);
  if (page.url().includes('/login/two-factor')) {
    await page.locator('input[autocomplete=one-time-code]').fill(currentCode());
    await page.locator('form button[type=submit]').click();
  }
  await page.waitForSelector('[data-slot=app-shell]');
}
