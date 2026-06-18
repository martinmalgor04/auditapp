# Implementación — 28_flujo_form_dinamico

**Fecha:** 2026-06-17
**Estado:** Completo, a espera de reviewer
**Tasks:** T1..T13 marcadas `[x]` en `specs/28_flujo_form_dinamico/tasks.md`

## Trazabilidad R ↔ test

| R | Test en `tests/form-dynamic-flow.test.ts` |
|---|---|
| R1 | `itemStatus` — `cubre R1: las tres categorías son alcanzables` |
| R2 | `itemStatus` — respondido con na=true, string, array no vacío, número, booleano |
| R3 | `itemStatus` — con_observacion cuando respondido y notes no vacío; notas vacías → respondido |
| R4 | `itemStatus` — pendiente para null, '', [], {rows:[]}, na=false |
| R5 | `grep: data-item-status` en field-renderer.svelte + prop `status` en FieldRenderer |
| R6 | `sectionProgress consistency` — estado derivado cambia al cambiar value/na/notes |
| R7 | Chip usa `inline-flex` dentro del flex-wrap existente — sin altura propia (layout-neutral) |
| R8 | `grep: data-action="next-pending"` en +page.svelte |
| R9 | `nextPending` — retorna ítem en sección activa cuando existe pendiente |
| R10 | `nextPending` — salta a siguiente sección cuando activa no tiene pendientes |
| R11 | `nextPending` — retorna null cuando no hay ningún pendiente |
| R12 | `nextPending` — búsqueda circular desde última sección; vuelve al inicio |
| R13 | `nextPending` — función pura: determinista, sin I/O |
| R14 | `grep: score-pulse` en live-section-score.svelte + prop `animating` pasado desde +page.svelte |
| R15 | Trigger de animación = `onSectionScore` del servidor, no recálculo local |
| R16 | `grep: @media (prefers-reduced-motion: reduce)` en live-section-score.svelte |
| R17 | `grep: --sys-fast` / `--sys-ease` en live-section-score.svelte |
| R18 | `sectionProgress` — retorna {answered, total} con conteo correcto por sección |
| R19 | `sectionProgress consistency` — usa misma definición que itemStatus |
| R20 | progressBySec es $derived de itemLocalState → reactivo a cambios de ítem |
| R21 | Sin cambios en save-response.ts, section-score.ts, live.ts ni migraciones SQL |
| R22 | Controles Anterior/Siguiente intactos en +page.svelte |
| R23 | progressBySec y animatingSectionId derivan del mismo state que LiveSectionScore |
| R24 | `pnpm test` — 186 test files / 982 passed / 2 skipped / 0 failed |

## Archivos creados

- `src/lib/client/form/item-status.ts` — funciones puras `itemStatus`, `sectionProgress`, tipo `ItemStatus`
- `src/lib/client/form/next-pending.ts` — función pura `nextPending`, tipo `PendingTarget`
- `tests/form-dynamic-flow.test.ts` — 38 tests (itemStatus, sectionProgress, nextPending, consistencia)

## Archivos modificados

- `src/lib/components/form/field-renderer.svelte` — prop `status?: ItemStatus`, chip `data-item-status`, `id="item-{item.id}"`
- `src/lib/components/form/live-section-score.svelte` — prop `animating?: boolean`, clase `.score-pulse`, keyframe, `prefers-reduced-motion`
- `src/lib/components/form/section-nav.svelte` — prop `sectionProgress?: Map<...>`, conteo n/total por sección
- `src/routes/(app)/auditorias/[id]/form/+page.svelte` — itemLocalState, itemStatuses, progressBySec, animatingSectionId, goToNextPending(), botón "Próximo pendiente →", props a componentes
- `specs/28_flujo_form_dinamico/tasks.md` — T1..T13 marcadas [x]
- `feature_list.json` — feature 28 → in_progress

## Verificación

- `pnpm run check`: 0 errores, 32 warnings (todos pre-existentes en otros archivos)
- `pnpm test`: 186 test files / 982 passed / 2 skipped / 0 failed
- No-regresión: form-autosave*, form-live-score, form-section-nav, form-item-ux, form-table-* — todos verdes
- Sin cambios a: migrations/, save-response.ts, section-score.ts, live.ts
