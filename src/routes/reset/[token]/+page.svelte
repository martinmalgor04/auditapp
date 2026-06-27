<script lang="ts">
  import { enhance } from '$app/forms';
  import SysShell from '$lib/components/brand/SysShell.svelte';
  import SysButton from '$lib/components/brand/SysButton.svelte';
  import SysInput from '$lib/components/brand/SysInput.svelte';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
  <title>Nueva contraseña — auditapp</title>
</svelte:head>

<SysShell variant="dark">
  <div class="w-full max-w-sm space-y-4 rounded bg-sys-blanco p-6 shadow-lg">
    {#if !data.valid || form?.tokenInvalid}
      <!-- R10: pantalla amable para token inválido/expirado/usado -->
      <h1 class="text-2xl font-bold text-[var(--sys-text-on-light)]">Enlace inválido</h1>
      <p class="text-sm text-[var(--sys-text-on-light)]">
        Este enlace ya no es válido. Puede que haya expirado, ya fue usado, o que hayas solicitado
        uno nuevo.
      </p>
      <p class="text-center text-sm">
        <a href="/forgot" class="text-sys-azul hover:underline">Solicitar un nuevo enlace</a>
      </p>
    {:else}
      <!-- R9: formulario de nueva contraseña -->
      <h1 class="text-2xl font-bold text-[var(--sys-text-on-light)]">Nueva contraseña</h1>
      <p class="text-sm text-[var(--sys-text-on-light)]">
        Ingresá tu nueva contraseña (mínimo 8 caracteres).
      </p>

      {#if form?.errors?._}
        <p class="text-sm text-sys-rojo" role="alert">{form.errors._}</p>
      {/if}

      <form method="POST" use:enhance class="space-y-4">
        <SysInput
          label="Nueva contraseña"
          name="nueva"
          type="password"
          required
          autocomplete="new-password"
          error={form?.errors?.nueva}
        />
        <SysInput
          label="Confirmar contraseña"
          name="confirmacion"
          type="password"
          required
          autocomplete="new-password"
          error={form?.errors?.confirmacion}
        />
        <SysButton type="submit" variant="primary" class="w-full">Guardar nueva contraseña</SysButton>
      </form>
    {/if}
  </div>
</SysShell>
