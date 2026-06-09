<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements';

  let {
    label,
    name,
    type = 'text',
    error,
    class: className = '',
    id = name,
    ...rest
  }: HTMLInputAttributes & {
    label?: string;
    error?: string;
    class?: string;
  } = $props();
</script>

<div class="space-y-1 {className}">
  {#if label}
    <label for={id} class="block text-sm font-medium text-[var(--sys-text-on-light)]">{label}</label>
  {/if}
  <input
    {id}
    {name}
    {type}
    class="sys-input w-full min-h-[var(--sys-touch-min)] rounded-sys-app border border-sys-medio/20 bg-sys-blanco px-3 py-2 text-[var(--sys-text-body-light)]"
    aria-invalid={error ? 'true' : undefined}
    {...rest}
  />
  {#if error}
    <p class="text-sm text-sys-rojo" role="alert">{error}</p>
  {/if}
</div>

<style>
  .sys-input:focus {
    outline: none;
    border-color: var(--sys-azul-electrico);
    box-shadow: 0 0 0 3px rgba(33, 150, 243, 0.15);
  }
</style>
