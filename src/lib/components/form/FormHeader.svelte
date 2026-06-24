<script lang="ts">
  export let clientName: string;
  export let progress: number;   // 0–100
  export let pending: number;
  export let sectionTitle: string;
  export let onBack: () => void;
</script>

<div class="lg:hidden fixed top-0 left-0 right-0 z-40" style="background: var(--sys-navy)">
  <div class="flex items-center gap-3 px-4 py-3">
    <button on:click={onBack} class="text-[--sys-text-navy-muted]">← </button>
    <span class="text-[--sys-text-navy-muted] text-sm truncate">{clientName}</span>
    <div class="ml-auto shrink-0 bg-white/10 rounded-full px-2 py-0.5 text-xs text-white">
      {progress}% · {pending} pendientes
    </div>
  </div>
  <p class="px-4 pb-2 text-white font-semibold">{sectionTitle}</p>
  <!-- Barra progreso 4px -->
  <div class="h-[4px] bg-[--sys-border]">
    <div class="h-full bg-[--sys-primary]" style="width: {progress}%"></div>
  </div>
</div>
