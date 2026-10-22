import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * Master data acceptance (F-02): an admin adds a treatment in English and Arabic and it appears in the list at
 * once; the other tables list, edit, deactivate, delete and restore; a role that may only read cannot change anything.
 *
 * Needs the portal started with ENABLE_STUB_AUTH=true and the API with ENABLE_STUB_AUTH=true against a migrated
 * and seeded database (see playwright.config.ts). The portal must have been built with NEXT_PUBLIC_API_URL set to the API.
 */

async function signInAs(page: Page, role: string, locale: 'en' | 'ar' = 'en') {
  await page.goto(`/${locale}/login`);
  await page.locator(`button[name=role][value=${role}]`).click();
  await page.waitForSelector('[data-slot=app-shell]');
}

/** A slug that has not been used by an earlier run of this suite against the same database. */
const unique = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** The row of the table whose name cell contains `text`. */
const rowWith = (page: Page, text: string) => page.getByRole('row').filter({ hasText: text });

/** Chooses an option of a combobox or select inside `scope`, and waits for the list to close so the next click lands. */
async function choose(page: Page, scope: Locator, label: RegExp | string, option: string) {
  await scope.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
}

async function openResource(page: Page, resource: string, locale: 'en' | 'ar' = 'en') {
  await page.goto(`/${locale}/admin/masters/${resource}`);
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByRole('row').nth(1)).toBeVisible();
}

test.describe('master data index', () => {
  test('lists the eight tables and opens one', async ({ page }) => {
    await signInAs(page, 'super_admin');
    await page.goto('/en/admin/masters');
    await expect(page.getByRole('heading', { level: 1, name: 'Master data' })).toBeVisible();
    for (const title of [
      'Countries',
      'Languages',
      'Currencies',
      'Specialities',
      'Treatments',
      'Cities',
      'Document types',
      'Lost reasons',
    ]) {
      await expect(page.getByRole('heading', { level: 2, name: title })).toBeVisible();
    }
    await page.getByRole('link', { name: /Open\s+Treatments/ }).click();
    await expect(page).toHaveURL(/\/en\/admin\/masters\/treatments$/);
  });

  test('is reachable from the admin menu and answers 404 for a table that does not exist', async ({
    page,
  }) => {
    await signInAs(page, 'super_admin');
    await page.getByRole('link', { name: 'Master data' }).first().click();
    await expect(page).toHaveURL(/\/en\/admin\/masters$/);
    await page.goto('/en/admin/masters/not-a-table');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  });
});

test.describe('treatments', () => {
  test('an admin adds a treatment in English and Arabic and it appears in the list at once', async ({
    page,
  }) => {
    const slug = unique('e2e-treatment');
    const name = `E2E treatment ${slug}`;
    const arabic = 'علاج تجريبي';
    await signInAs(page, 'super_admin');
    await openResource(page, 'treatments');

    await page.getByRole('button', { name: 'Add treatment' }).click();
    const dialog = page.getByRole('dialog', { name: 'New treatment' });
    await dialog.getByLabel('Slug').fill(slug);
    await dialog.getByLabel(/^Name \(English\)/).fill(name);
    await choose(page, dialog, /Speciality/, 'Cardiology');
    await dialog.getByLabel('Typical stay in days').fill('9');
    await dialog.getByLabel('Name in Arabic').fill(arabic);
    await dialog.getByRole('button', { name: 'Add', exact: true }).click();

    await expect(page.getByText(`${name} was added`)).toBeVisible();
    await expect(dialog).toBeHidden();
    const row = rowWith(page, name);
    await expect(row).toBeVisible();
    await expect(row).toContainText(arabic);
    await expect(row).toContainText('Cardiology');
    await expect(row).toContainText('9 days');
    await expect(row.getByText('Active', { exact: true })).toBeVisible();
  });

  test('the Arabic name shows when the portal is used in Arabic', async ({ page }) => {
    await signInAs(page, 'super_admin', 'ar');
    await page.goto('/ar/admin/masters/treatments');
    await expect(page.getByRole('heading', { level: 1, name: 'العلاجات' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'إضافة علاج' })).toBeVisible();
    await expect(
      page.getByRole('row').filter({ hasText: 'جراحة تجاوز الشريان التاجي' }),
    ).toBeVisible();
  });

  test('a duplicate slug is reported on the slug field and nothing is added', async ({ page }) => {
    await signInAs(page, 'super_admin');
    await openResource(page, 'treatments');
    await page.getByRole('button', { name: 'Add treatment' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Slug').fill('knee-replacement');
    await dialog.getByLabel(/^Name \(English\)/).fill('Duplicate knee');
    await choose(page, dialog, /Speciality/, 'Orthopaedics');
    await dialog.getByRole('button', { name: 'Add', exact: true }).click();

    await expect(dialog.getByText('This slug is already used')).toBeVisible();
    await expect(dialog.getByLabel('Slug')).toHaveAttribute('aria-invalid', 'true');
    await expect(dialog).toBeVisible();
  });

  test('validation messages appear on the fields before anything is sent', async ({ page }) => {
    await signInAs(page, 'super_admin');
    await openResource(page, 'treatments');
    await page.getByRole('button', { name: 'Add treatment' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Slug').fill('Not A Slug');
    await dialog.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(dialog.getByLabel('Slug')).toHaveAttribute('aria-invalid', 'true');
    await expect(dialog.getByLabel(/^Name \(English\)/)).toHaveAttribute('aria-invalid', 'true');
  });

  test('edits a treatment, then deletes it and restores it', async ({ page }) => {
    const slug = unique('e2e-edit');
    const name = `E2E edit ${slug}`;
    await signInAs(page, 'super_admin');
    await openResource(page, 'treatments');

    // Add one to work on.
    await page.getByRole('button', { name: 'Add treatment' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Slug').fill(slug);
    await dialog.getByLabel(/^Name \(English\)/).fill(name);
    await choose(page, dialog, /Speciality/, 'Oncology');
    await dialog.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(rowWith(page, name)).toBeVisible();

    // Edit: the name button opens the sheet; only the changed field is saved.
    await rowWith(page, name).getByRole('button', { name, exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Edit treatment' });
    await sheet.getByLabel(/^Name \(English\)/).fill(`${name} renamed`);
    await sheet.getByLabel('Name in Arabic').fill('علاج معدّل');
    await sheet.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText(`${name} renamed was saved`)).toBeVisible();
    await expect(rowWith(page, `${name} renamed`)).toContainText('علاج معدّل');

    // Deactivate from the row menu.
    await rowWith(page, `${name} renamed`)
      .getByRole('button', { name: /Actions for/ })
      .click();
    await page.getByRole('menuitem', { name: 'Deactivate' }).click();
    await expect(
      rowWith(page, `${name} renamed`).getByText('Inactive', { exact: true }),
    ).toBeVisible();

    // Delete with confirmation; it leaves the list.
    await rowWith(page, `${name} renamed`)
      .getByRole('button', { name: /Actions for/ })
      .click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page
      .getByRole('alertdialog')
      .or(page.getByRole('dialog'))
      .getByRole('button', { name: 'Delete', exact: true })
      .click();
    await expect(page.getByText(`${name} renamed was deleted`)).toBeVisible();
    await expect(rowWith(page, `${name} renamed`)).toHaveCount(0);

    // It is in the deleted view, and restoring brings it back.
    await page.getByRole('switch', { name: 'Show deleted' }).click();
    await expect(
      rowWith(page, `${name} renamed`).getByText('Deleted', { exact: true }),
    ).toBeVisible();
    await rowWith(page, `${name} renamed`)
      .getByRole('button', { name: /Actions for/ })
      .click();
    await page.getByRole('menuitem', { name: 'Restore' }).click();
    await expect(page.getByText(`${name} renamed was restored`)).toBeVisible();
  });

  test('search finds a treatment by its Arabic name, and the filters narrow the list', async ({
    page,
  }) => {
    await signInAs(page, 'super_admin');
    await openResource(page, 'treatments');
    await page
      .getByRole('searchbox', { name: 'Search by name or code, in English or Arabic' })
      .fill('تجاوز الشريان');
    await expect(
      page.getByRole('row').filter({ hasText: 'Coronary bypass surgery' }),
    ).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: 'Knee replacement' })).toHaveCount(0);

    await page
      .getByRole('searchbox', { name: 'Search by name or code, in English or Arabic' })
      .fill('');
    await page.getByRole('combobox', { name: 'Speciality' }).click();
    await page.getByRole('option', { name: 'Orthopaedics' }).click();
    await expect(page.getByRole('row').filter({ hasText: 'Knee replacement' })).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: 'Coronary bypass surgery' })).toHaveCount(
      0,
    );
  });

  test('pages through the list with next and previous', async ({ page }) => {
    await signInAs(page, 'super_admin');
    await openResource(page, 'treatments');
    await choose(page, page.locator('main'), 'Rows per page', '10');
    const firstName = page.getByRole('row').nth(1).getByRole('button').first();
    await expect(page.getByText(/Page 1 of/)).toBeVisible();
    const onFirstPage = await firstName.innerText();
    await page.getByRole('button', { name: 'Next page' }).click();
    await expect(page.getByText(/Page 2 of/)).toBeVisible();
    await expect(firstName).not.toHaveText(onFirstPage);
    await page.getByRole('button', { name: 'Previous page' }).click();
    await expect(page.getByText(/Page 1 of/)).toBeVisible();
    await expect(firstName).toHaveText(onFirstPage);
  });
});

test.describe('other tables', () => {
  test('countries: add one with a dialling code, and deactivate it (countries are never deleted)', async ({
    page,
  }) => {
    await signInAs(page, 'super_admin');
    await openResource(page, 'countries');
    const code = Array.from({ length: 2 }, () =>
      String.fromCharCode(65 + Math.floor(Math.random() * 26)),
    ).join('');
    const name = `E2E land ${code}`;
    await page.getByRole('button', { name: 'Add country' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/^Code/).fill(code);
    await dialog.getByLabel(/^Name \(English\)/).fill(name);
    await dialog.getByLabel('Dialling code').fill('+999');
    await dialog.getByRole('button', { name: 'Add', exact: true }).click();
    // A code that an earlier run took is reported on the field; either way the screen behaves.
    const taken = dialog.getByText('This code is already used');
    await expect(taken.or(page.getByText(`${name} was added`))).toBeVisible();
    if (await taken.isVisible()) return;
    await expect(rowWith(page, name)).toBeVisible();
    await rowWith(page, name)
      .getByRole('button', { name: /Actions for/ })
      .click();
    await expect(page.getByRole('menuitem', { name: 'Delete' })).toHaveCount(0);
    await page.getByRole('menuitem', { name: 'Deactivate' }).click();
    await expect(rowWith(page, name).getByText('Inactive', { exact: true })).toBeVisible();
  });

  for (const [resource, expected] of [
    ['languages', 'العربية'],
    ['currencies', 'Omani rial'],
    ['specialities', 'Cardiology'],
    ['cities', 'Mumbai'],
    ['document-types', 'Medical report'],
    ['lost-reasons', 'Visa refused'],
  ] as const) {
    test(`${resource} lists its seeded rows`, async ({ page }) => {
      await signInAs(page, 'super_admin');
      await page.goto(`/en/admin/masters/${resource}`);
      await expect(page.getByRole('row').filter({ hasText: expected }).first()).toBeVisible();
    });
  }
});

test.describe('who may change master data', () => {
  test('finance can read the list but has no way to add, edit or delete', async ({ page }) => {
    await signInAs(page, 'finance');
    await openResource(page, 'treatments');
    await expect(page.getByText('You can look at this list but not change it.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add treatment' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Actions for/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Coronary bypass surgery' })).toHaveCount(0);
  });

  test('a role from another portal is sent back, not shown the screen', async ({ page }) => {
    await signInAs(page, 'case_manager');
    await page.goto('/en/admin/masters/treatments');
    await expect(page).not.toHaveURL(/\/admin\//);
  });
});

test.describe('accessibility and layout', () => {
  for (const locale of ['en', 'ar'] as const) {
    test(`the list and the add dialog have no axe violations (${locale})`, async ({ page }) => {
      await signInAs(page, 'super_admin', locale);
      await openResource(page, 'treatments', locale);
      const list = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(list.violations.map((v) => v.id)).toEqual([]);
      await page
        .getByRole('button')
        .filter({ hasText: locale === 'en' ? 'Add treatment' : 'إضافة علاج' })
        .click();
      await expect(page.getByRole('dialog')).toBeVisible();
      const dialog = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(dialog.violations.map((v) => v.id)).toEqual([]);
    });

    test(`works at 360 px wide without sideways scrolling (${locale})`, async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 740 });
      await signInAs(page, 'super_admin', locale);
      await openResource(page, 'treatments', locale);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});
