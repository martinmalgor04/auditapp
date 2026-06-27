<script lang="ts">
  import { enhance } from '$app/forms';
  import SysShell from '$lib/components/brand/SysShell.svelte';
  import SysButton from '$lib/components/brand/SysButton.svelte';
  import SysInput from '$lib/components/brand/SysInput.svelte';
  import type { ActionData } from './$types';

  let { form }: { form: ActionData } = $props();
</script>

<svelte:head>
  <title>Recuperar contraseña — auditapp</title>
</svelte:head>

<SysShell variant="dark">
  <div class="w-full max-w-sm space-y-4 rounded bg-sys-blanco p-6 shadow-lg">
    <h1 class="text-2xl font-bold text-[var(--sys-text-on-light)]">Recuperar contraseña</h1>

    {#if form?.ok && form?.message}
      <p class="rounded bg-green-50 p-3 text-sm text-green-800" role="status">
        {form.message}
      </p>
    {:else}
      {#if form?.error}
        <p class="text-sm text-sys-rojo" role="alert">{form.error}</p>
      {/if}

      <p class="text-sm text-[var(--sys-text-on-light)]">
        Ingresá tu email y te enviamos un enlace para restablecer la contraseña.
      </p>

      <form method="POST" use:enhance class="space-y-4">
        <SysInput label="Email" name="email" type="email" required autocomplete="email" />
        <SysButton type="submit" variant="primary" class="w-full">Enviar enlace</SysButton>
      </form>

      <p class="text-center text-sm">
        <a href="/login" class="text-sys-azul hover:underline">Volver al login</a>
      </p>
    {/if}
  </div>
</SysShell>
