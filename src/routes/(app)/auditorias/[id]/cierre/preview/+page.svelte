<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const p = $derived(data.preview);
  const sem = (band: string | null | undefined) =>
    band === 'green' ? '🟢' : band === 'amber' ? '🟠' : band === 'red' ? '🔴' : '—';
</script>

<svelte:head>
  <title>Preview informe — {p.client.razonSocial}</title>
</svelte:head>

<article class="mx-auto max-w-3xl space-y-6 p-6 text-slate-800">
  <header class="border-b border-slate-200 pb-4">
    <h1 class="text-2xl font-bold">Informe de auditoría</h1>
    <p class="text-lg">{p.client.razonSocial}</p>
    {#if p.client.cuit}
      <p class="text-sm text-slate-600">CUIT {p.client.cuit}</p>
    {/if}
  </header>

  <section class="grid gap-4 sm:grid-cols-2">
    {#if p.indices.it !== null}
      <div>
        <p class="text-sm text-slate-600">Índice IT</p>
        <p class="text-2xl font-bold">{p.indices.it} {sem(p.semaphore.it)}</p>
      </div>
    {/if}
    {#if p.indices.erp !== null}
      <div>
        <p class="text-sm text-slate-600">Índice ERP</p>
        <p class="text-2xl font-bold">{p.indices.erp} {sem(p.semaphore.erp)}</p>
      </div>
    {/if}
  </section>

  <section>
    <h2 class="mb-2 font-semibold">Scores por sección</h2>
    <ul class="space-y-1 text-sm">
      {#each p.sections as s}
        <li>{s.code} — {s.title}: {s.score} {sem(s.semaphore)}</li>
      {/each}
    </ul>
  </section>

  {#if p.topRisks.length > 0}
    <section>
      <h2 class="mb-2 font-semibold">Top riesgos</h2>
      <ul class="list-disc pl-5 text-sm">
        {#each p.topRisks as r}
          <li>{r.text} ({r.severity})</li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if p.quickWins.length > 0}
    <section>
      <h2 class="mb-2 font-semibold">Quick wins</h2>
      <ul class="list-disc pl-5 text-sm">
        {#each p.quickWins as w}
          <li>{w}</li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if p.nextStep}
    <section>
      <h2 class="mb-2 font-semibold">Próximo paso</h2>
      <p class="text-sm">{p.nextStep}</p>
    </section>
  {/if}

  <a href="/auditorias/{data.auditId}/cierre" class="text-sm text-blue-700 underline">
    Volver al cierre
  </a>
</article>
