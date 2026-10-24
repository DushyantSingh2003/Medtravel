import { defineConfig, devices } from '@playwright/test';

const webBaseUrl = process.env['WEB_BASE_URL'] ?? 'http://localhost:3000';
const portalBaseUrl = process.env['PORTAL_BASE_URL'] ?? 'http://localhost:3002';

/** Point at an existing Chromium (CI image, sandbox) instead of Playwright's own download. */
const executablePath = process.env['CHROMIUM_PATH'];
const launchOptions = executablePath ? { launchOptions: { executablePath } } : {};

/**
 * End-to-end tests run against already-running apps (locally `pnpm dev`, in CI the built
 * apps started by the workflow), so this config does not spawn servers itself.
 *
 * The portal must be started with ENABLE_UI_GALLERY=true for the component gallery tests. The portal tests sign in
 * for real, so the API must be running too, on a database seeded with SEED_DEV_USERS=true SEED_DEV_2FA=true. The website must have been built with
 * NEXT_PUBLIC_WHATSAPP_NUMBER set (any digits), because the floating WhatsApp button only exists then.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 2 : 0,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: webBaseUrl,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    ...launchOptions,
  },
  projects: [
    { name: 'chromium', testIgnore: /ui-gallery|portal-/, use: { ...devices['Desktop Chrome'] } },
    // Arabic is right-to-left; running the suite in both directions catches layout bugs.
    { name: 'chromium-rtl', testIgnore: /ui-gallery|portal-/, use: { ...devices['Desktop Chrome'], locale: 'ar' } },
    // The gallery tests choose their own language and viewport, so one browser project is enough.
    { name: 'gallery', testMatch: /ui-gallery/, use: { ...devices['Desktop Chrome'], baseURL: portalBaseUrl } },
    // The portal shell tests sign in through the API (see the header above).
    { name: 'portal', testMatch: /portal-/, use: { ...devices['Desktop Chrome'], baseURL: portalBaseUrl } },
  ],
});
