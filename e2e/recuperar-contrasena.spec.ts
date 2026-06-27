/**
 * E2E: flujo de recuperación de contraseña (R1, R18 #50).
 * - GET /forgot → formulario visible sin sesión (R1)
 * - POST /forgot → respuesta neutra
 * - extraer token del DB (dry-run, sin SMTP)
 * - GET /reset/[token] → formulario nueva contraseña (R9)
 * - POST /reset/[token] → redirect /login?reset=ok (R12)
 * - login con la nueva contraseña
 * - pantalla amable con token inválido (R10)
 */
import { expect, test } from '@playwright/test';
import { createSql } from '../src/lib/server/db/client';
import { runMigrations } from '../src/lib/server/db/migrate';
import { runSeed } from '../src/lib/server/db/seed';
import { withDbSuiteLock } from '../tests/helpers/db-lock';
import { hashToken, PASSWORD_RESET_TTL_MIN } from '../src/lib/server/auth/password-reset';
import { randomBytes } from 'node:crypto';

const sql = createSql(
  process.env.DATABASE_URL ?? 'postgres://auditapp:changeme@localhost:5432/auditapp'
);

const TEST_EMAIL = 'admin@serviciosysistemas.com.ar';
const ORIGINAL_PASS = 'changeme-admin';
const NEW_PASS = 'nuevaclave-e2e-2026';

test.beforeAll(async () => {
  await withDbSuiteLock(sql, async (s) => {
    await runMigrations(s);
    await runSeed(s);
  });
});

test.afterAll(async () => {
  // Restaurar contraseña original via seed (reejecutar seed es idempotente para users)
  await sql`UPDATE app_user SET password_hash = ${
    // Usamos el hash guardado antes del test (ver beforeEach)
    // Como simplificación: restauramos via seed completo que resetea passwords
    // En realidad el seed no regenera hashes — usamos la contraseña del test
    // La contraseña puede haber cambiado; el seed es idempotente pero no restaura passwords
    // Solución: guardamos el hash original en beforeAll (ver variable originalHash)
    'x'  // placeholder — se pisa en afterAll real abajo
  } WHERE email = ${TEST_EMAIL}`.catch(() => null);
  await sql`DELETE FROM password_reset_token`;
  await sql.end({ timeout: 5 });
});

let originalHash: string;

test.beforeAll(async () => {
  const [row] = await sql<{ password_hash: string }[]>`
    SELECT password_hash FROM app_user WHERE email = ${TEST_EMAIL}
  `;
  originalHash = row?.password_hash ?? '';
});

test.afterAll(async () => {
  if (originalHash) {
    await sql`UPDATE app_user SET password_hash = ${originalHash} WHERE email = ${TEST_EMAIL}`;
  }
  await sql`DELETE FROM password_reset_token`;
});

test('R1: GET /forgot sin sesión muestra el formulario', async ({ page }) => {
  await page.goto('/forgot');
  await expect(page.locator('h1')).toContainText('Recuperar');
  await expect(page.locator('input[name="email"]')).toBeVisible();
});

test('R2: POST /forgot con email inexistente muestra respuesta neutra', async ({ page }) => {
  await page.goto('/forgot');
  await page.fill('input[name="email"]', 'fantasma@example.com');
  await page.click('button[type="submit"]');
  await expect(page.locator('p[role="status"]')).toBeVisible({ timeout: 5_000 });
  const text = await page.locator('p[role="status"]').textContent();
  expect(text).toContain('Si el email');
});

test('R2: POST /forgot con email existente muestra la misma respuesta neutra', async ({ page }) => {
  await page.goto('/forgot');
  await page.fill('input[name="email"]', TEST_EMAIL);
  await page.click('button[type="submit"]');
  await expect(page.locator('p[role="status"]')).toBeVisible({ timeout: 5_000 });
  const text = await page.locator('p[role="status"]').textContent();
  expect(text).toContain('Si el email');
  // Limpiar
  await sql`DELETE FROM password_reset_token`;
});

test('R9, R12, R18: flujo completo forgot → reset → login con nueva contraseña', async ({
  page
}) => {
  // Paso 1: solicitar reseteo
  await page.goto('/forgot');
  await page.fill('input[name="email"]', TEST_EMAIL);
  await page.click('button[type="submit"]');
  await expect(page.locator('p[role="status"]')).toBeVisible({ timeout: 5_000 });

  // Paso 2: obtener token del DB (dry-run — sin SMTP real)
  const [row] = await sql<{ token_hash: string }[]>`
    SELECT token_hash FROM password_reset_token
    WHERE used_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
  `;
  expect(row).toBeDefined();

  // El token en claro no está en DB; debemos crear uno conocido directamente para e2e
  // Alternativa: insertar un token conocido en DB
  const knownToken = randomBytes(32).toString('base64url');
  const knownHash = hashToken(knownToken);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MIN * 60 * 1000);
  const [user] = await sql<{ id: string }[]>`SELECT id FROM app_user WHERE email = ${TEST_EMAIL}`;
  await sql`DELETE FROM password_reset_token`;
  await sql`
    INSERT INTO password_reset_token (user_id, token_hash, expires_at)
    VALUES (${user!.id}, ${knownHash}, ${expiresAt})
  `;

  // Paso 3: ir al formulario de reset con token conocido
  await page.goto(`/reset/${knownToken}`);
  await expect(page.locator('h1')).toContainText('Nueva contraseña');
  await expect(page.locator('input[name="nueva"]')).toBeVisible();

  // Paso 4: enviar nueva contraseña
  await page.fill('input[name="nueva"]', NEW_PASS);
  await page.fill('input[name="confirmacion"]', NEW_PASS);
  await page.click('button[type="submit"]');

  // Paso 5: debe redirigir a /login
  await page.waitForURL('**/login**', { timeout: 10_000 });

  // Paso 6: login con la nueva contraseña
  await page.fill('input[name="email"]', TEST_EMAIL);
  await page.fill('input[name="password"]', NEW_PASS);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/tablero', { timeout: 10_000 });
  await expect(page).toHaveURL(/tablero/);

  // Restaurar contraseña original para no romper otros tests
  await sql`UPDATE app_user SET password_hash = ${originalHash} WHERE email = ${TEST_EMAIL}`;
});

test('R10: /reset/[token] con token inválido muestra pantalla amable', async ({ page }) => {
  await page.goto('/reset/token-invalido-xyz-123');
  await expect(page.locator('h1')).toContainText('inválido');
  await expect(page.locator('a[href="/forgot"]')).toBeVisible();
});
