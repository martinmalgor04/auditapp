<script lang="ts">
  let { razonSocial }: { razonSocial: string } = $props();
</script>

<header class="space-y-3 text-center">
  <img src="/brand/sys-logo.svg" alt="Servicios y Sistemas" class="mx-auto h-10 w-auto" />
  <h1 class="text-2xl font-bold text-[var(--sys-text)]">Hola, {razonSocial}</h1>
  <p class="text-sm text-[var(--sys-text-muted)]">
    Completá estos datos para preparar la visita de auditoría.
  </p>
</header>
