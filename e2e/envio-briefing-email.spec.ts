/**
 * #52 T10 — e2e: botón "Enviar briefing por mail" en el detalle de auditoría.
 * Cubre R1, R6, R10.
 *
 * Fixture: crea una auditoría en briefing_enviado con token y contacto con email
 * directamente via DB (patrón de otros e2e de este proyecto).
 */
import { expect, test } from '@playwright/test';
import { createSql } from '../src/lib/server/db/client';
import { runMigrations } from '../src/lib/server/db/migrate';
import { runSeed } from '../src/lib/server/db/seed';
import { withDbSuiteLock } from '../tests/helpers/db-lock';
import { loginAsAdmin } from './helpers';

test.describe.configure({ mode: 'serial' });

const E2E_TOKEN = `e2e-briefing-email-${Date.now()}`;
const E2E_EMAIL = `e2e-briefing-${Date.now()}@cliente-test.com`;

let auditId: string;

test.describe('envío de briefing por email (#52)', () => {
  test.beforeAll(async () => {
    const sql = createSql(
      process.env.DATABASE_URL ?? 'postgres://auditapp:changeme@localhost:5432/auditapp'
    );
    await withDbSuiteLock(sql, async (s) => {
      await runMigrations(s);
      await runSeed(s);

      // Crear empresa con email de contacto
      const [empresa] = await s<{ id: string }[]>`
        INSERT INTO empresa (razon_social, cuit, origen, relacion, codigo, email, referente_nombre)
        VALUES (
          'E2E Briefing Email SA',
          null,
          'presupuestos',
          'cliente',
          ${'E2EBRE-' + Date.now()},
          ${E2E_EMAIL},
          'Juan Test'
        )
        RETURNING id
      `;

      // Obtener template id para 'it'
      const [tmpl] = await s<{ id: string }[]>`
        SELECT id FROM template WHERE code = 'it' AND status = 'active' LIMIT 1
      `;

      // Obtener tech id
      const [tech] = await s<{ id: string }[]>`
        SELECT id FROM app_user WHERE email = 'facu@serviciosysistemas.com.ar' LIMIT 1
      `;

      // Crear auditoría en briefing_enviado con token
      const [audit] = await s<{ id: string }[]>`
        INSERT INTO audit (empresa_id, name, types, template_ids, segment, status, assigned_tech_id, scheduled_at, public_token)
        VALUES (
          ${empresa.id},
          'E2E Briefing Email Audit',
          ARRAY['it'],
          ARRAY[${tmpl.id}::uuid],
          'A',
          'briefing_enviado',
          ${tech?.id ?? null},
          now(),
          ${E2E_TOKEN}
        )
        RETURNING id
      `;
      auditId = audit.id;

      // Asignación del técnico
      if (tech?.id) {
        await s`
          INSERT INTO audit_assignment (audit_id, audit_type, tech_id)
          VALUES (${auditId}, 'it', ${tech.id})
          ON CONFLICT DO NOTHING
        `;
      }
    });
    await sql.end({ timeout: 5 });
  });

  test('R1: el detalle muestra el botón "Enviar briefing por mail"', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`/auditorias/${auditId}`);

    const btn = page.getByRole('button', { name: /enviar briefing por mail/i });
    await expect(btn).toBeVisible({ timeout: 10_000 });
    await expect(btn).toBeEnabled();
  });

  test('R10: al confirmar el envío se muestra el toast de éxito', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`/auditorias/${auditId}`);

    // Abrir modal
    await page.getByRole('button', { name: /enviar briefing por mail/i }).click();

    // El modal debe mostrar el destinatario prefilleado
    const emailInput = page.getByLabel(/destinatario/i);
    await expect(emailInput).toBeVisible();
    await expect(emailInput).toHaveValue(E2E_EMAIL);

    // Confirmar envío
    await page.getByRole('button', { name: /^enviar$/i }).click();

    // Toast de éxito visible
    const toast = page.getByRole('alert');
    await expect(toast).toBeVisible({ timeout: 8_000 });
    await expect(toast).toContainText(/enviado/i);
  });

  test('R6: el detalle muestra la marca "Briefing enviado a {email}"', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`/auditorias/${auditId}`);

    // Enviar primero si no se hizo
    const btn = page.getByRole('button', { name: /enviar briefing por mail/i });
    if (await btn.isEnabled()) {
      await btn.click();
      await page.getByRole('button', { name: /^enviar$/i }).click();
      // Esperar que el modal se cierre y la página recargue
      await page.waitForTimeout(1500);
      await page.reload();
    }

    // Verificar que la marca aparece (puede tardar tras recarga)
    await expect(page.getByText(/briefing enviado a/i)).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText(E2E_EMAIL)).toBeVisible();
  });
});
