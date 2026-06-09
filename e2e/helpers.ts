import type { Page } from '@playwright/test';

export async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill('admin@serviciosysistemas.com.ar');
  await page.getByLabel('Contraseña').fill('changeme-admin');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.waitForURL('/tablero');
}
