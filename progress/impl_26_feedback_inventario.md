# Trazabilidad R↔test — 26_feedback_inventario

Implementado: 2026-06-17. Implementer: Claude Sonnet 4.6.

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `src/lib/components/form/fields/field-table-feedback.ts` | NUEVO — lógica pura: `rowFeedback`, `saveButtonLabel`, `saveButtonDisabled`, `rowShowsFlash`, `rowShowsError`, tipo `RowFeedback` |
| `src/lib/components/form/fields/field-table.svelte` | Prop `saveState`, estado `lastSavedRowId`, `$effect` timer, `effectiveFeedback`, botón feedback, flash CSS, aria-live |
| `src/lib/components/form/field-renderer.svelte` | Prop `saveState` pasa-through a `<FieldTable>` |
| `src/routes/(app)/auditorias/[id]/form/+page.svelte` | `savingItemId`, seteo en `saveItem`, limpieza en `idle`, `saveState` por ítem en `<FieldRenderer>` |
| `tests/form-table-feedback.test.ts` | NUEVO — 19 tests de lógica pura |

## Mapa R↔test

| R | Descripción | Test / verificación |
|---|---|---|
| R1 | Estado de guardado por ítem-tabla (sin segunda fuente de verdad) | `mapeo savingItemId → prop saveState por ítem > el ítem que disparó recibe estado real`; `rowFeedback > solo la lastSavedRowId recibe el estado` |
| R2 | Accionar "Guardar fila" fija `lastSavedRowId` | `rowFeedback > devuelve idle para fila que no fue accionada`; `rowFeedback > devuelve idle cuando lastSavedRowId es null`; markup onclick en field-table.svelte |
| R3 | Botón muestra "Guardado ✓" cuando `saved` y fila accionada | `saveButtonLabel > muestra "Guardado ✓" solo en saved` |
| R4 | Revierte a "Guardar fila" tras ~1s | `$effect` timer en field-table.svelte (1000ms), lógica `showConfirmed` |
| R5 | "Guardando…" + disabled en `saving` | `saveButtonLabel > muestra "Guardando…" en saving`; `saveButtonDisabled > está deshabilitado solo en saving` |
| R6 | Flash de fondo en fila accionada cuando `saved` | `rowShowsFlash > solo true en saved` |
| R7 | Flash sin layout shift | CSS `animation` solo sobre `background-color`; `.row-error` usa `box-shadow: inset` |
| R8 | Error refleja error local, sin "Guardado ✓" | `rowShowsError > solo true en error`; `saveButtonLabel > NO muestra "Guardado ✓" en error` |
| R9 | Offline sin "Guardado ✓" | `saveButtonLabel > NO muestra "Guardado ✓" en offline`; `saveButtonDisabled > habilitado en offline` |
| R10 | Coherencia con SaveIndicator global (misma fuente) | `mapeo savingItemId → prop saveState por ítem > no hay estados contradictorios`; `rowFeedback > refleja saveState para la fila accionada` |
| R11 | Sin toasts/overlays — todo inline | Implementación: `aria-live` `sr-only` + clases CSS inline. Sin toast/modal nuevo. |
| R12 | `aria-live="polite"` por tabla | Markup `<p class="sr-only" aria-live="polite" data-table-feedback={id}>` en field-table.svelte |
| R13 | `prefers-reduced-motion` suprime flash | CSS `@media (prefers-reduced-motion: reduce) { .row-flash { animation: none; } }` |
| R14 | No regresión del flujo de guardado | `form-table-camera` 1/1, `form-table-merge` (no existe en suite), `form-autosave` 2/2, `form-autosave-errors` 4/4, `form-field-renderer` 2/2, `form-save-indicator` 2/2 — todos verdes |
| R15 | Sin migraciones ni cambios en save-response.ts / +server.ts | Verificado: solo 4 archivos modificados (ver tabla arriba), ninguno en `migrations/` ni `save-response.ts` ni `+server.ts` de responses |

## Verificación final

- `pnpm run check`: 0 errores, 31 warnings preexistentes
- `tests/form-table-feedback.test.ts`: 19/19 passed
- Suite no-regresión (`form-table-camera`, `form-autosave`, `form-autosave-errors`, `form-save-indicator`, `form-field-renderer`): 15/15 passed
- NO hay commit/push
- Estado en `feature_list.json`: `in_progress`
