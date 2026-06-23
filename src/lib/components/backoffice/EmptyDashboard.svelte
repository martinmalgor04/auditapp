<script lang="ts">
  interface Props {
    hasFilters: boolean;
  }

  let { hasFilters }: Props = $props();
</script>

<div class="sys-card-pad flex flex-col items-center justify-center gap-6 py-12 text-center">
  <svg
    class="h-16 w-16 text-[var(--sys-text-muted-light)]"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
  >
    <path d="M22 19a2 2 0 0 1-2.414-1.802l-.796-4.374A1 1 0 0 0 17.838 12H.05a1 1 0 0 0-.998 1.041l.541 5.477A2 2 0 0 0 1.594 19" />
    <path d="M2.049 5H21.95a2 2 0 0 0 1.974-2.41l-.35-1.921A2 2 0 0 0 20.618 0H3.382a2 2 0 0 0-1.956 1.669l-.35 1.921A2 2 0 0 0 2.05 5Z" />
  </svg>

  {#if hasFilters}
    <div class="flex flex-col gap-3">
      <p class="text-sm text-sys-profundo font-medium">
        No hay auditorías con estos filtros
      </p>
      <p class="text-xs text-[var(--sys-text-muted-light)]">
        Intenta cambiar los filtros o crear una nueva auditoría
      </p>
      <a href="/tablero" class="sys-btn-secondary sys-btn-sm inline-block">
        Limpiar filtros
      </a>
    </div>
  {:else}
    <div class="flex flex-col gap-3">
      <p class="text-sm text-sys-profundo font-medium">
        Todavía no hay auditorías
      </p>
      <p class="text-xs text-[var(--sys-text-muted-light)]">
        Crea una nueva para comenzar
      </p>
      <a href="/auditorias/new" class="sys-btn-primary sys-btn-sm inline-block">
        Nueva auditoría
      </a>
    </div>
  {/if}
</div>
