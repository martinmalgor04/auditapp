import { expect, test } from '@playwright/test';

const VALID_TOKEN = 'e2e-briefing-token-demo';

test.describe('briefing externo', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('flujo feliz: cargar, completar campo, enviar, confirmación', async ({ page }) => {
    await page.goto(`/briefing/${VALID_TOKEN}`);

    await expect(page.getByRole('img', { name: 'Servicios y Sistemas' })).toBeVisible();
    await expect(page.getByText(/Hola,/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enviar' })).toBeVisible();

    const firstInput = page.locator('input[type="text"]').first();
    await firstInput.fill('Rubro E2E Test');
    await page.waitForTimeout(800);

    await page.getByRole('button', { name: 'Enviar' }).click();
    await expect(page.getByText('¡Listo! Nos vemos en la visita.')).toBeVisible();
  });

  test('token inválido muestra pantalla amable', async ({ page }) => {
    await page.goto('/briefing/token-invalido-e2e-xyz');
    await expect(page.getByText('Este enlace ya no está disponible')).toBeVisible();
    await expect(page.getByText(/Servicios y Sistemas/)).toBeVisible();
  });
});
