<script lang="ts">
  import type { PageData } from './$types';
  import AuditFilters from '$lib/components/backoffice/audit-filters.svelte';
  import AuditTable from '$lib/components/backoffice/audit-table.svelte';
  import AuditCardList from '$lib/components/backoffice/audit-card-list.svelte';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>Tablero — auditapp</title>
</svelte:head>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <h1 class="text-2xl font-bold text-slate-900">Tablero</h1>
    <a
      href="/auditorias/new"
      class="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
    >
      Nueva auditoría
    </a>
  </div>

  <AuditFilters clients={data.clients} filters={data.filters} />

  <AuditTable rows={data.dashboard.rows} />
  <AuditCardList rows={data.dashboard.rows} />

  {#if data.dashboard.hasNext || data.dashboard.page > 1}
    <nav class="flex items-center justify-between text-sm text-slate-600 pt-2">
      <span>
        Página {data.dashboard.page} · {data.dashboard.total} auditorías
      </span>
      <div class="flex gap-2">
        {#if data.dashboard.page > 1}
          <a
            href="?page={data.dashboard.page - 1}"
            class="rounded border border-slate-300 px-3 py-1 hover:bg-white"
          >
            Anterior
          </a>
        {/if}
        {#if data.dashboard.hasNext}
          <a
            href="?page={data.dashboard.page + 1}"
            class="rounded border border-slate-300 px-3 py-1 hover:bg-white"
          >
            Siguiente
          </a>
        {/if}
      </div>
    </nav>
  {/if}
</div>
