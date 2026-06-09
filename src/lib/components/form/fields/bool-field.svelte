<script lang="ts">
  let {
    id,
    label,
    helpText,
    value = $bindable(false),
    onchange
  }: {
    id: string;
    label: string;
    helpText?: string | null;
    value?: boolean;
    onchange?: () => void;
  } = $props();
</script>

<div class="flex items-start gap-3 min-h-[var(--sys-touch-min)]">
  <input
    {id}
    type="checkbox"
    bind:checked={value}
    class="mt-3 h-5 w-5 rounded border-slate-300"
    onchange={onchange}
  />
  <div>
    <label for={id} class="text-sm font-medium text-slate-800">{label}</label>
    {#if helpText}
      <p class="text-xs text-slate-500">{helpText}</p>
    {/if}
  </div>
</div>
