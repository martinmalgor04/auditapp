import { expect, test } from '@playwright/test';
import { loginAsAdmin } from './helpers';
import { createSql } from '../src/lib/server/db/client';
import { runMigrations } from '../src/lib/server/db/migrate';
import { runSeed } from '../src/lib/server/db/seed';
import { withDbSuiteLock } from '../tests/helpers/db-lock';

const ORIGINAL = 'changeme-admin';
const NUEVA = 'nueva-clave-2026';

const sql = createSql(
  process.env.DATABASE_URL ?? 'postgres://auditapp:changeme@localhost:5432/auditapp'
);

// La suite e2e asume usuarios sembrados por otra spec; al correr `perfil.spec`
// en aislamiento ese seed no existe. Garantizamos el usuario admin (idempotente)
// para que el login funcione con o sin el resto de la suite.
test.beforeAll(async () => {
  await withDbSuiteLock(sql, async (s) => {
    await runMigrations(s);
    await runSeed(s);
  });
});

test.afterAll(async () => {
  await sql.end({ timeout: 5 });
});

test('R1: /perfil sin sesión redirige a /login', async ({ page }) => {
  await page.goto('/perfil');
  await page.waitForURL('**/login');
  await expect(page.locator('h1')).toHaveText('Ingresar');
});

test('R13/R15: cambiar contraseña muestra toast de éxito y la sesión sigue activa', async ({
  page
}) => {
  await loginAsAdmin(page);

  // Abrir el perfil y ver los datos propios.
  await page.goto('/perfil');
  await expect(page.getByRole('heading', { name: 'Mi perfil', level: 1 })).toBeVisible();
  await expect(page.locator('input[name="email"]')).toHaveValue(
    'admin@serviciosysistemas.com.ar'
  );

  // Cambiar la contraseña con actual + nueva + confirmación.
  await page.locator('input[name="actual"]').fill(ORIGINAL);
  await page.locator('input[name="nueva"]').fill(NUEVA);
  await page.locator('input[name="confirmacion"]').fill(NUEVA);
  await page.getByRole('button', { name: 'Cambiar contraseña' }).click();

  // Toast de éxito branded.
  await expect(page.locator('[data-toast="success"]')).toBeVisible();

  // La sesión actual sigue válida: se puede seguir navegando.
  await page.goto('/tablero');
  await expect(page).toHaveURL(/\/tablero/);

  // Restaurar la contraseña original para no afectar otros specs.
  await page.goto('/perfil');
  await page.locator('input[name="actual"]').fill(NUEVA);
  await page.locator('input[name="nueva"]').fill(ORIGINAL);
  await page.locator('input[name="confirmacion"]').fill(ORIGINAL);
  await page.getByRole('button', { name: 'Cambiar contraseña' }).click();
  await expect(page.locator('[data-toast="success"]')).toBeVisible();
});
