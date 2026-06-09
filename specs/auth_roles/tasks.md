# Tasks — auth_roles

Implementación en orden. Marcar `[x]` al completar. Requiere `modelo_datos` (#2) merged o disponible en branch con tablas seed. Documentar trazabilidad R→test en `progress/impl_auth_roles.md`.

## Prerrequisitos

- [ ] T0 — Confirmar `modelo_datos` (#2) implementado: tablas `app_user`, `session`, `audit.public_token`, seed admin + técnicos. Cubre: dependencia base.

## Dependencias (pnpm) y tipos

- [ ] T1 — Instalar `@node-rs/argon2` (o `argon2` si falla en target). Cubre: **R1**.
- [ ] T2 — Crear `src/lib/server/auth/types.ts` y extender `src/app.d.ts` con `App.Locals.user`. Cubre: **R4**.

## Capa password y session

- [ ] T3 — Implementar `password.ts` (hashPassword, verifyPassword). Cubre: **R1**.
- [ ] T4 — Añadir `tests/auth/password.test.ts`. Cubre: **R1**.
- [ ] T5 — Crear queries `src/lib/server/db/users.ts` y `sessions.ts`. Cubre: **R2, R7**.
- [ ] T6 — Implementar `session.ts` (create, resolve, destroy, renewSliding, cookie helpers). Cubre: **R2, R3, R5, R6, R7**.
- [ ] T7 — Añadir `tests/auth/session.test.ts` (integración con test DB). Cubre: **R2, R5, R6, R7**.

## Login, logout y rate limit

- [ ] T8 — Implementar `rate-limit.ts` con ventana 60s / 5 intentos por IP. Cubre: **R9**.
- [ ] T9 — Implementar `login.ts` (authenticate con mensaje genérico). Cubre: **R8, R17**.
- [ ] T10 — Crear `src/routes/login/+page.svelte` y `+page.server.ts` (Zod, rate limit, cookie, redirect). Cubre: **R2, R3, R8, R9, R17**.
- [ ] T11 — Crear `src/routes/logout/+server.ts`. Cubre: **R7**.
- [ ] T12 — Añadir `tests/auth/login.test.ts` y casos rate limit. Cubre: **R2, R3, R8, R9, R17**.
- [ ] T13 — Añadir `tests/auth/logging.test.ts` (sin password en logs). Cubre: **R18**.

## Hooks

- [ ] T14 — Implementar `src/hooks.server.ts` resolviendo cookie → user → locals. Cubre: **R4, R5, R6**.
- [ ] T15 — Test de hook con cookie válida/expirada/inexistente. Cubre: **R4, R5**.

## Guards

- [ ] T16 — Implementar `guards.ts` (requireUser, requireStaff, requireAdmin, assertAdminOnly). Cubre: **R11, R12**.
- [ ] T17 — Crear `src/routes/(app)/+layout.server.ts` con `requireStaff`. Cubre: **R10, R12**.
- [ ] T18 — Añadir ruta stub protegida en `(app)/` para tests (p. ej. `(app)/+page.server.ts`). Cubre: **R10, R12**.
- [ ] T19 — Añadir `tests/auth/guards.test.ts` (admin vs tecnico vs anónimo, admin-only 403). Cubre: **R10, R11, R12**.

## Token de briefing

- [ ] T20 — Crear query `findAuditByPublicToken` en `src/lib/server/db/audits.ts`. Cubre: **R13**.
- [ ] T21 — Implementar `briefing-token.ts` (resolveBriefingByToken, isBriefingStatusValid). Cubre: **R13, R14, R15**.
- [ ] T22 — Crear `src/routes/briefing/[token]/+page.server.ts` y `+page.svelte` (placeholder + mensaje enlace no disponible). Cubre: **R15, R16**.
- [ ] T23 — Añadir `tests/auth/briefing-token.test.ts` (estados válidos/inválidos, sin cookie). Cubre: **R13, R14, R15, R16**.

## Cierre

- [ ] T24 — Crear `src/lib/server/auth/index.ts` con re-exports. Cubre: convención de módulo.
- [ ] T25 — Ejecutar `pnpm test`, `pnpm run check`, `pnpm run build`. Cubre: todos.
- [ ] T26 — Ejecutar `./init.sh` exit code 0. Cubre: gate arnés.
- [ ] T27 — Documentar trazabilidad R→test en `progress/impl_auth_roles.md`. Cubre: todos.

## Trazabilidad esperada (plantilla)

```markdown
## Trazabilidad
- R1 → tests/auth/password.test.ts
- R2 → tests/auth/session.test.ts, tests/auth/login.test.ts
- R3 → tests/auth/login.test.ts (Set-Cookie)
- R4 → test hook + tests/auth/guards.test.ts
- R5 → tests/auth/session.test.ts (expired)
- R6 → tests/auth/session.test.ts (sliding renew)
- R7 → tests/auth/session.test.ts, tests/auth/login.test.ts (logout)
- R8 → tests/auth/login.test.ts (generic message)
- R9 → tests/auth/login.test.ts (429)
- R10 → tests/auth/guards.test.ts (redirect)
- R11 → tests/auth/guards.test.ts (403 admin-only)
- R12 → tests/auth/guards.test.ts (staff pass)
- R13 → tests/auth/briefing-token.test.ts (lookup)
- R14 → tests/auth/briefing-token.test.ts (valid statuses)
- R15 → tests/auth/briefing-token.test.ts (invalid statuses)
- R16 → tests/auth/briefing-token.test.ts (no session cookie)
- R17 → tests/auth/login.test.ts (inactive user)
- R18 → tests/auth/logging.test.ts
```
