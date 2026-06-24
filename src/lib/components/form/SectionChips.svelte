<script context="module" lang="ts">
  export interface SectionChipData {
    code: string;
    done: number;
    total: number;
  }
</script>

<script lang="ts">
  export let sections: SectionChipData[];
  export let activeCode: string;
  export let onSelect: (code: string) => void;
</script>

<div class="flex gap-2 overflow-x-auto pb-1 px-3">
  {#each sections as s}
    <button
      on:click={() => onSelect(s.code)}
      data-testid="section-chip"
      class="shrink-0 flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium
        {s.code === activeCode ? 'bg-[--sys-primary] text-white' : 'bg-[--sys-bg-app] border border-[--sys-border] text-[--sys-text-secondary]'}"
    >
      {s.code}
      {#if s.done === s.total && s.total > 0}
        <span>✓</span>
      {/if}
    </button>
  {/each}
</div>
