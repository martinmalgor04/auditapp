import { expect, test } from '@playwright/test';
import { createSql } from '../src/lib/server/db/client';
import { withDbSuiteLock } from '../tests/helpers/db-lock';
import { loginAsAdmin } from './helpers';

test.describe.configure({ mode: 'serial' });

/**
 * #23 Fase 4 (T19, R16/R18): cockpit `/crm`. Verifica filtros (relacion, estado, búsqueda) y
 * paginación server-side sobre el dataset grande (el seed real tiene ~2000 empresas). Inserta
 * fixtures deterministas (una de cada relación) para que los filtros sean verificables sin
 * depender del estado del seed.
 */
test.describe('cockpit de empresas (CRM)', () => {
  const sql = createSql(
    process.env.DATABASE_URL ?? 'postgres://auditapp:changeme@localhost:5432/auditapp'
  );

  const cuitCliente = '30960000001';
  const cuitProspecto = '30960000002';
  const cuitExCliente = '30960000003';
  const RAZON_CLIENTE = 'COCKPIT E2E Cliente SA';
  const RAZON_PROSPECTO = 'COCKPIT E2E Prospecto SRL';
  const RAZON_EXCLIENTE = 'COCKPIT E2E ExCliente SA';

  test.beforeAll(async () => {
    await withDbSuiteLock(sql, async (s) => {
      await s`DELETE FROM empresa WHERE cuit IN (${cuitCliente}, ${cuitProspecto}, ${cuitExCliente})`;
      await s`
        INSERT INTO empresa (razon_social, cuit, relacion, rubro, provincia, origen)
        VALUES
          (${RAZON_CLIENTE}, ${cuitCliente}, 'cliente', 'Industria', 'CHACO', 'presupuestos'),
          (${RAZON_PROSPECTO}, ${cuitProspecto}, 'prospecto', 'Comercio', 'CORRIENTES', 'prospecto'),
          (${RAZON_EXCLIENTE}, ${cuitExCliente}, 'ex_cliente', 'Servicios', 'MISIONES', 'presupuestos')
      `;
    });
  });

  test.afterAll(async () => {
    await withDbSuiteLock(sql, async (s) => {
      await s`DELETE FROM empresa WHERE cuit IN (${cuitCliente}, ${cuitProspecto}, ${cuitExCliente})`;
    });
    await sql.end({ timeout: 5 });
  });

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/crm');
    await expect(page.getByRole('heading', { name: 'CRM — Empresas' })).toBeVisible();
  });

  test('lista y pagina el dataset grande (R18)', async ({ page }) => {
    // El cockpit no carga las ~2000 fichas: pagina server-side (50 por página por defecto).
    await expect(page.getByTestId('crm-empresas-table')).toBeVisible();
    const rows = await page.getByTestId('crm-empresa-row').count();
    expect(rows).toBeGreaterThan(0);
    expect(rows).toBeLessThanOrEqual(50);

    // El total global supera holgadamente una página → hay más de una página.
    await expect(page.getByTestId('crm-page-indicator')).toContainText('Página 1 de');
    const indicator = await page.getByTestId('crm-page-indicator').textContent();
    const totalPages = Number(indicator?.match(/de (\d+)/)?.[1] ?? '0');
    expect(totalPages).toBeGreaterThan(1);

    // Avanzar a la página 2 cambia la URL y mantiene a lo sumo 50 filas.
    await page.getByTestId('crm-page-next').click();
    await page.waitForURL(/page=2/);
    await expect(page.getByTestId('crm-page-indicator')).toContainText('Página 2 de');
    const rows2 = await page.getByTestId('crm-empresa-row').count();
    expect(rows2).toBeGreaterThan(0);
    expect(rows2).toBeLessThanOrEqual(50);
  });

  test('búsqueda por razón social filtra (R17)', async ({ page }) => {
    await page.getByTestId('crm-filter-q').fill('COCKPIT E2E Cliente');
    await page.getByTestId('crm-filters').getByRole('button', { name: 'Filtrar' }).click();
    await page.waitForURL(/q=/);
    await expect(page.getByText(RAZON_CLIENTE)).toBeVisible();
    await expect(page.getByTestId('crm-empresa-row')).toHaveCount(1);
  });

  test('filtro por relación reduce a una relación (R16)', async ({ page }) => {
    await page.getByTestId('crm-filter-q').fill('COCKPIT E2E');
    await page.getByTestId('crm-filter-relacion').selectOption('cliente');
    await page.getByTestId('crm-filters').getByRole('button', { name: 'Filtrar' }).click();
    await page.waitForURL(/relacion=cliente/);
    // Solo la empresa cliente del fixture (las otras dos son prospecto / ex_cliente).
    await expect(page.getByText(RAZON_CLIENTE)).toBeVisible();
    await expect(page.getByText(RAZON_PROSPECTO)).toHaveCount(0);
    const badges = page.getByTestId('crm-empresa-relacion');
    const n = await badges.count();
    for (let i = 0; i < n; i++) {
      await expect(badges.nth(i)).toHaveText('Cliente');
    }
  });

  test('filtro por estado efectivo (R16): ex_cliente → inactiva', async ({ page }) => {
    await page.getByTestId('crm-filter-q').fill('COCKPIT E2E');
    await page.getByTestId('crm-filter-estado').selectOption('inactiva');
    await page.getByTestId('crm-filters').getByRole('button', { name: 'Filtrar' }).click();
    await page.waitForURL(/estado=inactiva/);
    // El ex_cliente del fixture deriva 'inactiva'; el prospecto deriva 'sin_contactar' y no aparece.
    await expect(page.getByText(RAZON_EXCLIENTE)).toBeVisible();
    await expect(page.getByText(RAZON_PROSPECTO)).toHaveCount(0);
  });

  test('abrir la ficha desde el listado (R19)', async ({ page }) => {
    await page.getByTestId('crm-filter-q').fill('COCKPIT E2E Prospecto');
    await page.getByTestId('crm-filters').getByRole('button', { name: 'Filtrar' }).click();
    await page.waitForURL(/q=/);
    await page.getByTestId('crm-empresa-link').first().click();
    await page.waitForURL(/\/crm\/[0-9a-f-]+$/);
    await expect(page.getByTestId('ficha-razon-social')).toHaveText(RAZON_PROSPECTO);
    await expect(page.getByTestId('ficha-relacion-badge')).toHaveText('Prospecto');
  });

  test('editar relación y rubro desde la ficha persiste (R19)', async ({ page }) => {
    await page.goto('/crm?q=COCKPIT+E2E+Cliente');
    await page.getByTestId('crm-empresa-link').first().click();
    await page.waitForURL(/\/crm\/[0-9a-f-]+$/);

    await page.getByTestId('ficha-field-rubro').fill('Industria Editada E2E');
    await page.getByTestId('ficha-relacion').selectOption('prospecto');
    await page.getByTestId('ficha-save').click();
    await expect(page.getByTestId('ficha-save-ok')).toBeVisible();

    // Persistió en DB.
    await withDbSuiteLock(sql, async (s) => {
      const [row] = await s<{ relacion: string; rubro: string }[]>`
        SELECT relacion, rubro FROM empresa WHERE cuit = ${cuitCliente}
      `;
      expect(row.relacion).toBe('prospecto');
      expect(row.rubro).toBe('Industria Editada E2E');
    });

    // Restaurar para idempotencia entre corridas.
    await withDbSuiteLock(sql, async (s) => {
      await s`UPDATE empresa SET relacion = 'cliente', rubro = 'Industria' WHERE cuit = ${cuitCliente}`;
    });
  });
});
