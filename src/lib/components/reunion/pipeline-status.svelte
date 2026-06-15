<script lang="ts">
  type PipelineStatus = 'uploading' | 'processing' | 'ready_for_review' | 'error' | 'reviewed';

  type Props = {
    status: PipelineStatus;
    errorMessage?: string;
  };

  let { status, errorMessage }: Props = $props();

  const STATUS_CONFIG: Record<PipelineStatus, { label: string; description: string; icon: string }> = {
    uploading: {
      label: 'Subiendo audio',
      description: 'El archivo se está transfiriendo...',
      icon: '↑'
    },
    processing: {
      label: 'Procesando',
      description: 'La IA está transcribiendo y analizando la reunión. Puede tardar unos minutos.',
      icon: '⟳'
    },
    ready_for_review: {
      label: 'Listo para revisar',
      description: 'Se detectaron sugerencias de la reunión. Revisalas abajo.',
      icon: '✓'
    },
    reviewed: {
      label: 'Revisión completada',
      description: 'Las sugerencias fueron revisadas y aplicadas al formulario.',
      icon: '✓'
    },
    error: {
      label: 'Error en el procesamiento',
      description: 'Ocurrió un problema al procesar el audio.',
      icon: '!'
    }
  };

  const config = $derived(STATUS_CONFIG[status]);
</script>

<div class="rounded-sys-app border p-4 {status === 'error' ? 'border-sys-rojo/30 bg-sys-rojo/5' : status === 'ready_for_review' || status === 'reviewed' ? 'border-sys-verde/30 bg-sys-verde/5' : 'border-sys-borde bg-sys-fondo'}">
  <div class="flex items-start gap-3">
    {#if status === 'processing' || status === 'uploading'}
      <!-- Spinner -->
      <span class="mt-0.5 inline-block h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-sys-electrico border-t-transparent"></span>
    {:else}
      <span class="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold {status === 'error' ? 'bg-sys-rojo text-white' : 'bg-sys-verde text-white'}">
        {config.icon}
      </span>
    {/if}

    <div class="space-y-0.5">
      <p class="text-sm font-semibold text-sys-oscuro">{config.label}</p>
      <p class="text-sm text-sys-medio">{config.description}</p>
      {#if status === 'error' && errorMessage}
        <p class="mt-1 text-xs text-sys-rojo font-mono">{errorMessage}</p>
      {/if}
    </div>
  </div>
</div>
