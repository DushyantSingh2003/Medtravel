import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { signInAs } from './support/auth.js';

/**
 * Pricing rules (AD-05): the super admin sets package and add-on prices (each change is a new version), margins and discount
 * limits, the exchange-rate settings and manual rates. Needs the API and portal running against a database seeded with
 * SEED_DEV_USERS=true (the seed also creates the price list).
 */

const openPricing = async (page: Page, locale: 'en' | 'ar' = 'en') => {
  await page.goto(`/${locale}/admin/pricing`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
};

test.describe('pricing rules', () => {
  test('shows the three packages and the add-ons with their prices', async ({ page }) => {
    await signInAs(page, 'super_admin');
    await openPricing(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Pricing rules' })).toBeVisible();
    for (const name of ['Basic', 'Standard', 'Premium'])
      await expect(page.getByRole('heading', { level: 3, name })).toBeVisible();
    const premium = page.locator('[data-item=premium]');
    await expect(premium).toContainText('₹');
    await expect(premium).toContainText('$');
    await expect(page.getByRole('heading', { level: 3, name: /Extra night/ })).toBeVisible();
  });

  test('has no accessibility violations on any tab', async ({ page }) => {
    await signInAs(page, 'super_admin');
    await openPricing(page);
    await expect(page.locator('[data-item=premium]')).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.getByRole('tab', { name: 'Margins and discounts' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Margins' })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.getByRole('tab', { name: 'Exchange rates' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Rate settings' })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test('publishing a new Premium price adds a version and keeps the old one in the history', async ({
    page,
  }) => {
    await signInAs(page, 'super_admin');
    await openPricing(page);
    const premium = page.locator('[data-item=premium]');
    await expect(premium).toContainText('Price list version');
    const before = Number(/version (\d+)/.exec((await premium.textContent()) ?? '')?.[1]);
    const price = String(1_100_000 + before);

    await premium.getByRole('button', { name: 'Set prices' }).click();
    const dialog = page.getByRole('dialog', { name: 'Set prices for Premium' });
    await dialog.getByLabel('Price in INR').fill(price);
    await dialog.getByLabel('Why the price changed (optional)').fill('Browser test');
    await dialog.getByRole('button', { name: 'Publish prices' }).click();
    await expect(dialog).toBeHidden();
    await expect(premium).toContainText(`Price list version ${before + 1}`);
    await expect(premium).toContainText('₹1,1');

    await premium.getByRole('button', { name: 'History' }).click();
    const history = page.getByRole('dialog', { name: 'Price history: Premium' });
    // Each entry reads "Version N" followed by its date, so match the start of the line.
    await expect(history.getByText(new RegExp(`^Version ${before + 1}(?!\\d)`))).toBeVisible();
    await expect(history.getByText(new RegExp(`^Version ${before}(?!\\d)`))).toBeVisible();
    await expect(history.getByText('Browser test').first()).toBeVisible();
  });

  test('refuses a price list without the rupee price and shows why', async ({ page }) => {
    await signInAs(page, 'super_admin');
    await openPricing(page);
    const sim = page.locator('[data-item=sim_card]');
    await sim.getByRole('button', { name: 'Set prices' }).click();
    const dialog = page.getByRole('dialog', { name: /Set prices for/ });
    await dialog.getByLabel('Price in INR').fill('');
    await dialog.getByRole('button', { name: 'Publish prices' }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('alert').first()).toBeVisible();
  });

  test('adds an add-on and refuses a repeated code', async ({ page }) => {
    await signInAs(page, 'super_admin');
    await openPricing(page);
    const code = `test_${Date.now().toString(36)}`;
    await page.getByRole('button', { name: 'Add an add-on' }).click();
    let dialog = page.getByRole('dialog', { name: 'Add an add-on' });
    await dialog.getByLabel('Name').fill(`Test add-on ${code}`);
    await dialog.getByLabel('Code').fill(code);
    await dialog.getByLabel('Unit').fill('item');
    await dialog.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator(`[data-item=${code}]`)).toContainText('No price set yet');

    await page.getByRole('button', { name: 'Add an add-on' }).click();
    dialog = page.getByRole('dialog', { name: 'Add an add-on' });
    await dialog.getByLabel('Name').fill('Same again');
    await dialog.getByLabel('Code').fill(code);
    await dialog.getByLabel('Unit').fill('item');
    await dialog.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(dialog.getByText('An entry with this code already exists')).toBeVisible();
  });

  test('saves margins and discount limits, and refuses limits that fall as the role goes up', async ({
    page,
  }) => {
    await signInAs(page, 'super_admin');
    await openPricing(page);
    await page.getByRole('tab', { name: 'Margins and discounts' }).click();
    await page.getByLabel('Stay margin (%)').fill('17.5');
    await page.getByRole('button', { name: 'Save margins' }).click();
    await expect(page.getByText('Margins saved')).toBeVisible();
    await page.reload();
    await page.getByRole('tab', { name: 'Margins and discounts' }).click();
    await expect(page.getByLabel('Stay margin (%)')).toHaveValue('17.5');

    await page.getByLabel('Case manager: up to (%)').fill('45');
    await page.getByRole('button', { name: 'Save limits' }).click();
    await expect(page.getByText(/Limits must not fall/)).toBeVisible();
    await page.getByLabel('Case manager: up to (%)').fill('5');
    await page.getByRole('button', { name: 'Save limits' }).click();
    await expect(page.getByText('Discount limits saved')).toBeVisible();
  });

  test('saves the markup and sets, then removes, a manual rate', async ({ page }) => {
    await signInAs(page, 'super_admin');
    await openPricing(page);
    await page.getByRole('tab', { name: 'Exchange rates' }).click();
    await page.getByLabel('Markup when converting (%)').fill('1.5');
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByText('Rate settings saved')).toBeVisible();

    const rate = `${80 + (Date.now() % 9)}.25`;
    await page.getByRole('button', { name: 'Set a rate' }).click();
    const dialog = page.getByRole('dialog', { name: 'Set a rate by hand' });
    await dialog.getByLabel('Rate').fill(rate);
    await dialog.getByLabel('Reason').fill('Browser test rate');
    await dialog.getByRole('button', { name: 'Set rate' }).click();
    await expect(dialog).toBeHidden();
    const row = page.getByRole('listitem').filter({ hasText: 'Browser test rate' }).first();
    await expect(row).toContainText(`1 USD = ${rate}000000 INR`);
    await expect(row).toContainText('In force');

    await row.getByRole('button', { name: 'Remove' }).click();
    await page.getByRole('dialog', { name: 'Stop using this rate?' }).getByRole('button', { name: 'Remove' }).click();
    await expect(row).toContainText('Removed');
  });

  test('works in Arabic, right to left, at phone width, without sideways scrolling', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await signInAs(page, 'super_admin', 'ar');
    await openPricing(page, 'ar');
    await expect(page.getByRole('heading', { level: 1, name: 'قواعد التسعير' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('[data-item=premium]')).toBeVisible();
    for (const tab of ['الهوامش والخصومات', 'أسعار الصرف']) {
      await page.getByRole('tab', { name: tab }).click();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    }
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test('is closed to staff outside the admin portal, and shows an error, not prices, to finance', async ({
    page,
  }) => {
    await signInAs(page, 'case_manager');
    await page.goto('/en/admin/pricing');
    await expect(page).not.toHaveURL(/\/admin\/pricing$/);
  });

  test('shows finance an error instead of the price list, because the API refuses them', async ({
    page,
  }) => {
    await signInAs(page, 'finance');
    await page.goto('/en/admin/pricing');
    await expect(page.getByText('The price list could not be loaded')).toBeVisible();
    await expect(page.locator('[data-item=premium]')).toHaveCount(0);
  });
});
