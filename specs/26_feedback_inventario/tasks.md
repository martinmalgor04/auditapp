# Tasks — 26_feedback_inventario

> Pasos discretos, en orden. Cada uno referencia `R<n>`. No empezar hasta puerta
> humana (estado `spec_ready`). Cambio puramente cliente: NO tocar `migrations/`,
> `save-response.ts` ni el `+server.ts` de responses.

- [x] **T1** — En `field-table.svelte`, extraer la lógica pura de feedback:
  `rowFeedback(rowId, saveState, lastSavedRowId)`, `saveButtonLabel(fb)`,
  `saveButtonDisabled(fb)`, `rowShowsFlash(fb)`, `rowShowsError(fb)`. Reutilizar el
  tipo `SaveIndicatorState` de `save-indicator.svelte` (sin tipo paralelo).
  Extraída en `field-table-feedback.ts` (módulo TS puro, importable por tests).
  Cubre: R1, R10.

- [x] **T2** — Añadir a `field-table.svelte` la prop `saveState?: SaveIndicatorState`
  (default `'idle'`) y el estado local `lastSavedRowId`. En el `onclick` del botón
  "Guardar fila": fijar `lastSavedRowId = row.row_id` antes de `onchange?.()`.
  Cubre: R1, R2.

- [x] **T3** — Botón de fila: usar `saveButtonLabel(fb)` ("Guardar fila" /
  "Guardando…" / "Guardado ✓"), `disabled={saveButtonDisabled(fb)}` y clases por
  estado (verde éxito / rojo error / electrico normal, tokens SyS).
  Cubre: R3, R5, R8.

- [x] **T4** — `$effect` en `field-table.svelte` que, al entrar la fila accionada en
  `saved`, arma un timer (~1000 ms) que revierte el botón a normal; cancelar el
  timer si llega `error`/`offline`/cambio de fila. Sin "guardado en falso".
  Cubre: R4, R8, R9.

- [x] **T5** — Markup del flash: clase `row-flash` sobre el `<div data-row-id>`
  cuando `rowShowsFlash(fb)`; estilo `<style>` que anima **solo** `background-color`
  con `--sys-fast`/`--sys-ease`. Estado de error con `box-shadow: inset` (no
  border-width). Atributos `data-row-feedback`/`data-table-feedback`.
  Cubre: R6, R7, R8.

- [x] **T6** — Región `aria-live="polite"` `sr-only` por tabla que anuncie "Fila
  guardada" / "No se guardó la fila" según `fb`, consistente con `SaveIndicator`.
  Cubre: R12.

- [x] **T7** — Regla `@media (prefers-reduced-motion: reduce)` que anula la
  animación del flash; verificar que "Guardado ✓" se mantiene sin animación.
  Cubre: R13.

- [x] **T8** — `field-renderer.svelte`: aceptar prop `saveState` y reenviarla a
  `<FieldTable saveState={saveState} … />` (pasa-through; resto de campos la
  ignoran). Cubre: R1.

- [x] **T9** — `+page.svelte`: añadir `savingItemId = $state<string|null>(null)`;
  setear `savingItemId = itemId` en `saveItem` antes del `await autosave.patch`;
  limpiarlo cuando `saveState` vuelve a `idle`. Pasar a cada `<FieldRenderer>`
  `saveState={savingItemId === item.id ? saveState : 'idle'}`.
  Cubre: R1, R10.

- [x] **T10** — Verificar no-regresión del flujo de guardado: payload del PATCH,
  contrato `onchange`/`saveItem` y persistencia del ítem-tabla completo intactos.
  No hay migraciones nuevas ni cambios en `save-response.ts`/`+server.ts`.
  Cubre: R11 (sin overlays), R14, R15.

- [x] **T11** — `tests/form-table-feedback.test.ts` (nuevo, estilo puro del repo):
  - `rowFeedback`: solo la `lastSavedRowId` recibe el estado; otras filas `idle`
    (R1, R2, R10).
  - `saveButtonLabel`/`saveButtonDisabled`: "Guardado ✓" solo en `saved`,
    "Guardando…" + disabled en `saving`, normal en `idle`/`offline` (R3, R5, R9).
  - `rowShowsFlash`: true solo en `saved` (R6).
  - `rowShowsError`: true solo en `error`; nunca muestra "Guardado ✓" en `error`
    ni `offline` (R8, R9).
  - mapeo `savingItemId === item.id ? saveState : 'idle'` (R1, R10).
  19/19 tests verdes.
  Cubre: R1, R2, R3, R5, R6, R8, R9, R10.

- [x] **T12** — Confirmar suite existente verde sin cambios funcionales:
  `form-table-*`, `form-autosave*`, `form-save-indicator`, `form-field-renderer`.
  `pnpm run check` 0 errores (props/tipos nuevos). Documentar mapa R↔test en
  `progress/impl_26_feedback_inventario.md`.
  Cubre: R14.

## Resolución previa requerida (puerta humana)

Antes de implementar, confirmar OQ1 (granularidad última-fila), OQ2 (alcance a
add/edit de fila) y OQ3 (duraciones 1000 ms / 600 ms y tokens) de
`requirements.md`. Si la puerta cambia OQ1 a multi-fila, T2/T4 pasan de
`lastSavedRowId` a un `Set<rowId>` y se amplía T11.
