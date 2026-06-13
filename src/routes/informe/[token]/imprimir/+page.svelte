<script lang="ts">
  import type { PageData } from './$types';
  import ReportRender from '$lib/components/informe/report-render.svelte';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>Informe de auditoría — {data.model.cliente.razonSocial} · Servicios y Sistemas</title>
</svelte:head>

<!-- Vista PDF print branded (R13): render A4 de #14 sin chrome de app. -->
<div class="informe-print-public" data-testid="informe-imprimir-publico">
  <div class="print-actions">
    <a href="/informe/{data.token}">← Volver al informe</a>
    <button
      type="button"
      data-testid="informe-boton-pdf"
      onclick={() => window.print()}
    >
      Descargar PDF
    </button>
  </div>
  <ReportRender model={data.model} />
</div>

<style>
  .informe-print-public {
    padding: 16px 0 40px;
  }
  .print-actions {
    max-width: 210mm;
    margin: 0 auto 16px;
    padding: 0 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    font-family: var(--sys-font, 'Montserrat', Arial, sans-serif);
  }
  .print-actions a {
    color: var(--sys-celeste);
    font-size: 13px;
    text-decoration: none;
  }
  .print-actions button {
    background: var(--sys-azul-electrico);
    color: #fff;
    border: 0;
    font-family: inherit;
    font-size: 13px;
    font-weight: 700;
    padding: 12px 22px;
    border-radius: 3px;
    cursor: pointer;
    box-shadow: 0 8px 28px rgba(33, 150, 243, 0.35);
  }
  @media print {
    .print-actions {
      display: none;
    }
    .informe-print-public {
      padding: 0;
    }
    :global(.informe-public-shell) {
      background: #fff !important;
    }
    :global(body) {
      background: #fff !important;
    }
  }
</style>
