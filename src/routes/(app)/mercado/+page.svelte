<script lang="ts">
  import { goto } from '$app/navigation';
  import BarChart from '$lib/components/mercado/bar-chart.svelte';
  import StatCard from '$lib/components/mercado/StatCard.svelte';
  import ErpDistribution from '$lib/components/mercado/ErpDistribution.svelte';
  import SectionScoreBar from '$lib/components/mercado/SectionScoreBar.svelte';
  import ChipFilters from '$lib/components/ui/ChipFilters.svelte';
  import TrendChart from '$lib/components/mercado/trend-chart.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const currentYear = new Date().getFullYear();
  const ERP_COLORS = ['#2196F3', '#10B981', '#F59E0B', '#EF4444', '#6366F1', '#EC4899'];

  const chipOptions = [
    { label: 'Todos', value: 'all' },
    { label: 'Seg. A', value: 'A' },
    { label: 'Seg. B', value: 'B' },
    { label: String(currentYear), value: `year-${currentYear}` }
  ];

  const activeChip = $derived.by(() => {
    const fromYear = data.filters.from?.getUTCFullYear();
    const toYear = data.filters.to?.getUTCFullYear();
    if (fromYear === currentYear && toYear === currentYear) return `year-${currentYear}`;
    if (data.filters.segment === 'A') return 'A';
    if (data.filters.segment === 'B') return 'B';
    return 'all';
  });

  const empty = $derived(data.dashboard.universe.n === 0);

  const erpBars = $derived(
    data.dashboard.erp_distribution.map((row, index) => ({
      erp: row.key,
      pct: row.pct,
      color: ERP_COLORS[index % ERP_COLORS.length]
    }))
  );

  function applyChip(value: string) {
    const params = new URLSearchParams();
    if (value === 'A' || value === 'B') {
      params.set('segment', value);
    } else if (value === `year-${currentYear}`) {
      params.set('from', `${currentYear}-01-01`);
      params.set('to', `${currentYear}-12-31`);
    }
    const qs = params.toString();
    void goto(qs ? `/mercado?${qs}` : '/mercado');
  }

  function semaphoreClass(kind: 'verde' | 'amarillo' | 'rojo') {
    if (kind === 'verde') return 'bg-[var(--sys-verde)]';
    if (kind === 'amarillo') return 'bg-[var(--sys-naranja)]';
    return 'bg-[var(--sys-rojo)]';
  }
</script>

<svelte:head>
  <title>Mercado NEA — SyS</title>
</svelte:head>

<div class="mx-auto max-w-6xl space-y-6">
  <div>
    <h1 class="text-2xl font-semibold text-[--sys-text-primary]">Estudio de mercado NEA</h1>
    <p class="mt-1 text-sm text-[--sys-text-muted]">
      Métricas agregadas sobre auditorías cerradas ({data.dashboard.universe.n} en el universo actual)
    </p>
  </div>

  <div class="rounded-xl border border-[--sys-border] bg-white p-4" data-testid="mercado-filters">
    <ChipFilters options={chipOptions} value={activeChip} onChange={applyChip} />
  </div>

  {#if empty}
    <div
      class="rounded-xl border border-[--sys-border] bg-white p-8 text-center shadow-sm"
      data-testid="mercado-empty-state"
    >
      <p class="text-lg font-medium text-[--sys-text-primary]">
        No hay auditorías cerradas para estos filtros
      </p>
      <p class="mt-2 text-sm text-[--sys-text-muted]">
        Probá ampliar el rango de fechas o quitar filtros de segmento.
      </p>
    </div>
  {:else}
    <div class="grid grid-cols-2 gap-4">
      <StatCard
        category="IT"
        label="Índice IT promedio"
        value={data.dashboard.indices_global.avg_it ?? 0}
        n={data.dashboard.indices_global.n_it}
        testId="mercado-stat-it"
      />
      <StatCard
        category="ERP"
        label="Índice ERP promedio"
        value={data.dashboard.indices_global.avg_erp ?? 0}
        n={data.dashboard.indices_global.n_erp}
        testId="mercado-stat-erp"
      />
      <StatCard
        category="Cerradas"
        label="Auditorías cerradas"
        value={data.dashboard.universe.n}
        n={data.dashboard.universe.n}
        testId="mercado-stat-universe"
      />
      <StatCard
        category="Upsell"
        label="Con hallazgos upsell"
        value={data.dashboard.upsell_internal.audits_with_findings}
        n={data.dashboard.universe.n}
        testId="mercado-stat-upsell-audits"
      />
    </div>

    <section data-testid="mercado-section-erp">
      <ErpDistribution data={erpBars} />
    </section>

    <section class="rounded-xl border border-[--sys-border] bg-white p-4 shadow-sm">
      <h2 class="mb-4 text-lg font-semibold text-[--sys-text-primary]">Score por sección</h2>
      <div class="space-y-3">
        {#each data.dashboard.indices_by_segment as group (group.key)}
          {#if !group.suppressed && group.avg_it != null}
            <SectionScoreBar label="Seg. {group.key}" score={Math.round(group.avg_it)} />
          {/if}
        {/each}
      </div>
    </section>

    <section class="rounded-xl border border-[--sys-border] bg-white p-4 shadow-sm" data-testid="mercado-section-modulos">
      <h2 class="mb-4 text-lg font-semibold text-[--sys-text-primary]">Módulos Tango más usados</h2>
      <BarChart items={data.dashboard.modulos_tango} testId="mercado-modulos-chart" />
    </section>

    <div class="grid gap-4 lg:grid-cols-2">
      <section class="rounded-xl border border-[--sys-border] bg-white p-4 shadow-sm" data-testid="mercado-section-segment">
        <h2 class="mb-4 text-lg font-semibold text-[--sys-text-primary]">Índices por segmento</h2>
        <div class="space-y-3">
          {#each data.dashboard.indices_by_segment as group (group.key)}
            <div class="rounded-lg border border-[--sys-border] px-3 py-2 text-sm">
              <div class="font-medium text-[--sys-text-primary]">Segmento {group.key} (n={group.n})</div>
              {#if group.suppressed}
                <p class="mt-1 text-[--sys-text-muted]" data-testid="mercado-suppressed">
                  Muestra insuficiente (n &lt; 3)
                </p>
              {:else}
                <p class="mt-1 text-[--sys-text-muted]">
                  IT: {group.avg_it ?? '—'} · ERP: {group.avg_erp ?? '—'}
                </p>
              {/if}
            </div>
          {/each}
        </div>
      </section>

      <section class="rounded-xl border border-[--sys-border] bg-white p-4 shadow-sm" data-testid="mercado-section-rubro">
        <h2 class="mb-4 text-lg font-semibold text-[--sys-text-primary]">Índices por rubro</h2>
        <div class="space-y-3">
          {#each data.dashboard.indices_by_rubro as group (group.key)}
            <div class="rounded-lg border border-[--sys-border] px-3 py-2 text-sm">
              <div class="font-medium text-[--sys-text-primary]">{group.key} (n={group.n})</div>
              {#if group.suppressed}
                <p class="mt-1 text-[--sys-text-muted]">Muestra insuficiente (n &lt; 3)</p>
              {:else}
                <p class="mt-1 text-[--sys-text-muted]">
                  IT: {group.avg_it ?? '—'} · ERP: {group.avg_erp ?? '—'}
                </p>
              {/if}
            </div>
          {/each}
        </div>
      </section>
    </div>

    <section class="rounded-xl border border-[--sys-border] bg-white p-4 shadow-sm" data-testid="mercado-section-semaforos">
      <h2 class="mb-4 text-lg font-semibold text-[--sys-text-primary]">Semáforos IT / ERP</h2>
      <div class="grid gap-4 sm:grid-cols-2">
        {#each [{ label: 'IT', data: data.dashboard.semaforos.it }, { label: 'ERP', data: data.dashboard.semaforos.erp }] as block (block.label)}
          <div>
            <h3 class="mb-2 text-sm font-medium text-[--sys-text-muted]">{block.label}</h3>
            <div class="flex flex-wrap gap-2">
              {#each [
                { key: 'verde', label: 'Verde', n: block.data.verde },
                { key: 'amarillo', label: 'Amarillo', n: block.data.amarillo },
                { key: 'rojo', label: 'Rojo', n: block.data.rojo },
                { key: 'sin_dato', label: 'Sin dato', n: block.data.sin_dato }
              ] as chip (chip.key)}
                <span class="inline-flex items-center gap-2 rounded-lg border border-[--sys-border] px-3 py-1 text-sm">
                  <span
                    class={`h-3 w-3 rounded-full ${chip.key === 'sin_dato' ? 'bg-[--sys-border]' : semaphoreClass(chip.key as 'verde' | 'amarillo' | 'rojo')}`}
                  ></span>
                  {chip.label}: {chip.n}
                </span>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </section>

    <section class="rounded-xl border border-[--sys-border] bg-white p-4 shadow-sm" data-testid="mercado-section-trend">
      <h2 class="mb-4 text-lg font-semibold text-[--sys-text-primary]">Evolución mensual</h2>
      <TrendChart points={data.dashboard.monthly} />
    </section>

    <section
      class="rounded-xl border border-dashed border-[--sys-border] bg-[--sys-bg-app] p-4 shadow-sm"
      data-testid="mercado-section-upsell"
    >
      <h2 class="text-lg font-semibold text-[--sys-text-primary]">Upsell agregado — solo SyS</h2>
      <p class="mt-1 text-sm text-[--sys-text-muted]">Uso interno; no incluye textos individuales.</p>
      <div class="mt-4 grid gap-4 sm:grid-cols-3">
        <StatCard category="Upsell" label="Total hallazgos" value={data.dashboard.upsell_internal.total} n={data.dashboard.universe.n} />
        <StatCard
          category="Upsell"
          label="Promedio por auditoría"
          value={data.dashboard.upsell_internal.avg_per_audit ?? 0}
          n={data.dashboard.universe.n}
        />
        <StatCard
          category="Upsell"
          label="Auditorías con hallazgos"
          value={data.dashboard.upsell_internal.audits_with_findings}
          n={data.dashboard.universe.n}
        />
      </div>
    </section>
  {/if}
</div>
