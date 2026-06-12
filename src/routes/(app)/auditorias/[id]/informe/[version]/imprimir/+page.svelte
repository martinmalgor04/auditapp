<script lang="ts">
  import type { PageData } from './$types';
  import ReportRender from '$lib/components/informe/report-render.svelte';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>Informe — impresión</title>
</svelte:head>

<!-- Vista de impresión (R26): render limpio; el chrome de la app se oculta al imprimir. -->
<div class="informe-print-wrap" data-testid="informe-imprimir">
  <div class="mb-4 flex items-center justify-between gap-3 print:hidden">
    <p class="text-sm text-sys-medio">
      Imprimí desde el navegador (activá fondos e imágenes) para obtener el PDF A4.
    </p>
    <button type="button" class="sys-btn-primary" onclick={() => window.print()}>
      Imprimir / PDF
    </button>
  </div>
  <ReportRender model={data.model} />
</div>

<style>
  @media print {
    :global(header),
    :global(nav),
    :global(footer.app-footer) {
      display: none !important;
    }
    :global(body) {
      background: #fff !important;
    }
    .informe-print-wrap {
      margin: 0;
    }
  }
</style>
