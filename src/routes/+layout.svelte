<script lang="ts">
  import '../app.css';
  import '$lib/styles/brand.css';

  let { children } = $props();
</script>

<svelte:head>
  <link
    rel="stylesheet"
    href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;600;700;800&display=swap"
  />
</svelte:head>

<div class="font-sys">
  {@render children?.()}
</div>
