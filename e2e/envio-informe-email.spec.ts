/**
 * E2E #51 — Envío del informe al cliente por email (R1, R3, R6, R7, R9).
 *
 * Sin SMTP real: el transporte es dry-run (NODE_ENV=test, sin SMTP_HOST).
 * Reutiliza INFORME_FAKE=1 y el flujo completo de auditoría.
 */
import { expect, test } from '@playwright/test';
import { createSql } from '../src/lib/server/db/client';
import { runMigrations } from '../src/lib/server/db/migrate';
import { runSeed } from '../src/lib/server/db/seed';
import { withDbSuiteLock } from '../tests/helpers/db-lock';
import { AUDIT_SCENARIOS } from './fixtures/audit-scenarios';
import { login, runFullAuditFlow } from './helpers/audit-flow';

test.describe.configure({ mode: 'serial' });
test.describe('envío del informe al cliente por email', () => {
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

  test('botón habilitado con informe aprobado y email válido → confirmación → envío → toast → marca (R1, R3, R6, R7)', async ({
    page
  }) => {
    test.setTimeout(360_000);
    const scenario = AUDIT_SCENARIOS.find((s) => s.types.includes('erp-tango'))!;
    const suffix = `E2E-ENV-${Date.now()}`;

    const auditId = await runFullAuditFlow(page, scenario, suffix);

    const sql = createSql(
      process.env.DATABASE_URL ?? 'postgres://auditapp:changeme@localhost:5432/auditapp'
    );

    // Asegurar que la empresa tiene un email válido
    const contactEmail = `cliente-e2e-${Date.now()}@empresa-test.com`;
    await sql`
      UPDATE empresa
      SET email = ${contactEmail}
      WHERE id = (SELECT empresa_id FROM audit WHERE id = ${auditId})
    `;
    await sql.end({ timeout: 5 });

    await login(page, 'admin@serviciosysistemas.com.ar', 'changeme-admin');
    await page.goto(`/auditorias/${auditId}`);

    const informeSection = page.getByTestId('informe-section');
    await informeSection.getByRole('button', { name: 'Generar informe' }).click();
    await expect(informeSection.getByText('Borrador')).toBeVisible({ timeout: 30_000 });
    await informeSection.getByRole('link', { name: 'Revisar' }).click();
    await page.waitForURL(new RegExp(`/auditorias/${auditId}/informe/1$`));

    // Aprobar informe
    page.on('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Aprobar' }).click();
    await expect(page.getByText('Aprobado')).toBeVisible({ timeout: 15_000 });

    // R1: botón "Enviar por mail" habilitado (informe aprobado + email válido)
    const enviarBtn = page.getByTestId('enviar-informe-btn');
    await expect(enviarBtn).toBeVisible();
    await expect(enviarBtn).toBeEnabled();

    // R6: abrir modal de confirmación
    await enviarBtn.click();
    const input = page.getByTestId('enviar-email-input');
    await expect(input).toBeVisible();

    // R3: email prefilleado con el email de la empresa
    await expect(input).toHaveValue(contactEmail);

    // Confirmar envío (dry-run sin SMTP real)
    await page.getByTestId('enviar-confirmar').click();

    // R6: toast de éxito
    await expect(page.locator('[data-toast="success"]')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-toast="success"]')).toContainText(contactEmail);

    // R7: marca "informe enviado" visible con destinatario y fecha
    await expect(page.getByTestId('informe-enviado-lista')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('informe-enviado-item').first()).toContainText(contactEmail);
  });

  test('botón deshabilitado con informe borrador (R1)', async ({ page }) => {
    test.setTimeout(240_000);
    const scenario = AUDIT_SCENARIOS.find((s) => s.types.includes('erp-tango'))!;
    const suffix = `E2E-ENVB-${Date.now()}`;

    const auditId = await runFullAuditFlow(page, scenario, suffix);

    const sql = createSql(
      process.env.DATABASE_URL ?? 'postgres://auditapp:changeme@localhost:5432/auditapp'
    );
    await sql`
      UPDATE empresa
      SET email = 'empresa@test.com'
      WHERE id = (SELECT empresa_id FROM audit WHERE id = ${auditId})
    `;
    await sql.end({ timeout: 5 });

    await login(page, 'admin@serviciosysistemas.com.ar', 'changeme-admin');
    await page.goto(`/auditorias/${auditId}`);

    const informeSection = page.getByTestId('informe-section');
    await informeSection.getByRole('button', { name: 'Generar informe' }).click();
    await expect(informeSection.getByText('Borrador')).toBeVisible({ timeout: 30_000 });
    await informeSection.getByRole('link', { name: 'Revisar' }).click();
    await page.waitForURL(new RegExp(`/auditorias/${auditId}/informe/1$`));

    // Con borrador: el botón no existe (status no es aprobado → no se muestra la sección)
    const enviarBtn = page.getByTestId('enviar-informe-btn');
    await expect(enviarBtn).not.toBeVisible();
  });

  test('botón deshabilitado cuando empresa no tiene email (R1)', async ({ page }) => {
    test.setTimeout(360_000);
    const scenario = AUDIT_SCENARIOS.find((s) => s.types.includes('erp-tango'))!;
    const suffix = `E2E-ENVNE-${Date.now()}`;

    const auditId = await runFullAuditFlow(page, scenario, suffix);

    // Quitar email de la empresa
    const sql = createSql(
      process.env.DATABASE_URL ?? 'postgres://auditapp:changeme@localhost:5432/auditapp'
    );
    await sql`
      UPDATE empresa
      SET email = NULL
      WHERE id = (SELECT empresa_id FROM audit WHERE id = ${auditId})
    `;
    await sql.end({ timeout: 5 });

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

    // Botón deshabilitado sin email
    const enviarBtn = page.getByTestId('enviar-informe-btn');
    await expect(enviarBtn).toBeVisible();
    await expect(enviarBtn).toBeDisabled();
  });
});
