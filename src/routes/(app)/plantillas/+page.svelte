<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>Plantillas — auditapp</title>
</svelte:head>

<h1 class="text-2xl font-bold text-slate-900 mb-6">Plantillas</h1>

<ul class="space-y-2">
  {#each data.templates as t}
    <li>
      <a href="/plantillas/{t.id}" class="text-blue-700 hover:underline">{t.name} ({t.code})</a>
    </li>
  {/each}
</ul>
