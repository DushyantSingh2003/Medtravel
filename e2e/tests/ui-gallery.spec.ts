import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Component gallery acceptance (S-05): every component renders correctly in English and Arabic at
 * phone (360 px) and desktop widths, and the interactive ones actually work in a real browser.
 *
 * Needs the portal running with ENABLE_UI_GALLERY=true (see playwright.config.ts).
 */

const SECTIONS = [
  'button',
  'form-controls',
  'select',
  'combobox',
  'date-picker',
  'phone-input',
  'currency-input',
  'selection-controls',
  'badge',
  'status-badge',
  'card',
  'tabs',
  'dialog',
  'sheet',
  'drawer',
  'toast',
  'tooltip',
  'dropdown-menu',
  'avatar',
  'skeleton',
  'empty-state',
  'error-state',
  'page-header',
  'breadcrumbs',
  'confirm-dialog',
  'data-table',
  'form-fields',
  'file-uploader',
  'stage-tracker',
  'timeline',
  'chat-panel',
  'stat-card',
  'kanban-board',
  'app-shell',
  'switcher',
  'user-menu',
  'notifications-menu',
  'brand-mark',
  'site-header',
  'site-footer',
  'whatsapp-button',
];

const LOCALES = ['en', 'ar'] as const;
const VIEWPORTS = [
  { name: 'phone 360', width: 360, height: 800 },
  { name: 'desktop 1280', width: 1280, height: 900 },
];

const section = (page: Page, id: string) => page.locator(`#cmp-${id}`);

/** A day button in the open calendar (not an "outside month" day, and matched by day number, not by year). */
const calendarDay = (page: Page, day: number) =>
  page
    .locator('.rdp-day:not(.rdp-outside)')
    .filter({ hasText: new RegExp(`^${day}$`) })
    .getByRole('button');

async function openGallery(page: Page, locale: string) {
  await page.goto(`/${locale}/ui-gallery`);
  // The page is interactive once the client components have hydrated.
  await expect(section(page, 'button').getByRole('button').first()).toBeVisible();
  await page.waitForLoadState('networkidle');
}

for (const locale of LOCALES) {
  for (const viewport of VIEWPORTS) {
    test.describe(`${locale} · ${viewport.name}`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });

      test('shows every component section with the right language and direction', async ({
        page,
      }) => {
        await openGallery(page, locale);
        await expect(page.locator('html')).toHaveAttribute('lang', locale);
        await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
        await expect(page.locator('[data-component]')).toHaveCount(SECTIONS.length);
        for (const id of SECTIONS) {
          await expect(section(page, id), id).toBeAttached();
          await expect(section(page, id).locator(`#cmp-${id}-title`), id).toBeVisible();
        }
        // No English left behind in the Arabic gallery's headings.
        if (locale === 'ar') {
          for (const heading of await page.locator('[data-component] h2').allTextContents()) {
            expect(heading, 'Arabic heading should contain Arabic letters').toMatch(/[؀-ۿ]/);
          }
        }
      });

      test('does not overflow the screen sideways', async ({ page }) => {
        await openGallery(page, locale);
        const overflow = await page.evaluate(() => {
          const width = document.documentElement.clientWidth;
          const offenders: string[] = [];
          const scrollsSideways = (el: Element | null): boolean => {
            for (let node = el; node && node !== document.body; node = node.parentElement) {
              const overflowX = getComputedStyle(node).overflowX;
              if (
                overflowX === 'auto' ||
                overflowX === 'scroll' ||
                overflowX === 'hidden' ||
                overflowX === 'clip'
              )
                return true;
            }
            return false;
          };
          for (const el of document.querySelectorAll('main *')) {
            // Radix renders invisible form inputs next to checkboxes and switches; they have no visual effect.
            if (el.matches('input[aria-hidden="true"]')) continue;
            const box = el.getBoundingClientRect();
            if (box.width === 0 || box.height === 0) continue;
            if ((box.right > width + 1 || box.left < -1) && !scrollsSideways(el.parentElement)) {
              offenders.push(
                `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} (${Math.round(box.left)}..${Math.round(box.right)})`,
              );
            }
          }
          return {
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: width,
            offenders: offenders.slice(0, 8),
          };
        });
        expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
        expect(overflow.offenders).toEqual([]);
      });

      test('has no automatically detectable accessibility violations', async ({ page }) => {
        await openGallery(page, locale);
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze();
        const summary = results.violations.map(
          (v) => `${v.id}: ${v.help} (${v.nodes.length}) e.g. ${v.nodes[0]?.target.join(' ')}`,
        );
        expect(summary).toEqual([]);
      });

      test('stage tracker is vertical on phones and horizontal on wider screens', async ({
        page,
      }) => {
        await openGallery(page, locale);
        const items = section(page, 'stage-tracker').locator('nav ol > li');
        await expect(items).toHaveCount(12);
        const boxes = await items.evaluateAll((els) =>
          els
            .slice(0, 3)
            .map((el) => el.getBoundingClientRect())
            .map((b) => ({ top: Math.round(b.top), left: Math.round(b.left) })),
        );
        if (viewport.width < 768) {
          expect(boxes[1]!.top).toBeGreaterThan(boxes[0]!.top);
          expect(boxes[1]!.left).toBe(boxes[0]!.left);
        } else {
          expect(boxes[1]!.top).toBe(boxes[0]!.top);
          // Stage 2 comes after stage 1 in reading order: to the right in English, to the left in Arabic.
          if (locale === 'ar') expect(boxes[1]!.left).toBeLessThan(boxes[0]!.left);
          else expect(boxes[1]!.left).toBeGreaterThan(boxes[0]!.left);
        }
      });
    });
  }
}

test.describe('interactions (English, desktop)', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('data table: search, sort, page, select, hide a column, export CSV', async ({ page }) => {
    await openGallery(page, 'en');
    const table = section(page, 'data-table').getByRole('region', { name: 'Cases', exact: true });
    const rows = table.getByRole('row');

    await expect(section(page, 'data-table').getByText('120 results')).toBeVisible();
    await expect(section(page, 'data-table').getByText('Page 1 of 12')).toBeVisible();

    // Server-side sort, descending on the second click.
    const caseNo = table.getByRole('columnheader', { name: /Case no/ });
    await caseNo.getByRole('button').click();
    await expect(caseNo).toHaveAttribute('aria-sort', 'ascending');
    await caseNo.getByRole('button').click();
    await expect(caseNo).toHaveAttribute('aria-sort', 'descending');
    await expect(rows.nth(1)).toContainText('CASE-2026-000120');

    // Paging.
    await section(page, 'data-table').getByRole('button', { name: 'Next page' }).click();
    await expect(section(page, 'data-table').getByText('Page 2 of 12')).toBeVisible();
    await expect(rows.nth(1)).toContainText('CASE-2026-000110');

    // Search resets to page one and filters on the "server".
    await section(page, 'data-table')
      .getByRole('searchbox', { name: 'Search cases' })
      .first()
      .fill('Chen');
    await expect(section(page, 'data-table').getByText('15 results')).toBeVisible();
    await expect(section(page, 'data-table').getByText('Page 1 of 2')).toBeVisible();

    // Selection.
    await table.getByRole('checkbox', { name: 'Select all rows' }).check();
    await expect(section(page, 'data-table').getByText('10 selected')).toBeVisible();

    // Hide the Country column.
    await section(page, 'data-table').getByRole('button', { name: 'Columns' }).first().click();
    await page.getByRole('menuitemcheckbox', { name: 'Country' }).click();
    await page.keyboard.press('Escape');
    await expect(table.getByRole('columnheader', { name: 'Country' })).toHaveCount(0);

    // CSV of the visible columns, as a real download.
    const download = page.waitForEvent('download');
    await section(page, 'data-table').getByRole('button', { name: 'Export CSV' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('cases.csv');
    const path = await file.path();
    const fs = await import('node:fs/promises');
    const bytes = await fs.readFile(path);
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const lines = bytes.toString('utf8').slice(1).split('\r\n');
    expect(lines[0]).toBe('Case no.,Patient,Stage,Updated');
    expect(lines).toHaveLength(11);
    expect(lines.slice(1).every((line) => line.includes('Chen Wei'))).toBe(true);
  });

  test('virtualised table renders only the rows in view out of 5,000', async ({ page }) => {
    await openGallery(page, 'en');
    const region = section(page, 'data-table').getByRole('region', { name: 'Cases, virtualised' });
    await expect(region).toBeVisible();
    const rendered = await region.locator('tbody tr[data-state], tbody tr').count();
    expect(rendered).toBeGreaterThan(3);
    expect(rendered).toBeLessThan(40);
    await region.evaluate((el) => (el.scrollTop = el.scrollHeight));
    await expect(region.getByText('CASE-2026-005000')).toBeVisible();
    expect(await region.locator('tbody tr').count()).toBeLessThan(40);
  });

  test('currency input stores integer minor units for each currency', async ({ page }) => {
    await openGallery(page, 'en');
    const box = section(page, 'currency-input');
    const amount = box.getByLabel('Amount');
    await amount.fill('19.99');
    await expect(box.getByTestId('currency-minor')).toHaveText('1999');
    await amount.blur();
    await expect(amount).toHaveValue('$19.99');
    await box.getByRole('combobox', { name: 'Currency' }).click();
    await page.getByRole('option', { name: 'JPY' }).click();
    await amount.fill('1500');
    await expect(box.getByTestId('currency-minor')).toHaveText('1500');
    await box.getByRole('combobox', { name: 'Currency' }).click();
    await page.getByRole('option', { name: 'KWD' }).click();
    await amount.fill('1.5');
    await expect(box.getByTestId('currency-minor')).toHaveText('1500');
  });

  test('phone input reports E.164 only for a valid number', async ({ page }) => {
    await openGallery(page, 'en');
    const box = section(page, 'phone-input');
    await box.getByLabel('Phone number').fill('98765');
    await expect(box.getByTestId('phone-value')).toHaveText('—');
    await box.getByLabel('Phone number').fill('9876543210');
    await expect(box.getByTestId('phone-value')).toHaveText('+919876543210');
    await box.getByRole('combobox', { name: 'Country code' }).click();
    await page.getByPlaceholder('Search countries').fill('United Arab');
    await page.getByRole('option', { name: /United Arab Emirates/ }).click();
    await box.getByLabel('Phone number').fill('501234567');
    await expect(box.getByTestId('phone-value')).toHaveText('+971501234567');
  });

  test('combobox and date picker work from the keyboard', async ({ page }) => {
    await openGallery(page, 'en');
    const combo = section(page, 'combobox').getByRole('combobox', { name: 'City' });
    await combo.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.type('mum');
    await page.keyboard.press('Enter');
    await expect(combo).toHaveText('Mumbai');

    const date = section(page, 'date-picker').getByRole('button', { name: 'Arrival date' });
    await date.click();
    await calendarDay(page, 15).click();
    await expect(date).not.toHaveText('Pick a date');
    await expect(date).toContainText('15');
  });

  test('dialog traps focus, closes with Escape and returns focus to its trigger', async ({
    page,
  }) => {
    await openGallery(page, 'en');
    const trigger = section(page, 'dialog').getByRole('button', { name: 'Open dialog' });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Share your reports' });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    expect(
      await page.evaluate(() => document.activeElement?.closest('[role=dialog]') !== null),
    ).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('tooltip opens for keyboard users who tab to its trigger', async ({ page }) => {
    await openGallery(page, 'en');
    // Focus the control before the tooltip trigger, then press Tab like a real keyboard user.
    await section(page, 'toast').getByRole('button', { name: 'Show error' }).focus();
    // Focusing scrolls the button into view, and the browser reports that scroll a frame later. Radix
    // closes a tooltip on any scroll, so let it arrive before the keyboard user tabs to the trigger.
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await page.keyboard.press('Tab');
    await expect(
      section(page, 'tooltip').getByRole('button', { name: 'More information' }),
    ).toBeFocused();
    await expect(page.getByRole('tooltip').first()).toContainText(
      'Shown on hover and keyboard focus.',
    );
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tooltip')).toHaveCount(0);
  });

  test('sheet, drawer, tooltip, menu and toast open', async ({ page }) => {
    await openGallery(page, 'en');
    await section(page, 'sheet').getByRole('button', { name: 'Open side panel' }).click();
    await expect(page.getByRole('dialog', { name: 'Filters' })).toBeVisible();
    await page.keyboard.press('Escape');

    await section(page, 'drawer').getByRole('button', { name: 'Open drawer' }).click();
    await expect(page.getByRole('dialog', { name: 'Quick actions' })).toBeVisible();
    await page.keyboard.press('Escape');

    await section(page, 'tooltip').getByRole('button', { name: 'More information' }).hover();
    await expect(page.getByRole('tooltip').first()).toContainText(
      'Shown on hover and keyboard focus.',
    );

    await section(page, 'dropdown-menu').getByRole('button', { name: 'Case actions' }).click();
    await expect(page.getByRole('menuitem', { name: 'Assign to me' })).toBeVisible();
    await page.keyboard.press('Escape');

    await section(page, 'toast').getByRole('button', { name: 'Show success' }).click();
    await expect(page.getByText('Your changes were saved.')).toBeVisible();
  });

  test('confirm dialog shows progress and then reports the result', async ({ page }) => {
    await openGallery(page, 'en');
    const box = section(page, 'confirm-dialog');
    await box.getByRole('button', { name: 'Cancel case…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Cancel this case?' });
    await dialog.getByRole('button', { name: 'Cancel case' }).click();
    await expect(dialog).toBeHidden();
    await expect(box.getByText('1 case cancelled')).toBeVisible();
  });

  test('form validates, wires errors to fields, accepts server errors and submits typed values', async ({
    page,
  }) => {
    await openGallery(page, 'en');
    const box = section(page, 'form-fields');
    await box.getByRole('button', { name: 'Submit' }).click();
    await expect(box.getByRole('alert').first()).toBeVisible();
    expect(await box.getByRole('alert').count()).toBeGreaterThanOrEqual(6);
    const email = box.getByLabel(/^Email/);
    await expect(email).toHaveAttribute('aria-invalid', 'true');

    await box.getByLabel(/^Full name/).fill('Asha Verma');
    await email.fill('asha@example.com');
    await box
      .getByLabel('Phone number')
      .or(box.locator('input[type=tel]'))
      .first()
      .fill('9876543210');
    await box.getByRole('combobox', { name: /Preferred city/ }).click();
    await page.getByPlaceholder('Search cities').fill('delhi');
    await page.keyboard.press('Enter');
    await box.getByRole('combobox', { name: /^Language/ }).click();
    await page.getByRole('option', { name: 'English' }).click();
    await box.getByRole('button', { name: /Planned arrival/ }).click();
    await calendarDay(page, 20).click();
    await box.getByRole('textbox', { name: /Budget/ }).fill('2500.50');
    await box.getByRole('checkbox', { name: /I consent/ }).check();
    await box.getByRole('button', { name: 'Submit' }).click();

    const result = box.getByTestId('form-result');
    await expect(result).toBeVisible();
    const values = JSON.parse((await result.textContent()) ?? '{}');
    expect(values).toMatchObject({
      name: 'Asha Verma',
      email: 'asha@example.com',
      phone: '+919876543210',
      city: 'delhi',
      language: 'en',
      budget: 250050,
      consent: true,
      urgent: false,
    });
    expect(values.arrival).toMatch(/^\d{4}-\d{2}-20$/);

    await box.getByRole('button', { name: 'Simulate a server error' }).click();
    await expect(box.getByText('This email is already registered.')).toBeVisible();
    await expect(email).toHaveAttribute('aria-invalid', 'true');
  });

  test('chat panel sends with Enter and keeps the line break with Shift+Enter', async ({
    page,
  }) => {
    await openGallery(page, 'en');
    const box = section(page, 'chat-panel');
    const composer = box.getByRole('textbox', { name: 'Write a message' });
    await composer.fill('First line');
    await composer.press('Shift+Enter');
    await composer.pressSequentially('Second line');
    await composer.press('Enter');
    const log = box.getByRole('log', { name: 'Messages' });
    await expect(log).toContainText('First line');
    await expect(log).toContainText('Second line');
    await expect(composer).toHaveValue('');
  });

  test('kanban card moves between columns with the keyboard and announces it', async ({ page }) => {
    await openGallery(page, 'en');
    const board = section(page, 'kanban-board');
    const announcer = page.locator('[id^="DndLiveRegion"]');
    const card = board.locator('[data-column="qualification"] [data-slot="kanban-card"]').first();
    await card.focus();
    await page.keyboard.press('Space');
    await expect(announcer).toHaveText(/Picked up CASE-2026-000101 Asha Verma\./);
    await page.keyboard.press('ArrowRight');
    await expect(announcer).toHaveText(
      /CASE-2026-000101 Asha Verma is over Medical review, position 1\./,
    );
    await page.keyboard.press('Space');
    await expect(announcer).toHaveText(/dropped in Medical review, position 1\./);
    await expect(board.locator('[data-column="medical_review"]')).toContainText('CASE-2026-000101');
    await expect(board.locator('[data-column="qualification"]')).not.toContainText(
      'CASE-2026-000101',
    );
  });

  test('kanban card moves with the mouse', async ({ page }) => {
    await openGallery(page, 'en');
    const board = section(page, 'kanban-board');
    const card = board.locator('[data-column="medical_review"] [data-slot="kanban-card"]').first();
    const target = board.locator('[data-column="hospital_opinions"] ul');
    await card.scrollIntoViewIfNeeded();
    const from = await card.boundingBox();
    const to = await target.boundingBox();
    await page.mouse.move(from!.x + 30, from!.y + 20);
    await page.mouse.down();
    await page.mouse.move(from!.x + 60, from!.y + 30, { steps: 5 });
    await page.mouse.move(to!.x + to!.width / 2, to!.y + 40, { steps: 15 });
    await page.mouse.up();
    await expect(board.locator('[data-column="hospital_opinions"]')).toContainText(
      'CASE-2026-000103',
    );
  });
});

test.describe('file uploader (English, desktop)', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  const stats = async (page: Page, name: string) => {
    const response = await page.request.get('/api/ui-gallery/s3/x?stats');
    const all = (await response.json()) as { key: string; parts: number; partPuts: number }[];
    return all.filter((upload) => upload.key.includes(name));
  };

  test('uploads a large file in S3 multipart parts with progress', async ({ page }) => {
    await openGallery(page, 'en');
    const box = section(page, 'file-uploader');
    await box.locator('input[type=file]').setInputFiles({
      name: 'scan-large.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.alloc(18 * 1024 * 1024, 1),
    });
    const item = box.locator('li[data-status]').filter({ hasText: 'scan-large.pdf' });
    await expect(item).toHaveAttribute('data-status', 'done', { timeout: 30_000 });
    await expect(item.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    await expect(box.getByTestId('uploaded-count')).toHaveText('1 file uploaded');
    const [upload] = await stats(page, 'scan-large.pdf');
    // More than one part (it really was multipart), and every part was uploaded exactly once.
    expect(upload!.parts).toBeGreaterThan(1);
    expect(upload!.partPuts).toBe(upload!.parts);
  });

  test('retries a failed upload without re-sending the parts that already arrived', async ({
    page,
  }) => {
    await openGallery(page, 'en');
    const box = section(page, 'file-uploader');
    await box.locator('input[type=file]').setInputFiles({
      name: 'flaky-report.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.alloc(20 * 1024 * 1024, 2),
    });
    const item = box.locator('li[data-status]').filter({ hasText: 'flaky-report.pdf' });
    // The mock fails part 2 once. Either the uploader recovers on its own or it offers a retry.
    await expect(item).toHaveAttribute('data-status', /done|error/, { timeout: 30_000 });
    if ((await item.getAttribute('data-status')) === 'error') {
      await item.getByRole('button', { name: /^Retry/ }).click();
    }
    await expect(item).toHaveAttribute('data-status', 'done', { timeout: 30_000 });
    const [upload] = await stats(page, 'flaky-report.pdf');
    expect(upload!.parts).toBeGreaterThan(2);
    // Each part once, plus the single failed attempt. Re-sending the parts that had already arrived
    // would push this higher.
    expect(upload!.partPuts).toBe(upload!.parts + 1);
  });

  test('rejects a file that is not a PDF, an image or DICOM, with a message', async ({ page }) => {
    await openGallery(page, 'en');
    const box = section(page, 'file-uploader');
    await box.locator('input[type=file]').setInputFiles({
      name: 'program.exe',
      mimeType: 'application/x-msdownload',
      buffer: Buffer.from('MZ'),
    });
    await expect(box.getByRole('alert')).toContainText(
      'program.exe is not a PDF, image or DICOM file.',
    );
    await expect(box.locator('li[data-status]')).toHaveCount(0);
  });
});

test.describe('Arabic specifics', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('Arabic gallery formats money and dates with Latin digits and mirrors layout', async ({
    page,
  }) => {
    await openGallery(page, 'ar');
    const amount = section(page, 'currency-input').getByLabel('المبلغ');
    await amount.fill('1234.5');
    await amount.blur();
    const text = await amount.inputValue();
    expect(text).toMatch(/1[,٬]234[.٫]50/);
    expect(text).not.toMatch(/[٠-٩]/);

    // The sheet opens from the end edge, which is the left side in Arabic.
    await section(page, 'sheet').getByRole('button', { name: 'فتح اللوحة الجانبية' }).click();
    const panel = page.getByRole('dialog', { name: 'عوامل التصفية' });
    await expect(panel).toBeVisible();
    const box = await panel.boundingBox();
    expect(box!.x).toBeLessThan(4);
  });

  test('Arabic calendar has Arabic navigation labels, month and year lists, and keeps a chosen day', async ({
    page,
  }) => {
    await openGallery(page, 'ar');
    const date = section(page, 'date-picker').getByRole('button', { name: 'تاريخ الوصول' });
    await date.click();
    await expect(page.getByRole('button', { name: 'الشهر التالي' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'الشهر السابق' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'الشهر' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'السنة' })).toBeVisible();
    await expect(page.getByText('Go to the')).toHaveCount(0);
    await calendarDay(page, 15).click();
    const chosen = await date.innerText();
    await date.click();
    // Clicking the chosen day again must not clear a required date.
    await calendarDay(page, 15).click();
    await expect(date).toHaveText(chosen);
  });

  test('Arabic data table shows Arabic pagination text and an Arabic CSV header', async ({
    page,
  }) => {
    await openGallery(page, 'ar');
    const box = section(page, 'data-table');
    await expect(box.getByText('الصفحة 1 من 12')).toBeVisible();
    await expect(box.getByText('120 نتيجة')).toBeVisible();
    const download = page.waitForEvent('download');
    await box.getByRole('button', { name: 'تصدير CSV' }).click();
    const file = await download;
    const fs = await import('node:fs/promises');
    const csv = (await fs.readFile(await file.path(), 'utf8')).slice(1);
    expect(csv.split('\r\n')[0]).toBe('رقم الحالة,المريض,الدولة,المرحلة,آخر تحديث');
  });
});

test.describe('mock storage endpoint', () => {
  test('escapes the object key in its XML answer and sends hardening headers', async ({
    request,
  }) => {
    const response = await request.post('/api/ui-gallery/s3/a%26b%3Cscript%3Ex?uploads');
    expect(response.status()).toBe(200);
    expect(response.headers()['x-content-type-options']).toBe('nosniff');
    expect(response.headers()['content-security-policy']).toBe('sandbox');
    const body = await response.text();
    expect(body).not.toContain('<script>');
    expect(body).toContain('a&#38;b&#60;script&#62;x');
  });

  test('keeps a percent sign in a file name instead of decoding it twice', async ({ request }) => {
    const response = await request.post('/api/ui-gallery/s3/100%25-report.pdf?uploads');
    expect(response.status()).toBe(200);
    expect(await response.text()).toContain('<Key>100%-report.pdf</Key>');
  });

  test('refuses requests the browser marks as cross-site', async ({ request }) => {
    const cross = await request.post('/api/ui-gallery/s3/x?uploads', {
      headers: { 'sec-fetch-site': 'cross-site' },
    });
    expect(cross.status()).toBe(403);
  });
});
