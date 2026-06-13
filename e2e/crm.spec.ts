import { expect, test } from '@playwright/test';
import { loginAsAdmin } from './helpers';

test.describe.configure({ mode: 'serial' });

test.describe('crm pipeline', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    const email = `e2e-crm-${Date.now()}@test.local`;
    await page.request.post('/api/crm/leads', {
      data: {
        email,
        empresa: 'E2E Empresa CRM',
        source: 'manual'
      }
    });
    await page.goto('/crm');
    await expect(page.getByRole('heading', { name: 'CRM — Leads' })).toBeVisible();
  });

  test('lista renderiza con contadores del funnel (R10, R11)', async ({ page }) => {
    await expect(page.getByTestId('crm-funnel-counts')).toBeVisible();
    await expect(page.getByTestId('crm-count-lead')).toBeVisible();
    await expect(page.getByTestId('crm-leads-table')).toBeVisible();
    await expect(page.getByText('E2E Empresa CRM')).toBeVisible();
  });

  test('filtro por estado reduce filas (R10)', async ({ page }) => {
    const rowsBefore = await page.getByTestId('crm-lead-row').count();
    expect(rowsBefore).toBeGreaterThan(0);
    await page.getByTestId('crm-filter-status').selectOption('cliente');
    await page.getByTestId('crm-filters').getByRole('button', { name: 'Filtrar' }).click();
    await page.waitForURL(/status=cliente/);
    await expect(page.getByTestId('crm-lead-row')).toHaveCount(0);
  });

  test('avanzar lead desde UI refleja nuevo estado (R12)', async ({ page }) => {
    await page.getByTestId('crm-filter-status').selectOption('lead');
    await page.getByTestId('crm-filters').getByRole('button', { name: 'Filtrar' }).click();
    await page.waitForURL(/status=lead/);
    const row = page.getByTestId('crm-lead-row').first();
    await row.getByTestId('crm-lead-expand').click();
    const select = page.getByTestId('crm-status-select').first();
    await select.selectOption({ label: 'Contactado' });
    await page.waitForTimeout(800);
    await page.goto('/crm?status=contactado');
    await expect(page.getByText('E2E Empresa CRM')).toBeVisible();
  });
});
