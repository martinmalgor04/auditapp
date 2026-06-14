import type { Page } from '@playwright/test';

export async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill('admin@serviciosysistemas.com.ar');
  await page.getByLabel('Contraseña').fill('changeme-admin');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.waitForURL('/tablero', { timeout: 30_000 });
}

export async function loginAsTech(page: Page, email = 'facu@serviciosysistemas.com.ar') {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Contraseña').fill('changeme-tech');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.waitForURL('/tablero', { timeout: 30_000 });
}
