<script lang="ts">
  const options = [
    { value: 'si', label: 'Sí' },
    { value: 'no', label: 'No' },
    { value: 'parcial', label: 'Parcial' }
  ] as const;

  let {
    id,
    label,
    helpText,
    value = $bindable<'si' | 'no' | 'parcial' | ''>(''),
    onchange
  }: {
    id: string;
    label: string;
    helpText?: string | null;
    value?: 'si' | 'no' | 'parcial' | '';
    onchange?: () => void;
  } = $props();
</script>

<div class="space-y-2">
  <span id="{id}-label" class="block text-sm font-medium text-slate-800">{label}</span>
  {#if helpText}
    <p class="text-xs text-slate-500">{helpText}</p>
  {/if}
  <div class="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="{id}-label">
    {#each options as opt}
      <label class="flex-1 min-w-[5rem]">
        <input
          type="radio"
          name={id}
          value={opt.value}
          bind:group={value}
          class="sr-only peer"
          onchange={onchange}
        />
        <span
          class="flex min-h-[var(--sys-touch-min)] items-center justify-center rounded-[var(--sys-radius)] border border-slate-300 px-3 text-sm peer-checked:border-[var(--sys-primary)] peer-checked:bg-[var(--sys-primary)] peer-checked:text-white"
        >
          {opt.label}
        </span>
      </label>
    {/each}
  </div>
</div>
