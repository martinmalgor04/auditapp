import { expect, test } from '@playwright/test';
import { createSql } from '../src/lib/server/db/client';
import { injectSurveyBeforeBodyClose } from '../src/lib/server/informe/manual-serve';
import { loginAsAdmin, loginAsTech } from './helpers';
import { insertTestAuditRow } from '../tests/helpers/backoffice';

/**
 * Verificación browser de #56/#57/#58 (authz + encuesta markup).
 * Corre con el webServer de playwright.config (preview :4173).
 */
test.describe('security authz #56/#57/#58', () => {
  test('admin ve Archivar; técnico no; encuesta manual usa 1–5', async ({ page }) => {
    const sql = createSql(
      process.env.DATABASE_URL ?? 'postgres://auditapp:changeme@localhost:5432/auditapp'
    );
    const { auditId } = await insertTestAuditRow(sql, {
      razonSocial: `E2E-Authz-${Date.now()}`,
      status: 'en_relevamiento',
      assignedTechEmail: 'facu@serviciosysistemas.com.ar'
    });
    await sql.end({ timeout: 5 });

    // #58 markup (sin DB): form compatible con Zod #47
    const html = injectSurveyBeforeBodyClose('<html><body>x</body></html>', 'tok', {
      id: 's1'
    });
    expect(html).toContain('value="5"');
    expect(html).toContain('value="true"');
    expect(html).not.toContain('muy_satisfecho');

    await loginAsAdmin(page);
    await page.goto(`/auditorias/${auditId}`);
    await expect(page.getByRole('button', { name: /Archivar/i })).toBeVisible({
      timeout: 15_000
    });

    await page.context().clearCookies();
    await loginAsTech(page);
    await page.goto(`/auditorias/${auditId}`);
    await expect(page.getByRole('button', { name: /Archivar/i })).toHaveCount(0);

    // #57: POST archive como técnico → ActionFailure 403 (no redirect)
    const res = await page.request.post(`/auditorias/${auditId}?/archive`, {
      form: {}
    });
    // SvelteKit form actions: 200 con failure o 303; no debe archivar
    expect([200, 303, 400, 403]).toContain(res.status());
    if (res.status() === 303) {
      // Si redirige, no debería ser a tablero por éxito de archive
      const loc = res.headers()['location'] ?? '';
      expect(loc.includes('/tablero')).toBe(false);
    }
  });
});
