<script lang="ts">
  import type { HTMLTextareaAttributes } from 'svelte/elements';

  let {
    label,
    name,
    error,
    class: className = '',
    id = name,
    ...rest
  }: HTMLTextareaAttributes & {
    label?: string;
    error?: string;
    class?: string;
  } = $props();
</script>

<div class="space-y-1 {className}">
  {#if label}
    <label for={id} class="block text-sm font-medium text-[var(--sys-text-on-light)]">{label}</label>
  {/if}
  <textarea
    {id}
    {name}
    class="sys-textarea w-full min-h-[var(--sys-touch-min)] rounded-sys-app border border-sys-medio/20 bg-sys-blanco px-3 py-2 text-[var(--sys-text-body-light)]"
    aria-invalid={error ? 'true' : undefined}
    {...rest}
  ></textarea>
  {#if error}
    <p class="text-sm text-sys-rojo" role="alert">{error}</p>
  {/if}
</div>

<style>
  .sys-textarea:focus {
    outline: none;
    border-color: var(--sys-azul-electrico);
    box-shadow: 0 0 0 3px rgba(33, 150, 243, 0.15);
  }
</style>
