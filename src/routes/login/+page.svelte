<script lang="ts">
  import type { ActionData } from './$types';

  let { form }: { form: ActionData } = $props();
</script>

<svelte:head>
  <title>Ingresar — auditapp</title>
</svelte:head>

<main class="min-h-screen bg-slate-50 flex items-center justify-center p-6">
  <form method="POST" class="w-full max-w-sm space-y-4 rounded-lg bg-white p-6 shadow-sm border border-slate-200">
    <h1 class="text-2xl font-bold text-slate-900">Ingresar</h1>

    {#if form?.error}
      <p class="text-sm text-red-600" role="alert">{form.error}</p>
    {/if}

    <label class="block space-y-1">
      <span class="text-sm font-medium text-slate-700">Email</span>
      <input
        type="email"
        name="email"
        required
        autocomplete="username"
        class="w-full rounded border border-slate-300 px-3 py-2 text-slate-900"
      />
    </label>

    <label class="block space-y-1">
      <span class="text-sm font-medium text-slate-700">Contraseña</span>
      <input
        type="password"
        name="password"
        required
        autocomplete="current-password"
        class="w-full rounded border border-slate-300 px-3 py-2 text-slate-900"
      />
    </label>

    <button
      type="submit"
      class="w-full rounded bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-800"
    >
      Ingresar
    </button>
  </form>
</main>
