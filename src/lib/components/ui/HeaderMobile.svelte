<script lang="ts">
  import { SYS_LOGOS } from '$lib/brand/logos';
  import UserMenu from '$lib/components/ui/UserMenu.svelte';

  export let title: string;
  export let subtitle: string = '';
  export let user: { name: string };
  export let showNew: boolean = false;
  export let onNew: () => void = () => {};
</script>

<div
  class="lg:hidden sticky top-0 z-40 px-4 pb-3"
  data-testid="header-mobile"
  style="
    padding-top: calc(env(safe-area-inset-top, 0px) + 0.75rem);
    background: linear-gradient(160deg, var(--sys-navy) 0%, var(--sys-navy-mid) 100%);
  "
>
  <div class="flex items-center justify-between">
    <img
      src={SYS_LOGOS.sysHorizontalW}
      alt="Servicios y Sistemas"
      class="h-6 w-auto"
      width="120"
      height="24"
    />
    <UserMenu {user} variant="header" />
  </div>

  <div class="flex items-end justify-between mt-2">
    <div>
      <h1 class="text-white text-2xl font-extrabold">{title}</h1>
      {#if subtitle}
        <p class="text-[--sys-text-navy-muted] text-sm">{subtitle}</p>
      {/if}
    </div>

    {#if showNew}
      <button
        on:click={onNew}
        class="bg-[--sys-primary] text-white rounded-lg px-3 py-1.5 text-sm font-medium"
      >
        + Nueva
      </button>
    {/if}
  </div>
</div>
