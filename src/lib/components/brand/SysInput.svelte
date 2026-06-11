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
    <label for={id} class="sys-field-label">{label}</label>
  {/if}
  <input
    {id}
    {name}
    {type}
    class="sys-field w-full"
    aria-invalid={error ? 'true' : undefined}
    {...rest}
  />
  {#if error}
    <p class="text-sm text-sys-rojo" role="alert">{error}</p>
  {/if}
</div>
