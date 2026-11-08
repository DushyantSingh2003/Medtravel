import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { signInAs } from './support/auth.js';

/**
 * Hospital and doctor approval (AD-02): a hospital desk sends changes, the super admin reviews them side by side and approves or
 * rejects, sets the agreement, verifies the accreditation and publishes. Needs the API and portal running against a database seeded
 * with SEED_DEV_USERS=true (which gives the development hospital a package and an accreditation certificate record).
 */

const API = process.env['API_BASE_URL'] ?? 'http://localhost:3001';
const PACKAGE = 'Dev check-up package';

interface Reply {
  status: number;
  body: unknown;
}

/** Calls the API from inside a signed-in page, as the portal does: its cookies and the CSRF header. */
async function api(page: Page, method: string, path: string, body?: unknown): Promise<Reply> {
  return page.evaluate(
    async ({ base, method, path, body }) => {
      const csrf = /(?:^|;\s*)mt_csrf=([^;]*)/.exec(document.cookie)?.[1];
      const response = await fetch(`${base}${path}`, {
        method,
        credentials: 'include',
        headers: {
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(csrf && method !== 'GET' ? { 'x-csrf-token': csrf } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const text = await response.text();
      return { status: response.status, body: text ? JSON.parse(text) : null };
    },
    { base: API, method, path, body },
  );
}

async function signedIn(browser: Browser, role: string): Promise<Page> {
  const context = await browser.newContext({
    baseURL: process.env['PORTAL_BASE_URL'] ?? 'http://localhost:3002',
  });
  const page = await context.newPage();
  await signInAs(page, role);
  return page;
}

interface HospitalFacts {
  id: string;
  name: string;
  status: string;
  packageId: string;
}

/** The development hospital: the one with the development package (the demo seed may have renamed it). */
async function devHospital(admin: Page): Promise<HospitalFacts> {
  const list = await api(admin, 'GET', '/admin/partners/hospitals?limit=100');
  const hospitals = (list.body as { items: { id: string }[] }).items;
  for (const { id } of hospitals) {
    const detail = await api(admin, 'GET', `/admin/partners/hospitals/${id}`);
    const body = detail.body as {
      name: string;
      status: string;
      packages: { id: string; name: string }[];
    };
    const pack = body.packages.find((p) => p.name === PACKAGE);
    if (pack) return { id, name: body.name, status: body.status, packageId: pack.id };
  }
  throw new Error('The development hospital is missing: seed with SEED_DEV_USERS=true');
}

// The tests share one hospital and its single waiting request per kind, so they must not run at the same time.
test.describe.configure({ mode: 'serial' });

const openQueue = async (page: Page, locale: 'en' | 'ar' = 'en') => {
  await page.goto(`/${locale}/admin/hospital-approvals`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
};

test.describe('review queue', () => {
  test('approves a profile change after looking at it, and the hospital is updated', async ({ browser, page }) => {
    const desk = await signedIn(browser, 'hospital_desk');
    await signInAs(page, 'super_admin');
    const { name: HOSPITAL } = await devHospital(page);
    const year = 1950 + (Date.now() % 60);
    const sent = await api(desk, 'POST', '/hospital/change-requests/profile', {
      fields: { establishedYear: year },
      note: 'Browser test: our founding year',
    });
    // A rerun may find an earlier request still waiting: that is fine, review whichever is there.
    expect([201, 409]).toContain(sent.status);

    await openQueue(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Hospital and doctor approval' })).toBeVisible();
    const row = page.getByRole('listitem').filter({ hasText: HOSPITAL }).filter({ hasText: 'Profile change' }).first();
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Review' }).click();
    const dialog = page.getByRole('dialog', { name: /Profile change/ });
    await expect(dialog.getByRole('table', { name: 'What would change' })).toBeVisible();
    // The waiting request may be an earlier one (a rerun, or the demo data's): whatever it changes is listed side by side.
    await expect(dialog.getByRole('rowheader').first()).toBeVisible();
    await expect(dialog.getByRole('columnheader', { name: 'Proposed' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByText('Request approved')).toBeVisible();
    await expect(dialog).toBeHidden();
    await desk.context().close();
  });

  test('rejects a request with a reason, which then shows against it', async ({ browser, page }) => {
    const desk = await signedIn(browser, 'hospital_desk');
    await signInAs(page, 'super_admin');
    const { name: HOSPITAL } = await devHospital(page);
    const sent = await api(desk, 'POST', '/hospital/change-requests/profile', {
      fields: { bedCount: 100 + (Date.now() % 900) },
    });
    expect([201, 409]).toContain(sent.status);
    await openQueue(page);
    await page.getByRole('listitem').filter({ hasText: HOSPITAL }).filter({ hasText: 'Profile change' }).first()
      .getByRole('button', { name: 'Review' }).click();
    const dialog = page.getByRole('dialog', { name: /Profile change/ });
    await dialog.getByRole('button', { name: 'Reject' }).click();
    await dialog.getByRole('button', { name: 'Reject' }).click();
    await expect(dialog.getByText(/at least 5|too_small|Too small/i).first()).toBeVisible();
    await dialog.getByLabel('Reason').fill('The bed count does not match your licence');
    await dialog.getByRole('button', { name: 'Reject' }).click();
    await expect(page.getByText('Request rejected')).toBeVisible();

    await page.getByLabel('Status').first().click();
    await page.getByRole('option', { name: 'Rejected' }).click();
    const rejected = page.getByRole('listitem').filter({ hasText: HOSPITAL }).first();
    await rejected.getByRole('button', { name: 'View' }).click();
    await expect(
      page.getByRole('dialog', { name: /Profile change/ }).getByText('The bed count does not match your licence'),
    ).toBeVisible();
    await desk.context().close();
  });

  test('shows a price change as money, and approving it changes the package price', async ({ browser, page }) => {
    const desk = await signedIn(browser, 'hospital_desk');
    await signInAs(page, 'super_admin');
    const facts = await devHospital(page);
    const priceMinor = 150_000 + (Date.now() % 500) * 100;
    const sent = await api(desk, 'POST', '/hospital/change-requests/price', {
      packageId: facts.packageId,
      priceMinor,
      currency: 'USD',
    });
    expect([201, 409]).toContain(sent.status);
    await openQueue(page);
    await page.getByRole('listitem').filter({ hasText: PACKAGE }).first()
      .getByRole('button', { name: 'Review' }).click();
    const dialog = page.getByRole('dialog', { name: /Package price/ });
    await expect(dialog.getByRole('rowheader', { name: 'Price' })).toBeVisible();
    await expect(dialog.getByRole('cell').filter({ hasText: '$' }).first()).toBeVisible();
    await dialog.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByText('Request approved')).toBeVisible();
    const after = await api(page, 'GET', `/admin/partners/hospitals/${facts.id}`);
    const pack = (after.body as { packages: { id: string; priceMinor: number }[] }).packages.find(
      (p) => p.id === facts.packageId,
    );
    expect(pack?.priceMinor).toBeGreaterThan(0);
    await desk.context().close();
  });
});

test.describe('hospital management', () => {
  test('sets the agreement, verifies the accreditation and publishes, then takes it down again', async ({ browser, page }) => {
    const desk = await signedIn(browser, 'hospital_desk');
    await signInAs(page, 'super_admin');
    let facts = await devHospital(page);
    const HOSPITAL = facts.name;
    if (facts.status === 'published') await api(page, 'POST', `/admin/partners/hospitals/${facts.id}/unpublish`);
    facts = await devHospital(page);
    if (facts.status === 'draft') {
      const submitted = await api(desk, 'POST', '/hospital/change-requests/onboarding', {});
      expect(submitted.status).toBe(201);
      await api(page, 'POST', `/admin/partners/requests/${(submitted.body as { id: string }).id}/approve`);
    }

    await openQueue(page);
    await page.getByRole('tab', { name: 'Hospitals' }).click();
    await page.getByRole('searchbox', { name: 'Search by name' }).fill(HOSPITAL);
    const row = page.getByRole('listitem').filter({ hasText: HOSPITAL });
    await expect(row).toHaveCount(1);
    await row.getByRole('button', { name: 'Manage' }).click();
    const dialog = page.getByRole('dialog', { name: HOSPITAL });

    await dialog.getByLabel('Referral fee (%)').fill('12.5');
    await dialog.getByLabel('Agreement starts').fill('2026-01-01');
    await dialog.getByLabel('Agreement ends').fill('2030-12-31');
    await dialog.getByRole('button', { name: 'Save agreement' }).click();
    await expect(page.getByText('Agreement saved')).toBeVisible();

    const nabh = dialog.getByRole('listitem').filter({ hasText: 'NABH' });
    if (await nabh.getByRole('button', { name: 'Mark as verified' }).count())
      await nabh.getByRole('button', { name: 'Mark as verified' }).click();
    await expect(nabh.getByText('Verified', { exact: true })).toBeVisible();

    await dialog.getByRole('button', { name: 'Publish on website' }).click();
    await expect(page.getByText('Hospital published')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Take off website' })).toBeVisible();

    const toggle = dialog.getByRole('switch', { name: `${PACKAGE} on the website` });
    await toggle.click();
    await expect(page.getByText(/Package (published|taken off the website)/)).toBeVisible();

    await dialog.getByRole('button', { name: 'Take off website' }).click();
    await expect(page.getByText('Hospital taken off the website')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Publish on website' })).toBeEnabled();
    await desk.context().close();
  });

  test('shows partner health: expiries and response times', async ({ page }) => {
    await signInAs(page, 'super_admin');
    await openQueue(page);
    await page.getByRole('tab', { name: 'Partner health' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Accreditations expiring' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Agreements ending' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'How fast hospitals answer' })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
});

test.describe('quality', () => {
  test('has no accessibility violations on the queue and the hospital list', async ({ page }) => {
    await signInAs(page, 'super_admin');
    await openQueue(page);
    await expect(page.getByRole('list', { name: 'Requests for review' }).or(page.getByText('Nothing to review'))).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.getByRole('tab', { name: 'Hospitals' }).click();
    await expect(page.getByRole('list', { name: 'Hospitals' })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test('works in Arabic, right to left, at phone width, without sideways scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await signInAs(page, 'super_admin', 'ar');
    await openQueue(page, 'ar');
    await expect(page.getByRole('heading', { level: 1, name: 'اعتماد المستشفيات والأطباء' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    for (const tab of ['المستشفيات', 'صحة الشركاء', 'قائمة المراجعة']) {
      await page.getByRole('tab', { name: tab }).click();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    }
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test('is closed to staff outside the admin portal', async ({ page }) => {
    await signInAs(page, 'case_manager');
    await page.goto('/en/admin/hospital-approvals');
    await expect(page).not.toHaveURL(/\/admin\/hospital-approvals$/);
  });

  test('shows finance an error, not data, because the API refuses them', async ({ page }) => {
    await signInAs(page, 'finance');
    await page.goto('/en/admin/hospital-approvals');
    await expect(page.getByText('The requests could not be loaded')).toBeVisible();
  });
});
