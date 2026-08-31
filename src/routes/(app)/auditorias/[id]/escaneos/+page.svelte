<script lang="ts">
  import SysButton from '$lib/components/brand/SysButton.svelte';
  import SysInput from '$lib/components/brand/SysInput.svelte';
  import ChipFilters from '$lib/components/ui/ChipFilters.svelte';
  import EscaneoEstadoBadge from '$lib/components/escaneos/escaneo-estado-badge.svelte';
  import EscaneoTokenPanel from '$lib/components/escaneos/escaneo-token-panel.svelte';
  import ConsolidadoCards from '$lib/components/escaneos/consolidado-cards.svelte';
  import ConsolidadoTabla from '$lib/components/escaneos/consolidado-tabla.svelte';
  import {
    DISPOSITIVO_TIPOS,
    DISPOSITIVO_TIPO_LABELS,
    REVISION_LABELS
  } from '$lib/escaneos/escaneo-view';
  import type { DispositivoRevision } from '$lib/server/escaneos/schemas';
  import { formatDateTime } from '$lib/utils/format';
  import type { PageData } from './$types';

  let { data, form }: { data: PageData; form?: Record<string, unknown> } = $props();

  let tipoFilter = $state(data.filtros.tipo);
  let escaneoFilter = $state(data.filtros.escaneo);

  const revisionFilter = $derived(data.filtros.revision);

  function buildUrl(overrides: Record<string, string | number | undefined> = {}) {
    const params = new URLSearchParams();
    const tipo = overrides.tipo ?? tipoFilter;
    const revision = overrides.revision ?? revisionFilter;
    const escaneo = overrides.escaneo ?? escaneoFilter;
    const page = overrides.page ?? 1;
    if (tipo) params.set('tipo', String(tipo));
    if (revision) params.set('revision', String(revision));
    if (escaneo) params.set('escaneo', String(escaneo));
    if (Number(page) > 1) params.set('page', String(page));
    const qs = params.toString();
    const base = `/auditorias/${data.audit.id}/escaneos`;
    return qs ? `${base}?${qs}` : base;
  }

  function applyFilters() {
    window.location.href = buildUrl({ page: 1 });
  }

  function applyRevision(value: string) {
    window.location.href = buildUrl({ revision: value, page: 1 });
  }

  function goToPage(page: number) {
    window.location.href = buildUrl({ page });
  }

  const revisionOptions = $derived([
    { label: `Todos (${data.total})`, value: '' },
    ...(
      ['sin_revisar', 'confirmado', 'descartado', 'fusionado'] as DispositivoRevision[]
    ).map((r) => ({
      label: `${REVISION_LABELS[r]} (${data.contadores[r]})`,
      value: r
    }))
  ]);

  const totalPages = $derived(Math.max(1, Math.ceil(data.total / data.limit)));
  const rangeStart = $derived(data.total === 0 ? 0 : (data.filtros.page - 1) * data.limit + 1);
  const rangeEnd = $derived(Math.min(data.filtros.page * data.limit, data.total));

  const tokenEmitido = $derived(
    form && typeof form.token === 'string' && typeof form.expiresAt === 'string'
      ? { token: form.token, expiresAt: form.expiresAt }
      : null
  );
</script>

<svelte:head>
  <title>Escaneos de red — {data.audit.razonSocial}</title>
</svelte:head>

<div class="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div>
      <h1 class="text-2xl font-semibold text-sys-profundo">Escaneos de red</h1>
      <p class="text-sm text-sys-medio">
        {data.audit.razonSocial} · <span class="font-mono">{data.audit.refCode}</span>
      </p>
    </div>
    <a
      href="/auditorias/{data.audit.id}"
      class="text-sm font-medium text-sys-electrico hover:underline"
    >
      Volver a la auditoría
    </a>
  </div>

  {#if typeof form?.error === 'string'}
    <p class="rounded-sys border border-sys-rojo/20 bg-sys-rojo/10 p-3 text-sm text-sys-rojo" role="alert">
      {form.error}
    </p>
  {/if}

  {#if data.cerrada}
    <!-- R4/R32 (puerta 2026-08-30): revisión permitida, alta de datos bloqueada -->
    <p class="rounded-sys border border-sys-naranja/20 bg-sys-naranja/10 p-4 text-sm text-sys-medio">
      Auditoría cerrada: podés revisar dispositivos, pero no crear escaneos ni gestionar tokens.
    </p>
  {/if}

  {#if tokenEmitido}
    <EscaneoTokenPanel token={tokenEmitido.token} expiresAt={tokenEmitido.expiresAt} />
  {/if}

  <!-- ── Sección Escaneos (R8) ─────────────────────────────────────────── -->
  <section class="space-y-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="text-lg font-semibold text-sys-profundo">Escaneos</h2>
    </div>

    {#if !data.cerrada}
      <form
        method="POST"
        action="?/crearEscaneo"
        class="flex flex-wrap items-end gap-3 rounded-sys border border-sys-borde bg-white p-4 shadow-sm"
        data-testid="crear-escaneo-form"
      >
        <SysInput
          name="rangoObjetivo"
          label="Rango objetivo"
          placeholder="192.168.10.0/24"
          required
          class="min-w-[12rem] flex-1"
          data-testid="crear-escaneo-rango"
        />
        <SysInput
          name="etiqueta"
          label="Etiqueta (opcional)"
          placeholder="VLAN administración"
          class="min-w-[10rem] flex-1"
          data-testid="crear-escaneo-etiqueta"
        />
        <SysButton type="submit" variant="primary" data-testid="crear-escaneo-submit">
          Nuevo escaneo
        </SysButton>
      </form>
    {/if}

    <!-- Cards mobile -->
    <div class="space-y-2 lg:hidden">
      {#each data.escaneos as e (e.id)}
        <div class="rounded-sys border border-sys-borde bg-white p-3 shadow-sm" data-testid="escaneo-card">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <p class="font-medium text-sys-profundo">{e.etiqueta ?? e.rangoObjetivo}</p>
              <p class="text-xs tabular-nums text-sys-medio">{e.rangoObjetivo}</p>
            </div>
            <EscaneoEstadoBadge estado={e.estado} />
          </div>
          <p class="mt-2 text-xs text-sys-medio">
            {e.dispositivosDetectados} dispositivos · Inicio {formatDateTime(e.iniciadoAt)} · Fin {formatDateTime(e.finalizadoAt)}
          </p>
          {#if !data.cerrada}
            <div class="mt-3 flex flex-wrap gap-2 border-t border-sys-borde/60 pt-3">
              <form method="POST" action="?/emitirToken">
                <input type="hidden" name="escaneoId" value={e.id} />
                <button
                  type="submit"
                  class="inline-flex min-h-[var(--sys-touch-min)] items-center rounded-sys bg-sys-status-blue-bg px-3 text-xs font-medium text-sys-status-blue-text"
                  data-testid="emitir-token"
                >
                  {e.tokenActivo ? 'Rotar token' : 'Emitir token'}
                </button>
              </form>
              {#if e.tokenActivo}
                <form
                  method="POST"
                  action="?/revocarToken"
                  onsubmit={(ev) => !confirm('¿Revocar el token activo? El agente dejará de poder reportar de inmediato.') && ev.preventDefault()}
                >
                  <input type="hidden" name="escaneoId" value={e.id} />
                  <button
                    type="submit"
                    class="inline-flex min-h-[var(--sys-touch-min)] items-center rounded-sys border border-sys-borde px-3 text-xs font-medium text-sys-status-red"
                    data-testid="revocar-token"
                  >
                    Revocar
                  </button>
                </form>
                <span class="self-center text-xs text-sys-text-faint">
                  Vence {formatDateTime(e.tokenExpiresAt)}
                </span>
              {/if}
            </div>
          {/if}
        </div>
      {:else}
        <p class="rounded-sys border border-sys-borde bg-white px-4 py-8 text-center text-sys-medio" data-testid="escaneos-empty">
          Sin escaneos todavía — creá el primero
        </p>
      {/each}
    </div>

    <!-- Tabla desktop -->
    <div class="hidden overflow-x-auto rounded-sys border border-sys-borde bg-white shadow-sm lg:block">
      <table class="min-w-full text-left text-sm" data-testid="escaneos-table">
        <thead class="border-b border-sys-borde bg-sys-offwhite text-sys-medio">
          <tr>
            <th class="px-4 py-3 font-medium">Escaneo</th>
            <th class="px-4 py-3 font-medium">Estado</th>
            <th class="px-4 py-3 font-medium">Dispositivos</th>
            <th class="px-4 py-3 font-medium">Inicio</th>
            <th class="px-4 py-3 font-medium">Fin</th>
            <th class="px-4 py-3 font-medium">Token</th>
          </tr>
        </thead>
        <tbody>
          {#each data.escaneos as e (e.id)}
            <tr class="border-b border-sys-borde/60" data-testid="escaneo-row">
              <td class="px-4 py-3">
                <span class="font-medium text-sys-profundo">{e.etiqueta ?? '—'}</span>
                <span class="block text-xs tabular-nums text-sys-medio">{e.rangoObjetivo}</span>
              </td>
              <td class="px-4 py-3"><EscaneoEstadoBadge estado={e.estado} /></td>
              <td class="px-4 py-3 tabular-nums text-sys-medio">{e.dispositivosDetectados}</td>
              <td class="px-4 py-3 text-xs tabular-nums text-sys-medio">{formatDateTime(e.iniciadoAt)}</td>
              <td class="px-4 py-3 text-xs tabular-nums text-sys-medio">{formatDateTime(e.finalizadoAt)}</td>
              <td class="px-4 py-3">
                {#if !data.cerrada}
                  <div class="flex items-center gap-2">
                    <form method="POST" action="?/emitirToken">
                      <input type="hidden" name="escaneoId" value={e.id} />
                      <button
                        type="submit"
                        class="inline-flex min-h-[var(--sys-touch-min)] items-center rounded-sys bg-sys-status-blue-bg px-3 text-xs font-medium text-sys-status-blue-text"
                        data-testid="emitir-token"
                      >
                        {e.tokenActivo ? 'Rotar token' : 'Emitir token'}
                      </button>
                    </form>
                    {#if e.tokenActivo}
                      <form
                        method="POST"
                        action="?/revocarToken"
                        onsubmit={(ev) => !confirm('¿Revocar el token activo? El agente dejará de poder reportar de inmediato.') && ev.preventDefault()}
                      >
                        <input type="hidden" name="escaneoId" value={e.id} />
                        <button
                          type="submit"
                          class="inline-flex min-h-[var(--sys-touch-min)] items-center rounded-sys border border-sys-borde px-3 text-xs font-medium text-sys-status-red"
                          data-testid="revocar-token"
                        >
                          Revocar
                        </button>
                      </form>
                    {/if}
                  </div>
                  {#if e.tokenActivo}
                    <span class="mt-1 block text-xs text-sys-text-faint">
                      Vence {formatDateTime(e.tokenExpiresAt)}
                    </span>
                  {/if}
                {:else if e.tokenActivo}
                  <span class="text-xs text-sys-text-faint">Activo hasta {formatDateTime(e.tokenExpiresAt)}</span>
                {:else}
                  <span class="text-xs text-sys-text-faint">—</span>
                {/if}
              </td>
            </tr>
          {:else}
            <tr>
              <td colspan="6" class="px-4 py-8 text-center text-sys-medio" data-testid="escaneos-empty">
                Sin escaneos todavía — creá el primero
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>

  <!-- ── Sección Dispositivos consolidados (R9–R17) ─────────────────────── -->
  <section class="space-y-3">
    <h2 class="text-lg font-semibold text-sys-profundo">Dispositivos detectados</h2>

    <!-- R17: contadores por revisión efectiva sobre el consolidado completo -->
    <div class="overflow-x-auto" data-testid="revision-filters">
      <ChipFilters options={revisionOptions} value={revisionFilter} onChange={applyRevision} />
    </div>

    <form
      class="flex flex-wrap items-end gap-3 rounded-sys border border-sys-borde bg-white p-4 shadow-sm"
      onsubmit={(e) => {
        e.preventDefault();
        applyFilters();
      }}
      data-testid="consolidado-filters"
    >
      <label class="flex flex-col gap-1 text-sm">
        <span class="text-sys-medio">Tipo</span>
        <select
          bind:value={tipoFilter}
          class="rounded-sys border border-sys-borde px-3 py-2 text-sm"
          data-testid="filtro-tipo"
        >
          <option value="">Todos</option>
          {#each DISPOSITIVO_TIPOS as t (t)}
            <option value={t}>{DISPOSITIVO_TIPO_LABELS[t]}</option>
          {/each}
        </select>
      </label>
      <label class="flex flex-col gap-1 text-sm">
        <span class="text-sys-medio">Escaneo de origen</span>
        <select
          bind:value={escaneoFilter}
          class="rounded-sys border border-sys-borde px-3 py-2 text-sm"
          data-testid="filtro-escaneo"
        >
          <option value="">Todos</option>
          {#each data.escaneos as e (e.id)}
            <option value={e.id}>{e.etiqueta ?? e.rangoObjetivo}</option>
          {/each}
        </select>
      </label>
      <SysButton type="submit" variant="secondary">Filtrar</SysButton>
    </form>

    <ConsolidadoCards dispositivos={data.dispositivos} auditId={data.audit.id} />
    <ConsolidadoTabla dispositivos={data.dispositivos} auditId={data.audit.id} />

    <div class="flex flex-wrap items-center justify-between gap-3 text-sm" data-testid="consolidado-pagination">
      <span class="text-sys-medio">
        {#if data.total === 0}
          Sin resultados
        {:else}
          Mostrando {rangeStart}–{rangeEnd} de {data.total}
        {/if}
      </span>
      <div class="flex items-center gap-2">
        <SysButton
          variant="secondary"
          disabled={data.filtros.page <= 1}
          data-testid="page-prev"
          onclick={() => goToPage(data.filtros.page - 1)}
        >
          Anterior
        </SysButton>
        <span class="tabular-nums text-sys-medio">Página {data.filtros.page} de {totalPages}</span>
        <SysButton
          variant="secondary"
          disabled={data.filtros.page >= totalPages}
          data-testid="page-next"
          onclick={() => goToPage(data.filtros.page + 1)}
        >
          Siguiente
        </SysButton>
      </div>
    </div>
  </section>
</div>
