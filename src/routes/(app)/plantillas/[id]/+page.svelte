<script lang="ts">
  import type { PageData } from './$types';
  import TemplateItemEditor from '$lib/components/backoffice/template-item-editor.svelte';

  let { data, form }: { data: PageData; form?: { error?: string } } = $props();
</script>

<svelte:head>
  <title>{data.template.name} — Plantillas</title>
</svelte:head>

<div class="space-y-6">
  <div>
    <a href="/plantillas" class="text-sm text-slate-500 hover:underline">← Plantillas</a>
    <h1 class="text-2xl font-bold text-slate-900 mt-2">{data.template.name}</h1>
    <p class="text-sm text-slate-600">{data.template.code} · {data.template.version}</p>
  </div>

  {#if form?.error}
    <p class="text-sm text-red-600">{form.error}</p>
  {/if}

  {#each data.template.sections as section}
    <section class="space-y-3">
      <h2 class="text-lg font-semibold text-slate-800">
        {section.title}
        <span class="text-xs text-slate-400 font-normal">({section.code})</span>
      </h2>
      <div class="space-y-4">
        {#each section.items as item}
          <TemplateItemEditor {item} />
        {/each}
      </div>
    </section>
  {/each}
</div>
