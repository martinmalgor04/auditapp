<script lang="ts">
  let {
    id,
    label,
    helpText,
    choices,
    value = $bindable<string[]>([]),
    onchange
  }: {
    id: string;
    label: string;
    helpText?: string | null;
    choices: string[];
    value?: string[];
    onchange?: () => void;
  } = $props();

  function toggle(choice: string) {
    if (value.includes(choice)) {
      value = value.filter((v) => v !== choice);
    } else {
      value = [...value, choice];
    }
    onchange?.();
  }
</script>

<div class="space-y-2">
  <span id="{id}-label" class="block text-sm font-medium text-sys-profundo">{label}</span>
  {#if helpText}
    <p class="text-xs text-[var(--sys-text-muted-light)]">{helpText}</p>
  {/if}
  <div class="space-y-2" role="group" aria-labelledby="{id}-label">
    {#each choices as choice}
      <label class="flex items-center gap-3 min-h-[var(--sys-touch-min)]">
        <input
          type="checkbox"
          checked={value.includes(choice)}
          class="h-5 w-5 rounded border-[var(--sys-border-subtle)]"
          onchange={() => toggle(choice)}
        />
        <span class="text-sm">{choice}</span>
      </label>
    {/each}
  </div>
</div>
