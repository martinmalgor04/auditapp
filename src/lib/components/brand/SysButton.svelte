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
    'inline-flex min-h-[var(--sys-touch-min)] items-center justify-center rounded-sys px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50';

  const variants: Record<Variant, string> = {
    primary: 'bg-sys-electrico text-white hover:bg-[#1976D2]',
    secondary:
      'border border-sys-medio/20 bg-sys-blanco text-sys-profundo hover:border-sys-electrico hover:text-sys-electrico',
    ghost: 'bg-transparent text-sys-profundo hover:text-sys-electrico'
  };
</script>

<button {type} {disabled} class="{base} {variants[variant]} {className}" {...rest}>
  {@render children?.()}
</button>
