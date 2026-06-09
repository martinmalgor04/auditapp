<script lang="ts">
  let { message }: { message: string } = $props();
</script>

<div class="text-center space-y-3 py-8">
  <h1 class="text-xl font-semibold text-[var(--sys-text-on-light)]">{message}</h1>
  <p class="text-sm leading-relaxed text-[var(--sys-text-muted-light)]">
    Si necesitás completar el briefing, contactá a Servicios y Sistemas para solicitar un nuevo enlace.
  </p>
</div>
