# Requirements — 37_ux_estado

> Tres mejoras de experiencia que resuelven problemas de contexto y feedback
> en la app: (1) el usuario no sabe si la navegación está cargando, lo que
> provoca doble-click en conexiones lentas; (2) el tablero vacío no da contexto
> ni guía al usuario nuevo; (3) los tap targets de los filtros pueden estar
> por debajo del mínimo de 44px recomendado por Apple HIG.

## Contexto verificado

- **Navegación SvelteKit:** el store `navigating` de `$app/stores` es `null`
  cuando no hay navegación en curso y un objeto `{ from, to }` durante la
  transición. El layout `(app)/+layout.svelte` es el lugar correcto para
  suscribirse a él.
- **Tablero vacío:** `src/routes/(app)/tablero/+page.svelte` renderiza
  `<AuditTable>` y `<AuditCardList>` con `data.dashboard.rows`. Si el array
  está vacío, ambos componentes muestran una tabla/lista vacía sin mensaje.
- **Filtros de auditoría:** `src/lib/components/backoffice/audit-filters.svelte`
  usa `<select>` nativos. El sistema de diseño define `--sys-touch-min: 44px`
  y la clase `.sys-field` aplica `min-h-[var(--sys-touch-min)]`.

## Requerimientos

### Indicador de carga de navegación (2.2)

**R1** — MIENTRAS SvelteKit está navegando entre páginas (store `navigating !==
null`), el sistema DEBE mostrar un indicador visual de carga en la parte
superior del viewport.

**R2** — El indicador DEBE ser no intrusivo: una barra fina (≤ 3px) en color
`sys-electrico` con animación de pulso o progreso, `z-index` superior al
header (`z-50` o mayor), `position: fixed; top: 0; left: 0; right: 0`.

**R3** — El indicador DEBE desaparecer cuando la navegación completa (store
`navigating === null`).

### Empty state en el tablero (2.1)

**R4** — CUANDO `data.dashboard.rows` está vacío (sin auditorías que mostrar),
el tablero DEBE mostrar un estado vacío con:
- Un ícono o ilustración relacionada (carpeta, portapapeles, etc.)
- Texto descriptivo: "Todavía no hay auditorías" o "Sin resultados para los filtros aplicados" (distinguir si hay filtros activos o no)
- Un botón "Nueva auditoría" que lleva a `/auditorias/new`

**R5** — CUANDO hay filtros activos y el resultado es vacío, el mensaje DEBE
indicar que se puede limpiar los filtros, no que "no hay auditorías".

**R6** — El empty state DEBE ser coherente con el design system: usar
`.sys-card` o estar en un área consistente con el resto de la página.

### Tap targets de filtros (2.4)

**R7** — Todos los `<select>`, `<input>` y botones dentro de
`src/lib/components/backoffice/audit-filters.svelte` DEBEN tener
`min-height: var(--sys-touch-min)` (44px).

**R8** — Si algún elemento interactivo en los filtros está por debajo de 44px
de alto, se DEBE corregir agregando la clase `.sys-field` o equivalente.

## Trazabilidad requerida

| R | Test mínimo |
|---|---|
| R1 | Store `navigating` se subscribe en el layout; el indicador se renderiza condicionalmente |
| R2 | El elemento del indicador tiene `class` con `fixed top-0` y color electrico |
| R3 | Cuando `$navigating` es null, el elemento no está en el DOM |
| R4 | Con `rows = []` y sin filtros, el tablero muestra el mensaje "no hay auditorías" y el botón |
| R5 | Con `rows = []` y filtros activos, el tablero muestra mensaje diferenciado |
| R7 | Los `<select>` de filtros tienen `min-h-[var(--sys-touch-min)]` o equivalente ≥ 44px |
