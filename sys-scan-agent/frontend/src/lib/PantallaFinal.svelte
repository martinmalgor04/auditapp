<script lang="ts">
  import { ExportarLogs } from '../../wailsjs/go/main/App';
  import type { scan } from '../../wailsjs/go/models';

  let { progreso, onNuevo }: {
    progreso: scan.ScanProgreso;
    onNuevo: () => void;
  } = $props();

  let exportado = $state('');

  const titulo = $derived(
    progreso.Fase === 'completado'
      ? '¡Listo! Escaneo completado'
      : progreso.Fase === 'cancelado'
        ? 'Escaneo cancelado'
        : 'El escaneo falló'
  );

  async function exportar() {
    try {
      exportado = await ExportarLogs();
    } catch {
      // diálogo cancelado: no es error
    }
  }
</script>

<section class="mx-auto flex max-w-lg flex-col items-center gap-4 p-6 text-center">
  <div
    class="flex h-16 w-16 items-center justify-center rounded-full text-3xl text-white"
    class:bg-sys-verde={progreso.Fase === 'completado'}
    class:bg-sys-naranja={progreso.Fase === 'cancelado'}
    class:bg-sys-rojo={progreso.Fase === 'fallido'}
  >
    {progreso.Fase === 'completado' ? '✓' : progreso.Fase === 'cancelado' ? '⊘' : '✗'}
  </div>

  <h2 class="text-xl font-semibold text-sys-profundo">{titulo}</h2>

  <p class="text-sm text-sys-neutro">
    {progreso.Sincronizados} equipos sincronizados de {progreso.Encontrados} encontrados.
  </p>

  {#if progreso.Error}
    <p class="w-full rounded-sys bg-red-50 p-3 text-sm text-sys-rojo">{progreso.Error}</p>
  {/if}

  <p class="text-xs text-sys-neutro">
    Las credenciales del cliente ya se borraron de esta notebook y del motor de escaneo.
  </p>

  <div class="flex gap-2">
    <button class="sys-btn-primary" onclick={onNuevo} data-testid="btn-nuevo-escaneo">
      Nuevo escaneo
    </button>
    <button class="sys-btn-secondary" onclick={exportar}>
      {exportado ? 'Logs exportados ✓' : 'Exportar logs'}
    </button>
  </div>
</section>
