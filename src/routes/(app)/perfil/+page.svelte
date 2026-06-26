<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import type { PageData } from './$types';

  type FormResult = {
    form?: 'perfil' | 'password';
    ok?: boolean;
    message?: string;
    error?: string;
    errors?: Record<string, string>;
  };

  let { data, form }: { data: PageData; form?: FormResult } = $props();

  const ROLE_LABELS: Record<string, string> = {
    admin: 'Administrador',
    tecnico: 'Técnico'
  };

  // Toast visible cuando la última acción terminó (éxito o error).
  let toast = $state<{ type: 'success' | 'error'; message: string } | null>(null);

  $effect(() => {
    if (!form) {
      return;
    }
    if (form.ok) {
      toast = { type: 'success', message: form.message ?? 'Listo' };
    } else if (form.error) {
      toast = { type: 'error', message: form.error };
    }
  });

  function perfilErrors(): Record<string, string> {
    return form?.form === 'perfil' ? (form.errors ?? {}) : {};
  }
  function passwordErrors(): Record<string, string> {
    return form?.form === 'password' ? (form.errors ?? {}) : {};
  }
</script>

<svelte:head>
  <title>Mi perfil — auditapp</title>
</svelte:head>

<div class="mx-auto w-full max-w-2xl px-4 py-6">
  <h1 class="mb-6 text-2xl font-bold text-sys-profundo">Mi perfil</h1>

  <!-- R2/R3: datos propios + rol read-only -->
  <section class="mb-8 rounded-sys-app border border-[var(--sys-border-subtle)] bg-white p-4 shadow-sys-card">
    <h2 class="mb-4 font-semibold text-sys-profundo">Tus datos</h2>
    <form
      method="POST"
      action="?/perfil"
      class="grid gap-4"
      use:enhance={() => {
        return async ({ update }) => {
          await update({ reset: false });
          await invalidateAll();
        };
      }}
    >
      <label class="space-y-1">
        <span class="text-xs text-[var(--sys-text-muted-light)]">Nombre visible</span>
        <input
          type="text"
          name="name"
          value={data.name}
          required
          maxlength="120"
          autocomplete="name"
          class="w-full rounded border px-3 py-2 text-sm"
        />
        {#if perfilErrors().name}
          <span class="text-xs text-sys-rojo" data-error="name">{perfilErrors().name}</span>
        {/if}
      </label>

      <label class="space-y-1">
        <span class="text-xs text-[var(--sys-text-muted-light)]">Email</span>
        <input
          type="email"
          name="email"
          value={data.email}
          required
          maxlength="200"
          autocomplete="email"
          class="w-full rounded border px-3 py-2 text-sm"
        />
        {#if perfilErrors().email}
          <span class="text-xs text-sys-rojo" data-error="email">{perfilErrors().email}</span>
        {/if}
      </label>

      <div class="space-y-1">
        <span class="text-xs text-[var(--sys-text-muted-light)]">Rol</span>
        <p class="rounded bg-[var(--sys-bg-app)] px-3 py-2 text-sm text-sys-text-muted" data-readonly="role">
          {ROLE_LABELS[data.role] ?? data.role}
        </p>
      </div>

      <button
        type="submit"
        class="w-fit rounded-sys-cta bg-sys-profundo px-4 py-2 text-sm font-medium text-white"
      >
        Guardar datos
      </button>
    </form>
  </section>

  <!-- R6–R13: cambio de contraseña -->
  <section class="rounded-sys-app border border-[var(--sys-border-subtle)] bg-white p-4 shadow-sys-card">
    <h2 class="mb-4 font-semibold text-sys-profundo">Cambiar contraseña</h2>
    <form
      method="POST"
      action="?/password"
      class="grid gap-4"
      use:enhance={() => {
        return async ({ update }) => {
          await update({ reset: true });
        };
      }}
    >
      <label class="space-y-1">
        <span class="text-xs text-[var(--sys-text-muted-light)]">Contraseña actual</span>
        <input
          type="password"
          name="actual"
          required
          autocomplete="current-password"
          class="w-full rounded border px-3 py-2 text-sm"
        />
        {#if passwordErrors().actual}
          <span class="text-xs text-sys-rojo" data-error="actual">{passwordErrors().actual}</span>
        {/if}
      </label>

      <label class="space-y-1">
        <span class="text-xs text-[var(--sys-text-muted-light)]">Nueva contraseña</span>
        <input
          type="password"
          name="nueva"
          required
          minlength="10"
          autocomplete="new-password"
          class="w-full rounded border px-3 py-2 text-sm"
        />
        <span class="text-xs text-[var(--sys-text-muted-light)]">
          Mínimo 10 caracteres, con al menos una letra y un número.
        </span>
        {#if passwordErrors().nueva}
          <span class="text-xs text-sys-rojo" data-error="nueva">{passwordErrors().nueva}</span>
        {/if}
      </label>

      <label class="space-y-1">
        <span class="text-xs text-[var(--sys-text-muted-light)]">Confirmar nueva contraseña</span>
        <input
          type="password"
          name="confirmacion"
          required
          autocomplete="new-password"
          class="w-full rounded border px-3 py-2 text-sm"
        />
        {#if passwordErrors().confirmacion}
          <span class="text-xs text-sys-rojo" data-error="confirmacion"
            >{passwordErrors().confirmacion}</span
          >
        {/if}
      </label>

      <button
        type="submit"
        class="w-fit rounded-sys-cta bg-sys-profundo px-4 py-2 text-sm font-medium text-white"
      >
        Cambiar contraseña
      </button>
    </form>
  </section>
</div>

{#if toast}
  <div
    class="fixed bottom-16 right-4 z-50 max-w-sm rounded-sys-app px-4 py-3 text-white shadow-lg md:bottom-4"
    class:bg-sys-rojo={toast.type === 'error'}
    class:bg-emerald-600={toast.type === 'success'}
    role="alert"
    data-toast={toast.type}
  >
    <div class="flex items-start justify-between gap-3">
      <p class="flex-1 text-sm font-medium">{toast.message}</p>
      <button
        type="button"
        onclick={() => (toast = null)}
        class="shrink-0 text-white/70 transition-colors hover:text-white"
        aria-label="Cerrar alerta"
      >
        ×
      </button>
    </div>
  </div>
{/if}
