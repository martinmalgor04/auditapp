import { expect, test } from '@playwright/test';
import { createSql } from '../src/lib/server/db/client';
import { runMigrations } from '../src/lib/server/db/migrate';
import { runSeed } from '../src/lib/server/db/seed';
import { withDbSuiteLock } from '../tests/helpers/db-lock';
import { AUDIT_SCENARIOS } from './fixtures/audit-scenarios';
import { login, runFullAuditFlow } from './helpers/audit-flow';

// R15, R27, R29, R30, R31 — flujo feliz con Claude mockeado (INFORME_FAKE=1 en webServer).
test.describe.configure({ mode: 'serial' });
test.describe('informe IA', () => {
  test.beforeAll(async () => {
    const sql = createSql(
      process.env.DATABASE_URL ?? 'postgres://auditapp:changeme@localhost:5432/auditapp'
    );
    await withDbSuiteLock(sql, async (s) => {
      await runMigrations(s);
      await runSeed(s);
    });
    await sql.end({ timeout: 5 });
  });

  test('generar → borrador → editar → edición inline → aprobar → imprimir', async ({ page }) => {
    test.setTimeout(300_000);
    const scenario = AUDIT_SCENARIOS.find((s) => s.types.includes('erp-tango'))!;
    const suffix = `E2E-INF-${Date.now()}`;

    const auditId = await runFullAuditFlow(page, scenario, suffix);

    // Detalle de auditoría cerrada: listado y CTA (R27)
    await login(page, 'admin@serviciosysistemas.com.ar', 'changeme-admin');
    await page.goto(`/auditorias/${auditId}`);
    const informeSection = page.getByTestId('informe-section');
    await expect(informeSection).toBeVisible();
    await expect(informeSection.getByRole('button', { name: 'Generar informe' })).toBeVisible();

    // Generar: estados visibles (R15)
    await informeSection.getByRole('button', { name: 'Generar informe' }).click();
    await expect(informeSection.getByTestId('report-status-badge').first()).toBeVisible();
    await expect(informeSection.getByText('Borrador')).toBeVisible({ timeout: 30_000 });

    // Revisión
    await informeSection.getByRole('link', { name: 'Revisar' }).click();
    await page.waitForURL(new RegExp(`/auditorias/${auditId}/informe/1$`));

    // Vista interna (R17)
    await page.getByTestId('tab-vista-interna').click();
    await expect(page.getByTestId('internal-view')).toBeVisible();
    await expect(page.getByText('Recomendaciones de presupuesto')).toBeVisible();
    await page.getByRole('button', { name: 'Informe cliente' }).click();

    // Edición por sección (R20)
    const editor = page.getByTestId('section-editor');
    await editor.locator('input').first().fill('Diagnóstico editado en e2e');
    await editor.getByRole('button', { name: 'Guardar sección' }).click();
    await expect(editor.getByText('Sección guardada')).toBeVisible();

    // Edición inline (R30, R31)
    await page.getByRole('button', { name: 'Editar sobre el informe' }).click();
    const lead = page.locator('[data-field="resumen.lead"][contenteditable="true"]').first();
    await expect(lead).toBeVisible();
    await lead.click();
    await lead.fill('Lead editado inline desde e2e.');
    await expect(page.getByTestId('inline-feedback')).toHaveText('Guardado (edición 1)', {
      timeout: 15_000
    });
    await page.getByRole('button', { name: 'Listo' }).click();

    // Aprobar (R23)
    page.on('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Aprobar' }).click();
    await expect(page.getByText('Aprobado')).toBeVisible({ timeout: 15_000 });

    // Render imprimible (R26)
    await page.goto(`/auditorias/${auditId}/informe/1/imprimir`);
    await expect(page.getByTestId('informe-imprimir')).toBeVisible();
    await expect(page.getByText('Integral de verdad.')).toBeVisible();
    await expect(page.getByText('Lead editado inline desde e2e.')).toBeVisible();
  });
});
