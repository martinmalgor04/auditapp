<script lang="ts">
  type TrendPoint = {
    month: string;
    n: number;
    avg_it: number | null;
    avg_erp: number | null;
  };

  let {
    points,
    testId = 'mercado-trend-chart'
  }: {
    points: TrendPoint[];
    testId?: string;
  } = $props();

  const width = 420;
  const height = 160;
  const pad = 24;

  const maxN = $derived(Math.max(...points.map((p) => p.n), 1));

  const linePoints = $derived(
    points
      .map((p, i) => {
        const x = pad + (i / Math.max(points.length - 1, 1)) * (width - pad * 2);
        const y = height - pad - (p.n / maxN) * (height - pad * 2);
        return `${x},${y}`;
      })
      .join(' ')
  );
</script>

<svg viewBox="0 0 {width} {height}" class="w-full max-w-2xl" role="img" aria-label="Evolución mensual" data-testid={testId}>
  <polyline
    points={linePoints}
    fill="none"
    stroke="var(--sys-electrico)"
    stroke-width="2"
    stroke-linejoin="round"
  />
  {#each points as point, i (point.month)}
    {@const x = pad + (i / Math.max(points.length - 1, 1)) * (width - pad * 2)}
    {@const y = height - pad - (point.n / maxN) * (height - pad * 2)}
    <circle cx={x} cy={y} r="4" class="fill-[var(--sys-electrico)]" />
    <text x={x - 14} y={height - 4} class="fill-[var(--sys-text-muted-light)] text-[10px]">
      {point.month.slice(5)}
    </text>
  {/each}
</svg>
