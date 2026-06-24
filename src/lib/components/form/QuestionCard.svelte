<script context="module" lang="ts">
  export type TriValue = 'si' | 'no' | 'parcial' | null;
</script>

<script lang="ts">
  export let question: string;
  export let value: TriValue;
  export let hasObservation: boolean = false;
  export let relevance: 'alta' | 'media' | null = null;
  export let onChange: (v: TriValue) => void;
  export let onAddObservation: () => void;
</script>

<div class="bg-white rounded-xl p-4 shadow-[0_1px_4px_rgba(0,0,0,.08)]">
  <!-- Badges opcionales -->
  <div class="flex gap-2 mb-2">
    {#if hasObservation}
      <span class="text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">Observación</span>
    {/if}
    {#if relevance === 'alta'}
      <span class="text-xs bg-[--sys-status-blue-bg] text-[--sys-status-blue-text] rounded-full px-2 py-0.5">Alta relevancia</span>
    {:else if relevance === 'media'}
      <span class="text-xs bg-amber-50 text-amber-700 rounded-full px-2 py-0.5">Media relevancia</span>
    {/if}
  </div>

  <!-- Pregunta -->
  <p class="text-[13px] font-semibold text-[--sys-text-primary] mb-3">{question}</p>

  <!-- Botones -->
  <div class="flex gap-2">
    <button type="button" on:click={() => onChange('si')}
      class="flex-1 py-2 rounded-lg text-sm font-medium border
        {value === 'si' ? 'bg-[--sys-status-green] text-white border-[--sys-status-green]' : 'bg-white border-[--sys-border] text-[--sys-text-secondary]'}">
      Sí
    </button>
    <button type="button" on:click={() => onChange('no')}
      class="flex-1 py-2 rounded-lg text-sm font-medium border
        {value === 'no' ? 'bg-[--sys-status-red] text-white border-[--sys-status-red]' : 'bg-white border-[--sys-border] text-[--sys-text-secondary]'}">
      No
    </button>
    <button type="button" on:click={() => onChange('parcial')}
      class="flex-1 py-2 rounded-lg text-sm font-medium border
        {value === 'parcial' ? 'border-[--sys-primary] text-[--sys-primary] bg-white' : 'bg-white border-[--sys-border] text-[--sys-text-secondary]'}">
      Parcial
    </button>
  </div>

  <!-- Link observación -->
  <button type="button" on:click={onAddObservation} class="mt-3 text-xs text-[--sys-primary]">+ Agregar observación</button>
</div>
