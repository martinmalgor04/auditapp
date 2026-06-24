<script lang="ts">
  import BarChart from '$lib/components/mercado/bar-chart.svelte';
  import StatCard from '$lib/components/mercado/StatCard.svelte';
  import TrendChart from '$lib/components/mercado/trend-chart.svelte';
  import ErpDistribution from '$lib/components/mercado/ErpDistribution.svelte';
  import SectionScoreBar from '$lib/components/mercado/SectionScoreBar.svelte';
  import GroupedBar from '$lib/components/mercado/grouped-bar.svelte';
  import ChipFilters from '$lib/components/ui/ChipFilters.svelte';
  import SysButton from '$lib/components/brand/SysButton.svelte';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();

  const FINDING_LABELS: Record<string, string> = {
    backups: 'Backups',
    seguridad: 'Seguridad',
    licencias: 'Licencias',
    hardware_eol: 'Hardware / EOL',
    redes: 'Redes',
    otros: 'Otros'
  };

  const currentYear = new Date().getFullYear().toString();

  // ChipFilters state (client-side filtering)
  const chipOptions = [
    { label: 'Todos', value: '' },
    { label: 'Seg. A', value: 'A' },
    { label: 'Seg. B', value: 'B' },
    { label: currentYear, value: currentYear }
  ];
  // Initialize chip from URL param so it renders active after navigation
  let chipValue = $state(data.filters.segment ?? '');

  // Server-driven filter form state
  let segmentFilter = $state('');
  let rubroFilter = $state('');
  let provinciaFilter = $state('');
  let fromFilter = $state('');
  let toFilter = $state('');

  $effect(() => {
    segmentFilter = data.filters.segment ?? '';
    rubroFilter = data.filters.rubro ?? '';
    provinciaFilter = data.filters.provincia ?? '';
    fromFilter = data.filters.from ? data.filters.from.toISOString().slice(0, 10) : '';
    toFilter = data.filters.to ? data.filters.to.toISOString().slice(0, 10) : '';
  });

  const empty = $derived(data.dashboard.universe.n === 0);

  function applyFilters() {
    const params = new URLSearchParams();
    if (segmentFilter) params.set('segment', segmentFilter);
    if (rubroFilter) params.set('rubro', rubroFilter);
    if (provinciaFilter) params.set('provincia', provinciaFilter);
    if (fromFilter) params.set('from', fromFilter);
    if (toFilter) params.set('to', toFilter);
    const qs = params.toString();
    window.location.href = qs ? `/mercado?${qs}` : '/mercado';
  }

  function handleChipChange(v: string) {
    chipValue = v;
    // Map chip to server filter and navigate
    const params = new URLSearchParams();
    if (v === 'A' || v === 'B') {
      params.set('segment', v);
    } else if (v === currentYear) {
      params.set('from', `${currentYear}-01-01`);
      params.set('to', `${currentYear}-12-31`);
    }
    const qs = params.toString();
    window.location.href = qs ? `/mercado?${qs}` : '/mercado';
  }

  // Map erp_distribution to ErpBar[]
  const ERP_COLORS: Record<string, string> = {
    'Tango': 'var(--sys-primary)',
    'SAP': '#2563eb',
    'Bejerman': '#7c3aed',
    'Odoo': '#059669',
    'Sin ERP': 'var(--sys-border)',
  };
  const erpDistributionBars = $derived(
    data.dashboard.erp_distribution.map((item) => ({
      erp: item.key,
      pct: item.pct,
      color: ERP_COLORS[item.key] ?? 'var(--sys-primary)'
    }))
  );

  // Map indices_by_segment to SectionScoreBar items
  const segmentScoreBars = $derived(
    data.dashboard.indices_by_segment
      .filter((g) => !g.suppressed)
      .flatMap((g) => [
        { label: `Seg ${g.key} IT`, score: g.avg_it != null ? Math.round(g.avg_it) : 0 },
        { label: `Seg ${g.key} ERP`, score: g.avg_erp != null ? Math.round(g.avg_erp) : 0 }
      ])
  );

  function semaphoreClass(kind: 'verde' | 'amarillo' | 'rojo') {
    if (kind === 'verde') return 'bg-[var(--sys-verde)]';
    if (kind === 'amarillo') return 'bg-[var(--sys-naranja)]';
    return 'bg-[var(--sys-rojo)]';
  }
</script>

<svelte:head>
  <title>Mercado NEA — SyS</title>
</svelte:head>

<div class="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div>
      <h1 class="text-2xl font-semibold text-sys-profundo">Estudio de mercado NEA</h1>
      <p class="mt-1 text-sm text-sys-medio">
        Métricas agregadas sobre auditorías cerradas ({data.dashboard.universe.n} en el universo
        actual)
      </p>
    </div>
  </div>

  <!-- ChipFilters — client-side quick filter -->
  <ChipFilters options={chipOptions} value={chipValue} onChange={handleChipChange} />

  <form
    class="flex flex-wrap items-end gap-3 rounded-sys border border-sys-borde bg-white p-4 shadow-sm"
    onsubmit={(e) => {
      e.preventDefault();
      applyFilters();
    }}
    data-testid="mercado-filters"
  >
    <label class="flex flex-col gap-1 text-sm">
      <span class="text-sys-medio">Segmento</span>
      <select
        bind:value={segmentFilter}
        class="rounded-sys border border-sys-borde px-3 py-2 text-sm"
        data-testid="mercado-filter-segment"
      >
        <option value="">Todos</option>
        <option value="A">A</option>
        <option value="B">B</option>
        <option value="C">C</option>
      </select>
    </label>
    <label class="flex flex-col gap-1 text-sm">
      <span class="text-sys-medio">Rubro</span>
      <select
        bind:value={rubroFilter}
        class="rounded-sys border border-sys-borde px-3 py-2 text-sm"
        data-testid="mercado-filter-rubro"
      >
        <option value="">Todos</option>
        {#each data.rubros as rubro (rubro)}
          <option value={rubro}>{rubro}</option>
        {/each}
      </select>
    </label>
    <label class="flex flex-col gap-1 text-sm">
      <span class="text-sys-medio">Provincia</span>
      <select
        bind:value={provinciaFilter}
        class="rounded-sys border border-sys-borde px-3 py-2 text-sm"
        data-testid="mercado-filter-provincia"
      >
        <option value="">Todas</option>
        {#each data.provincias as prov (prov.key)}
          <option value={prov.key}>{prov.key}{prov.is_nea ? ' (NEA)' : ''}</option>
        {/each}
      </select>
    </label>
    <label class="flex flex-col gap-1 text-sm">
      <span class="text-sys-medio">Desde</span>
      <input
        type="date"
        bind:value={fromFilter}
        class="rounded-sys border border-sys-borde px-3 py-2 text-sm"
        data-testid="mercado-filter-from"
      />
    </label>
    <label class="flex flex-col gap-1 text-sm">
      <span class="text-sys-medio">Hasta</span>
      <input
        type="date"
        bind:value={toFilter}
        class="rounded-sys border border-sys-borde px-3 py-2 text-sm"
        data-testid="mercado-filter-to"
      />
    </label>
    <SysButton type="submit">Filtrar</SysButton>
  </form>

  {#if empty}
    <div
      class="rounded-sys border border-sys-borde bg-white p-8 text-center shadow-sm"
      data-testid="mercado-empty-state"
    >
      <p class="text-lg font-medium text-sys-profundo">
        No hay auditorías cerradas para estos filtros
      </p>
      <p class="mt-2 text-sm text-sys-medio">
        Probá ampliar el rango de fechas o quitar filtros de segmento/rubro.
      </p>
    </div>
  {:else}
    <!-- #43 Bloque 1: Oportunidad de migración a Tango -->
    <section
      class="rounded-sys border border-sys-borde bg-white p-4 shadow-sm"
      data-testid="mercado-section-tango"
    >
      <h2 class="mb-1 text-lg font-semibold text-sys-profundo">Oportunidad de migración a Tango</h2>
      <p class="mb-4 text-sm text-sys-medio">
        Distribución del ERP de las empresas auditadas y mercado direccionable por rubro y segmento.
      </p>
      <div class="grid gap-4 lg:grid-cols-3">
        {#each data.dashboard.tango_opportunity.overall as grp (grp.group)}
          <div class="rounded-sys border border-sys-borde px-3 py-2">
            <div class="text-sm font-medium capitalize text-sys-profundo">
              {grp.group === 'sin_erp' ? 'Sin ERP' : grp.group}
            </div>
            <div class="text-2xl font-semibold text-sys-profundo">{grp.n}</div>
            <div class="text-xs text-sys-medio">{grp.pct}% del universo</div>
          </div>
        {/each}
      </div>
      <div class="mt-4 grid gap-6 lg:grid-cols-2">
        <div>
          <h3 class="mb-2 text-sm font-medium text-sys-medio">Por rubro</h3>
          <GroupedBar cuts={data.dashboard.tango_opportunity.by_rubro} testId="mercado-tango-rubro" />
        </div>
        <div>
          <h3 class="mb-2 text-sm font-medium text-sys-medio">Por segmento</h3>
          <GroupedBar
            cuts={data.dashboard.tango_opportunity.by_segment}
            testId="mercado-tango-segment"
          />
        </div>
      </div>
    </section>

    <!-- #43 Bloque 2: Mapa del mercado NEA -->
    <section
      class="rounded-sys border border-sys-borde bg-white p-4 shadow-sm"
      data-testid="mercado-section-nea"
    >
      <h2 class="mb-4 text-lg font-semibold text-sys-profundo">Mapa del mercado NEA</h2>
      <div class="grid gap-6 lg:grid-cols-3">
        <div>
          <h3 class="mb-2 text-sm font-medium text-sys-medio">Por provincia</h3>
          <BarChart
            items={data.dashboard.nea_map.by_provincia.map((p) => ({
              key: p.is_nea ? `${p.key} (NEA)` : p.key,
              n: p.n
            }))}
            testId="mercado-nea-provincia"
          />
        </div>
        <div>
          <h3 class="mb-2 text-sm font-medium text-sys-medio">Por rubro</h3>
          <BarChart items={data.dashboard.nea_map.by_rubro} testId="mercado-nea-rubro" />
        </div>
        <div>
          <h3 class="mb-2 text-sm font-medium text-sys-medio">Por segmento</h3>
          <BarChart items={data.dashboard.nea_map.by_segment} testId="mercado-nea-segment" />
        </div>
      </div>
    </section>

    <!-- #43 Bloque 3: Salud de la base instalada Tango + cross-sell -->
    <section
      class="rounded-sys border border-sys-borde bg-white p-4 shadow-sm"
      data-testid="mercado-section-base"
    >
      <h2 class="mb-4 text-lg font-semibold text-sys-profundo">
        Salud de la base instalada Tango
      </h2>
      {#if data.dashboard.installed_base.suppressed}
        <p class="text-sm text-sys-medio" data-testid="mercado-base-suppressed">
          Muestra insuficiente de usuarios Tango (n &lt; 3).
        </p>
      {:else}
        <div class="grid gap-4 sm:grid-cols-2">
          <StatCard
            category="ERP"
            label="Índice ERP promedio (usuarios Tango)"
            value={data.dashboard.installed_base.avg_erp ?? 0}
            n={data.dashboard.installed_base.tango_users_n}
          />
          <StatCard
            category="Cerradas"
            label="Empresas con Tango"
            value={data.dashboard.installed_base.tango_users_n}
            n={data.dashboard.installed_base.tango_users_n}
          />
        </div>
        <h3 class="mb-2 mt-4 text-sm font-medium text-sys-medio">
          Módulos menos adoptados (oportunidad de cross-sell)
        </h3>
        <div class="space-y-1">
          {#each data.dashboard.installed_base.modules as mod (mod.key)}
            <div class="flex items-center justify-between rounded-sys border border-sys-borde px-3 py-1 text-sm">
              <span class="capitalize text-sys-profundo">{mod.key}</span>
              <span class="text-sys-medio">
                {mod.adopted} adoptan · {mod.missing} faltan · {mod.adoption_pct}%
              </span>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <!-- #43 Bloque 4: Hallazgos recurrentes (interno) -->
    <section
      class="rounded-sys border border-dashed border-sys-borde bg-sys-offwhite p-4 shadow-sm"
      data-testid="mercado-section-hallazgos"
    >
      <h2 class="text-lg font-semibold text-sys-profundo">Hallazgos recurrentes — solo SyS</h2>
      <p class="mt-1 text-sm text-sys-medio">
        Uso interno; categorías por palabras clave, sin textos individuales.
      </p>
      <div class="mt-4 grid gap-6 lg:grid-cols-2">
        <div>
          <h3 class="mb-2 text-sm font-medium text-sys-medio">
            Riesgos (top_risks) — {data.dashboard.recurring_findings.total_risks}
          </h3>
          <BarChart
            items={data.dashboard.recurring_findings.top_risks.map((c) => ({
              key: FINDING_LABELS[c.category] ?? c.category,
              n: c.n
            }))}
            testId="mercado-hallazgos-risks"
          />
        </div>
        <div>
          <h3 class="mb-2 text-sm font-medium text-sys-medio">
            Quick wins — {data.dashboard.recurring_findings.total_quick_wins}
          </h3>
          <BarChart
            items={data.dashboard.recurring_findings.quick_wins.map((c) => ({
              key: FINDING_LABELS[c.category] ?? c.category,
              n: c.n
            }))}
            testId="mercado-hallazgos-wins"
          />
        </div>
      </div>
    </section>

    <!-- #43 Bloque 5: Riesgo / retención (interno) -->
    <section
      class="rounded-sys border border-dashed border-sys-borde bg-sys-offwhite p-4 shadow-sm"
      data-testid="mercado-section-riesgo"
    >
      <h2 class="text-lg font-semibold text-sys-profundo">Riesgo / retención — solo SyS</h2>
      <p class="mt-1 text-sm text-sys-medio">
        Empresas con auditoría cerrada que hoy están en riesgo (ex-cliente o estado inactiva).
      </p>
      {#if data.dashboard.risk_retention.suppressed}
        <p class="mt-4 text-sm text-sys-medio" data-testid="mercado-riesgo-suppressed">
          Muestra insuficiente (n &lt; 3).
        </p>
      {:else}
        <div class="mt-4 grid gap-4 sm:grid-cols-4">
          <StatCard
            category="Cerradas"
            label="Auditadas"
            value={data.dashboard.risk_retention.universe_empresas}
            n={data.dashboard.risk_retention.universe_empresas}
          />
          <StatCard
            category="Upsell"
            label="Ex-clientes"
            value={data.dashboard.risk_retention.ex_cliente ?? 0}
            n={data.dashboard.risk_retention.universe_empresas}
          />
          <StatCard
            category="Upsell"
            label="Inactivas"
            value={data.dashboard.risk_retention.inactiva ?? 0}
            n={data.dashboard.risk_retention.universe_empresas}
          />
          <StatCard
            category="Upsell"
            label="En riesgo (unión)"
            value={data.dashboard.risk_retention.at_risk ?? 0}
            n={data.dashboard.risk_retention.universe_empresas}
          />
        </div>
      {/if}
    </section>

    <!-- Grid 2x2 StatCards -->
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        category="IT"
        label="Índice IT promedio"
        value={data.dashboard.indices_global.avg_it ?? 0}
        n={data.dashboard.indices_global.n_it}
      />
      <StatCard
        category="ERP"
        label="Índice ERP promedio"
        value={data.dashboard.indices_global.avg_erp ?? 0}
        n={data.dashboard.indices_global.n_erp}
      />
      <StatCard
        category="Cerradas"
        label="Auditorías cerradas"
        value={data.dashboard.universe.n}
        n={data.dashboard.universe.n}
      />
      <StatCard
        category="Upsell"
        label="Con hallazgos upsell"
        value={data.dashboard.upsell_internal.audits_with_findings}
        n={data.dashboard.upsell_internal.audits_with_findings}
      />
    </div>

    <!-- ErpDistribution -->
    <section class="rounded-sys border border-sys-borde bg-white p-4 shadow-sm" data-testid="mercado-section-erp">
      <h2 class="mb-4 text-lg font-semibold text-sys-profundo">Distribución ERP actual</h2>
      <ErpDistribution data={erpDistributionBars} />
    </section>

    <section class="rounded-sys border border-sys-borde bg-white p-4 shadow-sm" data-testid="mercado-section-modulos">
      <h2 class="mb-4 text-lg font-semibold text-sys-profundo">Módulos Tango más usados</h2>
      <BarChart items={data.dashboard.modulos_tango} testId="mercado-modulos-chart" />
    </section>

    <div class="grid gap-4 lg:grid-cols-2">
      <section class="rounded-sys border border-sys-borde bg-white p-4 shadow-sm" data-testid="mercado-section-segment">
        <h2 class="mb-4 text-lg font-semibold text-sys-profundo">Índices por segmento</h2>
        <div class="space-y-3">
          {#each data.dashboard.indices_by_segment as group (group.key)}
            <div class="rounded-sys border border-sys-borde px-3 py-2 text-sm">
              <div class="font-medium text-sys-profundo">Segmento {group.key} (n={group.n})</div>
              {#if group.suppressed}
                <p class="mt-1 text-sys-medio" data-testid="mercado-suppressed">
                  Muestra insuficiente (n &lt; 3)
                </p>
              {:else}
                <div class="mt-2 space-y-1">
                  <SectionScoreBar label="IT" score={group.avg_it != null ? Math.round(group.avg_it) : 0} />
                  <SectionScoreBar label="ERP" score={group.avg_erp != null ? Math.round(group.avg_erp) : 0} />
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </section>

      <section class="rounded-sys border border-sys-borde bg-white p-4 shadow-sm" data-testid="mercado-section-rubro">
        <h2 class="mb-4 text-lg font-semibold text-sys-profundo">Índices por rubro</h2>
        <div class="space-y-3">
          {#each data.dashboard.indices_by_rubro as group (group.key)}
            <div class="rounded-sys border border-sys-borde px-3 py-2 text-sm">
              <div class="font-medium text-sys-profundo">{group.key} (n={group.n})</div>
              {#if group.suppressed}
                <p class="mt-1 text-sys-medio">Muestra insuficiente (n &lt; 3)</p>
              {:else}
                <div class="mt-2 space-y-1">
                  <SectionScoreBar label="IT" score={group.avg_it != null ? Math.round(group.avg_it) : 0} />
                  <SectionScoreBar label="ERP" score={group.avg_erp != null ? Math.round(group.avg_erp) : 0} />
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </section>
    </div>

    <!-- SectionScoreBar global por segmento -->
    {#if segmentScoreBars.length > 0}
      <section class="rounded-sys border border-sys-borde bg-white p-4 shadow-sm" data-testid="mercado-section-scores">
        <h2 class="mb-4 text-lg font-semibold text-sys-profundo">Score por sección y segmento</h2>
        <div class="space-y-2">
          {#each segmentScoreBars as bar (bar.label)}
            <SectionScoreBar label={bar.label} score={bar.score} />
          {/each}
        </div>
      </section>
    {/if}

    <section class="rounded-sys border border-sys-borde bg-white p-4 shadow-sm" data-testid="mercado-section-semaforos">
      <h2 class="mb-4 text-lg font-semibold text-sys-profundo">Semáforos IT / ERP</h2>
      <div class="grid gap-4 sm:grid-cols-2">
        {#each [{ label: 'IT', data: data.dashboard.semaforos.it }, { label: 'ERP', data: data.dashboard.semaforos.erp }] as block (block.label)}
          <div>
            <h3 class="mb-2 text-sm font-medium text-sys-medio">{block.label}</h3>
            <div class="flex flex-wrap gap-2">
              {#each [
                { key: 'verde', label: 'Verde', n: block.data.verde },
                { key: 'amarillo', label: 'Amarillo', n: block.data.amarillo },
                { key: 'rojo', label: 'Rojo', n: block.data.rojo },
                { key: 'sin_dato', label: 'Sin dato', n: block.data.sin_dato }
              ] as chip (chip.key)}
                <span
                  class="inline-flex items-center gap-2 rounded-sys border border-sys-borde px-3 py-1 text-sm"
                >
                  <span
                    class={`h-3 w-3 rounded-full ${chip.key === 'sin_dato' ? 'bg-sys-borde' : semaphoreClass(chip.key as 'verde' | 'amarillo' | 'rojo')}`}
                  ></span>
                  {chip.label}: {chip.n}
                </span>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </section>

    <section class="rounded-sys border border-sys-borde bg-white p-4 shadow-sm" data-testid="mercado-section-trend">
      <h2 class="mb-4 text-lg font-semibold text-sys-profundo">Evolución mensual</h2>
      <TrendChart points={data.dashboard.monthly} />
    </section>

    <section
      class="rounded-sys border border-dashed border-sys-borde bg-sys-offwhite p-4 shadow-sm"
      data-testid="mercado-section-upsell"
    >
      <h2 class="text-lg font-semibold text-sys-profundo">Upsell agregado — solo SyS</h2>
      <p class="mt-1 text-sm text-sys-medio">Uso interno; no incluye textos individuales.</p>
      <div class="mt-4 grid gap-4 sm:grid-cols-3">
        <StatCard
          category="Upsell"
          label="Total hallazgos"
          value={data.dashboard.upsell_internal.total}
          n={data.dashboard.upsell_internal.total}
        />
        <StatCard
          category="Upsell"
          label="Promedio por auditoría"
          value={data.dashboard.upsell_internal.avg_per_audit != null ? parseFloat(data.dashboard.upsell_internal.avg_per_audit.toFixed(2)) : 0}
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
