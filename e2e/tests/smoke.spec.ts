import { expect, test } from '@playwright/test';

/**
 * Proves the website renders in both languages and that Arabic flips the document
 * direction. Journey tests arrive with the flows they cover.
 */
test('the English home page renders', async ({ page }) => {
  await page.goto('/en');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('the Arabic home page renders right-to-left', async ({ page }) => {
  await page.goto('/ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
});
