import { expect, test } from '@playwright/test';
import { loginAsAdmin } from './helpers';

test.describe.configure({ mode: 'serial' });

test.describe('importar clientes (CRM)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/crm');
    await expect(page.getByRole('heading', { name: 'CRM — Leads' })).toBeVisible();
  });

  test('admin ve la acción de importar y el enlace de plantilla (R1, R19)', async ({ page }) => {
    const toggle = page.getByTestId('crm-import-clients-toggle');
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(page.getByTestId('crm-import-clients-panel')).toBeVisible();

    const link = page.getByTestId('crm-import-template-link');
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '/plantillas/clientes-import-template.csv');
  });

  test('subir un CSV muestra el reporte con contadores (R14)', async ({ page }) => {
    await page.getByTestId('crm-import-clients-toggle').click();
    const cuit = `30-72${Date.now().toString().slice(-7)}-1`;
    const csv =
      'razon_social,cuit\n' +
      `E2E Import SA,${cuit}\n` +
      'Sin Cuit SA,\n' +
      ',30-72000000-9\n';

    await page.getByTestId('crm-import-file').setInputFiles({
      name: 'clientes-e2e.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csv, 'utf8')
    });
    await page.getByTestId('crm-import-submit').click();

    const report = page.getByTestId('crm-import-report');
    await expect(report).toBeVisible();
    await expect(page.getByTestId('crm-import-total')).toContainText('3');
    await expect(page.getByTestId('crm-import-skipped')).toContainText('1');
    await expect(page.getByTestId('crm-import-invalid')).toContainText('1');
  });
});
