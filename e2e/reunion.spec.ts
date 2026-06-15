/**
 * E2E — Asistente de reunión (feature #12)
 *
 * NOTA: El pipeline STT+LLM requiere APIs externas reales (OpenAI).
 * Los tests que dependen del estado "listo" están marcados con test.skip
 * porque no hay modo de mock de pipeline en e2e actualmente.
 *
 * Para ejecutar el flujo completo: configurar OPENAI_API_KEY en el entorno
 * y levantar la app con REUNION_PIPELINE_MODE=direct.
 *
 * Tests que SÍ corren sin APIs externas:
 * - navegación a la página de reunión
 * - registro de consentimiento
 * - tab de subir archivo
 */

import { expect, test } from '@playwright/test';
import { loginAsTech, loginAsAdmin } from './helpers';
import { ensureFormAudit } from './ensure-form-audit';
import path from 'path';

test.describe('Asistente de reunión — navegación y consentimiento', () => {
  test('técnico puede navegar a asistente de reunión desde auditoría en_relevamiento', async ({
    page
  }) => {
    await loginAsTech(page);
    const auditId = await ensureFormAudit(page);

    await page.goto(`/auditorias/${auditId}`);
    await expect(page.getByRole('link', { name: /asistente de reunión/i })).toBeVisible();

    await page.getByRole('link', { name: /asistente de reunión/i }).click();
    await expect(page).toHaveURL(new RegExp(`/auditorias/${auditId}/reunion`));
    await expect(page.getByRole('heading', { name: /asistente de reunión/i })).toBeVisible();
  });

  test('página de reunión muestra el paso de consentimiento si no hay sesiones', async ({
    page
  }) => {
    await loginAsTech(page);
    const auditId = await ensureFormAudit(page);

    await page.goto(`/auditorias/${auditId}/reunion`);
    // Puede mostrar lista vacía o directo el consentimiento
    const hasConsentTitle = await page
      .getByRole('heading', { name: /consentimiento/i })
      .isVisible()
      .catch(() => false);
    const hasNewButton = await page
      .getByRole('button', { name: /nueva sesión/i })
      .isVisible()
      .catch(() => false);

    expect(hasConsentTitle || hasNewButton).toBe(true);
  });

  test('puede registrar consentimiento y avanzar al paso de audio', async ({ page }) => {
    await loginAsTech(page);
    const auditId = await ensureFormAudit(page);

    await page.goto(`/auditorias/${auditId}/reunion`);

    // Si hay botón "Nueva sesión", hacerlo clic primero
    const newSessionBtn = page.getByRole('button', { name: /nueva sesión/i });
    if (await newSessionBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await newSessionBtn.click();
    }

    // Esperar paso de consentimiento
    await expect(page.getByRole('heading', { name: /consentimiento/i })).toBeVisible({
      timeout: 5000
    });

    // Seleccionar tipo kickoff
    await page.selectOption('select[name=undefined], select', 'kickoff');

    // Marcar checkbox
    await page.getByRole('checkbox').check();

    // Confirmar
    await page.getByRole('button', { name: /confirmar y continuar/i }).click();

    // Debería avanzar al paso de audio
    await expect(page.getByRole('heading', { name: /audio/i })).toBeVisible({ timeout: 5000 });
  });

  test('tab Subir archivo acepta .webm', async ({ page }) => {
    await loginAsTech(page);
    const auditId = await ensureFormAudit(page);

    await page.goto(`/auditorias/${auditId}/reunion`);

    const newSessionBtn = page.getByRole('button', { name: /nueva sesión/i });
    if (await newSessionBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await newSessionBtn.click();
    }

    // Consentimiento rápido
    const checkbox = page.getByRole('checkbox');
    if (await checkbox.isVisible({ timeout: 3000 }).catch(() => false)) {
      await checkbox.check();
      await page.getByRole('button', { name: /confirmar y continuar/i }).click();
    }

    // Esperar audio step
    await expect(page.getByRole('heading', { name: /audio/i })).toBeVisible({ timeout: 5000 });

    // Ir a tab Subir
    await page.getByRole('button', { name: /subir archivo/i }).click();
    await expect(page.locator('input[type=file]')).toBeVisible();
  });

  test.skip(
    'flujo completo: subir audio → pipeline → revisar propuesta → aceptar → verificar form',
    async ({ page }) => {
      /**
       * Este test requiere:
       * - OPENAI_API_KEY configurada
       * - REUNION_PIPELINE_MODE=direct
       * - Pipeline completa con STT + LLM real
       *
       * Para ejecutar: quitar test.skip y configurar entorno con APIs reales.
       */
      await loginAsTech(page);
      const auditId = await ensureFormAudit(page);

      await page.goto(`/auditorias/${auditId}/reunion`);

      const newSessionBtn = page.getByRole('button', { name: /nueva sesión/i });
      if (await newSessionBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await newSessionBtn.click();
      }

      // 1. Consentimiento
      await page.getByRole('checkbox').check();
      await page.getByRole('button', { name: /confirmar y continuar/i }).click();

      // 2. Subir audio fixture
      await page.getByRole('button', { name: /subir archivo/i }).click();
      const fixtureFile = path.join(process.cwd(), 'tests/fixtures/reunion-audio.webm');
      await page.locator('input[type=file]').setInputFiles(fixtureFile);

      // 3. Esperar estado "listo" (polling)
      await expect(page.getByText(/listo para revisar|ready_for_review/i)).toBeVisible({
        timeout: 120_000
      });

      // 4. Ver propuesta (si hay)
      const proposalCard = page.locator('[data-testid="proposal-card"]').first();
      if (await proposalCard.isVisible({ timeout: 5000 }).catch(() => false)) {
        // 5. Aceptar propuesta
        await proposalCard.getByRole('button', { name: /aceptar/i }).click();
      }

      // 6. Finalizar revisión
      await page.getByRole('button', { name: /finalizar revisión/i }).click();

      // 7. Verificar éxito
      await expect(page.getByText(/revisión completada/i)).toBeVisible({ timeout: 10_000 });
    }
  );
});
