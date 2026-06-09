import type { Page } from '@playwright/test';

export async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.fill('input[name="email"]', 'admin@serviciosysistemas.com.ar');
  await page.fill('input[name="password"]', 'changeme-admin');
  await page.click('button[type="submit"]');
  await page.waitForURL('/tablero');
}
