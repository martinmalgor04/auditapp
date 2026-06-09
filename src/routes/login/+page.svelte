<script lang="ts">
  import SysShell from '$lib/components/brand/SysShell.svelte';
  import SysButton from '$lib/components/brand/SysButton.svelte';
  import SysInput from '$lib/components/brand/SysInput.svelte';
  import type { ActionData } from './$types';

  let { form }: { form: ActionData } = $props();
</script>

<svelte:head>
  <title>Ingresar — auditapp</title>
</svelte:head>

<SysShell variant="dark">
  <form
    method="POST"
    class="w-full max-w-sm space-y-4 rounded bg-sys-blanco p-6 shadow-lg"
  >
    <h1 class="text-2xl font-bold text-[var(--sys-text-on-light)]">Ingresar</h1>

    {#if form?.error}
      <p class="text-sm text-sys-rojo" role="alert">{form.error}</p>
    {/if}

    <SysInput label="Email" name="email" type="email" required autocomplete="username" />
    <SysInput
      label="Contraseña"
      name="password"
      type="password"
      required
      autocomplete="current-password"
    />

    <SysButton type="submit" variant="primary" class="w-full">Ingresar</SysButton>
  </form>
</SysShell>
