# Implementación #8 `08_cierre_scoring`

## Trazabilidad R → test

| R | Test |
|---|---|
| R1 | tests/scoring/item-score.test.ts |
| R2 | tests/scoring/section-score.test.ts |
| R3 | tests/scoring/template-index.test.ts > applies weight factors |
| R4 | tests/scoring/template-index.test.ts > excludes CAB and all-na sections |
| R5 | tests/scoring/template-index.test.ts > combo audit stores separate it and erp indices |
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
| R15 (regresión briefing) | tests/api/briefing-load.test.ts > upsell absent |

## Entregables

- Motor scoring: `src/lib/server/scoring/{types,constants,score-item,score-section,score-template,score-audit,inventory-eol,semaphore,persist,live,preview,schemas,load-context}.ts`
- Pantalla cierre: `src/routes/(app)/auditorias/[id]/cierre/` + `preview/`
- Wire transición: `completeRelevamiento` → `recalculateAndPersistScores`
- Live scores form: `loadAuditForm` usa `computeLiveScores`

## Verificación

- `./init.sh` verde (218 tests)
- `pnpm run check` verde
- Feature **no** marcada `done` (pendiente reviewer)
