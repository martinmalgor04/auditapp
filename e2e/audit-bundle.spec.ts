import { expect, test } from '@playwright/test';
import { createSql } from '../src/lib/server/db/client';
import { withDbSuiteLock } from '../tests/helpers/db-lock';
import { ensureE2eBundleAudit } from './ensure-bundle-audit';
import { loginAsAdmin, loginAsTech } from './helpers';

test.describe.configure({ mode: 'serial' });

test.describe('export/import de auditoría (backoffice admin)', () => {
  let auditId = '';

  test.beforeAll(async () => {
    auditId = await ensureE2eBundleAudit();
  });

  test('admin exporta, hace dry-run, confirma y ve la auditoría importada con su status', async ({
    page
  }) => {
    test.setTimeout(120_000);
    await loginAsAdmin(page);
    await page.goto(`/auditorias/${auditId}`);

    // Acciones de bundle visibles para admin.
    const actions = page.getByTestId('audit-bundle-actions');
    await expect(actions).toBeVisible();
    await expect(page.getByTestId('export-bundle-link')).toBeVisible();

    // Exportar: descargar el bundle vía el endpoint y obtener su JSON.
    const bundleJson = await page.evaluate(async (id) => {
      const res = await fetch(`/api/audits/${id}/bundle/export`);
      return res.text();
    }, auditId);
    expect(bundleJson).toContain('bundle_schema_version');

    // Cargar el bundle en el input de import (dispara dry-run automático).
    await page.getByTestId('import-bundle-file').setInputFiles({
      name: 'bundle.json',
      mimeType: 'application/json',
      buffer: Buffer.from(bundleJson)
    });

    const report = page.getByTestId('dry-run-report');
    await expect(report).toBeVisible();

    // Confirmar import (modo permissive).
    await page.getByTestId('confirm-import').click();
    await expect(page.getByTestId('import-success')).toBeVisible({ timeout: 30_000 });

    // La auditoría importada existe en DB con el status original preservado.
    const sql = createSql(
      process.env.DATABASE_URL ?? 'postgres://auditapp:changeme@localhost:5432/auditapp'
    );
    await withDbSuiteLock(sql, async (s) => {
      const rows = await s<{ status: string }[]>`
        SELECT a.status
        FROM audit a JOIN client c ON c.id = a.empresa_id
        WHERE c.cuit = '30-44455566-7' AND a.archived_at IS NULL
      `;
      // Origen + importada comparten el cliente; al menos una en en_relevamiento.
      expect(rows.length).toBeGreaterThanOrEqual(2);
      expect(rows.every((r) => r.status === 'en_relevamiento')).toBe(true);
    });
    await sql.end({ timeout: 5 });
  });

  test('un tecnico no ve las acciones de export/import', async ({ page }) => {
    await loginAsTech(page);
    await page.goto(`/auditorias/${auditId}`);
    await expect(page.getByTestId('audit-bundle-actions')).toHaveCount(0);
  });
});
