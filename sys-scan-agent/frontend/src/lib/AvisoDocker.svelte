<script lang="ts">
  import { InstalarDocker } from '../../wailsjs/go/main/App';

  let { onListo }: { onListo: () => void } = $props();

  let instalando = $state(false);
  let error = $state('');

  async function instalar() {
    instalando = true;
    error = '';
    try {
      await InstalarDocker();
      onListo();
    } catch (e) {
      error = String(e);
    } finally {
      instalando = false;
    }
  }
</script>

<div class="mx-4 mt-4 rounded-sys-app border border-amber-300 bg-amber-50 p-4 text-sm">
  <p class="font-semibold text-sys-profundo">Docker Desktop no está corriendo</p>
  <p class="mt-1 text-sys-neutro">
    El agente lo necesita para el motor de escaneo. Si no lo tenés instalado, lo instalamos ahora:
    se descarga el instalador oficial y Windows/macOS te va a pedir autorización una sola vez.
  </p>
  {#if error}
    <p class="mt-2 rounded-sys bg-red-50 p-2 text-sys-rojo">{error}</p>
  {/if}
  <div class="mt-3 flex gap-2">
    <button class="sys-btn-primary" onclick={instalar} disabled={instalando}>
      {instalando ? 'Instalando… (puede tardar varios minutos)' : 'Instalar / reparar Docker Desktop'}
    </button>
    <button class="sys-btn-secondary" onclick={onListo}>Ya lo abrí, verificar de nuevo</button>
  </div>
</div>
