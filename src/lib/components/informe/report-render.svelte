<script lang="ts">
  import { renderInformeHtml, type InformeRenderModel } from '$lib/informe/render';

  let { model, editMode = false }: { model: InformeRenderModel; editMode?: boolean } = $props();

  const html = $derived(renderInformeHtml(model, { editMode }));
</script>

<!-- Render del template A4 oficial (R26). Única fuente del HTML branded. -->
<!-- eslint-disable-next-line svelte/no-at-html-tags -->
{@html html}
