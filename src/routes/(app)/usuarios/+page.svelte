<script lang="ts">
  import type { PageData } from './$types';
  import AuditTypeCheckboxes from '$lib/components/backoffice/audit-type-checkboxes.svelte';
  import { AUDIT_TYPE_LABELS, type AuditType } from '$lib/audit-types';

  let { data, form }: { data: PageData; form?: { error?: string; temporaryPassword?: string } } =
    $props();
</script>

<svelte:head>
  <title>Usuarios — auditapp</title>
</svelte:head>

<h1 class="text-2xl font-bold text-sys-profundo mb-6">Usuarios</h1>

{#if form?.error}
  <p class="mb-4 text-sm text-red-600">{form.error}</p>
{/if}

{#if form?.temporaryPassword}
  <p class="mb-4 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-3">
    Contraseña temporal: <code>{form.temporaryPassword}</code>
  </p>
{/if}

<section class="mb-8 rounded-lg border border-[var(--sys-border-subtle)] bg-white p-4">
  <h2 class="font-semibold mb-3">Alta de usuario</h2>
  <form method="POST" action="?/create" class="grid gap-3 sm:grid-cols-2">
    <input type="email" name="email" placeholder="Email" required class="rounded border px-3 py-2 text-sm" />
    <input type="text" name="name" placeholder="Nombre" required class="rounded border px-3 py-2 text-sm" />
    <select name="role" class="rounded border px-3 py-2 text-sm">
      <option value="tecnico">Técnico</option>
      <option value="admin">Admin</option>
    </select>
    <div class="sm:col-span-2">
      <AuditTypeCheckboxes
        legend="Especialidades del técnico"
        hint="Dejá todo desmarcado para acceso a todos los tipos. Los admins ignoran este campo."
      />
    </div>
    <input
      type="text"
      name="temporaryPassword"
      placeholder="Contraseña temporal (opcional)"
      class="rounded border px-3 py-2 text-sm"
    />
    <button type="submit" class="sm:col-span-2 rounded bg-sys-profundo px-4 py-2 text-sm text-white w-fit">
      Crear usuario
    </button>
  </form>
</section>

<div class="space-y-4">
  {#each data.users as user}
    <article class="rounded-lg border border-[var(--sys-border-subtle)] bg-white p-4">
      <form method="POST" action="?/update" class="grid gap-3 sm:grid-cols-4 items-end">
        <input type="hidden" name="userId" value={user.id} />
        <label class="space-y-1">
          <span class="text-xs text-[var(--sys-text-muted-light)]">Email</span>
          <input type="email" name="email" value={user.email} class="w-full rounded border px-2 py-1.5 text-sm" />
        </label>
        <label class="space-y-1">
          <span class="text-xs text-[var(--sys-text-muted-light)]">Nombre</span>
          <input type="text" name="name" value={user.name} class="w-full rounded border px-2 py-1.5 text-sm" />
        </label>
        <label class="space-y-1">
          <span class="text-xs text-[var(--sys-text-muted-light)]">Rol</span>
          <select name="role" class="w-full rounded border px-2 py-1.5 text-sm">
            <option value="tecnico" selected={user.role === 'tecnico'}>Técnico</option>
            <option value="admin" selected={user.role === 'admin'}>Admin</option>
          </select>
        </label>
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" checked={user.active} /> Activo
        </label>
        <div class="sm:col-span-4">
          <AuditTypeCheckboxes
            selected={user.auditTypes ?? []}
            hint={user.role === 'admin'
              ? 'Los admins ven todos los tipos; este campo no aplica.'
              : 'Sin selección = ve todos los tipos.'}
          />
          {#if user.auditTypes && user.auditTypes.length > 0}
            <p class="mt-1 text-xs text-[var(--sys-text-muted-light)]">
              Actual: {user.auditTypes.map((type) => AUDIT_TYPE_LABELS[type as AuditType]).join(', ')}
            </p>
          {/if}
        </div>
        <button type="submit" class="rounded border px-3 py-1.5 text-sm hover:bg-sys-offwhite">Guardar</button>
      </form>
      <div class="flex gap-4 mt-3 pt-3 border-t border-[var(--sys-border-subtle)]">
        <form method="POST" action="?/resetPassword">
          <input type="hidden" name="userId" value={user.id} />
          <input type="hidden" name="email" value={user.email} />
          <button type="submit" class="text-xs text-blue-700 underline">Reset contraseña</button>
        </form>
        {#if user.active}
          <form method="POST" action="?/deactivate">
            <input type="hidden" name="userId" value={user.id} />
            <button type="submit" class="text-xs text-red-700 underline">Desactivar</button>
          </form>
        {/if}
      </div>
    </article>
  {/each}
</div>
