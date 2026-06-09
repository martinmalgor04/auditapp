<script lang="ts">
  export type SaveIndicatorState = 'idle' | 'saving' | 'saved' | 'offline';

  let { state }: { state: SaveIndicatorState } = $props();
</script>

<p
  class="text-xs text-center min-h-[1.25rem] sticky top-0 z-20 bg-[var(--sys-surface)] py-1"
  aria-live="polite"
  data-save-state={state}
>
  {#if state === 'saving'}
    <span class="text-[var(--sys-accent)]">Guardando…</span>
  {:else if state === 'saved'}
    <span class="text-emerald-600">Guardado ✓</span>
  {:else if state === 'offline'}
    <span class="text-amber-700">Sin conexión — se reintenta</span>
  {/if}
</p>
