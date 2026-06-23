<script lang="ts">
  let {
    id,
    label,
    helpText,
    value = $bindable(''),
    required = false,
    onchange
  }: {
    id: string;
    label: string;
    helpText?: string | null;
    value?: string;
    required?: boolean;
    onchange?: () => void;
  } = $props();
</script>

<div class="space-y-1">
  <label for={id} class="block text-sm font-medium text-sys-profundo">
    {label}{#if required}<span class="text-red-500"> *</span>{/if}
  </label>
  {#if helpText}
    <p class="text-xs text-[var(--sys-text-muted-light)]">{helpText}</p>
  {/if}
  <input
    {id}
    type="date"
    bind:value
    {required}
    class="w-full min-h-[var(--sys-touch-min)] rounded-[var(--sys-radius)] border border-[var(--sys-border-subtle)] px-3 py-2 text-base"
    onchange={onchange}
  />
</div>
