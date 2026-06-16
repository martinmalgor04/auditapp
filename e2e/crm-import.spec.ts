import { expect, test } from '@playwright/test';
import { createSql } from '../src/lib/server/db/client';
import { withDbSuiteLock } from '../tests/helpers/db-lock';
import { loginAsAdmin } from './helpers';

test.describe.configure({ mode: 'serial' });

/**
 * #23 Fase 2 (T8b, R31): el selector de `relacion` está en la UI de import masivo; importar con
 * `prospecto` deja las empresas nuevas como `prospecto`, con `cliente` como `cliente`. La relación
 * la define el selector, NO el origen del archivo.
 */
test.describe('importar empresas con selector de relación (CRM)', () => {
  const sql = createSql(
    process.env.DATABASE_URL ?? 'postgres://auditapp:changeme@localhost:5432/auditapp'
  );

  // CUITs aislados del seed para no chocar con datos reales.
  const cuitCliente = '30-79000000-1';
  const cuitProspecto = '30-79000000-2';
  const cuitClienteDigits = '30790000001';
  const cuitProspectoDigits = '30790000002';

  test.beforeEach(async ({ page }) => {
    await withDbSuiteLock(sql, async (s) => {
      await s`DELETE FROM empresa WHERE cuit IN (${cuitClienteDigits}, ${cuitProspectoDigits})`;
    });
    await loginAsAdmin(page);
    await page.goto('/crm');
    await expect(page.getByRole('heading', { name: 'CRM — Empresas' })).toBeVisible();
  });

  test.afterAll(async () => {
    await withDbSuiteLock(sql, async (s) => {
      await s`DELETE FROM empresa WHERE cuit IN (${cuitClienteDigits}, ${cuitProspectoDigits})`;
    });
    await sql.end({ timeout: 5 });
  });

  test('el selector de relación está visible en el panel de import (R31)', async ({ page }) => {
    await page.getByTestId('crm-import-clients-toggle').click();
    await expect(page.getByTestId('crm-import-clients-panel')).toBeVisible();
    const selector = page.getByTestId('crm-import-relacion');
    await expect(selector).toBeVisible();
    // Opciones esperadas: cliente | prospecto.
    await expect(selector.locator('option')).toHaveCount(2);
  });

  test('importar con prospecto deja las empresas nuevas como prospecto (R31)', async ({ page }) => {
    await page.getByTestId('crm-import-clients-toggle').click();
    await page.getByTestId('crm-import-relacion').selectOption('prospecto');

    const csv = `razon_social,cuit\nProspecto E2E SA,${cuitProspecto}\n`;
    await page.getByTestId('crm-import-file').setInputFiles({
      name: 'prospecto-e2e.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csv, 'utf8')
    });
    await page.getByTestId('crm-import-submit').click();
    await expect(page.getByTestId('crm-import-report')).toBeVisible();
    await expect(page.getByTestId('crm-import-created')).toContainText('1');

    await withDbSuiteLock(sql, async (s) => {
      const [row] = await s<{ relacion: string }[]>`
        SELECT relacion FROM empresa WHERE cuit = ${cuitProspectoDigits}
      `;
      expect(row.relacion).toBe('prospecto');
    });
  });

  test('importar con cliente deja las empresas nuevas como cliente (R31)', async ({ page }) => {
    await page.getByTestId('crm-import-clients-toggle').click();
    await page.getByTestId('crm-import-relacion').selectOption('cliente');

    const csv = `razon_social,cuit\nCliente E2E SA,${cuitCliente}\n`;
    await page.getByTestId('crm-import-file').setInputFiles({
      name: 'cliente-e2e.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csv, 'utf8')
    });
    await page.getByTestId('crm-import-submit').click();
    await expect(page.getByTestId('crm-import-report')).toBeVisible();
    await expect(page.getByTestId('crm-import-created')).toContainText('1');

    await withDbSuiteLock(sql, async (s) => {
      const [row] = await s<{ relacion: string }[]>`
        SELECT relacion FROM empresa WHERE cuit = ${cuitClienteDigits}
      `;
      expect(row.relacion).toBe('cliente');
    });
  });
});
