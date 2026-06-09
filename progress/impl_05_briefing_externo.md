# Implementación — 05_briefing_externo

Feature: formulario público `/briefing/[token]` con autosave, envío y UX mobile-first SyS.

## Resumen

- Dominio en `src/lib/server/briefing/` (validate, load, save, submit, rate-limit, schemas).
- DB queries en `src/lib/server/db/briefing.ts`.
- API `PATCH /api/briefing/[token]/responses` con envelope JSON.
- UI: layout marca, wizard condicional, field renderers MVP, confirmación post-envío.
- Tests: 7 archivos vitest + `e2e/briefing.spec.ts`.
- `token_expires_at` no existe en schema (#2); vigencia solo por `audit.status`.

## Trazabilidad

- R1 → `tests/api/briefing-load.test.ts`, `e2e/briefing.spec.ts`
- R2 → `tests/briefing-form.test.ts`
- R3 → `tests/api/briefing-save.test.ts`
- R4 → `tests/api/briefing-submit.test.ts`
- R5 → `tests/api/briefing-load.test.ts`, `e2e/briefing.spec.ts` (token inválido)
- R6 → `e2e/briefing.spec.ts` (viewport 375×667, logo, botón Enviar)
- R7 → `tests/api/briefing-save.test.ts` (403 ítem técnico / desconocido)
- R8 → `tests/briefing-token.test.ts`
- R9 → `tests/api/briefing-submit.test.ts`, `e2e/briefing.spec.ts` (confirmación)
- R10 → `tests/briefing-form.test.ts`, `e2e/briefing.spec.ts` (Hola, {razon_social})
- R11 → `tests/api/briefing-rate-limit.test.ts`
- R12 → `tests/briefing-validation.test.ts`
- R13 → `tests/briefing-form.test.ts` (stepCount 1 vs 2/3)
- R14 → suite `tests/api/briefing-*` + `tests/briefing-*`
- R15 → `e2e/briefing.spec.ts` flujo feliz

## Fix aislamiento tests (post-review)

Problema: `getSql()` y el cliente `sql` del test usaban conexiones distintas; `retry` re-ejecutaba tests que mutan DB; `global-setup` y hooks del worker hacían `runSeed` concurrente (FK `template_item_section_id_fkey`); e2e sembraba la auditoría antes del `build`.

Cambios:

- `src/lib/server/db/client.ts` — bridge `globalThis.__auditapp_test_sql_bridge__`; `setSqlForTests` / `clearSqlForTests` / `resetSqlForTests`.
- `tests/helpers/db.ts` — conexión compartida `max:1`, mutex JS `withTestDbSerial`, `ensureBaselineSeed` (seed una vez + truncate volátil), `closeTestDb` en global-teardown.
- `tests/setup.ts` — `beforeAll` seed por archivo; `beforeEach` truncate volátil + bridge; `afterEach` re-vincula bridge (full reset solo en `beforeAll` de `users-admin` / `templates-admin`).
- `tests/global-setup.ts` — solo migraciones (sin seed duplicado en proceso padre).
- `tests/fixtures/briefing-audit.ts` + `tests/helpers/backoffice.ts` — `setSqlForTests(sql)` antes de inserts.
- `vite.config.ts` — `singleFork`, `retry: 0` (obligatorio: retry re-ejecuta tests que mutan DB), `hooks: 'list'`, `globalTeardown`.
- `playwright.config.ts` — `build && ensure-audit && preview` (seed e2e inmediato antes del servidor).
- `e2e/ensure-audit.ts` — TRUNCATE + `runSeed` + fila con token `e2e-briefing-token-demo`.

## Verificación

- `pnpm test` — 160 tests verdes (no correr vitest en paralelo con playwright/e2e)
- `pnpm run check` — 0 errores
- `pnpm exec playwright test e2e/briefing.spec.ts` — 2 tests verdes
- `./init.sh` — exit 0
