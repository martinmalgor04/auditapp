import { expect, test } from '@playwright/test';
import { loginAsAdmin, loginAsTech } from './helpers';

test.describe.configure({ mode: 'serial' });

test.describe('dashboard mercado', () => {
  test('admin ve dashboard y secciones cuando hay datos (R1, R15)', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/mercado');
    await expect(page.getByRole('heading', { name: 'Estudio de mercado NEA' })).toBeVisible({
      timeout: 15_000
    });
    await expect(page.getByTestId('mercado-filters')).toBeVisible();
    // Feature #42: el layout ahora usa Sidebar (desktop) + BottomNav (mobile), ambos con nav.
    // Verificar que al menos uno de los nav links a /mercado es visible.
    await expect(page.locator('nav a[href="/mercado"]').first()).toBeVisible();

    const empty = page.getByTestId('mercado-empty-state');
    if (await empty.isVisible()) {
      await expect(empty).toContainText('No hay auditorías cerradas');
    } else {
      await expect(page.getByTestId('mercado-section-erp')).toBeVisible();
      await expect(page.getByTestId('mercado-section-modulos')).toBeVisible();
      await expect(page.getByTestId('mercado-section-semaforos')).toBeVisible();
      await expect(page.getByTestId('mercado-section-trend')).toBeVisible();
      await expect(page.getByTestId('mercado-section-upsell')).toBeVisible();
      // #43 — los 5 bloques accionables
      await expect(page.getByTestId('mercado-section-tango')).toBeVisible();
      await expect(page.getByTestId('mercado-section-nea')).toBeVisible();
      await expect(page.getByTestId('mercado-section-base')).toBeVisible();
      await expect(page.getByTestId('mercado-section-hallazgos')).toBeVisible();
      await expect(page.getByTestId('mercado-section-riesgo')).toBeVisible();
    }
  });

  test('#43 — filtro provincia y bloques accionables (R4, R18, R19)', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/mercado');
    await expect(page.getByRole('heading', { name: 'Estudio de mercado NEA' })).toBeVisible({
      timeout: 15_000
    });
    // El filtro de provincia existe.
    await expect(page.getByTestId('mercado-filter-provincia')).toBeVisible();

    // Provincia inexistente → estado vacío (R18).
    await page.goto('/mercado?provincia=ProvinciaInexistenteE2E');
    await expect(page.getByTestId('mercado-empty-state')).toBeVisible();
  });

  test('técnico no ve link Mercado y recibe 403 (R1)', async ({ page }) => {
    await page.context().clearCookies();
    await loginAsTech(page);
    await expect(page.locator('nav a[href="/mercado"]')).toHaveCount(0);
    await page.goto('/mercado');
    await expect(page.getByText(/403|No tenés permiso/i).first()).toBeVisible();
  });

  test('filtro sin resultados muestra estado vacío (R13)', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/mercado?rubro=RubroInexistenteE2E');
    await expect(page.getByTestId('mercado-empty-state')).toBeVisible();
    await expect(page.getByText('No hay auditorías cerradas para estos filtros')).toBeVisible();
  });

  test('chip Seg. A navega a /mercado?segment=A y queda activo', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/mercado');
    await expect(page.getByRole('heading', { name: 'Estudio de mercado NEA' })).toBeVisible({
      timeout: 15_000
    });

    const chipSegA = page.getByRole('button', { name: 'Seg. A' });
    await expect(chipSegA).toBeVisible();

    await chipSegA.click();

    // Chip click triggers window.location.href navigation to /mercado?segment=A
    await page.waitForURL('**/mercado?segment=A', { timeout: 15_000 });

    // After navigation the chip "Seg. A" should be rendered active (bg-[--sys-primary])
    const activeChip = page.getByRole('button', { name: 'Seg. A' });
    await expect(activeChip).toBeVisible();
    // The active chip must have the inline class that carries sys-primary background
    await expect(activeChip).toHaveClass(/bg-\[--sys-primary\]/);
  });

  test('chip Seg. A activo filtra los datos del grid (o muestra estado vacío)', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/mercado?segment=A');
    await expect(page.getByRole('heading', { name: 'Estudio de mercado NEA' })).toBeVisible({
      timeout: 15_000
    });

    // Either the dashboard sections are shown (filtered to segment A) or the empty state
    const empty = page.getByTestId('mercado-empty-state');
    const hasEmpty = await empty.isVisible();
    if (hasEmpty) {
      await expect(empty).toContainText(/No hay auditorías/);
    } else {
      // At least one data section must be visible
      const sections = [
        'mercado-section-erp',
        'mercado-section-modulos',
        'mercado-section-semaforos'
      ];
      let anyVisible = false;
      for (const tid of sections) {
        if (await page.getByTestId(tid).isVisible()) {
          anyVisible = true;
          break;
        }
      }
      expect(anyVisible).toBe(true);
    }
  });
});
