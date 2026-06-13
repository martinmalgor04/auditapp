<script lang="ts">
  import { onMount } from 'svelte';
  import type { PageData } from './$types';
  import ReportWebRender from '$lib/components/informe/report-web-render.svelte';
  import { initInformeWebEffects } from '$lib/client/informe/web-effects';

  let { data }: { data: PageData } = $props();

  onMount(() => initInformeWebEffects());
</script>

<svelte:head>
  <title>Informe de auditoría — {data.model.cliente.razonSocial} · Servicios y Sistemas</title>
</svelte:head>

<ReportWebRender model={data.model} />

<!-- Acción de descarga (R13): vista print A4 con window.print(). -->
<a
  class="informe-pdf-btn"
  href="/informe/{data.token}/imprimir"
  data-testid="informe-descargar-pdf"
>
  Descargar PDF
</a>

<style>
  .informe-pdf-btn {
    position: fixed;
    right: 20px;
    bottom: 20px;
    z-index: 50;
    background: var(--sys-azul-electrico);
    color: #fff;
    font-family: var(--sys-font, 'Montserrat', Arial, sans-serif);
    font-size: 13px;
    font-weight: 700;
    padding: 12px 22px;
    border-radius: 3px;
    text-decoration: none;
    box-shadow: 0 8px 28px rgba(33, 150, 243, 0.35);
  }
  .informe-pdf-btn:hover {
    box-shadow: 0 16px 44px rgba(33, 150, 243, 0.45);
  }
  @media print {
    .informe-pdf-btn {
      display: none;
    }
  }
</style>
