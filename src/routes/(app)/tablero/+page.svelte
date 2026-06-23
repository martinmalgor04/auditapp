<script lang="ts">
  import type { PageData } from './$types';
  import AuditFilters from '$lib/components/backoffice/audit-filters.svelte';
  import AuditTable from '$lib/components/backoffice/audit-table.svelte';
  import AuditCardList from '$lib/components/backoffice/audit-card-list.svelte';
  import EmptyDashboard from '$lib/components/backoffice/EmptyDashboard.svelte';

  let { data }: { data: PageData } = $props();

  const hasFilters = $derived(
    (data.filters.type ?? '') !== '' ||
      (data.filters.status ?? '') !== '' ||
      (data.filters.clientId ?? '') !== '' ||
      (data.filters.q ?? '') !== ''
  );
</script>

<svelte:head>
  <title>Tablero — auditapp</title>
</svelte:head>

<div class="space-y-6">
  <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
    <h1 class="sys-page-title">Tablero</h1>
    <a href="/auditorias/new" class="sys-btn-primary w-full sm:w-auto">Nueva auditoría</a>
  </div>

  <AuditFilters clients={data.clients} filters={data.filters} allowedTypes={data.allowedTypes} />

  {#if data.dashboard.rows.length === 0}
    <EmptyDashboard {hasFilters} />
  {:else}
    <AuditTable rows={data.dashboard.rows} />
    <AuditCardList rows={data.dashboard.rows} />
  {/if}

  {#if data.dashboard.hasNext || data.dashboard.page > 1}
    <nav class="flex flex-col gap-3 pt-2 text-sm text-[var(--sys-text-muted-light)] sm:flex-row sm:items-center sm:justify-between">
      <span>
        Página {data.dashboard.page} · {data.dashboard.total} auditorías
      </span>
      <div class="flex gap-2">
        {#if data.dashboard.page > 1}
          <a href="?page={data.dashboard.page - 1}" class="sys-btn-secondary sys-btn-sm">Anterior</a>
        {/if}
        {#if data.dashboard.hasNext}
          <a href="?page={data.dashboard.page + 1}" class="sys-btn-secondary sys-btn-sm">Siguiente</a>
        {/if}
      </div>
    </nav>
  {/if}
</div>
