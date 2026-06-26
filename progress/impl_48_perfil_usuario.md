# Implementación #48 — 48_perfil_usuario

Perfil de usuario propio + cambio de contraseña autenticado. Ruta `(app)/perfil` con dos
form actions (`?/perfil`, `?/password`). Identidad siempre derivada de `locals.user` (R12).

## Tasks

- [x] T1 — Sin migración (la columna `app_user.name` ya cumple como nombre visible).
- [x] T2 — `src/lib/server/db/users.ts`: `updateUserProfile` (UNIQUE 23505 → `email_in_use`),
  `updateUserPasswordHash`, `findUserByEmailExcept`.
- [x] T3 — `src/lib/server/db/sessions.ts`: `deleteOtherSessions(userId, keepSessionId)`.
- [x] T4 — `src/lib/server/auth/profile.ts`: `profileUpdateSchema`, `passwordChangeSchema`,
  `updateProfile`, `changePassword`.
- [x] T5 — `tests/perfil-schema.test.ts`.
- [x] T6 — `src/routes/(app)/perfil/+page.server.ts`: `load` + actions `perfil`/`password`.
- [x] T7 — `src/routes/(app)/perfil/+page.svelte`: UI branded SyS, mobile-first, toasts.
- [x] T8 — `tests/api/perfil.test.ts`.
- [x] T9 — `tests/api/perfil-password.test.ts`.
- [x] T10 — `e2e/perfil.spec.ts`.
- [x] T11 — `pnpm run check` (0 errores) + `pnpm test`. Trazabilidad abajo.

## Trazabilidad R → test

| R | Test |
|---|---|
| R1 | `tests/api/perfil.test.ts` (load sin user → redirect 303 /login); `e2e/perfil.spec.ts` |
| R2 | `tests/api/perfil.test.ts` (load devuelve name/email/role de locals.user) |
| R3 | `tests/perfil-schema.test.ts` (sin `role`, `.strict`); `tests/api/perfil.test.ts` (POST role=admin no cambia rol) |
| R4 | `tests/perfil-schema.test.ts` (name/email, longitudes); `tests/api/perfil.test.ts` (válido persiste / inválido no) |
| R5 | `tests/api/perfil.test.ts` (email de otro → 409; mismo email propio OK) |
| R6 | `tests/api/perfil-password.test.ts` (actual incorrecta → no cambia hash) |
| R7 | `tests/perfil-schema.test.ts` (<10, sin letra, sin dígito, >200); `tests/api/perfil-password.test.ts` (débil → no cambia) |
| R8 | `tests/perfil-schema.test.ts` (confirmación distinta); `tests/api/perfil-password.test.ts` |
| R9 | `tests/api/perfil-password.test.ts` (nueva = actual → rechazo) |
| R10 | `tests/api/perfil-password.test.ts` (hash cambia, verify nueva=true / actual=false) |
| R11 | `tests/api/perfil-password.test.ts` (3 sesiones → queda solo la actual) |
| R12 | `tests/api/perfil.test.ts` y `tests/api/perfil-password.test.ts` (userId inyectado ignorado) |
| R13 | `e2e/perfil.spec.ts` (toast de éxito branded) |
| R14 | `tests/perfil-schema.test.ts`, `tests/api/perfil.test.ts`, `tests/api/perfil-password.test.ts` |
| R15 | `e2e/perfil.spec.ts` (login → /perfil → cambiar contraseña → toast → sigue navegando) |

## Nota de infra de tests

`tests/setup.ts`: se agregó `perfil` a `SKIP_DB_RESET` para que `tests/api/perfil.test.ts`
gestione su propio reset/seed de usuarios (`resetAuthUsersForTests`) sin chocar con el advisory
lock del hold por test (mismo patrón que `perfil-password.test.ts`, ya cubierto por `password`).
