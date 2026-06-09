<script lang="ts">
  import type { ScoreBand } from '$lib/scoring/section-score';

  let {
    score,
    band
  }: {
    score: number | null;
    band: ScoreBand;
  } = $props();

  const bandClass = $derived(
    band === 'green'
      ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
      : band === 'amber'
        ? 'text-amber-700 bg-amber-50 border-amber-200'
        : band === 'red'
          ? 'text-red-700 bg-red-50 border-red-200'
          : 'text-slate-600 bg-slate-50 border-slate-200'
  );
</script>

<div
  class="rounded-lg border px-3 py-2 text-sm font-medium {bandClass}"
  aria-label="Score de sección"
  data-score-band={band}
>
  {#if score === null}
    <span>N/A</span>
  {:else}
    <span>Score: {score}/100</span>
  {/if}
</div>
