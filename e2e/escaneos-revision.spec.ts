import { expect, test } from '@playwright/test';
import { ensureE2eEscaneosAudit } from './ensure-escaneos-audit';
import { loginAsAdmin } from './helpers';

/**
 * #62 T15 — flujo feliz de revisión de escaneos (R1, R20, R21):
 * login → detalle de auditoría → "Escaneos de red" → confirmar dispositivo
 * (badge cambia) → detalle por identidad → fusionar con fila manual →
 * vínculo visible.
 */
test.describe('escaneos — UI de revisión', () => {
  let auditId = '';

  test.beforeAll(async () => {
    auditId = await ensureE2eEscaneosAudit();
  });

  test('confirmar y fusionar un dispositivo consolidado', async ({ page }) => {
    await loginAsAdmin(page);

    // R1: enlace desde el detalle de la auditoría
    await page.goto(`/auditorias/${auditId}`);
    await page.getByTestId('link-escaneos').first().click();
    await page.waitForURL(new RegExp(`/auditorias/${auditId}/escaneos`));

    // Lista consolidada: 1 dispositivo (dedup de 2 escaneos), sin revisar
    await expect(page.getByTestId('consolidado-tabla')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('consolidado-row')).toHaveCount(1);
    await expect(page.getByTestId('revision-badge').first()).toHaveText('Sin revisar');
    // R10: provenance con ambos escaneos
    await expect(page.getByTestId('provenance-chips').first()).toContainText('VLAN administración');
    await expect(page.getByTestId('provenance-chips').first()).toContainText('VLAN depósito');

    // R20: confirmar desde la lista → badge cambia
    await page
      .getByTestId('consolidado-tabla')
      .getByTestId('marcar-confirmado')
      .click();
    await expect(page.getByTestId('revision-badge').first()).toHaveText('Confirmado');

    // Detalle por identidad (deep-link estable)
    await page
      .getByTestId('consolidado-tabla')
      .getByTestId('consolidado-detalle-link')
      .click();
    await page.waitForURL(/\/escaneos\/dispositivos\//);
    await expect(page.getByTestId('detalle-titulo')).toHaveText('srv-archivos');
    await expect(page.getByTestId('detalle-campos')).toContainText('Debian 12');
    // R18: software de la ocurrencia canónica con origen identificado
    await expect(page.getByTestId('detalle-software')).toContainText('nginx');
    await expect(page.getByTestId('origen-canonico')).toBeVisible();
    // R19: raw colapsable por ocurrencia (2 escaneos)
    await expect(page.getByTestId('raw-json-details')).toHaveCount(2);

    // R21: fusionar con la fila del inventario manual
    await page.getByTestId('accion-fusionar').click();
    await expect(page.getByTestId('fusionar-panel')).toBeVisible();
    await page.getByTestId('fusionar-fila').first().click();
    await page.getByTestId('fusionar-submit').click();

    // Vínculo visible y badge fusionado
    await expect(page.getByTestId('vinculo-bloque')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('vinculo-bloque')).toContainText('Tabla de equipos relevados');
    await expect(page.getByTestId('vinculo-bloque')).toContainText('ProLiant DL380');
    await expect(page.getByTestId('revision-badge').first()).toHaveText('Fusionado');
  });
});
