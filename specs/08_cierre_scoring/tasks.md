# Tasks — #8 08_cierre_scoring

Implementación en orden. Marcar `[x]` al completar. Documentar trazabilidad R→test en `progress/impl_08_cierre_scoring.md`.

**Precondición:** features #1–#4 y #7 en `done`.

## Motor de scoring (dominio puro)

- [ ] T1 — Crear `src/lib/server/scoring/types.ts` y `constants.ts` (`SECTION_WEIGHT_FACTORS`, semáforo, umbrales edad). Cubre: **R3, R9**.
- [ ] T2 — Implementar `score-item.ts` (bool, tri, select, thresholds, required penalty). Cubre: **R1**.
- [ ] T3 — Implementar `inventory-eol.ts` (EOL fabricante + fallback PC/infra). Cubre: **R6**.
- [ ] T4 — Implementar `score-section.ts` y `score-template.ts` (exclusión CAB/N/A). Cubre: **R2, R4**.
- [ ] T5 — Implementar `score-audit.ts` (map IT/ERP, sin global) y `semaphore.ts`. Cubre: **R5, R9**.
- [ ] T6 — Tests unitarios puros: `tests/scoring/item-score.test.ts`, `section-score.test.ts`, `template-index.test.ts`, `inventory-eol.test.ts`, `determinism.test.ts`, `semaphore.test.ts`. Cubre: **R1–R6, R8, R9**.

## Persistencia y API de dominio

- [ ] T7 — Implementar `persist.ts` + queries SQL upsert `audit_section_score` y merge índices en `audit_closure`. Cubre: **R7, R5**.
- [ ] T8 — Implementar `live.ts` (`computeLiveScores` sin writes). Cubre: **R23**.
- [ ] T9 — Implementar `schemas.ts` Zod para campos cualitativos de cierre. Cubre: **R13, R14, R15, R16**.
- [ ] T10 — Wire transición `en_relevamiento → en_cierre` en backoffice para llamar `recalculateAndPersistScores`. Cubre: **R10**.
- [ ] T11 — `tests/scoring/persist-section-score.test.ts` y `tests/scoring/live-score.test.ts`. Cubre: **R7, R23**.

## Pantalla de cierre

- [ ] T12 — Ruta `(app)/auditorias/[id]/cierre/+page.server.ts` con guards y load (índices, secciones, campos). Cubre: **R11, R12**.
- [ ] T13 — `+page.svelte`: semáforos, scores por sección, form top 5 riesgos, quick wins, upsell, next step. Cubre: **R12, R13, R14, R15, R16**.
- [ ] T14 — Actions `saveClosure`, `confirmClosure` (advertencia blanda), `reopenAudit` (solo admin). Cubre: **R18, R19, R20, R21, R22**.
- [ ] T15 — Implementar `preview.ts` y ruta `cierre/preview/` (HTML legible, sin upsell). Cubre: **R17**.

## Tests API e integración

- [ ] T16 — `tests/api/closure-transition.test.ts`. Cubre: **R10**.
- [ ] T17 — `tests/api/closure-routes.test.ts` (auth, read-only cerrada). Cubre: **R11, R22**.
- [ ] T18 — `tests/api/closure-save.test.ts`. Cubre: **R13, R14, R15, R16**.
- [ ] T19 — `tests/api/closure-confirm.test.ts` (cerrada, token null, warning vacíos). Cubre: **R18, R19, R20**.
- [ ] T20 — `tests/api/closure-reopen.test.ts`. Cubre: **R21**.
- [ ] T21 — `tests/api/closure-preview.test.ts`. Cubre: **R17**.
- [ ] T22 — Verificar upsell ausente en briefing público (regresión con #5). Cubre: **R15**.

## Integración form técnico (#7)

- [ ] T23 — Exponer endpoint o load helper que use `computeLiveScores` en form PWA (solo lectura + semáforo). Cubre: **R23** (contrato con implementer #7).

## Cierre

- [ ] T24 — Ejecutar `./init.sh`, `pnpm run check`, `pnpm test`. Cubre: todos.
- [ ] T25 — Documentar trazabilidad R→test en `progress/impl_08_cierre_scoring.md`. Cubre: todos.

## Trazabilidad esperada (plantilla)

```markdown
| R | Test |
|---|---|
| R1 | tests/scoring/item-score.test.ts |
| R2 | tests/scoring/section-score.test.ts |
| R3 | tests/scoring/template-index.test.ts > weight factors |
| R4 | tests/scoring/template-index.test.ts > excludes CAB/NA |
| R5 | tests/scoring/template-index.test.ts > separate indices |
| R6 | tests/scoring/inventory-eol.test.ts |
| R7 | tests/scoring/persist-section-score.test.ts |
| R8 | tests/scoring/determinism.test.ts |
| R9 | tests/scoring/semaphore.test.ts |
| R10 | tests/api/closure-transition.test.ts |
| R11 | tests/api/closure-routes.test.ts |
| R12 | tests/api/closure-page.test.ts |
| R13–R16 | tests/api/closure-save.test.ts |
| R17 | tests/api/closure-preview.test.ts |
| R18–R20 | tests/api/closure-confirm.test.ts |
| R21 | tests/api/closure-reopen.test.ts |
| R22 | tests/api/closure-routes.test.ts |
| R23 | tests/scoring/live-score.test.ts |
```
