<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { onMount } from 'svelte';
  import type { PageData } from './$types';
  import { subscribePush, unsubscribePush, isPushSubscribed } from '$lib/client/push/subscribe';

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

  // Push toggle state
  let pushSubscribed = $state<boolean | null>(null); // null = cargando
  let pushLoading = $state(false);
  let pushSupported = $state(false);

  onMount(async () => {
    pushSupported =
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window;
    if (pushSupported) {
      pushSubscribed = await isPushSubscribed();
    }
  });

  async function togglePush() {
    pushLoading = true;
    try {
      if (pushSubscribed) {
        const ok = await unsubscribePush();
        if (ok) {
          pushSubscribed = false;
          toast = { type: 'success', message: 'Notificaciones push desactivadas' };
        } else {
          toast = { type: 'error', message: 'No se pudo desactivar las notificaciones push' };
        }
      } else {
        const ok = await subscribePush();
        if (ok) {
          pushSubscribed = true;
          toast = { type: 'success', message: 'Notificaciones push activadas' };
        } else {
          toast = { type: 'error', message: 'No se pudo activar las notificaciones push. Verificá los permisos del navegador.' };
        }
      }
    } catch {
      toast = { type: 'error', message: 'Error al cambiar preferencia de notificaciones push' };
    } finally {
      pushLoading = false;
    }
  }

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

  <!-- #53: toggle push PWA -->
  {#if pushSupported}
    <section class="mb-8 rounded-sys-app border border-[var(--sys-border-subtle)] bg-white p-4 shadow-sys-card">
      <h2 class="mb-2 font-semibold text-sys-profundo">Notificaciones push</h2>
      <p class="mb-4 text-sm text-[var(--sys-text-muted-light)]">
        Recibí avisos de auditorías en tu dispositivo aunque la app esté cerrada.
      </p>
      <div class="flex items-center gap-3">
        <button
          type="button"
          onclick={togglePush}
          disabled={pushLoading || pushSubscribed === null}
          class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50"
          class:bg-sys-profundo={pushSubscribed}
          class:bg-gray-200={!pushSubscribed}
          role="switch"
          aria-checked={pushSubscribed ?? false}
          aria-label="Activar notificaciones push"
          data-testid="push-toggle"
        >
          <span
            class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out"
            class:translate-x-5={pushSubscribed}
            class:translate-x-0={!pushSubscribed}
          ></span>
        </button>
        <span class="text-sm text-sys-profundo">
          {#if pushSubscribed === null}
            Cargando…
          {:else if pushSubscribed}
            Activadas en este dispositivo
          {:else}
            Desactivadas en este dispositivo
          {/if}
        </span>
      </div>
    </section>
  {/if}

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
