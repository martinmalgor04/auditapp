<script lang="ts">
  import ChipPill from '$lib/components/ui/ChipPill.svelte';

  export let options: Array<{ label: string; value: string }>;
  export let value: string;
  export let onChange: (v: string) => void;
</script>

<div class="flex gap-2 overflow-x-auto">
  {#each options as option (option.value)}
    <ChipPill
      label={option.label}
      active={option.value === value}
      onClick={() => onChange(option.value)}
    />
  {/each}
</div>
