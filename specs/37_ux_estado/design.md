# Design — 37_ux_estado

## 1. Indicador de carga de navegación

Implementado directamente en `src/routes/(app)/+layout.svelte`:

```svelte
<script lang="ts">
  import { navigating } from '$app/stores';
  // ...
</script>

{#if $navigating}
  <div
    class="fixed top-0 left-0 right-0 z-[60] h-0.5 bg-sys-electrico"
    aria-hidden="true"
    role="progressbar"
  >
    <div class="h-full w-full animate-pulse bg-sys-electrico/70" />
  </div>
{/if}
```

`z-[60]` para estar sobre el header (`z-40`). La barra de 2px (h-0.5) es visible
sin ser intrusiva. El `animate-pulse` indica actividad sin implicar un progreso
real (que no conocemos).

**Alternativa descartada:** usar una librería externa tipo `nprogress`. Innecesario
para este caso; la solución nativa de SvelteKit es más simple y sin dependencias.

---

## 2. Empty state del tablero

El tablero necesita distinguir dos casos:

**A) Sin filtros activos y sin auditorías:**
```
     [ícono carpeta]
  Todavía no hay auditorías
  Creá la primera para comenzar.
     [ Nueva auditoría ]
```

**B) Con filtros activos y sin resultados:**
```
     [ícono lupa]
  Sin resultados
  Probá ajustar los filtros.
     [ Limpiar filtros ]
```

La detección de "filtros activos" se puede hacer verificando si algún
query param distinto de `page` está presente en la URL, o si `data.filters`
tiene valores no-default (lo que ya viene del `+page.server.ts`).

**Implementación:** modificar `src/routes/(app)/tablero/+page.svelte`.
Si `data.dashboard.rows.length === 0`, en lugar de renderizar `<AuditTable>`
y `<AuditCardList>` (que mostrarían vacío), renderizar el empty state.

```svelte
{#if data.dashboard.rows.length === 0}
  <div class="sys-card flex flex-col items-center gap-4 py-16 text-center">
    <!-- ícono -->
    <p class="text-lg font-semibold text-sys-profundo">
      {hasActiveFilters ? 'Sin resultados' : 'Todavía no hay auditorías'}
    </p>
    <p class="text-sm text-[var(--sys-text-muted-light)]">
      {hasActiveFilters ? 'Probá ajustar los filtros.' : 'Creá la primera para comenzar.'}
    </p>
    {#if hasActiveFilters}
      <a href="/tablero" class="sys-btn-secondary sys-btn-sm">Limpiar filtros</a>
    {:else}
      <a href="/auditorias/new" class="sys-btn-primary">Nueva auditoría</a>
    {/if}
  </div>
{:else}
  <AuditTable rows={data.dashboard.rows} />
  <AuditCardList rows={data.dashboard.rows} />
{/if}
```

`hasActiveFilters` = `data.filters.clientId !== null || data.filters.status !== null || ...`
(verificar la estructura real de `data.filters` en `+page.server.ts`).

---

## 3. Tap targets de filtros

En `src/lib/components/backoffice/audit-filters.svelte`, agregar `sys-field`
o `min-h-[var(--sys-touch-min)]` a todos los `<select>` e `<input type="text">`.

---

## Archivos a modificar

- `src/routes/(app)/+layout.svelte` — agregar barra de carga de navegación
- `src/routes/(app)/tablero/+page.svelte` — empty state
- `src/lib/components/backoffice/audit-filters.svelte` — tap targets
