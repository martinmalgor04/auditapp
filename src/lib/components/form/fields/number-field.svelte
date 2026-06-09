<script lang="ts">
  let {
    id,
    label,
    helpText,
    value = $bindable<number | ''>(''),
    required = false,
    onchange
  }: {
    id: string;
    label: string;
    helpText?: string | null;
    value?: number | '';
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
  <input
    {id}
    type="number"
    min="0"
    bind:value
    {required}
    class="w-full min-h-[var(--sys-touch-min)] rounded-[var(--sys-radius)] border border-slate-300 px-3 py-2 text-base"
    oninput={onchange}
  />
</div>
