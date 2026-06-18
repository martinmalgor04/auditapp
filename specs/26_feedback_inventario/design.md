# Design — 26_feedback_inventario

> CÓMO. Micro-feedback local en `field-table.svelte`, derivado del estado de
> autosave existente. Cambio puramente cliente. Sin librerías nuevas, tokens SyS,
> accesibilidad consistente con `SaveIndicator`.

## 1. Resumen de la decisión

Hoy el estado de guardado es **global** (`saveState` en `+page.svelte`) y solo lo
ve el `SaveIndicator` sticky. La feature propaga ese estado **al ítem-tabla
activo** y `field-table` lo refleja en la **última fila accionada**. No se inventa
estado de guardado nuevo: la única fuente de verdad sigue siendo el autosave; la
fila solo decide **dónde y cómo** pintar el resultado (R1, R10).

No se toca el modelo de datos, ni `save-response.ts`, ni el `+server.ts` de
responses, ni el payload del PATCH (R14, R15).

## 2. Flujo del estado hasta la fila

```
autosave.patch (autosave.ts, sin cambios)
   └─ onStateChange(state, msg)  ──►  +page.svelte: saveState (global, ya existe)
                                          │
              (nuevo) qué ítem se está guardando: savingItemId
                                          │
                          FieldRenderer  (pasa-through prop saveState del ítem)
                                          │
                                   FieldTable
                                     ├─ recuerda lastSavedRowId (fila accionada)
                                     └─ deriva feedback de (saveState, lastSavedRowId)
```

### 2.1 ¿Cómo sabe la página qué ítem se está guardando?

`saveItem(itemId, …)` en `+page.svelte` ya recibe el `itemId`. Se añade un estado
`savingItemId = $state<string | null>(null)`:

- En `saveItem`, antes de `await autosave.patch(...)`: `savingItemId = itemId`.
- Cuando `saveState` vuelve a `idle` (o cambia de ítem), se limpia.

`FieldRenderer` recibe una prop nueva `saveState: SaveIndicatorState` calculada por
ítem en el `{#each}` del page:

```svelte
<FieldRenderer
  …
  saveState={savingItemId === item.id ? saveState : 'idle'}
/>
```

Así, **solo el ítem que disparó el guardado** ve `saving/saved/error/offline`; el
resto ve `idle` (R1). Esto evita que un guardado de otro campo encienda el flash en
la tabla.

### 2.2 ¿Cómo elige `field-table` la fila?

`field-table` mantiene `let lastSavedRowId = $state<string | null>(null)`.

- Al click en "Guardar fila" de una fila: `lastSavedRowId = row.row_id` y luego
  `onchange?.()` (R2).
- (OQ2) `addRow`/`updateCell` también fijan `lastSavedRowId` a la fila
  creada/editada; `removeRow` lo deja en `null` (la fila ya no existe).

`field-table` deriva el feedback de la fila con un `$derived`/función pura
`rowFeedback(rowId, saveState, lastSavedRowId)`:

| saveState | rowId === lastSavedRowId | feedback de la fila |
|---|---|---|
| `saving`  | sí | botón "Guardando…" disabled |
| `saved`   | sí | botón "Guardado ✓" + clase flash (1 vez) |
| `error`   | sí | botón/fila en error |
| `offline` | sí | sin "Guardado ✓" (sin confirmación falsa) |
| cualquiera| no | normal |

La transición visible "Guardado ✓ → Guardar fila" (~1 s, R4) y "flash → normal"
(R6) las maneja `field-table` con temporizadores locales armados al observar la
entrada en `saved` (un `$effect` que depende de `saveState`). El estado del dato lo
sigue dictando el autosave (R10).

## 3. Archivos a tocar

| Archivo | Cambio |
|---|---|
| `src/lib/components/form/fields/field-table.svelte` | Prop nueva `saveState`; `lastSavedRowId`; lógica `rowFeedback`; markup del botón "Guardado ✓"/"Guardando…"; clase de flash en la fila; región `aria-live`; estilos `<style>` con tokens SyS + `prefers-reduced-motion`. |
| `src/lib/components/form/field-renderer.svelte` | Aceptar prop `saveState` y reenviarla a `<FieldTable>` (pasa-through; resto de campos la ignoran). |
| `src/routes/(app)/auditorias/[id]/form/+page.svelte` | `savingItemId` + setearlo en `saveItem`; pasar `saveState` por ítem a `<FieldRenderer>`. |
| `tests/form-table-feedback.test.ts` | **nuevo** — lógica pura de `rowFeedback`, label del botón, mapeo estado→ítem, flash/error/offline (estilo de tests del repo). |

No se crean componentes nuevos. No se añade dependencia.

## 4. Firmas nuevas

```ts
// field-table.svelte — lógica pura extraíble para test (puede vivir inline o en helper)
export type RowFeedback = 'idle' | 'saving' | 'saved' | 'error' | 'offline';

export function rowFeedback(
  rowId: string,
  saveState: SaveIndicatorState,   // de save-indicator.svelte
  lastSavedRowId: string | null
): RowFeedback {
  if (rowId !== lastSavedRowId) return 'idle';
  return saveState; // saved/saving/error/offline/idle
}

// label/disabled derivados (puros, testeables)
export function saveButtonLabel(fb: RowFeedback): string {
  if (fb === 'saving') return 'Guardando…';
  if (fb === 'saved') return 'Guardado ✓';
  return 'Guardar fila';
}
export function saveButtonDisabled(fb: RowFeedback): boolean {
  return fb === 'saving';
}
export function rowShowsFlash(fb: RowFeedback): boolean {
  return fb === 'saved';
}
export function rowShowsError(fb: RowFeedback): boolean {
  return fb === 'error';
}
```

Prop pública nueva en `field-table.svelte` y `field-renderer.svelte`:
`saveState?: SaveIndicatorState` (default `'idle'`).
Tipo reutilizado: `SaveIndicatorState` de `save-indicator.svelte` (NO se crea un
tipo paralelo → cumple "una sola fuente de verdad", R1/R10).

## 5. Markup / clases (botón + flash + aria-live)

Botón de fila (reemplaza el actual en `field-table.svelte`):

```svelte
<button
  type="button"
  class="row-save-btn min-h-[var(--sys-touch-min)] rounded border px-3 text-sm font-medium
    {fb === 'saved'
      ? 'border-sys-verde/40 bg-sys-verde/10 text-sys-verde'
      : fb === 'error'
        ? 'border-sys-rojo/40 bg-sys-rojo/10 text-sys-rojo'
        : 'border-sys-electrico/30 bg-sys-electrico/5 text-sys-electrico'}"
  disabled={saveButtonDisabled(fb)}
  onclick={() => { lastSavedRowId = row.row_id; onchange?.(); }}
>
  {saveButtonLabel(fb)}
</button>
```

Fila con flash (sobre el `<div data-row-id>` existente, sin cambiar su box):

```svelte
<div
  class="rounded-lg border border-slate-200 p-3 space-y-2 row-shell"
  class:row-flash={rowShowsFlash(fb)}
  class:row-error={rowShowsError(fb)}
  data-row-id={row.row_id}
  data-row-feedback={fb}
>
```

Región `aria-live` por tabla (R12), una sola, anuncia el resultado de la última
fila sin layout visible nuevo:

```svelte
<p class="sr-only" aria-live="polite" data-table-feedback={id}>
  {fb === 'saved' ? 'Fila guardada' : fb === 'error' ? 'No se guardó la fila' : ''}
</p>
```

Estilos (sin librerías; tokens SyS; sin layout shift, R7; reduced-motion, R13):

```svelte
<style>
  /* Flash solo sobre background-color → no afecta layout (R7). */
  .row-flash { animation: row-flash var(--sys-fast, 220ms) var(--sys-ease) 1; }
  @keyframes row-flash {
    0%   { background-color: color-mix(in srgb, var(--sys-verde) 14%, transparent); }
    100% { background-color: transparent; }
  }
  .row-error { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--sys-rojo) 45%, transparent); }
  @media (prefers-reduced-motion: reduce) {
    .row-flash { animation: none; }   /* el texto "Guardado ✓" se mantiene (R13) */
  }
</style>
```

> El error usa `box-shadow: inset` (no `border-width`) para no empujar el layout
> (R7). `data-row-feedback`/`data-table-feedback` facilitan asserts y e2e.

## 6. Manejo del caso error (R8/R9/R10)

- `error` (4xx): `autosave.patch` ya emitió `onStateChange('error', msg)` →
  `saveState='error'` global. Con `savingItemId === item.id`, el ítem-tabla recibe
  `saveState='error'`; la fila accionada toma estilo de error y el botón NO muestra
  "Guardado ✓" (R8). El `SaveIndicator` global muestra el mensaje completo
  (coherencia R10) — la fila no duplica el texto largo del error, solo señala
  visualmente (evita ruido en mobile).
- `offline` (red/5xx): el dato va a la retry-queue (`+page.svelte` ya lo encola).
  La fila NO confirma "Guardado ✓" (R9); queda en estado neutro/"Guardando…"
  hasta que el flush online dispare un `saved` real, momento en que (si la fila
  sigue siendo `lastSavedRowId`) recién confirma.
- Limpieza: un `$effect` en `field-table` cancela los timers de confirmación/flash
  si llega `error`/`offline` después de un `saved` momentáneo, evitando "guardado
  en falso".

## 7. Alternativas descartadas

1. **PATCH por fila (guardado granular real).** Cambiar el contrato para guardar
   una sola fila. Descartado: el ítem-tabla se persiste completo en
   `audit_response`; partirlo toca `save-response.ts`, el `+server.ts` y el modelo
   de merge — viola R14/R15 y excede el alcance ("no cambia el flujo de guardado").
2. **Estado de guardado propio dentro de `field-table`** (la fila marca "guardado"
   al click, sin esperar al server). Descartado: crea una **segunda fuente de
   verdad** y puede mostrar "Guardado ✓" cuando el server rechazó (R5/R8/R10).
3. **Toast/snackbar de confirmación.** Descartado por requisito explícito (R11):
   intrusivo y tapa el formulario; el dolor era justamente el feedback lejos del
   dedo.
4. **Store global de "filas guardando" (`Map<itemId, Set<rowId>>`).** Resolvería
   multi-fila simultánea, pero añade estado global nuevo y complejidad por un caso
   marginal (OQ1). Se prefiere `lastSavedRowId` por ítem (mínimo viable).

## 8. Accesibilidad y consistencia SyS

- `aria-live="polite"` igual que `SaveIndicator` (R12); texto en `sr-only`.
- Colores por token: éxito `--sys-verde`, error `--sys-rojo`, acción
  `sys-electrico` (Tailwind `bg-sys-electrico/5`, ya usado en el botón actual).
- Animación con `--sys-fast`/`--sys-ease` (tokens existentes en `brand.css`).
- Toque mínimo `--sys-touch-min` conservado en el botón.

## 9. Verificación

Tests **puros** (estilo del repo: `form-table-camera.test.ts`,
`reunion-review-ui.test.ts` — sin `@testing-library`): se prueba `rowFeedback`,
`saveButtonLabel`, `saveButtonDisabled`, `rowShowsFlash`, `rowShowsError` y el
mapeo `savingItemId`→prop. `pnpm run check` valida props/tipos del componente. La
suite existente de tabla/autosave (`form-table-*`, `form-autosave*`) debe seguir
verde (R14). Mapa R↔test en `progress/impl_26_feedback_inventario.md` (lo llena el
implementer).
