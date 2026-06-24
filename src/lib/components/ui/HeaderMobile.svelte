<script lang="ts">
  export let title: string;
  export let subtitle: string = '';
  export let user: { name: string };
  export let showNew: boolean = false;
  export let onNew: () => void = () => {};
</script>

<div
  class="lg:hidden fixed top-0 left-0 right-0 z-40 px-4 pt-4 pb-3"
  style="background: linear-gradient(160deg, var(--sys-navy) 0%, var(--sys-navy-mid) 100%)"
>
  <div class="flex items-center justify-between">
    <span class="text-[--sys-text-navy-muted] text-xs">servicios &amp; sistemas</span>
    <div class="w-8 h-8 rounded-full bg-[--sys-primary] flex items-center justify-center text-white text-sm font-bold">
      {user.name.charAt(0).toUpperCase()}
    </div>
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
