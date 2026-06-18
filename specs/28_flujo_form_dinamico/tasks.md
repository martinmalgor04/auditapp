# Tasks — 28_flujo_form_dinamico

> Pasos de implementación en orden. Cada tarea es discreta y verificable.
> Ninguna toca el modelo de datos, autosave ni scoring.
> El implementer marca `[x]` al completar cada tarea.

---

- [x] **T1** — Crear `src/lib/client/form/item-status.ts` con las funciones
  `itemStatus` y `sectionProgress` según las firmas del design.md §10.
  Exportar también el tipo `ItemStatus`.
  Cubre: R1, R2, R3, R4, R18, R19.

- [x] **T2** — Crear `tests/form-dynamic-flow.test.ts` con los tests de
  `itemStatus`:
  - pendiente cuando value=null, na=false (R4)
  - pendiente cuando value='', [], objeto vacío (R4)
  - respondido cuando na=true (R2)
  - respondido cuando value tiene contenido (R2)
  - con_observacion cuando respondido y notes no vacío (R3)
  - respondido tiene prioridad sobre observacion vacía (R3/R4)
  - `sectionProgress` cuenta solo respondido+con_observacion (R18, R19)
  - `sectionProgress` retorna 0/0 para sección sin ítems (caso borde)
  Cubre: R1, R2, R3, R4, R18, R19.

- [x] **T3** — Crear `src/lib/client/form/next-pending.ts` con la función
  `nextPending` y el tipo `PendingTarget` según design.md §3.
  Cubre: R9, R10, R11, R12, R13.

- [x] **T4** — Agregar tests de `nextPending` en `tests/form-dynamic-flow.test.ts`:
  - retorna ítem en sección activa cuando existe pendiente (R9)
  - salta a siguiente sección cuando la activa no tiene pendientes (R10)
  - búsqueda circular desde la última sección (R12)
  - retorna null cuando no hay ningún pendiente (R11)
  - función pura: sin I/O (R13)
  Cubre: R9, R10, R11, R12, R13.

- [x] **T5** — Modificar `src/lib/components/form/field-renderer.svelte`:
  - Importar `ItemStatus` de `item-status.ts`
  - Agregar prop `status?: ItemStatus` (default `'pendiente'`)
  - Agregar chip de estado en el `flex-wrap` del header del `<article>` (ver design.md §6)
  - Agregar `id="item-{item.id}"` al `<article>` para scroll target
  Cubre: R5, R7.

- [x] **T6** — Modificar `src/lib/components/form/live-section-score.svelte`:
  - Agregar prop `animating?: boolean` (default `false`)
  - Agregar clase `.score-pulse` condicional en el `<div>` raíz
  - Agregar `<style>` con keyframe `score-pulse` usando `--sys-fast`/`--sys-ease`
  - Agregar regla `@media (prefers-reduced-motion: reduce)` que anula la animación
  Cubre: R14, R16, R17.

- [x] **T7** — Modificar `src/lib/components/form/section-nav.svelte`:
  - Agregar prop `sectionProgress?: Map<string, {answered:number, total:number}>`
  - Mostrar conteo `n/total` junto al label de cada sección cuando el prop está presente
  Cubre: R18, R20.

- [x] **T8** — Modificar `src/routes/(app)/auditorias/[id]/form/+page.svelte` —
  parte 1: estado reactivo de ítems:
  - Importar `itemStatus`, `sectionProgress` de `item-status.ts`
  - Agregar `itemLocalState: Map<itemId, {value, na, notes}>` inicializado desde `data.sections`
  - Actualizar `itemLocalState` en `saveItem` y en `onnoteschange` de cada `FieldRenderer`
  - Derivar `itemStatuses: Map<itemId, ItemStatus>` y `progressBySec: Map<sectionId, ...>`
  Cubre: R6, R20, R23.

- [x] **T9** — Modificar `+page.svelte` — parte 2: pasar props a componentes:
  - Pasar `status={itemStatuses.get(item.id) ?? 'pendiente'}` a cada `<FieldRenderer>`
  - Pasar `sectionProgress={progressBySec}` a `<SectionNav>`
  - Pasar `animating={animatingSectionId === activeSection?.id}` a `<LiveSectionScore>`
  Cubre: R5, R14, R18, R20.

- [x] **T10** — Modificar `+page.svelte` — parte 3: trigger de animación del score:
  - Agregar `animatingSectionId = $state<string | null>(null)`
  - En el callback `onSectionScore` del autosave: fijar `animatingSectionId = sectionId`
    y limpiar con `setTimeout` de ~800ms
  Cubre: R14, R15, R23.

- [x] **T11** — Modificar `+page.svelte` — parte 4: botón "próximo pendiente":
  - Importar `nextPending` de `next-pending.ts`
  - Agregar `lastVisitedItemIndex = $state(-1)` y `noPendingMessage = $state(false)`
  - Implementar `goToNextPending()` según design.md §5.4
  - Actualizar `lastVisitedItemIndex` al navegar con el botón
  - Agregar botón "Próximo pendiente →" y mensaje "Sin pendientes" en el markup
    (entre `LiveSectionScore` y la lista de ítems)
  Cubre: R8, R9, R10, R11, R12.

- [x] **T12** — Agregar tests en `tests/form-dynamic-flow.test.ts` —
  consistencia del progreso:
  - `sectionProgress` con misma definición que `itemStatus` (R19 y R23)
  - estado derivado se actualiza cuando cambia value/na/notes (R6, verificado con función pura)
  Cubre: R6, R19, R23.

- [x] **T13** — Verificar no-regresión:
  - Ejecutar `pnpm test` y confirmar que pasan sin modificar:
    `form-autosave.test.ts`, `form-autosave-errors.test.ts`, `form-live-score.test.ts`,
    `form-section-nav.test.ts`, `form-item-ux.test.ts`, `form-table-*.test.ts`
  - Ejecutar `pnpm run check` (tsc) sin errores de tipos
  - Confirmar que no hay cambios en `save-response.ts`, `section-score.ts`, `live.ts`
    ni en ninguna migración SQL
  Cubre: R21, R22, R24.
