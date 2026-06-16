<script lang="ts">
  import SysButton from '$lib/components/brand/SysButton.svelte';
  import SysInput from '$lib/components/brand/SysInput.svelte';
  import {
    EMPRESA_RELACIONES,
    EMPRESA_RELACION_LABELS,
    EMPRESA_ESTADOS,
    EMPRESA_ESTADO_LABELS,
    EMPRESA_RELACION_BADGE,
    EMPRESA_ESTADO_BADGE
  } from '$lib/crm/empresa-view';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const isAdmin = $derived(data.user?.role === 'admin');

  let relacionFilter = $state(data.filters.relacion ?? '');
  let estadoFilter = $state(data.filters.estado ?? '');
  let searchQ = $state(data.filters.q ?? '');

  function buildUrl(overrides: Record<string, string | number | undefined> = {}) {
    const params = new URLSearchParams();
    const rel = overrides.relacion ?? relacionFilter;
    const est = overrides.estado ?? estadoFilter;
    const q = overrides.q ?? searchQ;
    const page = overrides.page ?? 1;
    if (rel) params.set('relacion', String(rel));
    if (est) params.set('estado', String(est));
    if (String(q).trim()) params.set('q', String(q).trim());
    if (page && Number(page) > 1) params.set('page', String(page));
    const qs = params.toString();
    return qs ? `/crm?${qs}` : '/crm';
  }

  function applyFilters() {
    window.location.href = buildUrl({ page: 1 });
  }

  function goToPage(page: number) {
    window.location.href = buildUrl({ page });
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
  // #23 Fase 2 (R31): selector explícito de relación que aplica a todo el lote (cliente | prospecto).
  // No se infiere por el origen del archivo; el usuario elige y el endpoint lo recibe como parámetro.
  let importRelacion = $state<'cliente' | 'prospecto'>('cliente');
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
      body.append('relacion', importRelacion); // R31: relación del selector aplicada al lote
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

  const rangeStart = $derived(data.total === 0 ? 0 : (data.page - 1) * data.perPage + 1);
  const rangeEnd = $derived(Math.min(data.page * data.perPage, data.total));
</script>

<svelte:head>
  <title>CRM — Empresas</title>
</svelte:head>

<div class="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div>
      <h1 class="text-2xl font-semibold text-sys-profundo">CRM — Empresas</h1>
      <p class="text-sm text-sys-medio" data-testid="crm-total">
        {data.totalAll} empresas en el registro
      </p>
    </div>
    {#if isAdmin}
      <SysButton
        variant="secondary"
        data-testid="crm-import-clients-toggle"
        onclick={() => (importOpen = !importOpen)}
      >
        Importar empresas
      </SysButton>
    {/if}
  </div>

  {#if isAdmin && importOpen}
    <div
      class="space-y-4 rounded-sys border border-sys-borde bg-white p-4 shadow-sm"
      data-testid="crm-import-clients-panel"
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-lg font-semibold text-sys-profundo">Importar empresas</h2>
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
        <label class="flex items-center gap-2 text-sm text-sys-profundo">
          <span class="font-medium">Relación del lote</span>
          <select
            bind:value={importRelacion}
            data-testid="crm-import-relacion"
            class="rounded-sys border border-sys-borde bg-white px-2 py-1 text-sm"
          >
            <option value="cliente">Cliente</option>
            <option value="prospecto">Prospecto</option>
          </select>
        </label>
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

  <form
    class="flex flex-wrap items-end gap-3 rounded-sys border border-sys-borde bg-white p-4 shadow-sm"
    onsubmit={(e) => {
      e.preventDefault();
      applyFilters();
    }}
    data-testid="crm-filters"
  >
    <label class="flex flex-col gap-1 text-sm">
      <span class="text-sys-medio">Relación</span>
      <select
        bind:value={relacionFilter}
        class="rounded-sys border border-sys-borde px-3 py-2 text-sm"
        data-testid="crm-filter-relacion"
      >
        <option value="">Todas</option>
        {#each EMPRESA_RELACIONES as r (r)}
          <option value={r}>{EMPRESA_RELACION_LABELS[r]}</option>
        {/each}
      </select>
    </label>
    <label class="flex flex-col gap-1 text-sm">
      <span class="text-sys-medio">Estado</span>
      <select
        bind:value={estadoFilter}
        class="rounded-sys border border-sys-borde px-3 py-2 text-sm"
        data-testid="crm-filter-estado"
      >
        <option value="">Todos</option>
        {#each EMPRESA_ESTADOS as s (s)}
          <option value={s}>{EMPRESA_ESTADO_LABELS[s]}</option>
        {/each}
      </select>
    </label>
    <label class="flex min-w-[14rem] flex-1 flex-col gap-1 text-sm">
      <span class="text-sys-medio">Buscar</span>
      <SysInput
        value={searchQ}
        placeholder="Razón social o CUIT"
        data-testid="crm-filter-q"
        oninput={(e) => {
          searchQ = (e.currentTarget as HTMLInputElement).value;
        }}
      />
    </label>
    <SysButton type="submit" variant="secondary">Filtrar</SysButton>
  </form>

  <div class="overflow-x-auto rounded-sys border border-sys-borde bg-white shadow-sm">
    <table class="min-w-full text-left text-sm" data-testid="crm-empresas-table">
      <thead class="border-b border-sys-borde bg-sys-offwhite text-sys-medio">
        <tr>
          <th class="px-4 py-3 font-medium">Razón social</th>
          <th class="px-4 py-3 font-medium">CUIT</th>
          <th class="px-4 py-3 font-medium">Relación</th>
          <th class="px-4 py-3 font-medium">Estado</th>
          <th class="px-4 py-3 font-medium">Rubro</th>
          <th class="px-4 py-3 font-medium">Provincia</th>
          <th class="px-4 py-3 font-medium"></th>
        </tr>
      </thead>
      <tbody>
        {#each data.empresas as empresa (empresa.id)}
          <tr class="border-b border-sys-borde/60 hover:bg-sys-offwhite" data-testid="crm-empresa-row">
            <td class="px-4 py-3">
              <a
                href="/crm/{empresa.id}"
                class="font-medium text-sys-profundo hover:text-sys-electrico hover:underline"
                data-testid="crm-empresa-link"
              >
                {empresa.razonSocial}
              </a>
            </td>
            <td class="px-4 py-3 tabular-nums text-sys-medio">{empresa.cuit ?? '—'}</td>
            <td class="px-4 py-3">
              <span
                class="rounded-full px-2 py-0.5 text-xs font-medium {EMPRESA_RELACION_BADGE[
                  empresa.relacion
                ]}"
                data-testid="crm-empresa-relacion"
              >
                {EMPRESA_RELACION_LABELS[empresa.relacion]}
              </span>
            </td>
            <td class="px-4 py-3">
              <span
                class="rounded-full px-2 py-0.5 text-xs font-medium {EMPRESA_ESTADO_BADGE[
                  empresa.estado
                ]}"
                data-testid="crm-empresa-estado"
              >
                {EMPRESA_ESTADO_LABELS[empresa.estado]}
              </span>
            </td>
            <td class="px-4 py-3 text-sys-medio">{empresa.rubro ?? '—'}</td>
            <td class="px-4 py-3 text-sys-medio">{empresa.provincia ?? '—'}</td>
            <td class="px-4 py-3 text-right">
              <a
                href="/crm/{empresa.id}"
                class="text-sm font-medium text-sys-electrico hover:underline"
              >
                Ver ficha
              </a>
            </td>
          </tr>
        {:else}
          <tr>
            <td colspan="7" class="px-4 py-8 text-center text-sys-medio" data-testid="crm-empty">
              Sin empresas para los filtros aplicados
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <div class="flex flex-wrap items-center justify-between gap-3 text-sm" data-testid="crm-pagination">
    <span class="text-sys-medio" data-testid="crm-pagination-range">
      {#if data.total === 0}
        Sin resultados
      {:else}
        Mostrando {rangeStart}–{rangeEnd} de {data.total}
      {/if}
    </span>
    <div class="flex items-center gap-2">
      <SysButton
        variant="secondary"
        disabled={data.page <= 1}
        data-testid="crm-page-prev"
        onclick={() => goToPage(data.page - 1)}
      >
        Anterior
      </SysButton>
      <span class="tabular-nums text-sys-medio" data-testid="crm-page-indicator">
        Página {data.page} de {data.totalPages}
      </span>
      <SysButton
        variant="secondary"
        disabled={data.page >= data.totalPages}
        data-testid="crm-page-next"
        onclick={() => goToPage(data.page + 1)}
      >
        Siguiente
      </SysButton>
    </div>
  </div>
</div>
