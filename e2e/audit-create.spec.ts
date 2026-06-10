import { expect, test } from '@playwright/test';
import { loginAsAdmin } from './helpers';

test('nueva auditoría: busca cliente seed, precarga CAB y crea borrador', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/auditorias/new');
  await expect(page.getByRole('heading', { name: 'Nueva auditoría' })).toBeVisible();

  const search = page.getByRole('combobox', { name: 'Buscar cliente' });
  await search.fill('plastipress');
  await expect(page.getByRole('option', { name: /PLASTIPRESS/i })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('option', { name: /PLASTIPRESS/i }).click();

  const cabFieldset = page.getByRole('group', { name: 'Cabecera (CAB)' });
  await expect(cabFieldset).toBeVisible();
  await expect(cabFieldset.locator('input[name^="cab_"]').first()).not.toHaveValue('');

  await page.locator('input[name="scheduledAt"]').fill('2026-09-15');
  await page.getByRole('button', { name: 'Crear auditoría' }).click();

  await expect(page).toHaveURL(/\/auditorias\/[0-9a-f-]+$/);
  await expect(page.getByText(/PLASTIPRESS/i)).toBeVisible();
});
