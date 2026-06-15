<script lang="ts">
  import LeadRow from '$lib/components/crm/lead-row.svelte';
  import SysButton from '$lib/components/brand/SysButton.svelte';
  import SysInput from '$lib/components/brand/SysInput.svelte';
  import { CRM_FUNNEL, CRM_STATUS_LABELS, CRM_SOURCE_LABELS, type CrmStatus } from '$lib/crm/view';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const isAdmin = $derived(data.user?.role === 'admin');

  let statusFilter = $state(data.filters.status ?? '');
  let sourceFilter = $state(data.filters.source ?? '');
  let searchQ = $state(data.filters.q ?? '');

  function applyFilters() {
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (sourceFilter) params.set('source', sourceFilter);
    if (searchQ.trim()) params.set('q', searchQ.trim());
    const qs = params.toString();
    window.location.href = qs ? `/crm?${qs}` : '/crm';
  }

  type RowError = { row: number; reason: string };
  type ImportReport = {
    total: number;
    created: number;
    updated: number;
    skipped: RowError[];
    invalid: RowError[];
    ignoredColumns: string[];
  };

  let importOpen = $state(false);
  let importFile = $state<File | null>(null);
  let importing = $state(false);
  let importError = $state<string | null>(null);
  let importReport = $state<ImportReport | null>(null);

  function onImportFileChange(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    importFile = input.files?.[0] ?? null;
  }

  async function submitImport() {
    if (!importFile) {
      importError = 'Elegí un archivo CSV o .xlsx';
      return;
    }
    importing = true;
    importError = null;
    importReport = null;
    try {
      const body = new FormData();
      body.append('file', importFile);
      const res = await fetch('/api/crm/clients/import', { method: 'POST', body });
      const json = await res.json();
      if (!res.ok || !json.success) {
        importError = json.error ?? 'No se pudo importar el archivo';
        return;
      }
      importReport = json.data as ImportReport;
    } catch {
      importError = 'No se pudo importar el archivo';
    } finally {
      importing = false;
    }
  }
</script>

<svelte:head>
  <title>CRM — Leads</title>
</svelte:head>

<div class="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <h1 class="text-2xl font-semibold text-sys-profundo">CRM — Leads</h1>
    {#if isAdmin}
      <SysButton
        variant="secondary"
        data-testid="crm-import-clients-toggle"
        onclick={() => (importOpen = !importOpen)}
      >
        Importar clientes
      </SysButton>
    {/if}
  </div>

  {#if isAdmin && importOpen}
    <div
      class="space-y-4 rounded-sys border border-sys-borde bg-white p-4 shadow-sm"
      data-testid="crm-import-clients-panel"
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-lg font-semibold text-sys-profundo">Importar clientes</h2>
        <a
          href="/plantillas/clientes-import-template.csv"
          download
          class="text-sm font-medium text-sys-electrico hover:underline"
          data-testid="crm-import-template-link"
        >
          Descargar plantilla CSV
        </a>
      </div>
      <p class="text-sm text-sys-medio">
        Aceptamos CSV o Excel (.xlsx). Solo se importan las columnas
        <code>razon_social, cuit, direccion, cp, provincia, telefono, email</code>; el resto se
        ignora. El match es por CUIT (se actualiza si ya existe).
      </p>

      <div class="flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept=".csv,.xlsx"
          data-testid="crm-import-file"
          onchange={onImportFileChange}
          class="text-sm"
        />
        <SysButton
          variant="primary"
          disabled={importing || !importFile}
          data-testid="crm-import-submit"
          onclick={submitImport}
        >
          {importing ? 'Importando…' : 'Importar'}
        </SysButton>
      </div>

      {#if importError}
        <p class="text-sm text-red-600" data-testid="crm-import-error">{importError}</p>
      {/if}

      {#if importReport}
        <div class="space-y-3" data-testid="crm-import-report">
          <div class="flex flex-wrap gap-2 text-sm">
            <span class="rounded-sys bg-sys-offwhite px-3 py-1" data-testid="crm-import-total">
              Leídas: <strong class="tabular-nums">{importReport.total}</strong>
            </span>
            <span class="rounded-sys bg-sys-offwhite px-3 py-1" data-testid="crm-import-created">
              Creados: <strong class="tabular-nums">{importReport.created}</strong>
            </span>
            <span class="rounded-sys bg-sys-offwhite px-3 py-1" data-testid="crm-import-updated">
              Actualizados: <strong class="tabular-nums">{importReport.updated}</strong>
            </span>
            <span class="rounded-sys bg-sys-offwhite px-3 py-1" data-testid="crm-import-skipped">
              Omitidos: <strong class="tabular-nums">{importReport.skipped.length}</strong>
            </span>
            <span class="rounded-sys bg-sys-offwhite px-3 py-1" data-testid="crm-import-invalid">
              Inválidos: <strong class="tabular-nums">{importReport.invalid.length}</strong>
            </span>
          </div>

          {#if importReport.ignoredColumns.length > 0}
            <p class="text-sm text-sys-medio" data-testid="crm-import-ignored">
              Columnas ignoradas ({importReport.ignoredColumns.length}):
              {importReport.ignoredColumns.join(', ')}
            </p>
          {/if}

          {#if importReport.skipped.length > 0}
            <div class="text-sm">
              <p class="font-medium text-sys-profundo">Omitidos (sin CUIT)</p>
              <ul class="list-disc pl-5 text-sys-medio">
                {#each importReport.skipped as e (e.row)}
                  <li>Fila {e.row}: {e.reason}</li>
                {/each}
              </ul>
            </div>
          {/if}

          {#if importReport.invalid.length > 0}
            <div class="text-sm">
              <p class="font-medium text-red-600">Inválidos</p>
              <ul class="list-disc pl-5 text-sys-medio">
                {#each importReport.invalid as e (e.row)}
                  <li>Fila {e.row}: {e.reason}</li>
                {/each}
              </ul>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/if}

  <div class="flex flex-wrap gap-2" data-testid="crm-funnel-counts">
    {#each CRM_FUNNEL as stage}
      <a
        href="/crm?status={stage}"
        class="rounded-sys border border-sys-borde bg-white px-3 py-2 text-sm shadow-sm transition-colors hover:border-sys-electrico"
        data-testid="crm-count-{stage}"
      >
        <span class="font-medium text-sys-profundo">{CRM_STATUS_LABELS[stage]}</span>
        <span class="ml-2 tabular-nums text-sys-electrico">{data.counts[stage]}</span>
      </a>
    {/each}
  </div>

  <form
    class="flex flex-wrap items-end gap-3 rounded-sys border border-sys-borde bg-white p-4 shadow-sm"
    onsubmit={(e) => {
      e.preventDefault();
      applyFilters();
    }}
    data-testid="crm-filters"
  >
    <label class="flex flex-col gap-1 text-sm">
      <span class="text-sys-medio">Estado</span>
      <select
        bind:value={statusFilter}
        class="rounded-sys border border-sys-borde px-3 py-2 text-sm"
        data-testid="crm-filter-status"
      >
        <option value="">Todos (sin descartados)</option>
        {#each [...CRM_FUNNEL, 'descartado'] as s (s)}
          <option value={s}>{CRM_STATUS_LABELS[s as CrmStatus]}</option>
        {/each}
      </select>
    </label>
    <label class="flex flex-col gap-1 text-sm">
      <span class="text-sys-medio">Origen</span>
      <select
        bind:value={sourceFilter}
        class="rounded-sys border border-sys-borde px-3 py-2 text-sm"
        data-testid="crm-filter-source"
      >
        <option value="">Todos</option>
        {#each Object.entries(CRM_SOURCE_LABELS) as [value, label]}
          <option {value}>{label}</option>
        {/each}
      </select>
    </label>
    <label class="flex min-w-[12rem] flex-1 flex-col gap-1 text-sm">
      <span class="text-sys-medio">Buscar</span>
      <SysInput
        value={searchQ}
        placeholder="Email o empresa"
        data-testid="crm-filter-q"
        oninput={(e) => {
          searchQ = (e.currentTarget as HTMLInputElement).value;
        }}
      />
    </label>
    <SysButton type="submit" variant="secondary">Filtrar</SysButton>
  </form>

  <div class="overflow-x-auto rounded-sys border border-sys-borde bg-white shadow-sm">
    <table class="min-w-full text-left text-sm" data-testid="crm-leads-table">
      <thead class="border-b border-sys-borde bg-sys-offwhite text-sys-medio">
        <tr>
          <th class="px-4 py-3 font-medium">Estado</th>
          <th class="px-4 py-3 font-medium">Empresa</th>
          <th class="px-4 py-3 font-medium">Contacto</th>
          <th class="px-4 py-3 font-medium">Email</th>
          <th class="px-4 py-3 font-medium">Origen</th>
          <th class="px-4 py-3 font-medium">Próxima acción</th>
          <th class="px-4 py-3 font-medium">Fecha</th>
          <th class="px-4 py-3 font-medium"></th>
        </tr>
      </thead>
      <tbody>
        {#each data.leads as lead (lead.id)}
          <LeadRow
            {lead}
            events={data.eventsByLead[lead.id] ?? []}
            {isAdmin}
            onStatusChanged={() => window.location.reload()}
          />
        {:else}
          <tr>
            <td colspan="8" class="px-4 py-8 text-center text-sys-medio">Sin leads para mostrar</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>
