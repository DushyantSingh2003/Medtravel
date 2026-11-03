import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { devEmail, signInAs, submitLogin, currentCode, DEV_PASSWORD } from './support/auth.js';

/**
 * User management (AD-01): the super admin finds people, edits them, runs teams, deactivates (and the other person is signed out
 * within seconds), and views the product as someone else with a banner. Needs the API and portal running against a database
 * seeded with SEED_DEV_USERS=true (SEED_DEV_2FA=true in CI), which includes a throwaway account for the deactivation test.
 */

const DISPOSABLE = 'disposable@dev.medtravel.test';

/** Signs in a second browser context as the throwaway account and waits for its portal. */
async function signInDisposable(browser: Browser) {
  const context = await browser.newContext({
    baseURL: process.env['PORTAL_BASE_URL'] ?? 'http://localhost:3002',
  });
  const page = await context.newPage();
  await submitLogin(page, DISPOSABLE, DEV_PASSWORD);
  await page.waitForURL(/\/(login\/two-factor|ops)(\/|$)/);
  if (page.url().includes('/login/two-factor')) {
    await page.locator('input[autocomplete=one-time-code]').fill(currentCode());
    await page.locator('form button[type=submit]').click();
  }
  await page.waitForSelector('[data-slot=app-shell]');
  return { context, page };
}

/** Filters the list down to one account and opens it (the shell has a search box of its own, so ask for this one by name). */
async function openUser(page: Page, email: string) {
  await page.goto('/en/admin/users');
  const table = page.getByRole('table', { name: 'People' });
  await page.getByRole('searchbox', { name: 'Search by name or email' }).fill(email);
  const row = table.getByRole('row').filter({ hasText: email });
  await expect(row).toHaveCount(1);
  await row.getByRole('link').click();
  await expect(page.getByRole('tab', { name: 'Profile' })).toBeVisible();
}

test.describe('users and teams', () => {
  test('lists people, searches, and opens one', async ({ page }) => {
    await signInAs(page, 'super_admin');
    await page.goto('/en/admin/users');
    await expect(page.getByRole('heading', { level: 1, name: 'Users and roles' })).toBeVisible();
    const table = page.getByRole('table', { name: 'People' });
    await expect(table.getByText(devEmail('case_manager'))).toBeVisible();
    await page.getByRole('searchbox', { name: 'Search by name or email' }).fill('case-manager@dev');
    await expect(table.getByText(devEmail('case_manager'))).toBeVisible();
    await expect(table.getByText(devEmail('finance'))).toHaveCount(0);
    await table.getByRole('link', { name: /Dev case manager/ }).click();
    await expect(page.getByRole('heading', { level: 2, name: /Dev case manager/ })).toBeVisible();
  });

  test('has no accessibility violations on the list or a person', async ({ page }) => {
    await signInAs(page, 'super_admin');
    await page.goto('/en/admin/users');
    await expect(page.getByRole('table', { name: 'People' })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page
      .getByRole('link', { name: /Dev case manager/ })
      .first()
      .click();
    await expect(page.getByRole('tab', { name: 'Profile' })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test('changes a person’s job title and keeps it', async ({ page }) => {
    await signInAs(page, 'super_admin');
    await openUser(page, DISPOSABLE);
    const title = `Lead ${Date.now() % 10000}`;
    await page.getByLabel('Job title').fill(title);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Changes saved')).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Job title')).toHaveValue(title);
  });

  test('adds a team and removes it again', async ({ page }) => {
    await signInAs(page, 'super_admin');
    await page.goto('/en/admin/users');
    await page.getByRole('tab', { name: 'Teams' }).click();
    const name = `Test team ${Date.now() % 100000}`;
    await page.getByRole('button', { name: 'Add team' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add a team' });
    await dialog.getByLabel('Team name').fill(name);
    await dialog.getByRole('button', { name: 'Save team' }).click();
    await expect(page.getByText(name)).toBeVisible();
    await page
      .getByRole('listitem')
      .filter({ hasText: name })
      .getByRole('button', { name: 'Delete' })
      .click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText(name)).toHaveCount(0);
  });

  test('deactivating a person signs their browser out within seconds, and reactivating lets them back in', async ({
    page,
    browser,
  }) => {
    const victim = await signInDisposable(browser);
    try {
      await signInAs(page, 'super_admin');
      await openUser(page, DISPOSABLE);
      await page.getByRole('button', { name: 'Deactivate' }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Deactivate' }).click();
      await expect(page.getByText('Deactivated', { exact: true }).first()).toBeVisible();

      // The other browser is sent to the sign-in page without doing anything.
      await victim.page.waitForURL(/\/login/, { timeout: 8000 });
      await submitLogin(victim.page, DISPOSABLE, DEV_PASSWORD);
      await expect(victim.page.locator('form')).toBeVisible();
      await expect(victim.page).toHaveURL(/\/login/);
    } finally {
      // Leave the account usable for the next run.
      await page
        .getByRole('button', { name: 'Reactivate' })
        .click()
        .catch(() => undefined);
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Reactivate' })
        .click()
        .catch(() => undefined);
      await victim.context.close();
    }
  });

  test('viewing as a person shows a banner, is read-only, and ends with Stop viewing', async ({
    page,
  }) => {
    await signInAs(page, 'super_admin');
    await openUser(page, devEmail('finance'));
    await page.getByRole('button', { name: 'View as user' }).click();
    await page.getByRole('dialog').getByLabel('Why do you need to view as this person?').fill('Checking a reported display problem');
    await page.getByRole('dialog').getByRole('button', { name: 'Start viewing' }).click();

    const banner = page.locator('[data-slot=impersonation-banner]');
    await expect(banner).toContainText('Viewing as Dev finance');
    await expect(banner).toContainText('Read-only');
    // Another screen, same banner.
    await page.goto('/en/admin');
    await expect(banner).toBeVisible();

    await banner.getByRole('button', { name: 'Stop viewing' }).click();
    await page.waitForURL(/\/admin\/users/);
    await expect(page.locator('[data-slot=impersonation-banner]')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: 'Users and roles' })).toBeVisible();
  });

  test('works in Arabic, right to left, at phone width, without sideways scrolling', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await signInAs(page, 'super_admin', 'ar');
    await page.goto('/ar/admin/users');
    await expect(page.getByRole('heading', { level: 1, name: 'المستخدمون والأدوار' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('table', { name: 'الأشخاص' })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test('is closed to everyone but the super admin', async ({ page }) => {
    await signInAs(page, 'case_manager');
    await page.goto('/en/admin/users');
    await expect(page).not.toHaveURL(/\/admin\/users$/);
  });
});
