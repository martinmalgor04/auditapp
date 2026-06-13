<script lang="ts">
  let { children } = $props();
</script>

<svelte:head>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<!-- Layout público sin chrome de app (R1, R14): fondo dark del template web. -->
<div class="informe-public-shell">
  {@render children?.()}
</div>

<style>
  .informe-public-shell {
    min-height: 100vh;
    background: linear-gradient(
      160deg,
      var(--sys-azul-profundo) 0%,
      #0d2035 55%,
      var(--sys-azul-medio) 100%
    );
  }
</style>
