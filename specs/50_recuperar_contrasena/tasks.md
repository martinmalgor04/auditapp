# Tasks — #50 50_recuperar_contrasena

> Orden de implementación. Cada paso referencia los `R<n>` que cubre.
> No empezar hasta que el spec esté aprobado por humano (puerta SDD).
> **Precondición:** #49 (servicio email) implementado — plantilla `password_reset` reservada y
> tabla `email_log` disponibles. La migración de #50 va **después** de la de #49.

## Schema y DB

- [x] T1 — Crear `migrations/0NN_recuperar_contrasena.sql` (post-#49): tabla
  `password_reset_token` (`id`, `user_id` FK→`app_user` ON DELETE CASCADE, `token_hash` text,
  `expires_at` timestamptz, `used_at` timestamptz null, `created_at`) + índice único
  `password_reset_token_hash_uq` y los índices por `user_id`/`expires_at`, todo `IF NOT EXISTS`
  (idempotente). Cubre: R17.

- [x] T2 — Crear `src/lib/server/db/password-reset-tokens.ts`: `ResetTokenRow`, `insertResetToken`,
  `findResetTokenByHash`, `markResetTokenUsed`, `invalidateUserResetTokens`. SQL parametrizado.
  Cubre: R4, R6, R10, R13.

- [x] T3 — Extender `src/lib/server/db/sessions.ts`: `deleteAllSessionsForUser(userId)`
  (`DELETE FROM session WHERE user_id = $1`). Cubre: R14.

- [x] T4 — `tests/passwordreset-schema.test.ts`: aplicar la migración dos veces sin error; verificar
  columnas e índice único. Cubre: R17.

## Dominio / schema

- [x] T5 — Política de fortaleza compartida: extraer/declarar `strongPassword` en
  `src/lib/server/auth/password-policy.ts` (reusable por #48 y #50) o reusar el de #48. Cubre: R11.

- [x] T6 — Crear `src/lib/server/auth/password-reset.ts`: `PASSWORD_RESET_TTL_MIN`, `forgotSchema`,
  `resetPasswordSchema` (`.strict`, `strongPassword` + confirmación cruzada), `hashToken` (SHA-256),
  `requestPasswordReset` (token aleatorio `randomBytes(32).base64url`, hash en DB, invalidar previos,
  `sendEmail('password_reset', ...)`, no-op silencioso si user inexistente/inactivo),
  `resolveResetToken`, `completePasswordReset` (transacción: hash argon2id → `used_at` → borrar
  sesiones). Cubre: R2, R3, R4, R5, R6, R7, R9, R10, R11, R12, R13, R14, R15.

- [x] T7 — Extender `src/lib/server/auth/rate-limit.ts`: `isPasswordResetRateLimited(ip)`
  (misma ventana/umbral, sin tocar `isLoginRateLimited`). Cubre: R16.

- [x] T8 — `tests/forgot-schema.test.ts` y `tests/reset-schema.test.ts`: validación de email y de
  política de contraseña + confirmación. Cubre: R3, R11.

## Email

- [x] T9 — Extender `src/lib/server/email/templates.ts`: completar el `render` de la entrada
  reservada `password_reset` (HTML branded SyS + texto plano: saludo `nombre`, botón `resetUrl`,
  aviso `expiraEnMin`, nota «si no lo solicitaste, ignoralo»). Cubre: R8.

- [x] T10 — Extender `tests/email-templates.test.ts`: render de `password_reset` con datos válidos
  (incluye `resetUrl`/`expiraEnMin`) e inválidos. Cubre: R8.

## Rutas públicas

- [x] T11 — Crear `src/routes/forgot/+page.server.ts` (`actions.default`: rate limit → `forgotSchema`
  → `requestPasswordReset` → respuesta neutra) y `+page.svelte` (form email branded, `use:enhance`,
  mensaje neutro). Cubre: R1, R2, R3, R16.

- [x] T12 — Crear `src/routes/reset/[token]/+page.server.ts` (`load`: `resolveResetToken`;
  `actions.default`: rate limit → `resetPasswordSchema` → `completePasswordReset` →
  `redirect 303 /login?reset=ok`) y `+page.svelte` (form nueva+confirmación si vigente; pantalla
  amable + link a `/forgot` si inválido/expirado; toasts #38). Cubre: R9, R10, R11, R12, R16.

## Integración y e2e

- [x] T13 — `tests/api/forgot.test.ts`: respuesta neutra (existente vs inexistente), email inválido
  no genera token ni envía, usuario inactivo no-op, token hasheado (no claro), invalidación de
  previos, `sendEmail` invocado con `password_reset`+`resetUrl`. Cubre: R2, R3, R4, R5, R6, R7.

- [x] T14 — `tests/api/reset.test.ts`: token vigente/inexistente/expirado/usado, política débil no
  cambia hash, reseteo argon2id (`verifyPassword` true), un-solo-uso (segundo POST falla),
  invalidación de todas las sesiones, atomicidad ante fallo. Cubre: R9, R10, R11, R12, R13, R14, R15.

- [x] T15 — `tests/passwordreset-rate-limit.test.ts`: 6.º POST en la ventana rechazado en `/forgot`
  y `/reset`; `/forgot` rate-limitado sigue neutro. Cubre: R16.

- [x] T16 — `e2e/recuperar-contrasena.spec.ts`: flujo forgot → mail en dry-run (#49) → extraer link
  → reset → login con la nueva contraseña; pantalla amable con token inválido. Cubre: R1, R18.

## Cierre

- [x] T17 — Verificar trazabilidad (cada R con test), `pnpm run check`, `pnpm test` y el e2e en
  verde; `./init.sh` ok. Registrar mapa en `progress/impl_50_recuperar_contrasena.md`. Cubre: R18.
