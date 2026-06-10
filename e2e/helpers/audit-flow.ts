import { expect, type Page } from '@playwright/test';
import type { AuditScenario } from '../fixtures/audit-scenarios';

export async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.waitForURL(/tablero/);
}

export async function createAuditViaUi(page: Page, scenario: AuditScenario, suffix: string) {
  await page.goto('/auditorias/new');
  await expect(page.getByRole('heading', { name: 'Nueva auditoría' })).toBeVisible();

  await page.getByRole('radio', { name: 'Cliente nuevo' }).check();
  await page.locator('input[name="newRazonSocial"]').fill(`${scenario.razonSocial} ${suffix}`);
  await page.locator('input[name="newCuit"]').fill(scenario.cuit);
  await page.locator('input[name="newRubro"]').fill(scenario.rubro);

  for (const type of scenario.types) {
    await page.locator(`input[name="types"][value="${type}"]`).check();
  }

  await page.locator('select[name="segment"]').selectOption(scenario.segment);
  await page.locator('select[name="assignedTechId"]').selectOption({ label: scenario.tecnicoLabel });
  await page.locator('input[name="scheduledAt"]').fill(scenario.fecha);

  await page.getByRole('button', { name: 'Crear auditoría' }).click();
  await page.waitForURL(/\/auditorias\/[0-9a-f-]+$/);
}

export async function generateBriefingLink(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Generar link de briefing' }).click();
  const copyBtn = page.locator('[data-testid="copy-briefing-link"]');
  await expect(copyBtn).toBeVisible({ timeout: 15_000 });
  const url = await copyBtn.getAttribute('data-url');
  expect(url).toBeTruthy();
  return url!;
}

async function fillVisibleBriefingFields(page: Page, scenario: AuditScenario) {
  const values = [
    scenario.briefing.rubro,
    scenario.briefing.empleados,
    scenario.briefing.referente,
    scenario.briefing.contacto,
    scenario.briefing.erp,
    scenario.briefing.correo,
    scenario.briefing.soporte
  ];
  let valueIdx = 0;

  for (const input of await page.locator('input[type="text"], input[type="number"]').all()) {
    if (!(await input.isVisible())) continue;
    const type = await input.getAttribute('type');
    const value =
      type === 'number'
        ? scenario.briefing.empleados
        : (values[valueIdx++] ?? 'Valor E2E prueba');
    await input.fill(value);
    await page.waitForTimeout(type === 'number' ? 100 : 700);
  }

  for (const checkbox of await page.locator('input[type="checkbox"]:visible').all()) {
    await checkbox.check();
    await page.waitForTimeout(200);
  }
}

export async function completeBriefing(
  page: Page,
  briefingUrl: string,
  scenario: AuditScenario,
  suffix: string
) {
  await page.goto(briefingUrl);
  await expect(page.getByText(/Hola,/)).toBeVisible();
  await expect(page.getByText(new RegExp(`${scenario.razonSocial}.*${suffix}`))).toBeVisible();

  while (await page.getByRole('button', { name: 'Siguiente' }).isVisible().catch(() => false)) {
    await fillVisibleBriefingFields(page, scenario);
    await page.getByRole('button', { name: 'Siguiente' }).click();
  }

  await fillVisibleBriefingFields(page, scenario);
  await page.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.getByText('¡Listo! Nos vemos en la visita.')).toBeVisible({ timeout: 15_000 });
}

async function fillVisibleFormFields(page: Page) {
  for (const label of await page.locator('label').filter({ hasText: /^Sí$/ }).all()) {
    if (await label.isVisible()) await label.click();
  }

  for (const select of await page.locator('select:visible').all()) {
    const options = select.locator('option:not([value=""])');
    if ((await options.count()) > 0) {
      await select.selectOption({ index: 1 });
      await page.waitForTimeout(400);
    }
  }

  for (const input of await page.locator('input[type="text"]:visible, textarea:visible').all()) {
    if ((await input.inputValue()) === '') {
      await input.fill('OK E2E');
      await page.waitForTimeout(400);
    }
  }
}

export async function completeTechnicalForm(page: Page, auditId: string) {
  await page.goto(`/auditorias/${auditId}/form`);
  await expect(page.getByText('Progreso')).toBeVisible({ timeout: 20_000 });

  const sectionButtons = page.locator('[data-section-nav] button');
  const sectionCount = await sectionButtons.count();

  if (sectionCount === 0) {
    await fillVisibleFormFields(page);
  } else {
    for (let i = 0; i < sectionCount; i++) {
      await sectionButtons.nth(i).click();
      await fillVisibleFormFields(page);
    }
  }

  await page.getByRole('button', { name: 'Relevamiento completo' }).click();
  await page.waitForURL(new RegExp(`/auditorias/${auditId}$`), { timeout: 20_000 });
}

export async function closeAudit(page: Page, auditId: string, scenario: AuditScenario) {
  await page.goto(`/auditorias/${auditId}/cierre`);
  await expect(page.getByRole('heading', { name: 'Cierre de auditoría' })).toBeVisible();

  await page.getByPlaceholder('Riesgo 1').fill(scenario.closure.riesgo);
  await page.getByPlaceholder('Quick win').first().fill(scenario.closure.quickWin);
  await page.locator('textarea[name="nextStep"]').fill(scenario.closure.nextStep);

  await page.getByRole('button', { name: 'Confirmar cierre' }).click();
  await page.waitForURL(new RegExp(`/auditorias/${auditId}$`), { timeout: 20_000 });
  await expect(page.getByText('Cerrada')).toBeVisible();
}

export async function runFullAuditFlow(
  page: Page,
  scenario: AuditScenario,
  suffix: string
): Promise<string> {
  await login(page, 'admin@serviciosysistemas.com.ar', 'changeme-admin');
  await createAuditViaUi(page, scenario, suffix);

  const auditId = page.url().split('/').pop()!;
  const briefingUrl = await generateBriefingLink(page);

  await completeBriefing(page, briefingUrl, scenario, suffix);

  await login(
    page,
    scenario.tecnicoEmail,
    'changeme-tech'
  );
  await page.goto(`/auditorias/${auditId}`);
  await expect(page.getByText('Briefing completo')).toBeVisible();

  await page.getByRole('link', { name: 'Abrir relevamiento técnico' }).click();
  await completeTechnicalForm(page, auditId);
  await closeAudit(page, auditId, scenario);

  return auditId;
}
