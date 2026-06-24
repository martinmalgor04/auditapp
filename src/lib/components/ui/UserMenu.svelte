<script lang="ts">
  let {
    user,
    variant = 'header'
  }: {
    user: { name: string; role?: string };
    variant?: 'header' | 'sidebar';
  } = $props();

  let open = $state(false);

  function toggle(e: MouseEvent) {
    e.stopPropagation();
    open = !open;
  }

  function close() {
    open = false;
  }

  function clickOutside(node: HTMLElement) {
    function onClick(e: MouseEvent) {
      if (!node.contains(e.target as Node)) close();
    }
    document.addEventListener('click', onClick);
    return {
      destroy() {
        document.removeEventListener('click', onClick);
      }
    };
  }
</script>

{#if variant === 'header'}
  <div class="relative" use:clickOutside>
    <button
      type="button"
      class="w-8 h-8 rounded-full bg-[--sys-primary] flex items-center justify-center text-white text-sm font-bold"
      aria-label="Menú de usuario"
      aria-expanded={open}
      aria-haspopup="menu"
      onclick={toggle}
    >
      {user.name.charAt(0).toUpperCase()}
    </button>

    {#if open}
      <div
        role="menu"
        class="absolute right-0 top-full mt-2 w-48 rounded-lg border border-[--sys-border] bg-white py-1 shadow-lg z-50"
      >
        <p class="px-3 py-2 text-xs font-medium text-[--sys-text-primary] truncate border-b border-[--sys-border]">
          {user.name}
        </p>
        <form method="POST" action="/logout">
          <button
            type="submit"
            role="menuitem"
            class="w-full px-3 py-2 text-left text-sm text-[--sys-text-secondary] hover:bg-[--sys-bg-app]"
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    {/if}
  </div>
{:else}
  <div class="space-y-2">
    <div class="flex items-center gap-2">
      <div
        class="w-8 h-8 rounded-full bg-sys-primary flex items-center justify-center text-white text-sm font-bold shrink-0"
      >
        {user.name.charAt(0).toUpperCase()}
      </div>
      <div class="min-w-0">
        <p class="text-white text-xs font-medium truncate">{user.name}</p>
        {#if user.role}
          <p class="text-sys-text-navy-muted text-xs">{user.role}</p>
        {/if}
      </div>
    </div>
    <form method="POST" action="/logout">
      <button
        type="submit"
        class="w-full text-left text-xs text-sys-text-navy-muted hover:text-white transition-colors py-1"
      >
        Cerrar sesión
      </button>
    </form>
  </div>
{/if}
