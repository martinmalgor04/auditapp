<script lang="ts">
  let {
    title,
    value,
    subtitle = '',
    testId
  }: {
    title: string;
    value: string | number | null;
    subtitle?: string;
    testId?: string;
  } = $props();
</script>

<div
  class="rounded-sys border border-sys-borde bg-white p-4 shadow-sm"
  data-testid={testId}
>
  <p class="text-sm text-sys-medio">{title}</p>
  <p class="mt-1 text-2xl font-semibold tabular-nums text-sys-profundo">
    {value ?? '—'}
  </p>
  {#if subtitle}
    <p class="mt-1 text-xs text-[var(--sys-text-muted-light)]">{subtitle}</p>
  {/if}
</div>
