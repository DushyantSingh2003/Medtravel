import { closeSync, mkdtempSync, openSync, rmSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { signInAs } from './support/auth.js';

/**
 * The secure file service from the browser (F-06): a patient uploads a PDF and a 300 MB ZIP straight to the bucket with
 * progress, sees them scanned, opens and downloads them (PDFs stamped), an infected file is removed, and only permitted roles
 * can download. Needs the API, the worker, a bucket and a scanner: MinIO and ClamAV, or `fake-s3` and `fake-clamd` from
 * @medtravel/storage (what CI runs), with the API's S3 settings pointing at the bucket.
 */

const API = process.env['API_BASE_URL'] ?? 'http://localhost:3001';
const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
const stamp = Date.now().toString(36);

const pdfBytes = async (pages: number) => {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i += 1) doc.addPage([300, 400]);
  return Buffer.from(await doc.save());
};

/** A file of `bytes` bytes on disk that starts like a ZIP, so a 300 MB archive needs no 300 MB in the test's memory. */
function writeZip(directory: string, name: string, bytes: number): string {
  const path = join(directory, name);
  const fd = openSync(path, 'w');
  const chunk = Buffer.alloc(8 * 1024 * 1024, 7);
  chunk.set([0x50, 0x4b, 0x03, 0x04]);
  for (let written = 0; written < bytes;) {
    const size = Math.min(chunk.length, bytes - written);
    writeSync(fd, chunk, 0, size);
    written += size;
    chunk[0] = 0; // only the very first bytes are the ZIP signature
  }
  closeSync(fd);
  return path;
}

const filesList = (page: Page) => page.getByRole('list', { name: 'Your files' });
const rowOf = (page: Page, name: string) =>
  filesList(page).getByRole('listitem').filter({ hasText: name });

async function openRecords(page: Page) {
  await signInAs(page, 'patient');
  await page.goto('/en/patient/records');
  await expect(page.getByRole('heading', { level: 1, name: 'Medical records' })).toBeVisible();
  await page.waitForLoadState('networkidle');
}

test.describe('medical records', () => {
  test.describe.configure({ mode: 'serial' });
  let directory: string;
  test.beforeAll(() => {
    directory = mkdtempSync(join(tmpdir(), 'medtravel-e2e-'));
  });
  test.afterAll(() => rmSync(directory, { recursive: true, force: true }));

  test('uploads a PDF, shows it being scanned, previews it and downloads it with a watermark', async ({
    page,
  }) => {
    const name = `report-${stamp}.pdf`;
    const original = await pdfBytes(2);
    await openRecords(page);
    await page
      .locator('input[type=file]')
      .setInputFiles({ name, mimeType: 'application/pdf', buffer: original });

    const row = rowOf(page, name);
    await expect(row).toBeVisible({ timeout: 30_000 });
    // The worker scans it in the background; the list looks again until it is done.
    await expect(row.getByText('Ready')).toBeVisible({ timeout: 60_000 });
    await expect(row.getByText('2 pages')).toBeVisible();
    await expect(row.getByText('Medical report')).toBeVisible();
    await expect(row.getByText('Not shared')).toBeVisible();

    await row.getByRole('button', { name: `Preview ${name}` }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('iframe')).toHaveAttribute('src', /X-Amz-Expires=300/);
    await expect(dialog.getByText('marked with your name')).toBeVisible();
    await dialog.getByRole('button', { name: 'Close' }).first().click();

    const download = page.waitForEvent('download');
    await row.getByRole('button', { name: `Download ${name}` }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe(name);
    const chunks: Buffer[] = [];
    for await (const chunk of await file.createReadStream()) chunks.push(Buffer.from(chunk));
    const received = Buffer.concat(chunks);
    expect(received.equals(original)).toBe(false);
    expect((await PDFDocument.load(received)).getPageCount()).toBe(2);
  });

  test('uploads a 300 MB ZIP with progress, gets it scanned, and delivers it as it is', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const name = `dicom-${stamp}.zip`;
    const path = writeZip(directory, name, 300 * 1024 * 1024);
    await openRecords(page);
    // Slow every part a little so the progress can be watched.
    await page.route(/\/files\/[0-9a-f-]{36}\?.*partNumber=/, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 120));
      await route.continue();
    });
    await page.locator('input[type=file]').setInputFiles(path);

    const progress = page.getByRole('progressbar', { name: `Upload progress for ${name}` });
    await expect(progress).toBeVisible({ timeout: 30_000 });
    const seen = new Set<number>();
    await expect
      .poll(
        async () => {
          const value = Number(await progress.getAttribute('aria-valuenow').catch(() => null));
          if (value > 0 && value < 100) seen.add(value);
          return seen.size;
        },
        { timeout: 120_000, intervals: [150] },
      )
      .toBeGreaterThan(2);

    const row = rowOf(page, name);
    await expect(row).toBeVisible({ timeout: 120_000 });
    await expect(row.getByText('Ready')).toBeVisible({ timeout: 120_000 });
    await expect(row.getByText('Medical report')).toBeVisible();

    // A ZIP cannot be shown in the page, and is delivered unmarked.
    await row.getByRole('button', { name: `Preview ${name}` }).click();
    await expect(page.getByRole('dialog').getByText('cannot be shown here')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).first().click();
    const download = page.waitForEvent('download', { timeout: 120_000 });
    await row.getByRole('button', { name: `Download ${name}` }).click();
    expect((await download).suggestedFilename()).toBe(name);
  });

  test('removes a file that holds a virus, and refuses to open it', async ({ page }) => {
    const name = `infected-${stamp}.pdf`;
    await openRecords(page);
    await page.locator('input[type=file]').setInputFiles({
      name,
      mimeType: 'application/pdf',
      buffer: Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from(EICAR)]),
    });
    const row = rowOf(page, name);
    await expect(row.getByText('Removed: virus found')).toBeVisible({ timeout: 60_000 });
    await expect(row.getByRole('button', { name: `Download ${name}` })).toBeDisabled();
    await expect(row.getByRole('button', { name: `Preview ${name}` })).toBeDisabled();
  });

  test('refuses a file that is not an allowed type before it is sent', async ({ page }) => {
    await openRecords(page);
    await page
      .locator('input[type=file]')
      .setInputFiles({
        name: 'program.exe',
        mimeType: 'application/octet-stream',
        buffer: Buffer.from('MZ'),
      });
    await expect(
      page.getByText('program.exe is not a PDF, JPG, PNG, HEIC, DOCX or ZIP file.'),
    ).toBeVisible();
  });

  test('deletes a file the patient owns', async ({ page }) => {
    const name = `delete-me-${stamp}.pdf`;
    await openRecords(page);
    await page
      .locator('input[type=file]')
      .setInputFiles({ name, mimeType: 'application/pdf', buffer: await pdfBytes(1) });
    const row = rowOf(page, name);
    await expect(row.getByText('Ready')).toBeVisible({ timeout: 60_000 });
    await row.getByRole('button', { name: `Delete ${name}` }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Delete', exact: true })
      .click();
    await expect(rowOf(page, name)).toHaveCount(0);
  });

  test("only permitted roles can reach a patient's file", async ({ page, browser }) => {
    const name = `private-${stamp}.pdf`;
    await openRecords(page);
    await page
      .locator('input[type=file]')
      .setInputFiles({ name, mimeType: 'application/pdf', buffer: await pdfBytes(1) });
    await expect(rowOf(page, name).getByText('Ready')).toBeVisible({ timeout: 60_000 });
    const mine = await page.request.get(`${API}/documents?limit=50`);
    const id = ((await mine.json()) as { items: { id: string; fileName: string }[] }).items.find(
      (d) => d.fileName === name,
    )?.id;
    expect(id).toBeTruthy();

    // An agent has no access to documents at all, and a case manager who does not own the case does not see this one.
    for (const [role, status] of [
      ['agent', 403],
      ['finance', 403],
      ['case_manager', 404],
      ['hospital_desk', 404],
    ] as const) {
      const context = await browser.newContext();
      const other = await context.newPage();
      await signInAs(other, role);
      const csrf = (await context.cookies()).find((c) => c.name === 'mt_csrf')?.value ?? '';
      const res = await other.request.post(`${API}/documents/${id}/download`, {
        headers: { 'x-csrf-token': csrf },
      });
      expect(res.status(), role).toBe(status);
      await context.close();
    }
  });

  test('reads right to left in Arabic and has no axe violations', async ({ page }) => {
    await signInAs(page, 'patient', 'ar');
    await page.goto('/ar/patient/records');
    await expect(page.getByRole('heading', { level: 1, name: 'السجلات الطبية' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('list', { name: 'ملفاتك' })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });
});
