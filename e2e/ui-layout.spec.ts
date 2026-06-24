import { expect, test } from '@playwright/test';
import { loginAsAdmin } from './helpers';

test.describe('ui-layout responsive', () => {
  test('390px: sidebar no existe, bottom nav existe', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsAdmin(page);

    // Sidebar: aside.hidden.lg:flex — a 390px debe estar oculto (display: none)
    const sidebar = page.locator('aside.hidden');
    await expect(sidebar).toBeAttached();
    await expect(sidebar).toBeHidden();

    // Bottom nav: nav.lg:hidden.fixed.bottom-0 — debe existir y ser visible
    const bottomNav = page.locator('nav.lg\\:hidden.fixed');
    await expect(bottomNav).toBeVisible();
  });

  test('1100px: sidebar existe con ancho ~220px, bottom nav no visible, header mobile no visible', async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 800 });
    await loginAsAdmin(page);

    // Sidebar: a 1100px lg:flex activa, debe ser visible
    const sidebar = page.locator('aside.hidden');
    await expect(sidebar).toBeVisible();

    // Verificar ancho ~220px
    const box = await sidebar.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(215);
    expect(box!.width).toBeLessThanOrEqual(225);

    // Bottom nav: lg:hidden, a 1100px debe estar oculto
    const bottomNav = page.locator('nav.lg\\:hidden.fixed');
    await expect(bottomNav).toBeHidden();

    // Header mobile: lg:hidden sticky, a 1100px debe estar oculto
    const headerMobile = page.locator('[data-testid="header-mobile"]');
    await expect(headerMobile).toBeHidden();
  });
});
