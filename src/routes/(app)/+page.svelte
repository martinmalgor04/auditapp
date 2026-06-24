<script lang="ts">
  import { goto } from '$app/navigation';
  import type { PageData } from './$types';
  import type { AuditListItem } from '$lib/types';
  import TableroHeader from '$lib/components/backoffice/TableroHeader.svelte';
  import AuditCard from '$lib/components/backoffice/AuditCard.svelte';
  import AuditStatusBadge from '$lib/components/backoffice/audit-status-badge.svelte';
  import AuditProgressBar from '$lib/components/backoffice/audit-progress-bar.svelte';
  import AuditRowActions from '$lib/components/backoffice/audit-row-actions.svelte';
  import CopyLinkButton from '$lib/components/backoffice/copy-link-button.svelte';
  import { AUDIT_TYPE_LABELS, type AuditType } from '$lib/audit-types';
  import { formatDate } from '$lib/utils/format';

  import { page as pageStore } from '$app/stores';

  let { data }: { data: PageData } = $props();

  let searchValue = $state('');

  const TYPE_FILTER_OPTIONS = [
    { label: 'Todos', value: '' },
    { label: 'IT', value: 'it' },
    { label: 'ERP', value: 'erp' },
    { label: 'En cierre', value: 'en_cierre' },
    { label: 'Cerrada', value: 'cerrada' }
  ];

  // URL-driven filter (server already reads ?type=)
  const typeFilter = $derived($pageStore.url.searchParams.get('type') ?? '');

  function handleTypeFilter(value: string) {
    const params = new URLSearchParams($pageStore.url.searchParams);
    if (value) {
      params.set('type', value);
    } else {
      params.delete('type');
    }
    goto(`?${params.toString()}`);
  }

  const filtered = $derived(
    data.dashboard.rows.filter((row) => {
      const q = searchValue.trim().toLowerCase();
      const matchesSearch = !q || row.razonSocial.toLowerCase().includes(q);
      // Client-side search only; type filter is server-side via URL
      return matchesSearch;
    })
  );

  // Map DashboardAuditRow → AuditListItem for AuditCard
  function toAuditListItem(row: (typeof data.dashboard.rows)[0]): AuditListItem {
    return {
      id: row.id,
      ref_code: row.refCode,
      client_name: row.razonSocial,
      status: row.status,
      types: row.types,
      segment: row.segment,
      progress: row.progress.percent,
      assigned_tech_name: row.techName,
      scheduled_at: formatDate(row.scheduledAt) ?? undefined
    };
  }
</script>

<svelte:head>
  <title>Tablero — auditapp</title>
</svelte:head>

<!-- Mobile (< lg) -->
<div class="lg:hidden space-y-2 p-3 pt-[calc(env(safe-area-inset-top)+4rem+0.75rem)]">
  <TableroHeader
    auditCount={filtered.length}
    {searchValue}
    onSearch={(q) => (searchValue = q)}
    onNew={() => goto('/auditorias/nueva')}
  />
  <!-- Chips de filtro -->
  <div class="flex gap-2 overflow-x-auto px-1 pb-1">
    {#each TYPE_FILTER_OPTIONS as opt}
      <button
        class="rounded-full px-3 py-1 text-sm font-medium shrink-0 {typeFilter === opt.value
          ? 'bg-[--sys-primary] text-white'
          : 'bg-[--sys-bg-app] border border-[--sys-border] text-[--sys-text-secondary]'}"
        onclick={() => handleTypeFilter(opt.value)}
      >
        {opt.label}
      </button>
    {/each}
  </div>
  {#each filtered as row}
    <AuditCard audit={toAuditListItem(row)} />
  {:else}
    <p class="py-12 text-center text-[--sys-text-muted]">No hay auditorías</p>
  {/each}
</div>

<!-- Desktop (>= lg) -->
<div class="hidden lg:block p-6 pt-6">
  <TableroHeader
    auditCount={filtered.length}
    {searchValue}
    onSearch={(q) => (searchValue = q)}
    onNew={() => goto('/auditorias/nueva')}
  />
  <!-- Chips de filtro -->
  <div class="flex gap-2 mt-3">
    {#each TYPE_FILTER_OPTIONS as opt}
      <button
        class="rounded-full px-3 py-1 text-sm font-medium {typeFilter === opt.value
          ? 'bg-[--sys-primary] text-white'
          : 'bg-[--sys-bg-app] border border-[--sys-border] text-[--sys-text-secondary]'}"
        onclick={() => handleTypeFilter(opt.value)}
      >
        {opt.label}
      </button>
    {/each}
  </div>
  <div class="mt-4 bg-white rounded-xl shadow-sm overflow-hidden">
    <table class="w-full text-sm">
      <thead>
        <tr class="bg-[#F7F9FB]">
          <th class="px-4 py-3 text-[9px] font-bold uppercase text-[--sys-text-faint] text-left" style="width: 22%">Cliente</th>
          <th class="px-4 py-3 text-[9px] font-bold uppercase text-[--sys-text-faint] text-left" style="width: 88px">Tipo</th>
          <th class="px-4 py-3 text-[9px] font-bold uppercase text-[--sys-text-faint] text-left" style="width: 108px">Estado</th>
          <th class="px-4 py-3 text-[9px] font-bold uppercase text-[--sys-text-faint] text-left" style="width: 145px">Avance</th>
          <th class="px-4 py-3 text-[9px] font-bold uppercase text-[--sys-text-faint] text-left" style="width: 108px">Técnico</th>
          <th class="px-4 py-3 text-[9px] font-bold uppercase text-[--sys-text-faint] text-left" style="width: 62px">Visita</th>
          <th class="px-4 py-3 text-[9px] font-bold uppercase text-[--sys-text-faint] text-left" style="width: 76px">Actualiz.</th>
          <th class="px-4 py-3 text-[9px] font-bold uppercase text-[--sys-text-faint] text-left" style="width: 165px">Acciones</th>
        </tr>
      </thead>
      <tbody>
        {#each filtered as row}
          <tr class="border-b border-[#F0F2F5] hover:bg-[#F7F9FB]/60 transition-colors">
            <td class="px-4 py-3">
              <a href="/auditorias/{row.id}" class="font-medium text-[--sys-text-primary] hover:text-[--sys-primary]">
                {row.razonSocial}
              </a>
              <span class="block font-mono text-[10px] text-[--sys-primary]">{row.refCode}</span>
            </td>
            <td class="px-4 py-3">
              <div class="flex flex-wrap gap-1">
                {#each row.types as type}
                  <span class="rounded bg-[--sys-bg-app] px-2 py-0.5 text-[10px] text-[--sys-text-secondary]">
                    {AUDIT_TYPE_LABELS[type as AuditType] ?? type}
                  </span>
                {/each}
              </div>
            </td>
            <td class="px-4 py-3">
              <AuditStatusBadge status={row.status} />
            </td>
            <td class="px-4 py-3">
              <AuditProgressBar progress={row.progress} />
            </td>
            <td class="px-4 py-3 text-[--sys-text-secondary] text-xs">{row.techName}</td>
            <td class="px-4 py-3 text-[--sys-text-muted] text-xs">{formatDate(row.scheduledAt)}</td>
            <td class="px-4 py-3 text-[--sys-text-muted] text-xs">{formatDate(row.lastActivity)}</td>
            <td class="px-4 py-3">
              <div class="flex flex-col gap-2">
                <AuditRowActions auditId={row.id} status={row.status} />
                {#if row.briefingUrl}
                  <CopyLinkButton url={row.briefingUrl} />
                {/if}
              </div>
            </td>
          </tr>
        {:else}
          <tr>
            <td colspan="8" class="px-4 py-12 text-center text-[--sys-text-muted]">
              No hay auditorías
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  {#if data.dashboard.hasNext || data.dashboard.page > 1}
    <nav class="flex flex-col gap-3 pt-4 text-sm text-[--sys-text-muted] sm:flex-row sm:items-center sm:justify-between">
      <span>Página {data.dashboard.page} · {data.dashboard.total} auditorías</span>
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
