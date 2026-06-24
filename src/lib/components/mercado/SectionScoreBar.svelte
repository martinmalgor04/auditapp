<script lang="ts">
  export let label: string;
  export let score: number;   // 0–100
</script>

<div class="flex items-center gap-3">
  <span class="text-xs text-[--sys-text-secondary] w-20 shrink-0">{label}</span>
  <div class="flex-1 h-[6px] rounded-full bg-[--sys-border]">
    <div class="h-full rounded-full bg-[--sys-primary]" style="width: {score}%"></div>
  </div>
  <span class="text-xs text-[--sys-text-muted] w-8 text-right">{score}%</span>
</div>
