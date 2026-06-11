<script lang="ts">
  import type { HTMLButtonAttributes } from 'svelte/elements';

  type Variant = 'primary' | 'secondary' | 'ghost';

  let {
    variant = 'primary',
    type = 'button',
    disabled = false,
    class: className = '',
    children,
    ...rest
  }: HTMLButtonAttributes & {
    variant?: Variant;
    class?: string;
    children?: import('svelte').Snippet;
  } = $props();

  const base =
    'inline-flex min-h-[var(--sys-touch-min)] items-center justify-center rounded-sys px-4 py-2 text-sm font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50';

  const variants: Record<Variant, string> = {
    primary: 'bg-sys-electrico text-white hover:brightness-95 shadow-[0_2px_8px_rgba(33,150,243,0.22)]',
    secondary:
      'border bg-sys-blanco text-sys-profundo hover:bg-sys-offwhite hover:text-sys-electrico border-[var(--sys-border-subtle)] hover:border-[rgba(33,150,243,0.35)]',
    ghost: 'bg-transparent text-sys-profundo hover:bg-sys-offwhite hover:text-sys-electrico'
  };
</script>

<button {type} {disabled} class="{base} {variants[variant]} {className}" {...rest}>
  {@render children?.()}
</button>
