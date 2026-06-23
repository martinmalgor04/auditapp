<script lang="ts">
  interface Props {
    hasFilters?: boolean;
  }

  let { hasFilters = false }: Props = $props();
</script>

<div class="flex flex-col items-center justify-center py-12 px-4 text-center">
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    class="w-16 h-16 text-sys-medio mb-4"
  >
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
  
  {#if hasFilters}
    <h3 class="text-lg font-semibold text-sys-profundo mb-2">Sin resultados</h3>
    <p class="text-sm text-sys-medio mb-4">No hay auditorías que coincidan con los filtros aplicados.</p>
    <a href="?" class="text-sm font-medium text-sys-electrico hover:underline">Limpiar filtros</a>
  {:else}
    <h3 class="text-lg font-semibold text-sys-profundo mb-2">Todavía no hay auditorías</h3>
    <p class="text-sm text-sys-medio mb-4">Crea tu primera auditoría para comenzar.</p>
    <a href="/auditorias/new" class="inline-block px-4 py-2 rounded bg-sys-electrico text-white text-sm font-medium hover:opacity-90">
      Nueva auditoría
    </a>
  {/if}
</div>
