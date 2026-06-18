# Requirements — 28_flujo_form_dinamico

> Mejora de UX del form técnico: chip de estado por ítem, salto al próximo
> pendiente y animación de score por sección. Sin rediseño estructural, sin
> cambios al modelo de datos, autosave ni scoring. EARS estricto.

## Contexto verificado (código real)

**Estructura del form.** `src/routes/(app)/auditorias/[id]/form/+page.svelte`
muestra una sección activa a la vez con nav horizontal/vertical
(`section-nav.svelte`). Navegar entre secciones usa `goToSection(index)` /
`goToPrevSection()` / `goToNextSection()`. La lista de ítems (`activeSection.items`)
se renderiza con `{#each}` sobre `<FieldRenderer>` — un `<article>` por ítem.

**Estado de respuesta.** `FormItem` (de `load-form.ts`) tiene `value`, `na` y
`notes`. La función `isItemComplete` (en `load-form.ts`) ya determina si un ítem
tiene respuesta: `true` si `na=true` o si `value` no es null/vacío. `notes` es el
campo de observaciones.

**Score en vivo.** `LiveSectionScore` recibe `score: number | null` y
`band: ScoreBand` ('green' | 'amber' | 'red' | 'na'). El `page.svelte` mantiene
`sectionScores: Map<sectionId, {score, band}>` y lo actualiza via
`updateScoreFromApi` (en `live-score.ts`) al recibir `onSectionScore` del autosave.
La transición de color ya existe; no hay animación temporal de "reacción al guardar".

**Progreso.** `progressPct` (número global) lo calcula `loadAuditForm` en el
server y lo pasa a `SectionNav`. No hay progreso por-sección como variable reactiva
en el cliente hoy.

**Autosave.** `createAutosave` → `onStateChange(state, msg)` emite
`saving | saved | offline | error` con `saveState` global. `onSectionScore`
ya actualiza el mapa de scores en el cliente al resolver un PATCH.

**Observaciones.** En `field-renderer.svelte` el campo de observaciones es un
`<details>` colapsable; `notes` se emite con `onnoteschange`. El item tiene
`notes: string | null` al cargar.

## Decisiones de diseño pre-spec (no re-preguntar)

- **Estado del ítem se deriva en cliente**, sin nueva columna en DB: es una función
  pura de `(value, na, notes)` sobre los datos ya disponibles en el client.
- **Chip de observación** se activa cuando `notes` tiene contenido (no vacío). El
  chip de respondido requiere `isItemAnswered` (análogo a `isItemComplete` pero en
  cliente puro).
- **Próximo pendiente** navega dentro de la sección activa primero; si no hay
  pendientes en la sección actual, salta a la primera sección que tenga al menos
  un ítem pendiente, y dentro de ella al primer ítem pendiente.
- **Score animado**: al recibir un nuevo score de la API (ya existente via
  `onSectionScore`), `LiveSectionScore` muestra un pulso breve (CSS transition +
  keyframe) antes de estabilizarse en el color del band nuevo. No recalcula en
  cliente; la fuente sigue siendo el servidor.
- **Progreso por sección**: `SectionNav` mostrará el conteo `respondidos/total`
  por sección (derivado de items del client) de forma consistente con `progressPct`
  global. No reemplaza al `progressPct` global; lo complementa visualmente.

## Requirements (EARS)

### Chip de estado por ítem

**R1** — El sistema DEBE calcular el estado de cada ítem como una de tres
categorías: `pendiente`, `respondido`, o `con_observacion`, usando solo los datos
ya disponibles en el cliente (`value`, `na`, `notes`).

**R2** — CUANDO `na` es `true` o `value` no es nulo, vacío ni array/objeto vacío,
el sistema DEBE clasificar el ítem como `respondido`.

**R3** — CUANDO el ítem es `respondido` y `notes` tiene contenido (string no vacío),
el sistema DEBE clasificar el ítem como `con_observacion` (tiene prioridad sobre
`respondido`).

**R4** — CUANDO el ítem no cumple las condiciones de R2, el sistema DEBE clasificar
el ítem como `pendiente`.

**R5** — El sistema DEBE mostrar un chip visual de estado junto a cada ítem en el
form: `○ pendiente` / `✓ respondido` / `⚠ con observación`, usando tokens de color
SyS consistentes con el design system (`sys-electrico` para respondido, `sys-naranja`
para observación, neutro para pendiente).

**R6** — CUANDO el valor de un ítem cambia en cliente (al recibir `onchange`,
`onnoteschange` o `onnchange`), el sistema DEBE actualizar el chip del ítem de forma
reactiva sin esperar al siguiente load de página.

**R7** — El chip de estado NO DEBE alterar el layout del ítem (sin layout shift al
cambiar de estado).

### Acción "ir al próximo pendiente"

**R8** — El sistema DEBE ofrecer una acción visible "ir al próximo pendiente" en el
form.

**R9** — CUANDO el técnico activa "ir al próximo pendiente", el sistema DEBE
navegar al siguiente ítem con estado `pendiente` dentro de la sección activa,
usando scroll hasta ese ítem.

**R10** — CUANDO no existen ítems `pendiente` en la sección activa pero sí en
secciones posteriores, el sistema DEBE cambiar la sección activa a la primera
sección posterior que contenga al menos un ítem `pendiente`, y hacer scroll al
primer ítem pendiente de esa sección.

**R11** — CUANDO el técnico activa "ir al próximo pendiente" y no existen ítems
`pendiente` en ninguna sección (incluyendo anteriores), el sistema DEBE mostrar un
mensaje indicando que no quedan pendientes (p.ej. "Sin pendientes").

**R12** — La búsqueda de "próximo pendiente" DEBE considerar todas las secciones
del form, no solo las posteriores a la actual, para el caso en que el técnico esté
en la última sección y haya pendientes en secciones anteriores.

**R13** — La lógica de "próximo pendiente" DEBE ser una función pura derivada del
estado de los ítems en cliente, sin llamadas al servidor.

### Score animado por sección

**R14** — CUANDO el autosave recibe un `onSectionScore` (el servidor devuelve un
score actualizado), el sistema DEBE activar una animación visual breve en el
`LiveSectionScore` de esa sección (pulso o transición de color) antes de estabilizarse
en el nuevo valor.

**R15** — La animación del score NO DEBE recalcular el score en el cliente de
forma independiente al servidor; la fuente de verdad del score sigue siendo la
respuesta del servidor via `onSectionScore`.

**R16** — DONDE el usuario tenga activada la preferencia de movimiento reducido
(`prefers-reduced-motion: reduce`), el sistema DEBE suprimir la animación del score
(el cambio de color y valor se aplica de forma directa, sin transición).

**R17** — La animación del score DEBE usar tokens CSS SyS (`--sys-fast`,
`--sys-ease`) consistentes con las animaciones existentes del design system.

### Progreso por sección

**R18** — El sistema DEBE mostrar en `SectionNav` el conteo de ítems respondidos
versus total (`n/total`) por cada sección, derivado del estado de los ítems en
cliente.

**R19** — El conteo por sección DEBE ser consistente con el chip de estado por
ítem: un ítem cuenta como respondido en el conteo si y solo si su estado es
`respondido` o `con_observacion` (definición de R2/R3).

**R20** — El conteo por sección en `SectionNav` DEBE actualizarse reactivamente
cuando el estado de cualquier ítem cambia en cliente (sin reload de página).

### No regresión

**R21** — El sistema NO DEBE alterar el modelo de datos, el flujo del autosave, el
contrato de `saveItem`, ni las funciones de scoring en `section-score.ts` o
`live.ts`.

**R22** — El sistema NO DEBE modificar la estructura por secciones del form ni los
controles Anterior/Siguiente.

**R23** — El sistema NO DEBE introducir una segunda fuente de verdad del score: la
animación y el conteo de progreso DEBEN derivarse del mismo estado que alimenta al
`LiveSectionScore` y al `SaveIndicator` existentes.

**R24** — Las suites de tests existentes de form (`form-autosave*`, `form-live-score`,
`form-section-nav`, `form-table-*`, `form-item-ux`) DEBEN seguir pasando sin
modificaciones.

## Trazabilidad R ↔ test

| R | Verificación (test en `tests/form-dynamic-flow.test.ts`) |
|---|---|
| R1  | test: función `itemStatus(value, na, notes)` retorna las 3 categorías |
| R2  | test: `itemStatus` → respondido con `na=true`, valor string, valor array no vacío |
| R3  | test: `itemStatus` → con_observacion cuando respondido y notes no vacío |
| R4  | test: `itemStatus` → pendiente para value=null, '', [], {} vacío, na=false |
| R5  | grep: chip presente en markup de `field-renderer.svelte` con `data-item-status` |
| R6  | test: estado derivado del ítem actualiza cuando cambia value/na/notes en el estado reactivo |
| R7  | grep/test: el chip usa posición inline; no agrega altura ni margin al contenedor del ítem |
| R8  | grep: botón/acción "próximo pendiente" presente en `+page.svelte` |
| R9  | test: `nextPending(sections, activeSectionIdx, itemRefs)` retorna el ítem en la sección actual |
| R10 | test: `nextPending` retorna primer ítem de siguiente sección cuando la actual no tiene pendientes |
| R11 | test: `nextPending` retorna `null` cuando no hay ningún pendiente en ninguna sección |
| R12 | test: `nextPending` con búsqueda circular (desde última sección hacia el inicio) |
| R13 | test: `nextPending` es función pura sin I/O |
| R14 | grep/test: `LiveSectionScore` acepta prop `animating`; se activa al cambiar score |
| R15 | test: el score mostrado en `LiveSectionScore` siempre viene del state del server (no recalculado) |
| R16 | grep: regla `@media (prefers-reduced-motion: reduce)` en `live-section-score.svelte` anula animación |
| R17 | grep: animación usa `--sys-fast` o `--sys-ease` |
| R18 | test: `sectionProgress(items)` retorna `{answered, total}` por sección |
| R19 | test: `sectionProgress` cuenta con la misma definición que `itemStatus` |
| R20 | test: `sectionProgress` es derivado reactivo del array de ítems del cliente |
| R21 | grep: sin cambios en `save-response.ts`, `section-score.ts`, `live.ts` ni tablas DB |
| R22 | grep: controles Anterior/Siguiente intactos en `+page.svelte` |
| R23 | test: progreso y animación derivan del mismo mapa `sectionScores` que `LiveSectionScore` |
| R24 | pnpm test: suites existentes de form pasan sin modificar |

## Open questions

Ninguna. El scope y las decisiones están claros para proceder a implementación.
