import { expect, test } from '@playwright/test';
import { createSql } from '../src/lib/server/db/client';
import { runMigrations } from '../src/lib/server/db/migrate';
import { runSeed } from '../src/lib/server/db/seed';
import { withDbSuiteLock } from '../tests/helpers/db-lock';
import { AUDIT_SCENARIOS } from './fixtures/audit-scenarios';
import { login, runFullAuditFlow } from './helpers/audit-flow';

// R8, R13, R16 — aprobar → compartir → ver público → revocar.
test.describe.configure({ mode: 'serial' });
test.describe('entrega informe al cliente', () => {
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

  test('generar link → vista pública → contador → revocar (R8, R13, R16)', async ({
    page,
    browser
  }) => {
    test.setTimeout(360_000);
    const scenario = AUDIT_SCENARIOS.find((s) => s.types.includes('erp-tango'))!;
    const suffix = `E2E-ENT-${Date.now()}`;

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
    await expect(sharePanel).toBeVisible();
    await expect(sharePanel.getByRole('heading', { name: 'Entrega al cliente' })).toBeVisible();

    await sharePanel.getByTestId('share-generar').click();
    await expect(sharePanel.getByTestId('share-estado')).toHaveText('activo', { timeout: 10_000 });

    const url = await sharePanel.locator('code').textContent();
    expect(url).toMatch(/\/informe\/[A-Za-z0-9_-]{43}$/);

    const publicContext = await browser.newContext();
    const publicPage = await publicContext.newPage();
    await publicPage.goto(url!);

    await expect(publicPage.getByText('01 · Resumen ejecutivo')).toBeVisible({ timeout: 15_000 });
    await expect(publicPage.getByText('02 · Hallazgos por circuito')).toBeVisible();
    await expect(publicPage.getByTestId('informe-descargar-pdf')).toBeVisible();

    await publicPage.getByTestId('informe-descargar-pdf').click();
    await publicPage.waitForURL(/\/imprimir$/);
    await expect(publicPage.getByTestId('informe-boton-pdf')).toBeVisible();
    await publicContext.close();

    await page.reload();
    await expect(sharePanel.getByTestId('share-view-count')).toHaveText(/[1-9]/, {
      timeout: 10_000
    });

    await sharePanel.getByTestId('share-revocar').click();
    await expect(sharePanel.getByTestId('share-estado')).toHaveText('revocado', { timeout: 10_000 });

    const revokedContext = await browser.newContext();
    const revokedPage = await revokedContext.newPage();
    await revokedPage.goto(url!);
    await expect(revokedPage.getByTestId('informe-unavailable')).toBeVisible({ timeout: 10_000 });
    await expect(revokedPage.getByText('Este enlace ya no está disponible')).toBeVisible();
    await revokedContext.close();
  });
});
