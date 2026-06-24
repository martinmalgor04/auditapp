<script module lang="ts">
  export type StatCategory = 'IT' | 'ERP' | 'Cerradas' | 'Upsell';
</script>

<script lang="ts">
  export let category: StatCategory;
  export let value: number;
  export let label: string;
  export let n: number;
  export let testId: string | undefined = undefined;

  const colorMap: Record<StatCategory, string> = {
    IT: 'var(--sys-primary)',
    ERP: 'var(--sys-primary)',
    Cerradas: 'var(--sys-status-green)',
    Upsell: 'var(--sys-status-amber)'
  };

  $: color = colorMap[category];
</script>

<div class="bg-white rounded-xl p-4 shadow-sm" style="border-top: 3px solid {color}" data-testid={testId}>
  <p class="text-xs text-[--sys-text-muted] mb-1">{label}</p>
  <p class="text-[30px] font-extrabold text-[--sys-text-primary] leading-none">{value}</p>
  <p class="text-xs text-[--sys-text-faint] mt-1">n={n}</p>
</div>
