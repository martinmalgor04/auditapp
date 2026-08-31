<script lang="ts">
  import RevisionBadge from './revision-badge.svelte';
  import ProvenanceChips from './provenance-chips.svelte';
  import {
    DISPOSITIVO_TIPO_LABELS,
    detalleDispositivoHref,
    formatMac,
    type DispositivoConsolidadoUi
  } from '$lib/escaneos/escaneo-view';
  import { formatDateTime } from '$lib/utils/format';

  let {
    dispositivos,
    auditId
  }: {
    dispositivos: DispositivoConsolidadoUi[];
    auditId: string;
  } = $props();
</script>

<!-- R30: cards en viewports < lg -->
<div class="space-y-2 lg:hidden" data-testid="consolidado-cards">
  {#each dispositivos as d (d.identidad)}
    <div class="rounded-sys border border-sys-borde bg-white p-3 shadow-sm" data-testid="consolidado-card">
      <div class="flex items-start justify-between gap-2">
        <a
          href={detalleDispositivoHref(auditId, d.identidad)}
          class="min-w-0 font-medium text-sys-profundo hover:text-sys-electrico"
          data-testid="consolidado-detalle-link"
        >
          <span class="block truncate">{d.hostname ?? d.identidad}</span>
          <span class="block text-xs tabular-nums text-sys-medio">{d.ip}</span>
        </a>
        <RevisionBadge revision={d.revision} />
      </div>

      <div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-sys-medio">
        <span class="rounded-full bg-sys-offwhite px-2 py-0.5 font-medium">
          {DISPOSITIVO_TIPO_LABELS[d.tipo]}
        </span>
        {#if d.mac}
          <span class="font-mono">{formatMac(d.mac)}</span>
        {/if}
        {#if d.identidadPorIp}
          <!-- R15: identidad débil (sin MAC, riesgo DHCP) -->
          <span
            class="rounded-full bg-[rgba(245,158,11,.12)] px-2 py-0.5 font-medium text-sys-status-amber"
            title="Identidad derivada de IP: puede cambiar por reasignación DHCP"
            data-testid="identidad-debil-badge"
          >
            Identidad débil
          </span>
        {/if}
      </div>

      <div class="mt-2">
        <ProvenanceChips ocurrencias={d.ocurrencias} />
      </div>

      <div class="mt-1 text-xs text-sys-text-faint">
        Última detección: {formatDateTime(d.vistoAt)}
      </div>

      <!-- R20/R31: acciones rápidas con target táctil -->
      <div class="mt-3 flex gap-2 border-t border-sys-borde/60 pt-3">
        <form method="POST" action="?/marcar" class="flex-1">
          <input type="hidden" name="identidad" value={d.identidad} />
          <input type="hidden" name="revision" value="confirmado" />
          <button
            type="submit"
            class="min-h-[var(--sys-touch-min)] w-full rounded-sys border border-sys-borde px-3 text-sm font-medium text-sys-status-green disabled:opacity-40"
            disabled={d.revision === 'confirmado'}
            data-testid="marcar-confirmado"
          >
            Confirmar
          </button>
        </form>
        <form method="POST" action="?/marcar" class="flex-1">
          <input type="hidden" name="identidad" value={d.identidad} />
          <input type="hidden" name="revision" value="descartado" />
          <button
            type="submit"
            class="min-h-[var(--sys-touch-min)] w-full rounded-sys border border-sys-borde px-3 text-sm font-medium text-sys-status-red disabled:opacity-40"
            disabled={d.revision === 'descartado'}
            data-testid="marcar-descartado"
          >
            Descartar
          </button>
        </form>
        <a
          href={detalleDispositivoHref(auditId, d.identidad)}
          class="inline-flex min-h-[var(--sys-touch-min)] flex-1 items-center justify-center rounded-sys bg-sys-status-blue-bg px-3 text-sm font-medium text-sys-status-blue-text"
        >
          Detalle
        </a>
      </div>
    </div>
  {:else}
    <p class="rounded-sys border border-sys-borde bg-white px-4 py-8 text-center text-sys-medio">
      Sin dispositivos para los filtros aplicados
    </p>
  {/each}
</div>
