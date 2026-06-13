<script lang="ts">
  import type { InformeRenderModel } from '$lib/informe/render';
  import { renderInformeWebHtml } from '$lib/informe/web-render';

  let { model }: { model: InformeRenderModel } = $props();

  const html = $derived(renderInformeWebHtml(model));
</script>

<!-- Render del template web v2 oficial (R10). Única fuente del HTML público. -->
<!-- eslint-disable-next-line svelte/no-at-html-tags -->
{@html html}
