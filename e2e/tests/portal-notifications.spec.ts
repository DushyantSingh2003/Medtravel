import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { signInAs } from './support/auth.js';

/**
 * The notification engine from the browser (F-07): the admin sends a test event and finds it in the log, delivered on each
 * channel (the worker sends email and WhatsApp through the SMTP sink: Mailpit, or `fake-smtp` from @medtravel/notifications in CI);
 * the bell shows it and marks it read; a person switches a channel off and it stays off; only the admin sees the log.
 * Needs the API, the worker, Redis and an SMTP server on localhost:1025.
 */

const API = process.env['API_BASE_URL'] ?? 'http://localhost:3001';
const logRows = (page: Page) => page.getByRole('table').getByRole('row');
const bell = (page: Page) => page.getByRole('button', { name: /^Notifications/ });

test.describe.configure({ mode: 'serial' });

test.describe('the admin sends a test and sees it delivered', () => {
  test('queues the test on every channel, and the worker delivers it', async ({ page }) => {
    await signInAs(page, 'super_admin');
    await page.goto('/en/admin/notifications');
    await expect(page.getByRole('heading', { level: 1, name: 'Notifications' })).toBeVisible();

    await page.getByRole('button', { name: 'Send a test' }).click();
    const dialog = page.getByRole('dialog', { name: 'Send a test notification' });
    await dialog.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(dialog.getByText('3 messages queued')).toBeVisible();
    await expect(dialog.getByRole('listitem').filter({ hasText: 'In the app' })).toBeVisible();
    await expect(dialog.getByRole('listitem').filter({ hasText: 'WhatsApp' })).toBeVisible();
    await expect(dialog.getByRole('listitem').filter({ hasText: 'Email' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Close', exact: true }).first().click();

    // Filter to the test event: the newest rows are ours, and each channel ends up Sent (the worker polls every two seconds).
    await page.getByRole('combobox', { name: 'Event' }).click();
    await page.getByRole('option', { name: 'Test notification' }).click();
    for (const channel of ['In the app', 'Email', 'WhatsApp']) {
      await expect(async () => {
        await page.reload();
        await page.getByRole('combobox', { name: 'Event' }).click();
        await page.getByRole('option', { name: 'Test notification' }).click();
        const row = logRows(page).filter({ hasText: channel }).first();
        await expect(row).toBeVisible();
        await expect(row.getByText('Sent')).toBeVisible();
      }).toPass({ timeout: 30_000 });
    }
  });

  test('filters the log by channel and status, and clears the filters', async ({ page }) => {
    await signInAs(page, 'super_admin');
    await page.goto('/en/admin/notifications');
    await page.getByRole('combobox', { name: 'Channel' }).click();
    await page.getByRole('option', { name: 'WhatsApp' }).click();
    await expect(logRows(page).nth(1)).toBeVisible();
    for (const row of await logRows(page).all()) {
      const text = await row.innerText();
      if (!text.includes('Channel')) expect(text).toContain('WhatsApp');
    }
    await page.getByRole('combobox', { name: 'Status' }).click();
    await page.getByRole('option', { name: 'Failed' }).click();
    await expect(page.getByText('No notifications')).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(page.getByText('No notifications')).toBeHidden();
  });

  test('shows the test in the bell, marks one read when opened, and all with one click', async ({
    page,
  }) => {
    await signInAs(page, 'super_admin');
    const csrf = (await page.context().cookies()).find((c) => c.name === 'mt_csrf')?.value ?? '';
    // Two fresh unread messages for the admin, whatever else the bell already holds.
    for (let i = 0; i < 2; i += 1)
      expect(
        (
          await page.request.post(`${API}/notifications/test`, {
            headers: { 'x-csrf-token': csrf },
            data: { channels: ['in_app'] },
          })
        ).ok(),
      ).toBe(true);
    await page.reload();

    const button = bell(page);
    await expect(button).toHaveAccessibleName(/unread/);
    const unreadCount = async () =>
      Number(
        /(\d+) unread/.exec(
          (await button.getAttribute('aria-label')) ?? (await button.innerText()),
        )?.[1] ?? 0,
      );
    await button.click();
    const item = page.getByRole('button', { name: /Test notification/ }).first();
    await expect(item).toBeVisible();
    await expect(item).toContainText('this is a test message');
    const before = await unreadCount();
    expect(before).toBeGreaterThanOrEqual(2);

    await item.click();
    await expect(async () => expect(await unreadCount()).toBe(before - 1)).toPass({
      timeout: 10_000,
    });

    await page.getByRole('button', { name: 'Mark all as read' }).click();
    await expect(button).not.toHaveAccessibleName(/unread/);
    await expect(page.getByRole('button', { name: 'Mark all as read' })).toBeHidden();
  });
});

test.describe('who may see the log', () => {
  test('the other admin-portal role gets an error state, and a patient is sent to their own portal', async ({
    page,
    browser,
  }) => {
    await signInAs(page, 'finance');
    await page.goto('/en/admin/notifications');
    await expect(page.getByText('Could not load the log')).toBeVisible();

    const other = await browser.newPage();
    await signInAs(other, 'patient');
    await other.goto('/en/admin/notifications');
    await expect(other).toHaveURL(/\/en\/patient$/);
    await other.close();
  });

  test('the API refuses the log to everyone but the super admin', async ({ browser }) => {
    for (const [role, status] of [
      ['case_manager', 403],
      ['patient', 403],
      ['agent', 403],
    ] as const) {
      const context = await browser.newContext();
      const page = await context.newPage();
      await signInAs(page, role);
      const response = await page.request.get(`${API}/notifications/log`);
      expect(response.status(), role).toBe(status);
      await context.close();
    }
  });
});

test.describe('notification settings', () => {
  test('a person switches a channel off, it stays off after a reload, and it can be switched back on', async ({
    page,
  }) => {
    await signInAs(page, 'patient');
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('menuitem', { name: 'Notification settings' }).click();
    await expect(page).toHaveURL(/\/en\/account\/notifications$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Notification settings' }),
    ).toBeVisible();

    const whatsapp = page.getByRole('switch', { name: 'WhatsApp' });
    await expect(whatsapp).toBeChecked();
    await whatsapp.click();
    await expect(page.getByText('Your settings were saved.')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('switch', { name: 'WhatsApp' })).not.toBeChecked();
    await expect(page.getByRole('switch', { name: 'Email' })).toBeChecked();

    await page.getByRole('switch', { name: 'WhatsApp' }).click();
    await expect(page.getByRole('switch', { name: 'WhatsApp' })).toBeChecked();
  });

  test('reads right to left in Arabic and has no axe violations', async ({ page }) => {
    await signInAs(page, 'patient', 'ar');
    await page.goto('/ar/account/notifications');
    await expect(page.getByRole('heading', { level: 1, name: 'إعدادات الإشعارات' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('switch', { name: 'واتساب' })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });

  test('the admin log reads right to left in Arabic and has no axe violations', async ({
    page,
  }) => {
    await signInAs(page, 'super_admin', 'ar');
    await page.goto('/ar/admin/notifications');
    await expect(page.getByRole('heading', { level: 1, name: 'الإشعارات' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('button', { name: 'إرسال رسالة تجريبية' })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });
});
