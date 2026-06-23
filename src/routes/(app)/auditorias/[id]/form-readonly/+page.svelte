<script lang="ts">
  import type { PageData } from './$types';
  import SectionNav from '$lib/components/form/section-nav.svelte';

  let { data }: { data: PageData } = $props();

  let activeSectionId = $state(data.sections[0]?.id ?? '');

  const activeSection = $derived(data.sections.find((s) => s.id === activeSectionId) ?? data.sections[0]);
  const activeSectionIndex = $derived(data.sections.findIndex((s) => s.id === activeSectionId));
  const isFirstSection = $derived(activeSectionIndex <= 0);
  const isLastSection = $derived(activeSectionIndex >= data.sections.length - 1);

  // Mapa de progreso falso (sin edición, solo para la nav)
  const progressBySec = $derived(
    new Map(
      data.sections.map((sec) => [
        sec.id,
        {
          total: sec.items.length,
          answered: sec.items.filter((it) => it.na || (it.value !== null && it.value !== undefined && it.value !== '')).length
        }
      ])
    )
  );

  function goToSection(index: number) {
    const section = data.sections[index];
    if (!section) return;
    activeSectionId = section.id;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function displayValue(value: unknown): string {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'boolean') return value ? 'Sí' : 'No';
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  }
</script>

<svelte:head>
  <title>Relevamiento (solo lectura) — {data.audit.razonSocial}</title>
</svelte:head>

<div class="rounded-sys-app mb-4 border border-sys-naranja/20 bg-sys-naranja/10 p-3 text-sm text-sys-medio">
  Vista de solo lectura — auditoría cerrada. No se pueden editar respuestas.
</div>

<div class="lg:grid lg:grid-cols-[280px_1fr] lg:gap-6">
  <aside class="sticky top-12 z-20 -mx-4 mb-4 border-b border-sys-medio/10 bg-sys-offwhite px-4 pb-3 lg:top-16 lg:z-auto lg:mx-0 lg:mb-0 lg:border-0 lg:px-0 lg:pb-0 lg:self-start">
    <SectionNav
      sections={data.sections}
      {activeSectionId}
      progressPct={data.progressPct}
      sectionProgress={progressBySec}
      onselect={(id) => (activeSectionId = id)}
    />
  </aside>

  <div class="space-y-4">
    <div>
      <h1 class="text-xl font-bold">{activeSection?.code} — {activeSection?.title}</h1>
      <p class="text-sm text-slate-600">{data.audit.razonSocial}</p>
    </div>

    <div class="space-y-4">
      {#each activeSection?.items ?? [] as item (item.id)}
        <div
          id="item-{item.id}"
          class="rounded-sys-app border border-sys-borde bg-white p-4 space-y-2"
          data-testid="readonly-item"
        >
          <div class="flex items-start justify-between gap-2">
            <p class="text-sm font-medium text-sys-oscuro">{item.label}</p>
            {#if item.required}
              <span class="shrink-0 text-xs text-sys-rojo">*</span>
            {/if}
          </div>
          {#if item.helpText}
            <p class="text-xs text-sys-medio">{item.helpText}</p>
          {/if}

          {#if item.na}
            <p class="text-sm italic text-sys-medio">N/A</p>
          {:else}
            <p class="text-sm text-sys-oscuro whitespace-pre-wrap">{displayValue(item.value)}</p>
          {/if}

          {#if item.notes}
            <p class="text-xs text-sys-medio border-t border-sys-borde pt-2">
              <span class="font-medium">Observaciones:</span> {item.notes}
            </p>
          {/if}
        </div>
      {/each}
    </div>

    {#if data.sections.length > 1}
      <div class="flex gap-3 pt-2">
        {#if !isFirstSection}
          <button
            type="button"
            class="sys-btn-secondary flex-1"
            onclick={() => goToSection(activeSectionIndex - 1)}
          >
            Anterior
          </button>
        {/if}
        {#if !isLastSection}
          <button
            type="button"
            class="sys-btn-primary flex-1"
            onclick={() => goToSection(activeSectionIndex + 1)}
          >
            Siguiente
          </button>
        {/if}
      </div>
    {/if}

    <div class="pt-2">
      <a href="/auditorias/{data.auditId}" class="text-sm text-sys-electrico hover:underline">
        ← Volver al detalle
      </a>
    </div>
  </div>
</div>
