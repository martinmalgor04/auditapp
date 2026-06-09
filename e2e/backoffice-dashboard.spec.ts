import { expect, test } from '@playwright/test';
import { loginAsAdmin } from './helpers';

test.describe.configure({ mode: 'serial' });

test.describe('backoffice dashboard layout', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/tablero');
    await expect(page.getByRole('heading', { name: 'Tablero' })).toBeVisible();
  });

  test('desktop shows table; mobile shows cards', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.getByTestId('audit-table-desktop')).toBeVisible();
    await expect(page.getByTestId('audit-card-list-mobile')).toBeHidden();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId('audit-card-list-mobile')).toBeVisible();
    await expect(page.getByTestId('audit-table-desktop')).toBeHidden();
  });
});
