/**
 * tablero.spec.ts — Tests del tablero principal (/tablero)
 */

import { expect, test } from '@playwright/test';
import { loginAsAdmin } from './helpers';

test.describe.configure({ mode: 'serial' });

test.describe('tablero', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/tablero');
    await expect(page.getByRole('heading', { name: 'Tablero' })).toBeVisible();
  });

  test('390px: existen elementos card de auditoría', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    const cardList = page.getByTestId('audit-card-list-mobile');
    await expect(cardList).toBeVisible();

    const articles = cardList.locator('article');
    const emptyMsg = cardList.locator('text=No hay auditorías');

    const hasArticles = (await articles.count()) > 0;
    const hasEmpty = await emptyMsg.isVisible().catch(() => false);

    expect(hasArticles || hasEmpty).toBe(true);
  });

  test('1100px: existe tabla de auditorías', async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 800 });

    const tableContainer = page.getByTestId('audit-table-desktop');
    await expect(tableContainer).toBeVisible();

    const table = tableContainer.locator('table');
    await expect(table).toBeVisible();
  });

  test('filtrar por chip IT cambia la URL y aplica el filtro', async ({ page }) => {
    // Scope to the desktop chip-filters bar to avoid ambiguity with other "IT" elements
    const chipFilters = page.getByTestId('tablero-chip-filters');
    await expect(chipFilters).toBeVisible();
    const chipIt = chipFilters.locator('[role="button"]').filter({ hasText: /^IT$/ });
    await expect(chipIt).toBeVisible();
    await chipIt.click();

    await page.waitForURL(/[?&]type=it/, { timeout: 10_000 });
    expect(page.url()).toContain('type=it');
  });

  test('click en Relevamiento navega al form de la auditoría', async ({ page }) => {
    const relevamientoLinks = page.getByRole('link', { name: 'Relevamiento' });
    const count = await relevamientoLinks.count();

    if (count === 0) {
      test.skip(
        true,
        'No hay auditorías con botón "Relevamiento" disponible.'
      );
      return;
    }

    const firstLink = relevamientoLinks.first();
    const href = await firstLink.getAttribute('href');

    expect(href).toMatch(/\/auditorias\/[^/]+\/form$/);

    await firstLink.click();

    await page.waitForURL(/\/auditorias\/[^/]+\/form$/, { timeout: 15_000 });
    expect(page.url()).toMatch(/\/auditorias\/[^/]+\/form$/);
  });
});
