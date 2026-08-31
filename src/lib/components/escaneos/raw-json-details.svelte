<script lang="ts">
  import { formatDateTime } from '$lib/utils/format';

  type OcurrenciaRaw = {
    dispositivoId: string;
    escaneoId: string;
    escaneoEtiqueta: string | null;
    vistoAt: string | null;
    raw: Record<string, unknown>;
  };

  let { ocurrencias }: { ocurrencias: OcurrenciaRaw[] } = $props();
</script>

<!-- R19: payload raw de cada ocurrencia, colapsable, sin transformación -->
<div class="space-y-2" data-testid="raw-json-list">
  {#each ocurrencias as o (o.dispositivoId)}
    <details class="rounded-sys border border-sys-borde bg-white" data-testid="raw-json-details">
      <summary
        class="flex min-h-[var(--sys-touch-min)] cursor-pointer items-center px-4 py-2 text-sm font-medium text-sys-profundo"
      >
        Raw — {o.escaneoEtiqueta ?? o.escaneoId} · {formatDateTime(o.vistoAt)}
      </summary>
      <pre
        class="max-h-96 overflow-auto border-t border-sys-borde p-4 text-xs whitespace-pre-wrap text-sys-text-secondary"
      >{JSON.stringify(o.raw, null, 2)}</pre>
    </details>
  {/each}
</div>
