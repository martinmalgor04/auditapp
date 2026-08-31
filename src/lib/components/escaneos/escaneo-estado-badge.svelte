<script lang="ts">
  import type { EscaneoEstado } from '$lib/server/escaneos/schemas';
  import { ESCANEO_ESTADO_BADGE, ESCANEO_ESTADO_LABELS } from '$lib/escaneos/escaneo-view';

  let { estado }: { estado: EscaneoEstado } = $props();
</script>

<span
  class="inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold {ESCANEO_ESTADO_BADGE[
    estado
  ]}"
  data-testid="escaneo-estado-badge"
  data-estado={estado}
>
  {ESCANEO_ESTADO_LABELS[estado]}
</span>
