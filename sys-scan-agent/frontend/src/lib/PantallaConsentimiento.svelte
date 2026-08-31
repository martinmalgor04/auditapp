<script lang="ts">
  let { onConfirmar, onVolver }: {
    onConfirmar: (nombreCompleto: string) => void;
    onVolver: () => void;
  } = $props();

  let nombre = $state('');
  let error = $state('');

  function confirmar() {
    if (!nombre.trim()) {
      error = 'Anotá quién autoriza: nombre y apellido de la persona del cliente.';
      return;
    }
    onConfirmar(nombre.trim());
  }
</script>

<section class="mx-auto flex max-w-lg flex-col gap-4 p-6">
  <header>
    <h2 class="text-xl font-semibold text-sys-profundo">Consentimiento del cliente</h2>
    <p class="mt-1 text-sm text-sys-neutro">
      Antes de escanear la red, una persona del cliente tiene que autorizarlo.
      Anotá acá quién lo hace (queda registrado en AuditApp con fecha y hora).
    </p>
  </header>

  <label class="flex flex-col gap-1 text-sm">
    <span class="text-sys-neutro">Nombre y apellido de quien autoriza</span>
    <input
      class="sys-field"
      bind:value={nombre}
      placeholder="María Pérez"
      data-testid="input-consentimiento"
    />
  </label>

  {#if error}
    <p class="rounded-sys bg-red-50 p-3 text-sm text-sys-rojo">{error}</p>
  {/if}

  <div class="flex justify-between">
    <button class="sys-btn-secondary" onclick={onVolver}>Volver</button>
    <button class="sys-btn-primary" onclick={confirmar} data-testid="btn-consentimiento">
      Autoriza y comenzar
    </button>
  </div>
</section>
