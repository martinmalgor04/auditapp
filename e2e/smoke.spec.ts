import { expect, test } from '@playwright/test';

test('login page loads', async ({ page }) => {
  const response = await page.goto('/login');
  expect(response?.status()).toBe(200);
  await expect(page.locator('h1')).toHaveText('Ingresar');
});
