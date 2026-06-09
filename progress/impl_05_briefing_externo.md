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

## Verificación

- `pnpm test` — 145 tests verdes
- `pnpm run check` — 0 errores
- `pnpm exec playwright test e2e/briefing.spec.ts` — 2 tests verdes
- `./init.sh` — exit 0
