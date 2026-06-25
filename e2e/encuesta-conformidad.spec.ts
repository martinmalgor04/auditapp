import { expect, test } from '@playwright/test';
import { createSql } from '../src/lib/server/db/client';
import { runMigrations } from '../src/lib/server/db/migrate';
import { runSeed } from '../src/lib/server/db/seed';
import { withDbSuiteLock } from '../tests/helpers/db-lock';
import { AUDIT_SCENARIOS } from './fixtures/audit-scenarios';
import { login, runFullAuditFlow } from './helpers/audit-flow';

// R1, R7, R12 — ver informe público → bloque de encuesta → responder →
// agradecimiento → respuesta visible en backoffice.
test.describe.configure({ mode: 'serial' });
test.describe('encuesta de conformidad', () => {
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

  test('ver informe → responder → agradecimiento → backoffice (R1, R7, R12)', async ({
    page,
    browser
  }) => {
    test.setTimeout(360_000);
    const scenario = AUDIT_SCENARIOS.find((s) => s.types.includes('erp-tango'))!;
    const suffix = `E2E-ENC-${Date.now()}`;

    const auditId = await runFullAuditFlow(page, scenario, suffix);

    await login(page, 'admin@serviciosysistemas.com.ar', 'changeme-admin');
    await page.goto(`/auditorias/${auditId}`);
    const informeSection = page.getByTestId('informe-section');
    await informeSection.getByRole('button', { name: 'Generar informe' }).click();
    await expect(informeSection.getByText('Borrador')).toBeVisible({ timeout: 30_000 });
    await informeSection.getByRole('link', { name: 'Revisar' }).click();
    await page.waitForURL(new RegExp(`/auditorias/${auditId}/informe/1$`));

    page.on('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Aprobar' }).click();
    await expect(page.getByText('Aprobado')).toBeVisible({ timeout: 15_000 });

    const sharePanel = page.getByTestId('share-panel');
    await sharePanel.getByTestId('share-generar').click();
    await expect(sharePanel.getByTestId('share-estado')).toHaveText('activo', { timeout: 10_000 });

    const url = await sharePanel.locator('code').textContent();
    expect(url).toMatch(/\/informe\/[A-Za-z0-9_-]{43}$/);

    // El backoffice muestra «sin respuesta aún» antes de responder.
    const surveyResult = page.getByTestId('survey-result');
    await expect(surveyResult).toBeVisible();
    await expect(page.getByTestId('survey-result-empty')).toBeVisible();

    // Cliente: abre el informe público y ve el bloque de encuesta al pie (R1).
    const publicContext = await browser.newContext();
    const publicPage = await publicContext.newPage();
    await publicPage.goto(url!);
    await expect(publicPage.getByText('01 · Resumen ejecutivo')).toBeVisible({ timeout: 15_000 });

    const survey = publicPage.getByTestId('survey-block');
    await expect(survey).toBeVisible();

    // Completa: valoración 4, claridad 5, conforme Sí, comentario (R12).
    await survey.locator('input[name="valoracion_global"][value="4"]').check({ force: true });
    await survey.locator('input[name="claridad_informe"][value="5"]').check({ force: true });
    await survey.locator('input[name="conforme_hallazgos"][value="true"]').check({ force: true });
    await survey.locator('textarea[name="comentario"]').fill('Muy completo, gracias.');

    await survey.getByTestId('survey-submit').click();

    // Agradecimiento en el mismo bloque, sin recargar a otra página (R7).
    await expect(publicPage.getByTestId('survey-thanks')).toBeVisible({ timeout: 10_000 });
    await expect(publicPage.getByText('¡Gracias por tu respuesta!')).toBeVisible();
    await expect(publicPage.getByTestId('survey-summary-valoracion')).toContainText('4');
    await publicContext.close();

    // Backoffice: la respuesta aparece en «Conformidad del cliente» (R9, R12).
    await page.reload();
    await expect(page.getByTestId('survey-result-valoracion')).toContainText('4', {
      timeout: 10_000
    });
    await expect(page.getByText('Muy completo, gracias.')).toBeVisible();
  });
});
