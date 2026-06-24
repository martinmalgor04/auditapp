import { expect, test } from '@playwright/test';
import { E2E_BRIEFING_TOKEN, ensureE2eBriefingAudit } from './ensure-audit';
import { loginAsAdmin } from './helpers';
import { ensureE2eFormAudit } from './ensure-form-audit';

test.describe('branding SyS', () => {
  test.describe.configure({ mode: 'serial' });

  test('login page shows SyS logo and electric blue submit button', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByRole('img', { name: 'Servicios y Sistemas' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ingresar' })).toHaveClass(/bg-sys-electrico/);
  });

  test('tablero shows branded header with sys logo', async ({ page }) => {
    await loginAsAdmin(page);

    // Sidebar (desktop) uses white logo on navy background
    await expect(page.locator('[data-sys-shell-header] img')).toBeVisible();
  });

  test('form page uses sys-electrico primary button', async ({ page }) => {
    const auditId = await ensureE2eFormAudit();
    await loginAsAdmin(page);
    await page.goto(`/auditorias/${auditId}/form`);

    await expect(page.getByText('Progreso')).toBeVisible({ timeout: 15000 });

    const completeBtn = page.getByRole('button', { name: 'Relevamiento completo' });
    await expect(completeBtn).toBeVisible();
    await expect(completeBtn).toHaveClass(/bg-sys-electrico/);
  });

  test('briefing shows official logo asset path', async ({ page }) => {
    await ensureE2eBriefingAudit();
    await page.goto(`/briefing/${E2E_BRIEFING_TOKEN}`);

    await expect(page.locator('img[src="/brand/sys-horizontal-b.png"]').first()).toBeVisible();
  });

  test('cierre page shows branded header', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/tablero');
    await expect(page.locator('[data-sys-shell-header]')).toBeVisible();
  });
});
