<script lang="ts">
  import FieldRenderer, { type FieldItem } from '$lib/components/form/field-renderer.svelte';
  import SysButton from '$lib/components/brand/SysButton.svelte';

  let {
    items,
    stepCount,
    onfieldchange
  }: {
    items: FieldItem[];
    stepCount: 1 | 2 | 3;
    onfieldchange?: (itemId: string, value: unknown) => void;
  } = $props();

  let currentStep = $state(0);

  const steps = $derived.by(() => {
    if (stepCount === 1) {
      return [items];
    }
    const perStep = Math.ceil(items.length / stepCount);
    const result: FieldItem[][] = [];
    for (let i = 0; i < stepCount; i++) {
      result.push(items.slice(i * perStep, (i + 1) * perStep));
    }
    return result;
  });

  const stepItems = $derived(steps[currentStep] ?? []);
</script>

{#if stepCount > 1}
  <div class="mb-4 flex justify-center gap-2" aria-label="Progreso del formulario">
    {#each Array(stepCount) as _, i}
      <span
        class="h-2 w-8 rounded-full {i <= currentStep ? 'bg-sys-electrico' : 'bg-sys-medio/15'}"
      ></span>
    {/each}
  </div>
{/if}

<div class="space-y-6">
  {#each stepItems as item (item.id)}
    <FieldRenderer
      {item}
      onchange={(value) => onfieldchange?.(item.id, value)}
    />
  {/each}
</div>

{#if stepCount > 1}
  <div class="flex gap-3 pt-4">
    {#if currentStep > 0}
      <SysButton type="button" variant="secondary" class="flex-1" onclick={() => (currentStep -= 1)}>
        Anterior
      </SysButton>
    {/if}
    {#if currentStep < stepCount - 1}
      <SysButton type="button" variant="primary" class="flex-1" onclick={() => (currentStep += 1)}>
        Siguiente
      </SysButton>
    {/if}
  </div>
{/if}
