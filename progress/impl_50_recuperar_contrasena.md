# Impl #50 — Recuperar contraseña por email

## Mapa R ↔ test

| Req | Test |
|---|---|
| R1 — GET /forgot rinde formulario sin auth | `e2e/recuperar-contrasena.spec.ts` |
| R2 — POST /forgot respuesta siempre neutra | `tests/api/forgot.test.ts` — misma respuesta con email existente vs inexistente |
| R3 — Email inválido no filtra info | `tests/forgot-schema.test.ts`; `tests/api/forgot.test.ts` |
| R4 — Token de un solo uso hasheado en DB | `tests/api/forgot.test.ts` — token_hash presente, claro ausente |
| R5 — Usuario inactivo/inexistente no genera token | `tests/api/forgot.test.ts` |
| R6 — Nuevo token invalida los anteriores | `tests/api/forgot.test.ts` — invalidación previa verificada |
| R7 — sendEmail con password_reset + resetUrl | `tests/api/forgot.test.ts` |
| R8 — Plantilla password_reset branded | `tests/email-templates.test.ts` |
| R9 — GET /reset/[token] vigente muestra form | `tests/api/reset.test.ts`; `e2e/recuperar-contrasena.spec.ts` |
| R10 — Token inválido/expirado pantalla amable | `tests/api/reset.test.ts` |
| R11 — Política fortaleza Zod compartida | `tests/reset-schema.test.ts`; `tests/api/reset.test.ts` |
| R12 — Reseteo exitoso argon2id | `tests/api/reset.test.ts` — verifyPassword true |
| R13 — Token consumido (un solo uso) | `tests/api/reset.test.ts` — used_at non-null; segundo POST falla |
| R14 — Todas las sesiones invalidadas | `tests/api/reset.test.ts` |
| R15 — Atomicidad de la transacción | `tests/api/reset.test.ts` |
| R16 — Rate limit /forgot y /reset | `tests/passwordreset-rate-limit.test.ts` |
| R17 — Migración idempotente | `tests/passwordreset-schema.test.ts` |
| R18 — Suite completa tests + e2e | `pnpm test` 250/250; `e2e/recuperar-contrasena.spec.ts` |

## Archivos creados/modificados

- `migrations/027_recuperar_contrasena.sql` — preexistente (T1 ya estaba hecho)
- `src/lib/server/db/password-reset-tokens.ts` — CRUD de tokens (T2)
- `src/lib/server/db/sessions.ts` — `deleteAllSessionsForUser` (T3)
- `src/lib/server/auth/password-policy.ts` — `strongPassword` compartido (T5)
- `src/lib/server/auth/password-reset.ts` — dominio completo (T6)
- `src/lib/server/auth/rate-limit.ts` — `isPasswordResetRateLimited` (T7)
- `src/lib/server/email/templates.ts` — render `password_reset` completado (T9)
- `src/routes/forgot/+page.server.ts` + `+page.svelte` (T11)
- `src/routes/reset/[token]/+page.server.ts` + `+page.svelte` (T12)
- `tests/passwordreset-rate-limit.test.ts` — fix require→import (corrección menor)

## Resultado verificación

```
pnpm run check: 0 errors, 44 warnings (pre-existentes)
pnpm test: 250 passed, 2 skipped
./init.sh: OK
```
