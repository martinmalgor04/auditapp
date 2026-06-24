<script lang="ts">
  import ChipFilters from '$lib/components/ui/ChipFilters.svelte';

  export let auditCount: number;
  export let searchValue: string = '';
  export let filterValue: string = 'all';
  export let filterOptions: Array<{ label: string; value: string }> = [];
  export let onSearch: (q: string) => void;
  export let onFilterChange: (v: string) => void;
  export let onNew: () => void;
</script>

<div class="hidden lg:block bg-white border-b border-[--sys-border] -mx-6 -mt-6 mb-6">
  <div class="flex items-center justify-between px-6 py-4">
    <div>
      <h1 class="text-xl font-bold text-[--sys-text-primary]">Tablero</h1>
      <p class="text-sm text-[--sys-text-muted]">{auditCount} auditorías</p>
    </div>
    <button
      on:click={onNew}
      class="bg-[--sys-primary] text-white px-4 py-2 rounded-lg text-sm font-medium"
    >
      + Nueva auditoría
    </button>
  </div>

  <div class="flex items-center gap-3 px-6 py-3 border-t border-[--sys-border] bg-white">
    <span class="text-sm text-[--sys-text-muted] shrink-0">Filtrar:</span>
    <ChipFilters options={filterOptions} value={filterValue} onChange={onFilterChange} />
    <div class="relative flex-1 max-w-xs ml-auto">
      <span class="absolute left-3 top-1/2 -translate-y-1/2 text-[--sys-text-faint] text-sm">🔍</span>
      <input
        type="search"
        value={searchValue}
        on:input={(e) => onSearch(e.currentTarget.value)}
        placeholder="Buscar..."
        class="w-full pl-8 pr-3 py-1.5 text-sm border border-[--sys-border] rounded-lg bg-[--sys-bg-app] text-[--sys-text-primary]"
      />
    </div>
  </div>
</div>
