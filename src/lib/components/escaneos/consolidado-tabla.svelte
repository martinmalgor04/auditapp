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

<!-- R30: tabla en viewports >= lg -->
<div
  class="hidden overflow-x-auto rounded-sys border border-sys-borde bg-white shadow-sm lg:block"
  data-testid="consolidado-tabla"
>
  <table class="min-w-full text-left text-sm">
    <thead class="border-b border-sys-borde bg-sys-offwhite text-sys-medio">
      <tr>
        <th class="px-4 py-3 font-medium">Dispositivo</th>
        <th class="px-4 py-3 font-medium">Tipo</th>
        <th class="px-4 py-3 font-medium">MAC</th>
        <th class="px-4 py-3 font-medium">Origen</th>
        <th class="px-4 py-3 font-medium">Última detección</th>
        <th class="px-4 py-3 font-medium">Revisión</th>
        <th class="px-4 py-3 font-medium"></th>
      </tr>
    </thead>
    <tbody>
      {#each dispositivos as d (d.identidad)}
        <tr class="border-b border-sys-borde/60 hover:bg-sys-offwhite" data-testid="consolidado-row">
          <td class="px-4 py-3">
            <a
              href={detalleDispositivoHref(auditId, d.identidad)}
              class="font-medium text-sys-profundo hover:text-sys-electrico hover:underline"
              data-testid="consolidado-detalle-link"
            >
              {d.hostname ?? d.identidad}
            </a>
            <span class="block text-xs tabular-nums text-sys-medio">{d.ip}</span>
            {#if d.identidadPorIp}
              <!-- R15: identidad débil (sin MAC, riesgo DHCP) -->
              <span
                class="mt-1 inline-block rounded-full bg-[rgba(245,158,11,.12)] px-2 py-0.5 text-xs font-medium text-sys-status-amber"
                title="Identidad derivada de IP: puede cambiar por reasignación DHCP"
                data-testid="identidad-debil-badge"
              >
                Identidad débil
              </span>
            {/if}
          </td>
          <td class="px-4 py-3 text-sys-medio">{DISPOSITIVO_TIPO_LABELS[d.tipo]}</td>
          <td class="px-4 py-3 font-mono text-xs text-sys-medio">
            {d.mac ? formatMac(d.mac) : '—'}
          </td>
          <td class="px-4 py-3">
            <ProvenanceChips ocurrencias={d.ocurrencias} />
          </td>
          <td class="px-4 py-3 text-xs tabular-nums text-sys-medio">{formatDateTime(d.vistoAt)}</td>
          <td class="px-4 py-3">
            <RevisionBadge revision={d.revision} />
          </td>
          <td class="px-4 py-3">
            <div class="flex items-center justify-end gap-2">
              <form method="POST" action="?/marcar">
                <input type="hidden" name="identidad" value={d.identidad} />
                <input type="hidden" name="revision" value="confirmado" />
                <button
                  type="submit"
                  class="inline-flex min-h-[var(--sys-touch-min)] items-center rounded-sys border border-sys-borde px-3 text-xs font-medium text-sys-status-green disabled:opacity-40"
                  disabled={d.revision === 'confirmado'}
                  data-testid="marcar-confirmado"
                >
                  Confirmar
                </button>
              </form>
              <form method="POST" action="?/marcar">
                <input type="hidden" name="identidad" value={d.identidad} />
                <input type="hidden" name="revision" value="descartado" />
                <button
                  type="submit"
                  class="inline-flex min-h-[var(--sys-touch-min)] items-center rounded-sys border border-sys-borde px-3 text-xs font-medium text-sys-status-red disabled:opacity-40"
                  disabled={d.revision === 'descartado'}
                  data-testid="marcar-descartado"
                >
                  Descartar
                </button>
              </form>
              <a
                href={detalleDispositivoHref(auditId, d.identidad)}
                class="inline-flex min-h-[var(--sys-touch-min)] items-center rounded-sys bg-sys-status-blue-bg px-3 text-xs font-medium text-sys-status-blue-text"
              >
                Detalle
              </a>
            </div>
          </td>
        </tr>
      {:else}
        <tr>
          <td colspan="7" class="px-4 py-8 text-center text-sys-medio" data-testid="consolidado-empty">
            Sin dispositivos para los filtros aplicados
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
