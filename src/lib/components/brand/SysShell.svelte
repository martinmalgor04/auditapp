<script lang="ts">
  import type { Snippet } from 'svelte';

  type Variant = 'dark' | 'light';

  let {
    variant = 'light',
    showTopBar = variant === 'dark',
    children,
    nav,
    headerActions
  }: {
    variant?: Variant;
    showTopBar?: boolean;
    children?: Snippet;
    nav?: Snippet;
    headerActions?: Snippet;
  } = $props();

  const isDark = $derived(variant === 'dark');
  const logoSrc = $derived(isDark ? '/brand/sys-horizontal-w.png' : '/brand/sys-horizontal-b.png');
  const logoHref = $derived(isDark ? undefined : '/tablero');
</script>

<div
  class="min-h-screen font-sys {isDark
    ? 'sys-shell-dark text-[var(--sys-text-on-dark)]'
    : 'sys-shell-light bg-sys-offwhite text-[var(--sys-text-body-light)]'}"
  data-sys-shell={variant}
>
  {#if showTopBar}
    <div class="h-[var(--sys-top-bar)] bg-sys-electrico" aria-hidden="true"></div>
  {/if}

  {#if isDark}
    <div class="flex min-h-[calc(100vh-var(--sys-top-bar))] flex-col items-center justify-center p-6">
      <img src={logoSrc} alt="Servicios y Sistemas" class="mb-8 h-10 w-auto" />
      {@render children?.()}
    </div>
  {:else}
    <header
      class="sticky top-0 z-40 border-b border-black/[0.06] bg-sys-blanco"
      data-sys-shell-header
    >
      <div class="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
        <div class="flex min-w-0 items-center gap-6">
          {#if logoHref}
            <a href={logoHref} class="shrink-0">
              <img src={logoSrc} alt="Servicios y Sistemas" class="h-8 w-auto" />
            </a>
          {:else}
            <img src={logoSrc} alt="Servicios y Sistemas" class="h-8 w-auto shrink-0" />
          {/if}
          {@render nav?.()}
        </div>
        {@render headerActions?.()}
      </div>
    </header>
    <main class="mx-auto w-full max-w-7xl px-4 py-6">
      {@render children?.()}
    </main>
  {/if}
</div>

<style>
  .sys-shell-dark {
    background: var(--sys-bg-gradient);
  }
</style>
