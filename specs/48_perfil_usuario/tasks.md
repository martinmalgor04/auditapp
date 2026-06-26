# Tasks — #48 48_perfil_usuario

> Orden de implementación. Cada paso referencia los `R<n>` que cubre.
> No empezar hasta que el spec esté aprobado por humano (puerta SDD).

## Schema y DB

- [ ] T1 — (Sin migración por defecto: `app_user.name` ya cumple — ver design §Cambios de
  schema.) Solo si la puerta decide separar nombre visible: crear
  `migrations/026_perfil_display_name.sql` idempotente (`ADD COLUMN IF NOT EXISTS display_name`).
  Cubre: R2, R4.

- [ ] T2 — Extender `src/lib/server/db/users.ts`: `updateUserProfile(id, { name, email })`
  (UPDATE name/email; mapear UNIQUE `23505` de email → `{ ok:false, reason:'email_in_use' }`),
  `updateUserPasswordHash(id, hash)`, y `findUserByEmailExcept(email, excludeId)`. SQL
  parametrizado. Cubre: R4, R5, R10.

- [ ] T3 — Extender `src/lib/server/db/sessions.ts`: `deleteOtherSessions(userId, keepSessionId)`
  → `DELETE FROM session WHERE user_id = $1 AND id <> $2`. Cubre: R11.

## Dominio / schema

- [ ] T4 — Crear `src/lib/server/auth/profile.ts`: `profileUpdateSchema` (`.strict`, sin `role`),
  `passwordChangeSchema` (`.strict`, mín 10 / máx 200 / letra + dígito / confirmación coincide),
  `updateProfile({ user, raw })` (R4, R5), `changePassword({ user, currentSessionId, raw })`
  (verify actual con `verifyPassword` R6 → nueva≠actual R9 → `hashPassword` R10 →
  `deleteOtherSessions` R11). Resultados discriminados. Cubre: R3, R4, R5, R6, R7, R8, R9, R10, R11.

- [ ] T5 — `tests/perfil-schema.test.ts`: `profileUpdateSchema` (name/email válidos e inválidos,
  longitudes, `.strict`, sin `role`); `passwordChangeSchema` (fortaleza: < 10, sin letra, sin
  dígito, > 200; confirmación distinta). Cubre: R3, R4, R7, R8.

## Ruta `(app)/perfil`

- [ ] T6 — Crear `src/routes/(app)/perfil/+page.server.ts`: `load` con `requireUser` (R1) que
  devuelve `{ name, email, role }` de `locals.user` (R2, R12). `actions.perfil`
  (`requireUser` → `updateProfile` → `fail`/ok, R3/R4/R5). `actions.password` (`requireUser` →
  `currentSessionId = getSessionIdFromCookies(cookies)` → `changePassword` → `fail`/ok,
  R6–R11). Errores por caso, sin stack trace. Cubre: R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12.

- [ ] T7 — Crear `src/routes/(app)/perfil/+page.svelte`: UI branded `--sys-*`, mobile-first.
  Sección «Tus datos» (inputs name/email, rol read-only). Sección «Cambiar contraseña» (actual,
  nueva, confirmación). `use:enhance` en ambos forms; toast éxito/error (#38) según
  `form?.ok`/`form?.error`; `invalidateAll()` tras editar datos OK. Cubre: R2, R3, R13.

- [ ] T8 — `tests/api/perfil.test.ts`: load sin user → redirect /login (R1); load devuelve datos
  de locals.user (R2); POST con `role` no cambia rol (R3); edición válida persiste / inválida no
  (R4); email de otro → rechazo, mismo email propio OK (R5); POST con `userId` inyectado solo
  toca locals.user (R12). Cubre: R1, R2, R3, R4, R5, R12.

- [ ] T9 — `tests/api/perfil-password.test.ts`: actual incorrecta → no cambia hash (R6); nueva
  débil → rechazo (R7); confirmación distinta → rechazo (R8); nueva=actual → rechazo (R9); éxito
  → hash cambia, verify nueva true / actual false (R10); 3 sesiones → queda solo la actual (R11);
  guard de propiedad (R12). Cubre: R6, R7, R8, R9, R10, R11, R12.

## E2E

- [ ] T10 — `e2e/perfil.spec.ts`: login → abrir `/perfil` → cambiar contraseña (actual + nueva +
  confirmación) → ver toast de éxito → seguir navegando con la sesión actual. Cubre: R1, R13, R15.

## Cierre

- [ ] T11 — `pnpm run check` + `pnpm test` + `pnpm exec playwright test e2e/perfil.spec.ts` en
  verde. Mapa de trazabilidad en `progress/impl_48_perfil_usuario.md` (cada R con su test).
  Cubre: R14, R15.

## Trazabilidad R → Task

| R | Tasks |
|---|---|
| R1 | T6, T8, T10 |
| R2 | T1, T6, T7, T8 |
| R3 | T4, T5, T6, T7, T8 |
| R4 | T1, T2, T4, T5, T6, T8 |
| R5 | T2, T4, T6, T8 |
| R6 | T4, T6, T9 |
| R7 | T4, T5, T6, T9 |
| R8 | T4, T5, T6, T9 |
| R9 | T4, T6, T9 |
| R10 | T2, T4, T6, T9 |
| R11 | T3, T4, T6, T9 |
| R12 | T6, T8, T9 |
| R13 | T7, T10 |
| R14 | T5, T8, T9, T11 |
| R15 | T10, T11 |
