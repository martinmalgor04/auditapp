<script lang="ts">
  let { razonSocial, refCode }: { razonSocial: string; refCode?: string | null } = $props();
</script>

<header class="space-y-3 py-4 text-center">
  <img src="/brand/sys-horizontal-b.png" alt="Servicios y Sistemas" class="mx-auto h-10 w-auto" />
  <h1 class="text-2xl font-bold text-[var(--sys-text-on-light)]">Hola, {razonSocial}</h1>
  {#if refCode}
    <p class="text-xs font-mono text-[var(--sys-text-muted-light)]">{refCode}</p>
  {/if}
  <p class="text-sm text-[var(--sys-text-muted-light)]">
    Completá estos datos para preparar la visita de auditoría.
  </p>
</header>
