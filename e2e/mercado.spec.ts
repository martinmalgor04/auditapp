import { expect, test } from '@playwright/test';
import { ensureMercadoE2eData } from './ensure-mercado';
import { loginAsAdmin, loginAsTech } from './helpers';

test.describe.configure({ mode: 'serial' });

test.describe('dashboard mercado', () => {
  test.beforeAll(async () => {
    await ensureMercadoE2eData();
  });

  test('admin ve secciones del dashboard con data (R1, R15)', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/mercado');
    await expect(page.getByRole('heading', { name: 'Estudio de mercado NEA' })).toBeVisible();
    await expect(page.getByTestId('mercado-section-erp')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('mercado-section-modulos')).toBeVisible();
    await expect(page.getByTestId('mercado-section-semaforos')).toBeVisible();
    await expect(page.getByTestId('mercado-section-trend')).toBeVisible();
    await expect(page.getByTestId('mercado-section-upsell')).toBeVisible();
  });

  test('técnico no ve link Mercado y recibe 403 (R1)', async ({ page }) => {
    await page.context().clearCookies();
    await loginAsTech(page);
    await expect(page.getByRole('link', { name: 'Mercado' })).toHaveCount(0);
    await page.goto('/mercado');
    await expect(page.getByText(/403|No tenés permiso/i)).toBeVisible();
  });

  test('filtro sin resultados muestra estado vacío (R13)', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/mercado?rubro=RubroInexistenteE2E');
    await expect(page.getByTestId('mercado-empty-state')).toBeVisible();
    await expect(page.getByText('No hay auditorías cerradas para estos filtros')).toBeVisible();
  });
});
