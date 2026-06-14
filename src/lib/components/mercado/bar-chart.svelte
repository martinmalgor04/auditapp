<script lang="ts">
  type BarItem = { key: string; n: number; pct?: number };

  let {
    items,
    maxValue,
    label = 'Cantidad',
    testId = 'mercado-bar-chart'
  }: {
    items: BarItem[];
    maxValue?: number;
    label?: string;
    testId?: string;
  } = $props();

  const computedMax = $derived(maxValue ?? Math.max(...items.map((i) => i.n), 1));
  const chartWidth = 320;
  const rowHeight = 28;
  const chartHeight = $derived(Math.max(items.length * rowHeight, rowHeight));
</script>

<svg
  viewBox="0 0 {chartWidth + 120} {chartHeight + 8}"
  class="w-full max-w-xl"
  role="img"
  aria-label={label}
  data-testid={testId}
>
  {#each items as item, i (item.key)}
    {@const barWidth = (item.n / computedMax) * chartWidth}
    <text x="0" y={i * rowHeight + 18} class="fill-[var(--sys-text-muted-light)] text-[11px]">
      {item.key}
    </text>
    <rect
      x="100"
      y={i * rowHeight + 4}
      width={barWidth}
      height="16"
      rx="3"
      class="fill-[var(--sys-electrico)]"
    />
    <text x={106 + barWidth} y={i * rowHeight + 17} class="fill-[var(--sys-profundo)] text-[11px]">
      {item.n}{item.pct !== undefined ? ` (${item.pct}%)` : ''}
    </text>
  {/each}
</svg>
