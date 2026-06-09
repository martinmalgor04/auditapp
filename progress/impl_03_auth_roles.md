# Implementación — 03_auth_roles

**Feature:** Auth, sesiones y roles  
**Fecha:** 2026-06-08  
**Agente:** implementer

## Resumen

Capa de autenticación interna (argon2id + cookie HttpOnly Secure), hooks de sesión con renovación sliding, guards por rol, rate limit en login, validación de token público de briefing y rutas mínimas (`/login`, `/logout`, `(app)/`, `/briefing/[token]`).

## Archivos creados/modificados

- `src/lib/server/auth/` — types, password, session, login, guards, briefing-token, rate-limit, index
- `src/lib/server/db/users.ts`, `sessions.ts`, `audits.ts`
- `src/hooks.server.ts`
- `src/app.d.ts` — `App.Locals.user`
- `src/routes/login/`, `logout/`, `(app)/`, `briefing/[token]/`
- `tests/auth/*.test.ts`, `tests/helpers/cookies.ts`, `tests/helpers/auth.ts`
- `tests/setup.ts` — SESSION_SECRET y PUBLIC_APP_URL para tests

## Trazabilidad

- R1 → `tests/auth/password.test.ts`
- R2 → `tests/auth/session.test.ts`, `tests/auth/login.test.ts`
- R3 → `tests/auth/session.test.ts` (Set-Cookie attrs), `tests/auth/login.test.ts`
- R4 → `tests/auth/hooks.test.ts`, `tests/auth/guards.test.ts`
- R5 → `tests/auth/session.test.ts` (expired), `tests/auth/hooks.test.ts`
- R6 → `tests/auth/session.test.ts` (sliding renew)
- R7 → `tests/auth/session.test.ts`, `tests/auth/login.test.ts` (logout)
- R8 → `tests/auth/login.test.ts` (generic message)
- R9 → `tests/auth/login.test.ts` (429)
- R10 → `tests/auth/guards.test.ts` (redirect)
- R11 → `tests/auth/guards.test.ts` (403 admin-only)
- R12 → `tests/auth/guards.test.ts` (staff pass)
- R13 → `tests/auth/briefing-token.test.ts` (lookup)
- R14 → `tests/auth/briefing-token.test.ts` (valid statuses)
- R15 → `tests/auth/briefing-token.test.ts` (invalid statuses)
- R16 → `tests/auth/briefing-token.test.ts` (no session cookie)
- R17 → `tests/auth/login.test.ts` (inactive user)
- R18 → `tests/auth/logging.test.ts`

## Verificación

```bash
pnpm test          # 85 tests OK
pnpm run check     # 0 errors
pnpm run build     # OK
./init.sh          # exit 0
```
