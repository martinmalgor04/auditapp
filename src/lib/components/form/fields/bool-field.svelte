<script lang="ts">
  const options = [
    { value: 'si', label: 'Sí' },
    { value: 'no', label: 'No' }
  ] as const;

  type Choice = 'si' | 'no' | '';

  let {
    id,
    label,
    helpText,
    value = $bindable<boolean | null>(null),
    onchange
  }: {
    id: string;
    label: string;
    helpText?: string | null;
    value?: boolean | null;
    onchange?: () => void;
  } = $props();

  let choice = $state<Choice>('');

  $effect(() => {
    if (value === true) choice = 'si';
    else if (value === false) choice = 'no';
    else choice = '';
  });

  function handleChange() {
    if (choice === 'si') value = true;
    else if (choice === 'no') value = false;
    onchange?.();
  }
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
          bind:group={choice}
          class="sr-only peer"
          onchange={handleChange}
        />
        <span
          class="flex min-h-[var(--sys-touch-min)] items-center justify-center rounded-sys-app border border-sys-medio/20 px-3 text-sm peer-checked:border-sys-electrico peer-checked:bg-sys-electrico peer-checked:text-white"
        >
          {opt.label}
        </span>
      </label>
    {/each}
  </div>
</div>
