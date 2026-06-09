# Tasks — #5 05_briefing_externo

Implementación en orden. Marcar `[x]` al completar. Documentar trazabilidad R→test en `progress/impl_05_briefing_externo.md`.

> Prerrequisito: features #2–#4 en `done` (schema, auth token, backoffice genera link).

## Dominio y DB

- [x] T1 — Crear `src/lib/server/briefing/errors.ts` con `BriefingUnavailableError` y `BriefingItemNotAllowedError`. Cubre: **R5, R7**.
- [x] T2 — Implementar `src/lib/server/db/briefing.ts`: `findAuditByToken`, `listClienteItems`, `upsertResponse`, `updateAuditStatus`. Cubre: **R2, R3, R4, R8**.
- [x] T3 — Implementar `validate-token.ts` con reglas de vigencia (`status`, `token_expires_at`). Cubre: **R5, R8**.
- [x] T4 — Implementar `load-form.ts` (ítems + respuestas + `stepCount`). Cubre: **R2, R10, R13**.
- [x] T5 — Crear `schemas.ts` con validación Zod por `field_type` (permisiva R12). Cubre: **R12**.
- [x] T6 — Implementar `save-response.ts` con guard `filled_by=cliente` y upsert. Cubre: **R3, R7**.
- [x] T7 — Implementar `submit.ts` → `briefing_completo` idempotente. Cubre: **R4**.
- [x] T8 — Implementar `rate-limit.ts` y aplicarlo al endpoint de save. Cubre: **R11**.

## API y rutas

- [x] T9 — Crear `src/routes/api/briefing/[token]/responses/+server.ts` (PATCH, envelope JSON). Cubre: **R3, R7, R11**.
- [x] T10 — Verificar `hooks.server.ts`: `/briefing` y `/api/briefing` accesibles sin sesión. Cubre: **R1**.
- [x] T11 — Implementar `src/routes/briefing/[token]/+page.server.ts` (`load`, action `submit`). Cubre: **R1, R4, R5, R9**.
- [x] T12 — Añadir fixture `tests/fixtures/briefing-audit.ts` (audit `briefing_enviado`, ítems mixtos). Cubre: **R14**.

## UI y marca

- [x] T13 — Crear `src/lib/styles/brand.css` y `static/brand/sys-logo.svg` según skill `sys-brand`. Cubre: **R6**.
- [x] T14 — Implementar `+layout.svelte` briefing (mobile-first shell). Cubre: **R6**.
- [x] T15 — Crear componentes `briefing-unavailable`, `briefing-header`, `briefing-confirm`, `save-indicator`. Cubre: **R5, R6, R9, R10**.
- [x] T16 — Crear `field-renderer.svelte` + fields MVP (`text`, `number`, `bool`, `tri`, `select`, `multiselect`, `date`, `list`). Cubre: **R2, R6**.
- [x] T17 — Implementar `briefing-wizard.svelte` (1 página vs 2–3 pasos si >8 ítems). Cubre: **R13**.
- [x] T18 — Implementar `+page.svelte`: autosave debounced vía PATCH, indicador, botón Enviar. Cubre: **R3, R6**.

## Tests unitarios e integración

- [x] T19 — `tests/briefing-token.test.ts` (matriz estados/expiración). Cubre: **R8**.
- [x] T20 — `tests/briefing-form.test.ts` (solo ítems cliente, header, wizard). Cubre: **R2, R10, R13**.
- [x] T21 — `tests/briefing-validation.test.ts` (validación permisiva). Cubre: **R12**.
- [x] T22 — `tests/api/briefing-load.test.ts` (sin auth, token inválido). Cubre: **R1, R5**.
- [x] T23 — `tests/api/briefing-save.test.ts` (upsert, rechazo ítem no permitido). Cubre: **R3, R7**.
- [x] T24 — `tests/api/briefing-submit.test.ts` (transición estado, confirmación). Cubre: **R4, R9**.
- [x] T25 — `tests/api/briefing-rate-limit.test.ts`. Cubre: **R11**.

## E2E y cierre

- [x] T26 — Crear `e2e/briefing.spec.ts`: flujo feliz mobile + token inválido. Cubre: **R1, R5, R6, R9, R15**.
- [x] T27 — Ejecutar `pnpm test` y `pnpm exec playwright test e2e/briefing.spec.ts` en verde. Cubre: **R14, R15**.
- [x] T28 — Ejecutar `./init.sh` exit code 0. Cubre: todos.
- [x] T29 — Completar trazabilidad R→test en `progress/impl_05_briefing_externo.md`. Cubre: todos.

## Trazabilidad esperada (plantilla)

```markdown
## Trazabilidad
- R1 → briefing-load.test.ts, e2e/briefing.spec.ts
- R2 → briefing-form.test.ts
- R3 → briefing-save.test.ts
- R4 → briefing-submit.test.ts
- R5 → briefing-load.test.ts, e2e token inválido
- R6 → e2e viewport móvil + layout
- R7 → briefing-save.test.ts (403)
- R8 → briefing-token.test.ts
- R9 → briefing-submit.test.ts, e2e confirmación
- R10 → briefing-form.test.ts, e2e header
- R11 → briefing-rate-limit.test.ts
- R12 → briefing-validation.test.ts
- R13 → briefing-form.test.ts (wizard)
- R14 → suite tests/api/briefing-*
- R15 → e2e/briefing.spec.ts flujo feliz
```
