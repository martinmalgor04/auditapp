import { expect, test } from '@playwright/test';
import { createSql } from '../src/lib/server/db/client';
import { withDbSuiteLock } from '../tests/helpers/db-lock';
import { loginAsAdmin } from './helpers';

test.describe.configure({ mode: 'serial' });

/**
 * #23 Fase 5 (T25, R20/R21/R22/R23): ficha de empresa.
 *
 * Verifica el flujo completo en la ficha `/crm/[id]`:
 *  - Ver el estado efectivo + origen (derivado / override).
 *  - Registrar un evento → aparece en el timeline.
 *  - Setear un override (gana sobre el derivado) y limpiarlo (vuelve al derivado).
 *  - Crear una auditoría desde la ficha: CAB precargado, FK vinculada a la empresa.
 */
test.describe('ficha de empresa (CRM)', () => {
  const sql = createSql(
    process.env.DATABASE_URL ?? 'postgres://auditapp:changeme@localhost:5432/auditapp'
  );

  const cuit = '30930000001';
  const razonSocial = 'FICHA E2E Empresa SA';
  let empresaId: string;

  async function cleanup(s: typeof sql) {
    const audits = await s<{ id: string }[]>`
      SELECT a.id FROM audit a
      JOIN empresa e ON e.id = a.empresa_id
      WHERE e.cuit = ${cuit}
    `;
    const auditIds = audits.map((a) => a.id);
    if (auditIds.length > 0) {
      await s`DELETE FROM audit_response WHERE audit_id = ANY(${auditIds})`;
      await s`DELETE FROM audit_closure WHERE audit_id = ANY(${auditIds})`;
      await s`DELETE FROM audit WHERE id = ANY(${auditIds})`;
    }
    await s`DELETE FROM empresa WHERE cuit = ${cuit}`;
  }

  test.beforeEach(async ({ page }) => {
    await withDbSuiteLock(sql, async (s) => {
      await cleanup(s);
      const [row] = await s<{ id: string }[]>`
        INSERT INTO empresa (razon_social, cuit, relacion, rubro, provincia, origen)
        VALUES (${razonSocial}, ${cuit}, 'prospecto', 'Comercio', 'CHACO', 'prospecto')
        RETURNING id
      `;
      empresaId = row.id;
    });
    await loginAsAdmin(page);
    await page.goto(`/crm/${empresaId}`);
    await expect(page.getByTestId('ficha-razon-social')).toHaveText(razonSocial);
  });

  test.afterAll(async () => {
    await withDbSuiteLock(sql, cleanup);
    await sql.end({ timeout: 5 });
  });

  test('muestra el estado efectivo derivado y su origen (R20)', async ({ page }) => {
    // Prospecto sin actividad → sin_contactar, derivado automáticamente.
    await expect(page.getByTestId('ficha-estado-badge')).toContainText('Sin contactar');
    await expect(page.getByTestId('ficha-estado-source')).toContainText('Derivado');
  });

  test('registrar un evento lo agrega al timeline (R22)', async ({ page }) => {
    await page.getByTestId('ficha-evento-tipo').selectOption('llamada');
    await page.getByTestId('ficha-evento-texto').fill('Llamada de seguimiento E2E');
    await page.getByTestId('ficha-evento-save').click();

    const item = page.getByTestId('ficha-timeline-item').filter({ hasText: 'Llamada de seguimiento E2E' });
    await expect(item).toBeVisible();

    // El evento de contacto cambia el estado derivado: al recargar la ficha (el load vuelve a
    // derivar el estado en SQL), pasa de sin_contactar a contactada.
    await page.reload();
    await expect(page.getByTestId('ficha-estado-badge')).toContainText('Contactada');
    await expect(page.getByTestId('ficha-estado-source')).toContainText('Derivado');
  });

  test('setear y limpiar override: el override gana, luego vuelve al derivado (R23)', async ({ page }) => {
    // Setear override → presupuestada.
    await page.getByTestId('ficha-override-select').selectOption('presupuestada');
    await page.getByTestId('ficha-override-save').click();
    await expect(page.getByTestId('ficha-estado-badge')).toContainText('Presupuestada');
    await expect(page.getByTestId('ficha-estado-source')).toContainText('Fijado manualmente');

    // Se registró un evento cambio_estado en el timeline.
    await expect(
      page.getByTestId('ficha-timeline-item').filter({ hasText: 'Presupuestada' }).first()
    ).toBeVisible();

    // Verificación en DB: estado_override persistido.
    await withDbSuiteLock(sql, async (s) => {
      const [emp] = await s<{ estado_override: string | null }[]>`
        SELECT estado_override FROM empresa WHERE id = ${empresaId}
      `;
      expect(emp.estado_override).toBe('presupuestada');
    });

    // Limpiar override → vuelve al derivado (sin_contactar).
    await page.getByTestId('ficha-override-clear').click();
    await expect(page.getByTestId('ficha-estado-badge')).toContainText('Sin contactar');
    await expect(page.getByTestId('ficha-estado-source')).toContainText('Derivado');

    await withDbSuiteLock(sql, async (s) => {
      const [emp] = await s<{ estado_override: string | null }[]>`
        SELECT estado_override FROM empresa WHERE id = ${empresaId}
      `;
      expect(emp.estado_override).toBeNull();
    });
  });

  test('crear auditoría desde la ficha: CAB precargado y FK a la empresa (R21)', async ({ page }) => {
    await page.getByTestId('ficha-crear-auditoria').click();
    await page.waitForURL(new RegExp(`/auditorias/new\\?empresaId=${empresaId}`));
    await expect(page.getByRole('heading', { name: 'Nueva auditoría' })).toBeVisible();

    // El picker viene precargado con la empresa (modo "existente": el buscador trae la razón social).
    await expect(page.locator('input[type="search"]')).toHaveValue(razonSocial);

    await page.locator('input[name="types"][value="it"]').check();
    await page.locator('select[name="segment"]').selectOption('A');
    await page.locator('select[name="assignedTechId"]').selectOption({ index: 1 });
    await page.locator('input[name="scheduledAt"]').fill('2026-10-01');

    await page.getByRole('button', { name: 'Crear auditoría' }).click();
    await page.waitForURL(/\/auditorias\/[0-9a-f-]+$/);
    const auditId = page.url().split('/').pop()!;

    // La auditoría quedó vinculada a la MISMA empresa (no creó una nueva).
    await withDbSuiteLock(sql, async (s) => {
      const [audit] = await s<{ empresa_id: string }[]>`
        SELECT empresa_id FROM audit WHERE id = ${auditId}
      `;
      expect(audit.empresa_id).toBe(empresaId);

      const [{ count }] = await s<{ count: string }[]>`
        SELECT count(*)::text AS count FROM empresa WHERE cuit = ${cuit}
      `;
      expect(count).toBe('1');
    });
  });
});
