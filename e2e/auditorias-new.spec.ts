import { expect, test } from '@playwright/test';
import { createSql } from '../src/lib/server/db/client';
import { withDbSuiteLock } from '../tests/helpers/db-lock';
import { loginAsAdmin } from './helpers';

test.describe.configure({ mode: 'serial' });

/**
 * #23 Fase 3 (T12, R27): el form clásico de nueva auditoría crea/lee empresas contra la
 * tabla base `empresa`. Crear una auditoría con cliente nuevo materializa una fila en
 * `empresa` (relacion='prospecto'), vincula la FK `audit.empresa_id` y precarga el CAB.
 */
test.describe('nueva auditoría sobre empresa (form clásico)', () => {
  const sql = createSql(
    process.env.DATABASE_URL ?? 'postgres://auditapp:changeme@localhost:5432/auditapp'
  );

  const cuitDisplay = '30-78000000-3';
  const cuitDigits = '30780000003';
  const razonSocial = 'Empresa E2E Nueva Auditoria SRL';

  async function cleanup(s: typeof sql) {
    // Borrar la cadena dependiente antes de la empresa (FK audit.empresa_id).
    const audits = await s<{ id: string }[]>`
      SELECT a.id FROM audit a
      JOIN empresa e ON e.id = a.empresa_id
      WHERE e.cuit = ${cuitDigits} OR e.cuit = ${cuitDisplay}
    `;
    const auditIds = audits.map((a) => a.id);
    if (auditIds.length > 0) {
      await s`DELETE FROM audit_response WHERE audit_id = ANY(${auditIds})`;
      await s`DELETE FROM audit_closure WHERE audit_id = ANY(${auditIds})`;
      await s`DELETE FROM audit WHERE id = ANY(${auditIds})`;
    }
    await s`DELETE FROM empresa WHERE cuit = ${cuitDigits} OR cuit = ${cuitDisplay}`;
  }

  test.beforeEach(async ({ page }) => {
    await withDbSuiteLock(sql, cleanup);
    await loginAsAdmin(page);
  });

  test.afterAll(async () => {
    await withDbSuiteLock(sql, cleanup);
    await sql.end({ timeout: 5 });
  });

  test('cliente nuevo: crea empresa (relacion=prospecto), vincula FK y precarga CAB (R27)', async ({
    page
  }) => {
    await page.goto('/auditorias/new');
    await expect(page.getByRole('heading', { name: 'Nueva auditoría' })).toBeVisible();

    await page.getByRole('radio', { name: 'Cliente nuevo' }).check();
    await page.locator('input[name="newRazonSocial"]').fill(razonSocial);
    await page.locator('input[name="newCuit"]').fill(cuitDisplay);
    await page.locator('input[name="newRubro"]').fill('Comercio');

    await page.locator('input[name="types"][value="it"]').check();
    await page.locator('select[name="segment"]').selectOption('A');
    await page
      .locator('select[name="assignedTechId"]')
      .selectOption({ index: 1 });
    await page.locator('input[name="scheduledAt"]').fill('2026-09-15');

    await page.getByRole('button', { name: 'Crear auditoría' }).click();
    await page.waitForURL(/\/auditorias\/[0-9a-f-]+$/);

    const auditId = page.url().split('/').pop()!;

    // El CAB precargado muestra la razón social de la empresa.
    await expect(page.getByText(razonSocial).first()).toBeVisible();

    // Verificación en DB: empresa creada en la tabla base con relacion=prospecto y FK válida.
    await withDbSuiteLock(sql, async (s) => {
      const [emp] = await s<
        { id: string; relacion: string; razon_social: string }[]
      >`SELECT id, relacion, razon_social FROM empresa WHERE cuit = ${cuitDisplay}`;
      expect(emp).toBeTruthy();
      expect(emp.relacion).toBe('prospecto');
      expect(emp.razon_social).toBe(razonSocial);

      const [audit] = await s<
        { empresa_id: string }[]
      >`SELECT empresa_id FROM audit WHERE id = ${auditId}`;
      expect(audit.empresa_id).toBe(emp.id);
    });
  });
});
