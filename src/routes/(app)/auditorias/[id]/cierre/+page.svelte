<script lang="ts">
  import type { PageData } from './$types';

  let { data, form }: { data: PageData; form?: { error?: string; warnings?: string[] } } = $props();

  let topRisks = $state(
    data.topRisks.length > 0
      ? data.topRisks
      : [{ text: '', severity: 'media' as const }]
  );
  let quickWins = $state(data.quickWins.length > 0 ? data.quickWins : ['']);
  let upsellFindings = $state(data.upsellFindings.length > 0 ? data.upsellFindings : ['']);
  let nextStep = $state(data.nextStep ?? '');

  const semaphoreClass = (band: string | null) => {
    if (band === 'green') return 'bg-emerald-100 text-emerald-800';
    if (band === 'amber') return 'bg-amber-100 text-amber-800';
    if (band === 'red') return 'bg-red-100 text-red-800';
    return 'bg-slate-100 text-slate-600';
  };

  const semaphoreLabel = (band: string | null) => {
    if (band === 'green') return '🟢';
    if (band === 'amber') return '🟠';
    if (band === 'red') return '🔴';
    return '—';
  };

  const WARNING_LABELS: Record<string, string> = {
    top_risks: 'Top riesgos',
    quick_wins: 'Quick wins',
    next_step: 'Próximo paso acordado'
  };
</script>

<svelte:head>
  <title>Cierre — {data.audit.razonSocial}</title>
</svelte:head>

<div class="mx-auto max-w-3xl space-y-6 p-4">
  <div class="flex items-start justify-between gap-4">
    <div>
      <h1 class="text-2xl font-bold text-slate-900">Cierre de auditoría</h1>
      <p class="text-sm text-slate-600">{data.audit.razonSocial}</p>
    </div>
    <a href="/auditorias/{data.audit.id}" class="text-sm text-blue-700 underline">Volver</a>
  </div>

  {#if data.readonly}
    <p class="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
      Auditoría cerrada. Solo lectura.
      {#if data.isAdmin}
        <form method="POST" action="?/reopenAudit" class="mt-2">
          <button type="submit" class="text-sm font-medium text-amber-900 underline">
            Reabrir (admin)
          </button>
        </form>
      {/if}
    </p>
  {/if}

  {#if form?.error}
    <p class="text-sm text-red-600" role="alert">{form.error}</p>
  {/if}

  <section class="grid gap-4 sm:grid-cols-2">
    {#if data.indices.it !== null}
      <div class="rounded-lg border border-slate-200 bg-white p-4">
        <p class="text-sm text-slate-600">Índice IT</p>
        <p class="text-3xl font-bold">{data.indices.it}</p>
        <span class={`inline-block rounded px-2 py-0.5 text-sm ${semaphoreClass(data.indices.itSemaphore)}`}>
          {semaphoreLabel(data.indices.itSemaphore)}
        </span>
      </div>
    {/if}
    {#if data.indices.erp !== null}
      <div class="rounded-lg border border-slate-200 bg-white p-4">
        <p class="text-sm text-slate-600">Índice ERP</p>
        <p class="text-3xl font-bold">{data.indices.erp}</p>
        <span class={`inline-block rounded px-2 py-0.5 text-sm ${semaphoreClass(data.indices.erpSemaphore)}`}>
          {semaphoreLabel(data.indices.erpSemaphore)}
        </span>
      </div>
    {/if}
  </section>

  <section class="rounded-lg border border-slate-200 bg-white p-4">
    <h2 class="mb-3 font-semibold text-slate-800">Scores por sección</h2>
    <ul class="space-y-2">
      {#each data.sections as section}
        <li class="flex items-center justify-between gap-2 text-sm">
          <span>{section.code} — {section.title}</span>
          <span class={`rounded px-2 py-0.5 ${semaphoreClass(section.semaphore)}`}>
            {section.score ?? '—'} {semaphoreLabel(section.semaphore)}
          </span>
        </li>
      {/each}
    </ul>
  </section>

  <a
    href="/auditorias/{data.audit.id}/cierre/preview"
    class="inline-block text-sm text-blue-700 underline"
  >
    Preview del informe
  </a>

  {#if !data.readonly}
    <form method="POST" action="?/saveClosure" class="space-y-6">
      <input type="hidden" name="topRisks" value={JSON.stringify(topRisks.filter((r) => r.text.trim()))} />
      <input type="hidden" name="quickWins" value={JSON.stringify(quickWins.filter((w) => w.trim()))} />
      <input
        type="hidden"
        name="upsellFindings"
        value={JSON.stringify(upsellFindings.filter((u) => u.trim()))}
      />
      <input
        type="hidden"
        name="sectionObservations"
        value={JSON.stringify(
          Object.fromEntries(data.sections.map((s) => [s.id, s.observations ?? '']))
        )}
      />

      <section class="space-y-3">
        <h2 class="font-semibold text-slate-800">Top 5 riesgos</h2>
        {#each topRisks as risk, i}
          <div class="flex gap-2">
            <input
              class="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
              bind:value={risk.text}
              placeholder="Riesgo {i + 1}"
            />
            <select class="rounded border border-slate-300 px-2 text-sm" bind:value={risk.severity}>
              <option value="baja">Baja</option>
              <option value="media">Media</option>
              <option value="alta">Alta</option>
              <option value="critica">Crítica</option>
            </select>
          </div>
        {/each}
        {#if topRisks.length < 5}
          <button
            type="button"
            class="text-sm text-blue-700 underline"
            onclick={() => topRisks.push({ text: '', severity: 'media' })}
          >
            + Agregar riesgo
          </button>
        {/if}
      </section>

      <section class="space-y-2">
        <h2 class="font-semibold text-slate-800">Quick wins</h2>
        {#each quickWins as win, i}
          <input
            class="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            bind:value={quickWins[i]}
            placeholder="Quick win"
          />
        {/each}
        {#if quickWins.length < 10}
          <button
            type="button"
            class="text-sm text-blue-700 underline"
            onclick={() => quickWins.push('')}
          >
            + Agregar quick win
          </button>
        {/if}
      </section>

      <section class="space-y-2">
        <h2 class="font-semibold text-slate-800">Hallazgos upsell (interno)</h2>
        {#each upsellFindings as finding, i}
          <input
            class="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            bind:value={upsellFindings[i]}
            placeholder="Oportunidad comercial"
          />
        {/each}
        {#if upsellFindings.length < 20}
          <button
            type="button"
            class="text-sm text-blue-700 underline"
            onclick={() => upsellFindings.push('')}
          >
            + Agregar hallazgo
          </button>
        {/if}
      </section>

      <label class="block space-y-1">
        <span class="text-sm font-medium text-slate-700">Próximo paso acordado</span>
        <textarea
          name="nextStep"
          class="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          rows="3"
          bind:value={nextStep}
        ></textarea>
      </label>

      {#if form?.warnings?.length}
        <div class="space-y-2 rounded border border-amber-300 bg-amber-50 p-3" role="alert">
          <p class="text-sm font-medium text-amber-900">
            No se cerró la auditoría: faltan campos clave del informe.
          </p>
          <ul class="list-disc pl-5 text-sm text-amber-800">
            {#each form.warnings as warning}
              <li>{WARNING_LABELS[warning] ?? warning}</li>
            {/each}
          </ul>
          <p class="text-sm text-amber-800">
            Estos campos alimentan el informe del cliente (top riesgos y quick wins). Completalos
            y volvé a confirmar, o cerrá igual si de verdad no aplican.
          </p>
          <button
            type="submit"
            formaction="?/confirmClosure"
            name="forceClose"
            value="1"
            class="rounded border border-amber-400 px-3 py-1.5 text-sm font-medium text-amber-900"
          >
            Cerrar igual sin estos campos
          </button>
        </div>
      {/if}

      <div class="flex flex-wrap gap-3">
        <button
          type="submit"
          class="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white"
        >
          Guardar borrador
        </button>
        <button
          type="submit"
          formaction="?/confirmClosure"
          class="rounded-sys bg-sys-electrico px-4 py-2 text-sm font-medium text-white hover:bg-[#1976D2]"
        >
          Confirmar cierre
        </button>
      </div>
    </form>
  {:else}
    <section class="space-y-4 rounded-lg border border-slate-200 bg-white p-4 text-sm">
      <div>
        <h2 class="font-semibold">Top riesgos</h2>
        <ul class="list-disc pl-5">
          {#each data.topRisks as risk}
            <li>{risk.text} ({risk.severity})</li>
          {/each}
        </ul>
      </div>
      <div>
        <h2 class="font-semibold">Quick wins</h2>
        <ul class="list-disc pl-5">
          {#each data.quickWins as win}
            <li>{win}</li>
          {/each}
        </ul>
      </div>
      {#if data.nextStep}
        <p><strong>Próximo paso:</strong> {data.nextStep}</p>
      {/if}
    </section>
  {/if}
</div>
