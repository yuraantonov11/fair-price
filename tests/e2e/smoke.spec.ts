import { expect, test } from '@playwright/test';

test('playwright smoke check', async ({ page }) => {
  await page.goto('https://example.com');
  await expect(page).toHaveTitle(/Example Domain/);
});

