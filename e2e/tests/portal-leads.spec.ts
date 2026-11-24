import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { signInAs } from './support/auth.js';

/**
 * Lead inbox (C-01): a coordinator enters leads, the same phone number twice gives one patient with two flagged enquiries, a similar
 * name is a hint they can merge, and a lead can be taken. Needs the API and portal running against a database seeded with
 * SEED_DEV_USERS=true. Each run uses phone numbers of its own so reruns do not meet each other's leads.
 */

const stamp = Date.now();
let counter = 0;
/** A phone number no earlier run used: +9715 then eight digits from the clock and a counter. */
const phone = () => `+9715${String(((stamp % 9_000_000) + 1_000_000 + (counter += 7)) % 100_000_000).padStart(8, '0')}`;
const spaced = (value: string) => value.replace(/^(\+971)(\d)(\d{3})(\d{4})$/, '$1 $2 $3 $4');

const openInbox = async (page: Page, locale: 'en' | 'ar' = 'en') => {
  await page.goto(`/${locale}/ops/leads`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
};

async function enterLead(page: Page, fields: { name: string; phone: string; source?: string; message?: string }) {
  await page.getByRole('button', { name: 'New lead' }).click();
  const dialog = page.getByRole('dialog', { name: 'Enter a lead' });
  if (fields.source) {
    await dialog.getByRole('combobox', { name: 'Where it came from' }).click();
    await page.getByRole('option', { name: fields.source, exact: true }).click();
  }
  await dialog.getByLabel('Name').fill(fields.name);
  await dialog.getByLabel('Phone', { exact: true }).fill(fields.phone);
  if (fields.message) await dialog.getByLabel('What they asked').fill(fields.message);
  await dialog.getByRole('button', { name: 'Create lead' }).click();
  await expect(dialog).toBeHidden();
}

test.describe('lead inbox', () => {
  test('the same phone number entered twice gives one patient and two flagged enquiries', async ({ page }) => {
    await signInAs(page, 'case_manager');
    await openInbox(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Lead inbox' })).toBeVisible();
    const number = phone();
    const name = `Repeat Caller ${stamp}`;
    await enterLead(page, { name, phone: number, source: 'Phone call', message: 'First call about a knee' });
    await expect(page.getByText(/Lead created: CASE-/)).toBeVisible();
    // The same number, typed differently, from another channel.
    await enterLead(page, { name: `R. Caller ${stamp}`, phone: spaced(number), source: 'WhatsApp', message: 'Asking again' });
    await expect(page.getByText('Added to a patient we already know: flagged as a repeat enquiry')).toBeVisible();

    await page.getByRole('searchbox', { name: /Search by name/ }).fill(number);
    const rows = page.getByRole('listitem').filter({ hasText: 'Possible duplicate' });
    await expect(rows).toHaveCount(2);

    await rows.first().getByRole('button', { name: 'Open' }).click();
    const dialog = page.getByRole('dialog');
    const banner = dialog.locator('[data-slot=duplicate-banner]');
    await expect(banner).toContainText('Possible duplicate');
    await expect(banner).toContainText('phone number');
    await expect(dialog.getByRole('heading', { name: 'Other enquiries from the same patient' })).toBeVisible();
    await banner.getByRole('button', { name: 'Not a duplicate' }).click();
    await expect(page.getByText('Marked as not a duplicate').first()).toBeVisible();
    await expect(banner).toHaveCount(0);
  });

  test('a similar name is a hint: the two records can be merged, which is written to the audit log', async ({ page }) => {
    await signInAs(page, 'case_manager');
    await openInbox(page);
    const surname = `Farsi${stamp}`;
    await enterLead(page, { name: `Mohammed Al ${surname}`, phone: phone(), source: 'Phone call' });
    await enterLead(page, { name: `Mohamed Al ${surname}`, phone: phone(), source: 'Email' });

    await page.getByRole('searchbox', { name: /Search by name/ }).fill(`Mohamed Al ${surname}`);
    const row = page.getByRole('listitem').filter({ hasText: 'Possible duplicate' }).first();
    await row.getByRole('button', { name: 'Open' }).click();
    const dialog = page.getByRole('dialog');
    const banner = dialog.locator('[data-slot=duplicate-banner]');
    await expect(banner).toContainText('similar name');
    await expect(banner).toContainText(`Mohammed Al ${surname}`);
    await banner.getByRole('button', { name: /^Merge into / }).click();
    await page.getByRole('dialog', { name: 'Merge the two patient records?' }).getByRole('button', { name: 'Merge' }).click();
    await expect(page.getByText('Records merged')).toBeVisible();
    await expect(dialog.getByText('Merged', { exact: true })).toBeVisible();
    await expect(banner).toHaveCount(0);
  });

  test('takes an unassigned lead, which then reads as assigned', async ({ page }) => {
    await signInAs(page, 'case_manager');
    await openInbox(page);
    const name = `Unclaimed ${stamp}`;
    await enterLead(page, { name, phone: phone(), source: 'Walk-in' });
    await page.getByRole('searchbox', { name: /Search by name/ }).fill(name);
    const row = page.getByRole('listitem').filter({ hasText: name });
    // A case manager who enters a lead owns it; a super admin's entry waits to be taken, so this one is already theirs.
    await expect(row.getByText('Unassigned')).toHaveCount(0);
    await row.getByRole('button', { name: 'Open' }).click();
    await expect(page.getByRole('dialog').getByRole('link', { name: 'Open the case' })).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Take this lead' })).toHaveCount(0);
  });

  test('has no accessibility violations on the list, the new-lead dialog and a lead', async ({ page }) => {
    await signInAs(page, 'case_manager');
    await openInbox(page);
    await expect(page.getByRole('list', { name: 'Leads' }).or(page.getByText('No leads yet'))).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.getByRole('button', { name: 'New lead' }).click();
    await expect(page.getByRole('dialog', { name: 'Enter a lead' })).toBeVisible();
    expect((await new AxeBuilder({ page }).include('[role=dialog]').analyze()).violations).toEqual([]);
    await page.keyboard.press('Escape');
  });

  test('works in Arabic, right to left, at phone width, without sideways scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await signInAs(page, 'case_manager', 'ar');
    await openInbox(page, 'ar');
    await expect(page.getByRole('heading', { level: 1, name: 'صندوق العملاء المحتملين' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test('is closed to roles outside the coordinators', async ({ page }) => {
    await signInAs(page, 'hospital_desk');
    await page.goto('/en/ops/leads');
    await expect(page).not.toHaveURL(/\/ops\/leads$/);
  });
});
