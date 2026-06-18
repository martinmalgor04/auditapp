# Review — feature 26_feedback_inventario

**Veredicto:** APPROVED

## Trazabilidad R↔test

| R | Descripción | Estado | Test / verificación |
|---|---|---|---|
| R1 | Estado de guardado por ítem-tabla, sin segunda fuente de verdad | ✓ | `mapeo savingItemId → prop saveState por ítem > el ítem que disparó recibe estado real`; `rowFeedback > solo la lastSavedRowId recibe el estado`; prop `saveState` en `field-table.svelte` y `field-renderer.svelte`; `savingItemId` en `+page.svelte` |
| R2 | Accionar "Guardar fila" fija `lastSavedRowId` | ✓ | `rowFeedback > devuelve idle para fila que no fue accionada`; `rowFeedback > devuelve idle cuando lastSavedRowId es null`; `onclick` en botón fija `lastSavedRowId = row.row_id` antes de `onchange?.()` |
| R3 | Botón muestra "Guardado ✓" cuando `saved` y fila accionada | ✓ | `saveButtonLabel > muestra "Guardado ✓" solo en saved` |
| R4 | Revierte a "Guardar fila" tras ~1 s | ✓ | `$effect` con `setTimeout(1000)` en `field-table.svelte:57-75`; limpia `showConfirmed` y `lastSavedRowId` |
| R5 | "Guardando…" + disabled en `saving` | ✓ | `saveButtonLabel > muestra "Guardando…" en saving`; `saveButtonDisabled > está deshabilitado solo en saving` |
| R6 | Flash de fondo en fila accionada cuando `saved` | ✓ | `rowShowsFlash > solo true en saved`; clase `row-flash` sobre `<div data-row-id>` |
| R7 | Flash sin layout shift | ✓ | CSS anima solo `background-color`; `.row-error` usa `box-shadow: inset` (no `border-width`) |
| R8 | Error refleja error local, sin "Guardado ✓" | ✓ | `rowShowsError > solo true en error`; `saveButtonLabel > NO muestra "Guardado ✓" en error`; timer cancelado al llegar `error` |
| R9 | Offline sin "Guardado ✓" | ✓ | `saveButtonLabel > NO muestra "Guardado ✓" en offline`; `saveButtonDisabled > habilitado en offline` |
| R10 | Coherencia con SaveIndicator global | ✓ | `mapeo savingItemId → no hay estados contradictorios`; el estado de la fila se deriva del mismo `SaveState` del autosave |
| R11 | Sin toasts/modales/overlays | ✓ | Solo markup inline con clases CSS; `aria-live` en `sr-only`; sin componentes de overlay nuevos |
| R12 | `aria-live="polite"` por tabla | ✓ | `<p class="sr-only" aria-live="polite" data-table-feedback={id}>` en `field-table.svelte:133` |
| R13 | `prefers-reduced-motion` suprime flash | ✓ | `@media (prefers-reduced-motion: reduce) { .row-flash { animation: none; } }` en `field-table.svelte:231-233` |
| R14 | No regresión del flujo de guardado | ✓ | Suites `form-table-camera` 1/1, `form-autosave` 2/2, `form-autosave-errors` 4/4, `form-field-renderer` 2/2, `form-save-indicator` 2/2, `form-table-merge` 4/4 — todas verdes |
| R15 | Sin migraciones ni cambios en save-response.ts / +server.ts | ✓ | `git diff HEAD -- migrations/ save-response.ts responses/+server.ts` → sin output (ningún cambio) |

## Tasks

| Task | Estado |
|---|---|
| T1 — Lógica pura en `field-table-feedback.ts` | ✓ |
| T2 — Prop `saveState` y `lastSavedRowId` en `field-table.svelte` | ✓ |
| T3 — Botón con `saveButtonLabel`/`saveButtonDisabled`/clases por estado | ✓ |
| T4 — `$effect` timer ~1000 ms, cancelación en error/offline | ✓ |
| T5 — Clase `row-flash` / `row-error` + atributos `data-row-feedback` | ✓ |
| T6 — Región `aria-live="polite"` `sr-only` | ✓ |
| T7 — `@media (prefers-reduced-motion: reduce)` | ✓ |
| T8 — `field-renderer.svelte`: pasa-through `saveState` a `<FieldTable>` | ✓ |
| T9 — `+page.svelte`: `savingItemId`, seteo en `saveItem`, limpieza en `idle` | ✓ |
| T10 — No regresión flujo de guardado verificada | ✓ |
| T11 — `tests/form-table-feedback.test.ts` (19 tests nuevos) | ✓ |
| T12 — Suite existente verde, `pnpm run check` 0 errores | ✓ |

## Checkpoints de código

- C1 — Módulo puro `field-table-feedback.ts` con firmas exactas del design: ✓
- C2 — `field-table.svelte` recibe `saveState`, mantiene `lastSavedRowId`, `effectiveFeedback` incluye `showConfirmed` para R4: ✓
- C3 — `field-renderer.svelte` pasa `{saveState}` a `<FieldTable>` (solo para `fieldType === 'table'`): ✓
- C4 — `+page.svelte`: `savingItemId = $state<string|null>(null)`, seteado en `saveItem` antes de `autosave.patch`, limpiado en `onStateChange` cuando `s === 'idle'`: ✓
- C5 — CSS: animación solo `background-color`, error con `box-shadow: inset`, `prefers-reduced-motion` presente: ✓
- C6 — Archivos fuera de scope no modificados (migrations/, save-response.ts, +server.ts de responses): ✓

## Resultado de pnpm run check

```
1087 FILES   0 ERRORS   31 WARNINGS (todos preexistentes)
```

## Resultado de pnpm test

```
Test Files  184 passed (184)
     Tests  923 passed | 2 skipped (925)
```

`tests/form-table-feedback.test.ts`: **19/19 passed**
Suites de no-regresión (`form-table-camera`, `form-autosave`, `form-autosave-errors`, `form-save-indicator`, `form-field-renderer`, `form-table-merge`): **14/14 passed**
