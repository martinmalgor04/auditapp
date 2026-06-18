# Requirements — 26_feedback_inventario

> Feedback visual local y discreto al guardar una fila de la grilla de inventario
> (`field-table.svelte`), derivado de los estados de autosave existentes
> (`saving` / `saved` / `error`). EARS estricto. Sin toasts ni overlays. No cambia
> el modelo de datos ni el flujo de guardado.

## Contexto verificado (código real)

- La grilla vive en `src/lib/components/form/fields/field-table.svelte`. El botón
  **"Guardar fila"** ejecuta `onclick={() => onchange?.()}` (línea 92). Ese mismo
  `onchange` lo disparan `addRow`, `removeRow` y `updateCell`.
- `field-table` NO guarda una fila aislada: `onchange?.()` sube por
  `field-renderer.svelte` (`emitChange` → `onchange(currentValue())`, devuelve
  `{ rows }` completo) hasta `+page.svelte:312` (`saveItem(item.id, 'table', value, …)`),
  que hace un PATCH del **ítem-tabla entero** (todas las filas). No existe hoy un
  guardado por fila a nivel de datos.
- El estado de guardado es **global**: `createAutosave(...).onStateChange` →
  `saveState` en `+page.svelte:28`, consumido por un único `SaveIndicator` sticky
  arriba de todo (`+page.svelte:251-253`). `field-table` no recibe ese estado hoy.
- `SaveIndicator` (`save-indicator.svelte`) ya usa `aria-live="polite"` y los
  estados `idle | saving | saved | offline | error`.
- `autosave.patch` emite `saving` al empezar, y al terminar `saved` (+ vuelve a
  `idle` tras 2 s), `offline` (red/5xx, reintentable) o `error` (4xx, rechazo).

## Decisión de granularidad (resuelta — no re-preguntar)

El reto es propagar "qué se está guardando" hasta `field-table`, hoy estado global.
Una solución 100 % por-fila exigiría un PATCH por fila (cambio del modelo de
guardado, fuera de alcance: el ítem se guarda completo). **Decisión:** el feedback
se ancla a la **última fila accionada** dentro del ítem-tabla. `field-table`
recuerda qué `row_id` disparó el último guardado y, al observar la transición
`saving → saved | error` del **estado de su propio ítem**, refleja el resultado en
**esa** fila (botón "Guardado ✓" ~1 s + flash de fondo, o estado de error). Es la
mínima viable, sin segunda fuente de verdad: el resultado lo dicta el autosave; la
fila solo elige **dónde** pintarlo. Ver OQ1 para el caso multi-fila simultáneo.

## Requirements (EARS)

### Estado de guardado por ítem-tabla

**R1** — El sistema DEBE pasar a cada `field-table` el estado de guardado
(`idle | saving | saved | offline | error`) **correspondiente a su propio
ítem-tabla**, derivado del autosave existente, sin introducir una segunda fuente
de verdad del estado de guardado.

**R2** — CUANDO el técnico acciona el botón "Guardar fila" de una fila, el sistema
DEBE registrar el `row_id` de esa fila como la fila accionada del ítem antes de
disparar el guardado.

### Confirmación en el botón

**R3** — CUANDO el guardado del ítem-tabla resuelve en `saved` tras haber sido
accionado, el botón "Guardar fila" de la fila accionada DEBE mostrar una
confirmación textual "Guardado ✓".

**R4** — CUANDO el botón muestra "Guardado ✓", el sistema DEBE revertirlo a su
texto y estilo normal ("Guardar fila") transcurridos aproximadamente 1 s.

**R5** — MIENTRAS el guardado del ítem-tabla está en `saving`, el botón "Guardar
fila" de la fila accionada DEBE indicar el estado en curso (texto "Guardando…" y
deshabilitado) y NO DEBE mostrar "Guardado ✓".

### Flash en la fila

**R6** — CUANDO el guardado del ítem-tabla resuelve en `saved`, la fila accionada
DEBE mostrar un flash de fondo sutil y breve.

**R7** — El flash de fondo NO DEBE producir layout shift (no altera alto, ancho,
borde ni posición de la fila ni de las contiguas).

### Caso de error

**R8** — CUANDO el guardado del ítem-tabla resuelve en `error`, la fila accionada
DEBE reflejar el error de forma local (estilo de error en la fila + botón) y NO
DEBE mostrar "Guardado ✓".

**R9** — CUANDO el guardado del ítem-tabla resuelve en `offline`, la fila accionada
NO DEBE mostrar "Guardado ✓" (el dato quedó en la cola de reintento, no
confirmado).

**R10** — El feedback local de la fila DEBE ser coherente con el `SaveIndicator`
global: el estado mostrado en la fila DEBE derivarse del mismo estado de autosave
que alimenta al indicador global (sin estados contradictorios).

### No intrusivo y accesible

**R11** — El sistema NO DEBE usar toasts, modales ni overlays que tapen el
formulario para este feedback (todo el feedback es inline dentro de la grilla).

**R12** — El feedback de éxito/error de la fila DEBE ser anunciado por lectores de
pantalla mediante una región `aria-live` (consistente con el `aria-live="polite"`
ya usado por `SaveIndicator`), sin duplicar layout visible.

**R13** — DONDE el usuario tenga activada la preferencia de movimiento reducido
(`prefers-reduced-motion: reduce`), el sistema DEBE suprimir la animación del flash
(la confirmación textual "Guardado ✓" se mantiene).

### No regresión

**R14** — El sistema NO DEBE alterar el flujo de guardado existente: el payload del
PATCH, el contrato de `onchange`/`saveItem` y la persistencia del ítem-tabla
completo DEBEN permanecer iguales.

**R15** — El sistema NO DEBE modificar el modelo de datos ni las columnas/tablas de
`audit_response` (cambio puramente de UI cliente).

## Trazabilidad R ↔ verificación (resumen; mapa fino en tasks.md)

| R | Verificación (test) |
|---|---|
| R1  | test: mapeo estado global → prop por-ítem solo cuando el ítem activo coincide |
| R2  | test: accionar "Guardar fila" fija `lastSavedRowId = row_id` |
| R3  | test: lógica de label del botón = "Guardado ✓" cuando `estado=saved` y fila = accionada |
| R4  | test: temporizador ~1 s revierte el flag de confirmación |
| R5  | test: label/disabled del botón cuando `estado=saving` (no "Guardado ✓") |
| R6  | test: la fila accionada recibe la clase de flash cuando `estado=saved` |
| R7  | test: la clase de flash anima solo `background-color` (sin props de layout) |
| R8  | test: `estado=error` → fila/ botón en error, sin "Guardado ✓" |
| R9  | test: `estado=offline` → sin "Guardado ✓" |
| R10 | test: el estado por-fila se deriva del mismo `SaveState` del autosave |
| R11 | test/grep: sin toast/modal/overlay nuevos; markup inline |
| R12 | test: existe contenedor `aria-live` para el feedback de la fila |
| R13 | test/grep: regla `@media (prefers-reduced-motion: reduce)` anula el flash |
| R14 | test: contrato `onchange` intacto (suite de autosave/tabla actual verde) |
| R15 | grep: sin migraciones nuevas, sin cambios en `save-response.ts` ni `+server.ts` |

## Open questions (reales)

- **OQ1 — Granularidad fila-exacta vs ítem-tabla.** El default (arriba) ancla el
  feedback a la **última fila accionada** y blanquea la confirmación si el técnico
  acciona otra fila antes de resolver. ¿Es aceptable que, ante dos "Guardar fila"
  casi simultáneos, solo la última accionada muestre "Guardado ✓"? Alternativa
  (mayor costo): rastrear un set de `row_id` en vuelo. Propuesta: aceptar el
  default (última fila), sin sobre-ingeniería.
- **OQ2 — Alcance del feedback a `addRow`/`removeRow`/`updateCell`.** Esas acciones
  también disparan `onchange?.()` (mismo guardado). ¿El flash/confirmación aplica
  solo al botón "Guardar fila" explícito (propuesta) o también a alta/baja/edición
  de celda? Propuesta: solo "Guardar fila" + flash en la fila afectada por
  alta/edición; baja de fila no aplica (la fila desaparece).
- **OQ3 — Duración exacta.** "~1 s" para el botón y flash breve. Propuesta: botón
  1000 ms, flash 600 ms con `--sys-ease`. Confirmar tokens.
