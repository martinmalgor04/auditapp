<script lang="ts">
  let {
    id,
    label,
    helpText,
    choices,
    value = $bindable(''),
    required = false,
    onchange
  }: {
    id: string;
    label: string;
    helpText?: string | null;
    choices: string[];
    value?: string;
    required?: boolean;
    onchange?: () => void;
  } = $props();
</script>

<div class="space-y-1">
  <label for={id} class="block text-sm font-medium text-slate-800">
    {label}{#if required}<span class="text-red-500"> *</span>{/if}
  </label>
  {#if helpText}
    <p class="text-xs text-slate-500">{helpText}</p>
  {/if}
  <select
    {id}
    bind:value
    {required}
    class="w-full min-h-[var(--sys-touch-min)] rounded-[var(--sys-radius)] border border-slate-300 px-3 py-2 text-base bg-white"
    onchange={onchange}
  >
    <option value="">Seleccionar…</option>
    {#each choices as choice}
      <option value={choice}>{choice}</option>
    {/each}
  </select>
</div>
