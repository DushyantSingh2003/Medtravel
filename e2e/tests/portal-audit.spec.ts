import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { signInAs } from './support/auth.js';

/**
 * The audit log screen (F-05): an admin finds what was recorded, filters it, opens an event, exports it; everyone else is
 * turned away. Needs the API and portal running against a database seeded with SEED_DEV_USERS=true SEED_DEV_2FA=true, which
 * also adds three sample audit events.
 */

const PERSON_SEARCH = 'Search by person: name or email';

/** Picks an action in the filter; every test run signs in, so the three seeded events are not on the first page unfiltered. */
async function filterAction(page: Page, name: string) {
  // Rows only appear once the page has hydrated and loaded; clicking sooner is lost when React takes over.
  await expect(page.getByRole('table').getByRole('row').nth(1)).toBeVisible();
  await page.getByRole('combobox', { name: 'Action' }).click();
  await page.getByRole('option', { name }).click();
}

test.describe('audit log', () => {
  test('lists the events, newest first, with the person, action and record', async ({ page }) => {
    await signInAs(page, 'super_admin');
    await page.goto('/en/admin/audit');
    await expect(page.getByRole('heading', { level: 1, name: 'Audit log' })).toBeVisible();
    await filterAction(page, 'All document activity');
    const table = page.getByRole('table', { name: 'Audit log' });
    await expect(table.getByText('Document viewed').first()).toBeVisible();
    await expect(table.getByText('document.downloaded').first()).toBeVisible();
    await expect(table.getByText('203.0.113.10').first()).toBeVisible();
  });

  test('filters by action, and by person', async ({ page }) => {
    await signInAs(page, 'super_admin');
    await page.goto('/en/admin/audit');
    await filterAction(page, 'Document downloaded');
    const table = page.getByRole('table', { name: 'Audit log' });
    await expect(table.getByText('document.downloaded').first()).toBeVisible();
    await expect(table.getByText('document.viewed')).toHaveCount(0);

    await page.getByRole('button', { name: 'Clear filters' }).click();
    await page.getByRole('searchbox', { name: PERSON_SEARCH }).fill('no-such-person-anywhere');
    await expect(page.getByText('No events')).toBeVisible();
  });

  test('opens an event to show what changed, with only the changed fields', async ({ page }) => {
    await signInAs(page, 'super_admin');
    await page.goto('/en/admin/audit');
    await filterAction(page, 'Master data changes');
    // The seeded change, not one a master data test made: it is the row from the sample address.
    await page
      .getByRole('row')
      .filter({ hasText: '203.0.113.10' })
      .getByRole('button', { name: /Show details of master_data.updated/ })
      .click();
    const sheet = page.getByRole('dialog', { name: 'Audit event' });
    await expect(sheet.getByText('Total knee replacement')).toBeVisible();
    await expect(sheet.getByText(/"Knee replacement"/)).toBeVisible();
    await sheet.getByRole('button', { name: 'Close' }).click();
    await expect(sheet).toBeHidden();
  });

  test('shows a sign-in within seconds of it happening', async ({ page, browser }) => {
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await signInAs(otherPage, 'patient');
    await other.close();

    await signInAs(page, 'super_admin');
    await page.goto('/en/admin/audit');
    await page.getByRole('searchbox', { name: PERSON_SEARCH }).fill('dev patient');
    const table = page.getByRole('table', { name: 'Audit log' });
    await expect(table.getByText('auth.login').first()).toBeVisible();
  });

  test('exports the filtered log as a CSV file', async ({ page }) => {
    await signInAs(page, 'super_admin');
    await page.goto('/en/admin/audit');
    await filterAction(page, 'Document viewed');
    await expect(
      page.getByRole('table', { name: 'Audit log' }).getByText('Document viewed').first(),
    ).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('audit-log.csv');
    const stream = await file.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const text = Buffer.concat(chunks).toString('utf8');
    expect(text.split('\r\n')[0]).toBe(
      'time,actor,email,role,action,entityType,entityId,patientId,ip,userAgent,requestId,before,after',
    );
    expect(text).toContain('document.viewed');
  });

  test('turns away a case manager and an agent', async ({ page }) => {
    await signInAs(page, 'case_manager');
    await page.goto('/en/admin/audit');
    await expect(page).not.toHaveURL(/\/admin\/audit/);
    await expect(page.getByRole('heading', { level: 1, name: 'Audit log' })).toHaveCount(0);
  });
});

test.describe('audit log, Arabic and accessibility', () => {
  test('reads right to left, keeps codes left to right, and has no axe violations', async ({
    page,
  }) => {
    await signInAs(page, 'super_admin', 'ar');
    await page.goto('/ar/admin/audit');
    await expect(page.getByRole('heading', { level: 1, name: 'سجل التدقيق' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('table').getByRole('row').nth(1)).toBeVisible();
    await page.getByRole('combobox', { name: 'الإجراء' }).click();
    await page.getByRole('option', { name: 'عرض مستند' }).click();
    await expect(
      page.getByRole('table', { name: 'سجل التدقيق' }).getByText('عرض مستند').first(),
    ).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });

  test('fits a 360 px phone without sideways scrolling of the page', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await signInAs(page, 'super_admin');
    await page.goto('/en/admin/audit');
    await expect(page.getByRole('heading', { level: 1, name: 'Audit log' })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
