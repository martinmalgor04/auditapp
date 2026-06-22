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

  let menuOpen = $state(false);

  function toggleMenu() {
    menuOpen = !menuOpen;
  }

  function closeMenu() {
    menuOpen = false;
  }
</script>

<div
  class="min-h-screen overflow-x-hidden font-sys {isDark
    ? 'sys-shell-dark text-[var(--sys-text-on-dark)]'
    : 'sys-shell-light bg-sys-offwhite text-[var(--sys-text-body-light)]'}"
  data-sys-shell={variant}
>
  {#if showTopBar}
    <div
      class="bg-sys-electrico"
      style="height: max(var(--sys-top-bar), env(safe-area-inset-top, 0px));"
      aria-hidden="true"
    ></div>
  {/if}

  {#if isDark}
    <div class="flex min-h-[calc(100vh-var(--sys-top-bar))] flex-col items-center justify-center p-6"
      style="padding-left: max(1.5rem, env(safe-area-inset-left, 1.5rem)); padding-right: max(1.5rem, env(safe-area-inset-right, 1.5rem));"
    >
      <img src={logoSrc} alt="Servicios y Sistemas" class="mb-8 h-10 w-auto" />
      {@render children?.()}
    </div>
  {:else}
    <header
      class="sticky top-0 z-40 bg-sys-blanco/95 backdrop-blur-sm"
      style="box-shadow: var(--sys-shadow-header); padding-top: env(safe-area-inset-top, 0px); padding-left: env(safe-area-inset-left, 0px); padding-right: env(safe-area-inset-right, 0px);"
      data-sys-shell-header
    >
      <div class="mx-auto max-w-7xl px-4 py-4 sm:px-6">
        <div class="flex min-w-0 items-center justify-between gap-4">
          <div class="flex min-w-0 items-center gap-6">
            {#if logoHref}
              <a href={logoHref} class="shrink-0" onclick={closeMenu}>
                <img src={logoSrc} alt="Servicios y Sistemas" class="h-8 w-auto" />
              </a>
            {:else}
              <img src={logoSrc} alt="Servicios y Sistemas" class="h-8 w-auto shrink-0" />
            {/if}
            <!-- Nav desktop -->
            <div class="hidden min-w-0 md:block">
              {@render nav?.()}
            </div>
          </div>

          <div class="flex shrink-0 items-center gap-2">
            {@render headerActions?.()}
            <!-- Hamburger mobile -->
            <button
              class="flex h-10 w-10 flex-col items-center justify-center gap-[5px] rounded-sys md:hidden"
              onclick={toggleMenu}
              aria-label="Menú"
              aria-expanded={menuOpen}
            >
              <span class="h-0.5 w-5 rounded-full bg-sys-profundo transition-all duration-200 {menuOpen ? 'translate-y-[7px] rotate-45' : ''}"></span>
              <span class="h-0.5 w-5 rounded-full bg-sys-profundo transition-all duration-200 {menuOpen ? 'opacity-0' : ''}"></span>
              <span class="h-0.5 w-5 rounded-full bg-sys-profundo transition-all duration-200 {menuOpen ? '-translate-y-[7px] -rotate-45' : ''}"></span>
            </button>
          </div>
        </div>
      </div>

      <!-- Menú desplegable mobile -->
      {#if menuOpen}
        <div class="border-t border-[var(--sys-border-subtle)] bg-sys-blanco px-4 pb-3 pt-2 md:hidden">
          <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
          <div onclick={closeMenu}>
            {@render nav?.()}
          </div>
        </div>
      {/if}
    </header>

    <main class="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      {@render children?.()}
    </main>
  {/if}
</div>

<style>
  .sys-shell-dark {
    background: var(--sys-bg-gradient);
  }
</style>
