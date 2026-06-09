<script lang="ts">
  let {
    id,
    label,
    helpText,
    value = $bindable<string[]>(['']),
    onchange
  }: {
    id: string;
    label: string;
    helpText?: string | null;
    value?: string[];
    onchange?: () => void;
  } = $props();

  function addRow() {
    value = [...value, ''];
    onchange?.();
  }

  function removeRow(index: number) {
    value = value.filter((_, i) => i !== index);
    if (value.length === 0) {
      value = [''];
    }
    onchange?.();
  }
</script>

<div class="space-y-2">
  <span id="{id}-label" class="block text-sm font-medium text-slate-800">{label}</span>
  {#if helpText}
    <p class="text-xs text-slate-500">{helpText}</p>
  {/if}
  <div class="space-y-2" aria-labelledby="{id}-label">
    {#each value as row, i}
      <div class="flex gap-2">
        <input
          type="text"
          bind:value={value[i]}
          class="flex-1 min-h-[var(--sys-touch-min)] rounded-[var(--sys-radius)] border border-slate-300 px-3 py-2 text-base"
          oninput={onchange}
        />
        {#if value.length > 1}
          <button
            type="button"
            class="min-h-[var(--sys-touch-min)] px-3 text-sm text-slate-500"
            onclick={() => removeRow(i)}
          >
            Quitar
          </button>
        {/if}
      </div>
    {/each}
    <button
      type="button"
      class="text-sm text-sys-electrico min-h-[var(--sys-touch-min)]"
      onclick={addRow}
    >
      + Agregar
    </button>
  </div>
</div>
