# Tasks — 37_ux_estado

## T1 — Barra de carga de navegación
En `src/routes/(app)/+layout.svelte`, importar `navigating` de `$app/stores` y
agregar el div fijo `h-0.5 bg-sys-electrico` que solo se renderiza cuando
`$navigating !== null`.

## T2 — Empty state: detectar filtros activos
En `src/routes/(app)/tablero/+page.svelte`, verificar la estructura de
`data.filters` (leer el `+page.server.ts` primero) y derivar `hasActiveFilters`
para distinguir "sin auditorías" de "sin resultados con filtros".

## T3 — Empty state: implementar UI
Cuando `data.dashboard.rows.length === 0`, mostrar el card de empty state
con el mensaje y botón apropiados según `hasActiveFilters`. Ocultar
`<AuditTable>` y `<AuditCardList>` en ese caso.

## T4 — Tap targets en filtros
Leer `src/lib/components/backoffice/audit-filters.svelte`. Agregar
`class="sys-field"` (o `min-h-[var(--sys-touch-min)]`) a los `<select>` e
`<input>` que no lo tengan.

## T5 — Verificación
- Navegar entre páginas: confirmar la barra azul aparece y desaparece.
- En el tablero, aplicar un filtro que no devuelva resultados: ver empty state
  de "Sin resultados".
- Borrar todos los datos de auditorías temporalmente (o probar con un usuario
  nuevo): ver empty state de "No hay auditorías".
- Inspeccionar en DevTools mobile (375px) los filtros: confirmar ≥ 44px de alto.
- `pnpm run check` → 0 errores nuevos.
