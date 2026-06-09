import { expect, test } from '@playwright/test';
import { ensureE2eFormAudit } from './ensure-form-audit';

test.describe('form técnico mobile', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  let auditId = '';

  test.beforeAll(async () => {
    auditId = await ensureE2eFormAudit();
  });

  test('login, form, autosave indicator, section nav, live score', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('facu@serviciosysistemas.com.ar');
    await page.getByLabel('Contraseña').fill('changeme-tech');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await page.waitForURL(/tablero/);

    await page.goto(`/auditorias/${auditId}/form`);
    await expect(page.getByText('Progreso')).toBeVisible({ timeout: 15000 });

    const completeBtn = page.getByRole('button', { name: 'Relevamiento completo' });
    await expect(completeBtn).toBeVisible();
    await expect(completeBtn).toHaveClass(/min-h-/);

    const input = page.locator('input[type="text"], input[type="number"], textarea').first();
    if (await input.isVisible()) {
      await input.fill('E2E valor test');
      await expect(page.getByText(/Guardando|Guardado/)).toBeVisible({ timeout: 8000 });
    }

    const sectionButtons = page.locator('[data-section-nav] button');
    if ((await sectionButtons.count()) > 1) {
      await sectionButtons.nth(1).click();
    }

    await expect(page.locator('[data-score-band]')).toBeVisible();
  });
});

test.describe('form técnico desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  let auditId = '';

  test.beforeAll(async () => {
    auditId = await ensureE2eFormAudit();
  });

  test('lateral nav visible', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('facu@serviciosysistemas.com.ar');
    await page.getByLabel('Contraseña').fill('changeme-tech');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await page.waitForURL(/tablero/);

    await page.goto(`/auditorias/${auditId}/form`);
    await expect(page.locator('[data-section-nav]')).toBeVisible({ timeout: 15000 });
  });
});
