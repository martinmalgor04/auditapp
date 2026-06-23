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
  <label for={id} class="sys-field-label">
    {label}{#if required}<span class="text-red-500"> *</span>{/if}
  </label>
  {#if helpText}
    <p class="text-xs text-[var(--sys-text-muted-light)]">{helpText}</p>
  {/if}
  <input
    {id}
    type="number"
    min="0"
    bind:value
    {required}
    class="w-full min-h-[var(--sys-touch-min)] rounded-[var(--sys-radius)] border border-[var(--sys-border-subtle)] px-3 py-2 text-base"
    oninput={onchange}
  />
</div>
