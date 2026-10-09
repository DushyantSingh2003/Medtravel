import { defineConfig, devices } from '@playwright/test';

const webBaseUrl = process.env['WEB_BASE_URL'] ?? 'http://localhost:3000';

/** Point at an existing Chromium (CI image, sandbox) instead of Playwright's own download. */
const executablePath = process.env['CHROMIUM_PATH'];

/**
 * End-to-end tests run against already-running apps (locally `pnpm dev`, in CI the built
 * apps started by the workflow), so this config does not spawn servers itself.
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
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Arabic is right-to-left; running the suite in both directions catches layout bugs.
    { name: 'chromium-rtl', use: { ...devices['Desktop Chrome'], locale: 'ar' } },
  ],
});
