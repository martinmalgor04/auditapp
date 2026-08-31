<script lang="ts">
  import { ESCANEO_ESTADO_BADGE, ESCANEO_ESTADO_LABELS, type OcurrenciaUi } from '$lib/escaneos/escaneo-view';
  import { formatDateTime } from '$lib/utils/format';

  let { ocurrencias }: { ocurrencias: OcurrenciaUi[] } = $props();
</script>

<!-- R10: escaneos de origen con etiqueta/rango, estado y última detección -->
<div class="flex flex-wrap gap-1" data-testid="provenance-chips">
  {#each ocurrencias as o (o.escaneoId)}
    <span
      class="rounded-full px-2 py-0.5 text-xs font-medium {ESCANEO_ESTADO_BADGE[o.escaneoEstado]}"
      title="{ESCANEO_ESTADO_LABELS[o.escaneoEstado]} · Última detección: {formatDateTime(o.vistoAt)}"
    >
      {o.escaneoEtiqueta ?? o.escaneoRango}
    </span>
  {/each}
</div>
