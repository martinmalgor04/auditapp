import { expect, test } from '@playwright/test';
import { ensureE2eFormAudit } from './ensure-form-audit';

/**
 * Tests del formulario de relevamiento técnico.
 * Requieren un usuario técnico con sesión válida.
 * El fixture se crea via ensureE2eFormAudit().
 */

const TECH_EMAIL = 'facu@serviciosysistemas.com.ar';
const TECH_PASS = 'changeme-tech';

async function loginAndGoToForm(page: import('@playwright/test').Page, auditId: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(TECH_EMAIL);
  await page.getByLabel('Contraseña').fill(TECH_PASS);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.waitForURL(/tablero/);
  await page.goto(`/auditorias/${auditId}/form`);
  await expect(page.getByText('Progreso')).toBeVisible({ timeout: 15000 });
}

test.describe('form — chips de sección (mobile)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  let auditId = '';

  test.beforeAll(async () => {
    auditId = await ensureE2eFormAudit();
  });

  test('tap en chip de sección activa esa sección', async ({ page }) => {
    await loginAndGoToForm(page, auditId);

    // Obtener chips disponibles (dentro del contenedor lg:hidden de SectionChips)
    const chips = page.locator('[data-testid="section-chip"], .shrink-0.rounded-full');
    const chipCount = await chips.count();

    if (chipCount < 2) {
      test.skip(true, 'No hay suficientes chips de sección para testear navegación');
      return;
    }

    // Obtener el código de la primera sección activa
    const firstChip = chips.first();
    const firstCode = await firstChip.textContent();

    // Hacer tap en el segundo chip (force para ignorar solapamientos con headers fijos)
    const secondChip = chips.nth(1);
    const secondCode = await secondChip.textContent();
    await secondChip.scrollIntoViewIfNeeded();
    await secondChip.click({ force: true });

    // La sección activa debe cambiar: el h1 de sección (text-xl) debe mostrar el código elegido.
    // Nota: la layout también tiene un h1 "Tablero" en HeaderMobile; usar el selector específico.
    const sectionH1 = page.locator('h1.text-xl, h1[class*="text-xl"]').first();
    await expect(sectionH1).toContainText(secondCode?.trim().split('✓')[0].trim() ?? '', {
      timeout: 5000
    });

    // El h1 no debe seguir mostrando el código anterior (si son distintos)
    if (firstCode?.trim() !== secondCode?.trim()) {
      await expect(sectionH1).not.toContainText(
        firstCode?.trim().split('✓')[0].trim() ?? ''
      );
    }
  });
});

test.describe('form — chips de sección (desktop, SectionNav)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  let auditId = '';

  test.beforeAll(async () => {
    auditId = await ensureE2eFormAudit();
  });

  test('click en botón de sección en lateral nav activa esa sección', async ({ page }) => {
    await loginAndGoToForm(page, auditId);

    const nav = page.locator('[data-section-nav]');
    await expect(nav).toBeVisible({ timeout: 10000 });

    const sectionButtons = nav.locator('button');
    const count = await sectionButtons.count();

    if (count < 2) {
      test.skip(true, 'No hay suficientes secciones para testear navegación lateral');
      return;
    }

    const secondBtn = sectionButtons.nth(1);
    const secondLabel = await secondBtn.textContent();
    // Extraer el código (formato "XX — Título")
    const secondCode = secondLabel?.split('—')[0].trim();

    await secondBtn.scrollIntoViewIfNeeded();
    await secondBtn.click({ force: true });

    await expect(page.locator('h1.text-xl, h1[class*="text-xl"]').first()).toContainText(secondCode ?? '', { timeout: 5000 });
  });
});

test.describe('form — persistencia de respuesta bool', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  let auditId = '';

  test.beforeAll(async () => {
    auditId = await ensureE2eFormAudit();
  });

  test('click en "Sí" selecciona la opción visualmente', async ({ page }) => {
    await loginAndGoToForm(page, auditId);

    // QuestionCard renderiza <button>Sí</button>; el renderer antiguo usa <label>Sí</label>
    // Soportar ambas formas
    const siBtn = page.locator('button', { hasText: /^Sí$/ }).first();
    const siLabel = page.locator('label', { hasText: 'Sí' }).first();

    const btnVisible = await siBtn.isVisible().catch(() => false);
    const labelVisible = await siLabel.isVisible().catch(() => false);

    if (!btnVisible && !labelVisible) {
      test.skip(true, 'No hay campo bool visible en la primera sección');
      return;
    }

    if (btnVisible) {
      // QuestionCard: click en el botón
      await siBtn.scrollIntoViewIfNeeded();
      await siBtn.click({ force: true });
      // Verificar que el botón tiene estilos activos (fondo verde)
      await expect(siBtn).toHaveClass(/bg-\[--sys-status-green\]|text-white/, { timeout: 5000 });
    } else {
      // Renderer antiguo: click en la label del radio
      await siLabel.click();
      const siRadio = siLabel.locator('input[type="radio"]');
      await expect(siRadio).toBeChecked({ timeout: 5000 });
    }

    // Esperar confirmación de guardado
    await expect(page.getByText(/Guardando|Guardado/)).toBeVisible({ timeout: 8000 });
  });
});

test.describe('form — FormNextButton desaparece al completar sección', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  let auditId = '';

  test.beforeAll(async () => {
    auditId = await ensureE2eFormAudit();
  });

  test('responder todos los ítems de la sección activa hace desaparecer FormNextButton', async ({
    page
  }) => {
    await loginAndGoToForm(page, auditId);

    // FormNextButton muestra "Próximo pendiente → (N restantes)" — distinguirlo del botón inline
    // que solo dice "Próximo pendiente →" sin el conteo.
    const nextBtn = page.getByRole('button', { name: /Próximo pendiente →.*restantes/ });

    const isVisible = await nextBtn.isVisible().catch(() => false);
    if (!isVisible) {
      // El fixture pre-respondió todo, no hay ítems pendientes → saltear
      test.skip(true, 'No hay ítems pendientes en la sección activa (fixture ya respondido)');
      return;
    }

    // Responder todos los ítems bool/tri visibles en la sección activa
    // Hacer esto en un loop hasta que no haya más pendientes
    let iterations = 0;
    let answeredAny = false;
    const MAX_ITER = 50;

    while ((await page.getByRole('button', { name: /Próximo pendiente →.*restantes/ }).isVisible().catch(() => false)) && iterations < MAX_ITER) {
      iterations++;

      // QuestionCard: intentar responder el primer botón "Sí" sin estado activo
      const siBtn = page.locator('button', { hasText: /^Sí$/ }).first();
      if (await siBtn.isVisible().catch(() => false)) {
        await siBtn.scrollIntoViewIfNeeded();
        await siBtn.click({ force: true });
        await page.waitForTimeout(300);
        answeredAny = true;
        continue;
      }

      // Intentar responder el primer radio "Sí" o "No" visible sin respuesta (renderer antiguo)
      const uncheckedRadio = page.locator('input[type="radio"]:not(:checked)').first();
      if (await uncheckedRadio.isVisible().catch(() => false)) {
        const parentLabel = uncheckedRadio.locator('..').locator('..');
        await parentLabel.click();
        await page.waitForTimeout(300);
        answeredAny = true;
        continue;
      }

      // Intentar responder un select sin valor
      const emptySelect = page.locator('select').filter({ has: page.locator('option[value=""]:checked') }).first();
      if (await emptySelect.isVisible().catch(() => false)) {
        await emptySelect.selectOption({ index: 1 });
        await page.waitForTimeout(300);
        answeredAny = true;
        continue;
      }

      // Si no encontramos más campos sin respuesta, salir
      break;
    }

    // Si el loop no pudo responder ningún ítem (todos son de tipo no cubierto), saltear
    if (!answeredAny) {
      test.skip(true, 'No se encontraron ítems respondibles (bool/tri) en la sección activa');
      return;
    }

    // Luego de responder todos, el botón no debe estar visible
    await expect(nextBtn).not.toBeVisible({ timeout: 5000 });
  });
});
