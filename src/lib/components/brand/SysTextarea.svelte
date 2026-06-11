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
    <label for={id} class="sys-field-label">{label}</label>
  {/if}
  <textarea
    {id}
    {name}
    class="sys-field min-h-[6rem] w-full resize-y"
    aria-invalid={error ? 'true' : undefined}
    {...rest}
  ></textarea>
  {#if error}
    <p class="text-sm text-sys-rojo" role="alert">{error}</p>
  {/if}
</div>
