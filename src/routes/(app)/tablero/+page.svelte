<script lang="ts">
  import { goto } from '$app/navigation';
  import type { PageData } from './$types';
  import type { DashboardAuditRow } from '$lib/backoffice/dashboard-types';
  import type { AuditListItem } from '$lib/types';
  import { AUDIT_TYPE_LABELS, type AuditType } from '$lib/audit-types';
  import { canOpenClosure, canOpenForm } from '$lib/audit-status';
  import AuditCard from '$lib/components/backoffice/AuditCard.svelte';
  import TableroHeader from '$lib/components/backoffice/TableroHeader.svelte';
  import ChipFilters from '$lib/components/ui/ChipFilters.svelte';
  import StatusBadge from '$lib/components/ui/StatusBadge.svelte';
  import ItemProgressBar from '$lib/components/ui/ItemProgressBar.svelte';
  import EmptyDashboard from '$lib/components/backoffice/EmptyDashboard.svelte';
  import { formatDate } from '$lib/utils/format';

  let { data }: { data: PageData } = $props();

  const FILTER_OPTIONS = [
    { label: 'Todos', value: 'all' },
    { label: 'IT', value: 'it' },
    { label: 'ERP', value: 'erp' },
    { label: 'En cierre', value: 'en_cierre' },
    { label: 'Cerrada', value: 'cerrada' }
  ];

  const hasFilters = $derived(
    (data.filters.type ?? '') !== '' ||
      (data.filters.status ?? '') !== '' ||
      (data.filters.clientId ?? '') !== '' ||
      (data.filters.q ?? '') !== ''
  );

  const activeFilter = $derived.by(() => {
    if (data.filters.status === 'en_cierre') return 'en_cierre';
    if (data.filters.status === 'cerrada') return 'cerrada';
    if (data.filters.type === 'it') return 'it';
    if (data.filters.type === 'erp-tango' || data.filters.type === 'erp-estandar') return 'erp';
    return 'all';
  });

  function toAuditListItem(row: DashboardAuditRow): AuditListItem {
    return {
      id: row.id,
      ref_code: row.refCode,
      client_name: row.razonSocial,
      status: row.status,
      types: row.types.map((t) => AUDIT_TYPE_LABELS[t as AuditType] ?? t),
      segment: `Seg. ${row.segment}`,
      progress: row.progress.percent,
      assigned_tech_name: row.techName,
      scheduled_at: formatDate(row.scheduledAt) ?? undefined
    };
  }

  function buildParams(overrides: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    const merged = {
      type: data.filters.type,
      status: data.filters.status,
      clientId: data.filters.clientId,
      q: data.filters.q,
      sort: data.filters.sort,
      page: data.filters.page && data.filters.page > 1 ? String(data.filters.page) : undefined,
      ...overrides
    };
    for (const [key, value] of Object.entries(merged)) {
      if (value) params.set(key, value);
    }
    return params.toString();
  }

  function applyFilter(value: string) {
    const next: Record<string, string | undefined> = {
      type: undefined,
      status: undefined,
      page: undefined
    };
    if (value === 'it') next.type = 'it';
    else if (value === 'erp') next.type = 'erp-tango';
    else if (value === 'en_cierre') next.status = 'en_cierre';
    else if (value === 'cerrada') next.status = 'cerrada';
    const qs = buildParams(next);
    void goto(qs ? `/tablero?${qs}` : '/tablero');
  }

  function applySearch(q: string) {
    const qs = buildParams({ q: q || undefined, page: undefined });
    void goto(qs ? `/tablero?${qs}` : '/tablero');
  }

  function handleNew() {
    void goto('/auditorias/new');
  }
</script>

<svelte:head>
  <title>Tablero — auditapp</title>
</svelte:head>

<div class="max-lg:space-y-0 lg:space-y-0">
  <TableroHeader
    auditCount={data.dashboard.total}
    searchValue={data.filters.q ?? ''}
    filterValue={activeFilter}
    filterOptions={FILTER_OPTIONS}
    onSearch={applySearch}
    onFilterChange={applyFilter}
    onNew={handleNew}
  />

  <div class="lg:hidden bg-white border-b border-[--sys-border] -mx-4 px-4 py-3 mb-4">
    <ChipFilters options={FILTER_OPTIONS} value={activeFilter} onChange={applyFilter} />
  </div>

  {#if data.dashboard.rows.length === 0}
    <EmptyDashboard {hasFilters} />
  {:else}
    <div class="lg:hidden space-y-2 p-2" data-testid="audit-card-list-mobile">
      {#each data.dashboard.rows as row (row.id)}
        <article>
          <AuditCard audit={toAuditListItem(row)} />
        </article>
      {/each}
    </div>

    <div
      class="hidden lg:block overflow-hidden rounded-[10px] bg-white shadow-[0_1px_4px_rgba(0,0,0,.08)]"
      data-testid="audit-table-desktop"
    >
      <table class="w-full text-sm">
        <thead class="bg-[#F7F9FB]">
          <tr
            class="grid items-center gap-2 px-4 py-3 text-[9px] font-bold uppercase text-[--sys-text-faint]"
            style="grid-template-columns: 2.2fr 88px 120px 145px 108px 62px 76px 165px"
          >
            <th class="text-left">Cliente</th>
            <th class="text-left">Tipo</th>
            <th class="text-left">Estado</th>
            <th class="text-left">Avance</th>
            <th class="text-left">Técnico</th>
            <th class="text-left">Visita</th>
            <th class="text-left">Actualiz.</th>
            <th class="text-left">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {#each data.dashboard.rows as row (row.id)}
            <tr
              class="grid items-center gap-2 border-b border-[#F0F2F5] px-4 py-3"
              style="grid-template-columns: 2.2fr 88px 120px 145px 108px 62px 76px 165px"
            >
              <td class="min-w-0">
                <a
                  href="/auditorias/{row.id}"
                  class="block truncate font-medium text-[--sys-text-primary] hover:text-[--sys-primary]"
                >
                  {row.razonSocial}
                </a>
                <span class="block text-[10px] font-semibold text-[--sys-primary]">{row.refCode}</span>
              </td>
              <td class="text-xs text-[--sys-text-secondary]">
                {row.types.map((t) => AUDIT_TYPE_LABELS[t as AuditType] ?? t).join(', ')}
              </td>
              <td><StatusBadge status={row.status} /></td>
              <td>
                <div class="flex items-center gap-2">
                  <div class="flex-1">
                    <ItemProgressBar value={row.progress.percent} status={row.status} />
                  </div>
                  <span class="text-xs text-[--sys-text-muted] w-8 text-right">{row.progress.percent}%</span>
                </div>
              </td>
              <td class="text-xs text-[--sys-text-secondary] truncate">{row.techName}</td>
              <td class="text-xs text-[--sys-text-muted]">{formatDate(row.scheduledAt)}</td>
              <td class="text-xs text-[--sys-text-muted]">{formatDate(row.lastActivity)}</td>
              <td>
                <div class="flex flex-wrap gap-1">
                  <a
                    href="/auditorias/{row.id}"
                    class="px-2 py-1 text-xs border border-[--sys-border] rounded-lg text-[--sys-text-secondary]"
                  >
                    Ver
                  </a>
                  {#if canOpenForm(row.status)}
                    <a
                      href="/auditorias/{row.id}/form"
                      class="px-2 py-1 text-xs bg-[--sys-primary] text-white rounded-lg font-medium"
                    >
                      Relevamiento
                    </a>
                  {/if}
                  {#if canOpenClosure(row.status)}
                    <a
                      href="/auditorias/{row.id}/cierre"
                      class="px-2 py-1 text-xs border border-[--sys-border] rounded-lg text-[--sys-text-secondary]"
                    >
                      Cierre
                    </a>
                  {/if}
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  {#if data.dashboard.hasNext || data.dashboard.page > 1}
    <nav
      class="flex flex-col gap-3 pt-2 text-sm text-[--sys-text-muted] sm:flex-row sm:items-center sm:justify-between"
    >
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
