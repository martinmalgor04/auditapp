<script lang="ts">
  import { AudioRecorder, normalizeContentType, extFromMimeType } from '$lib/client/reunion/recorder';

  type Props = {
    onBlob: (blob: Blob, filename: string, contentType: 'audio/webm' | 'audio/mp4' | 'audio/mpeg' | 'audio/x-m4a') => void;
  };

  let { onBlob }: Props = $props();

  let activeTab = $state<'grabar' | 'subir'>('grabar');

  // Grabación
  let recorder: AudioRecorder | null = null;
  let recorderState = $state<'idle' | 'recording' | 'stopped'>('idle');
  let durationMs = $state(0);
  let durationInterval: ReturnType<typeof setInterval> | null = null;
  let recorderError = $state('');

  const MAX_DURATION_MS = 120 * 60 * 1000; // 120 min

  const formattedDuration = $derived(() => {
    const totalSec = Math.floor(durationMs / 1000);
    const h = Math.floor(totalSec / 3600).toString().padStart(2, '0');
    const m = Math.floor((totalSec % 3600) / 60).toString().padStart(2, '0');
    const s = (totalSec % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  });

  async function startRecording() {
    recorderError = '';
    try {
      recorder = new AudioRecorder();
      await recorder.start();
      recorderState = 'recording';
      durationMs = 0;
      durationInterval = setInterval(() => {
        if (recorder) {
          durationMs = recorder.durationMs;
          if (durationMs >= MAX_DURATION_MS) {
            stopRecording();
          }
        }
      }, 500);
    } catch (err) {
      recorderError = err instanceof Error ? err.message : 'No se pudo acceder al micrófono';
      recorderState = 'idle';
    }
  }

  async function stopRecording() {
    if (!recorder) return;
    if (durationInterval) {
      clearInterval(durationInterval);
      durationInterval = null;
    }
    try {
      const result = await recorder.stop();
      recorderState = 'stopped';
      const ct = normalizeContentType(recorder.mimeType);
      onBlob(result.blob, result.filename, ct);
      recorder = null;
    } catch (err) {
      recorderError = err instanceof Error ? err.message : 'Error al detener grabación';
    }
  }

  // Subir archivo
  let fileError = $state('');

  const ACCEPTED_TYPES = ['audio/webm', 'audio/x-m4a', 'audio/mp4', 'audio/mpeg', 'audio/mp3'];
  const MAX_FILE_BYTES = 104_857_600; // 100 MB

  function handleFileChange(e: Event) {
    fileError = '';
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_BYTES) {
      fileError = `El archivo supera el límite de 100 MB (${(file.size / 1024 / 1024).toFixed(1)} MB)`;
      return;
    }

    // Validar por nombre si MIME es genérico
    const mimeFromFile = file.type || '';
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const validExts = ['webm', 'm4a', 'mp3', 'mp4'];
    const validMime = ACCEPTED_TYPES.includes(mimeFromFile);
    const validExt = validExts.includes(ext);

    if (!validMime && !validExt) {
      fileError = 'Formato no soportado. Usá .webm, .m4a o .mp3';
      return;
    }

    // Determinar content type
    let ct: 'audio/webm' | 'audio/mp4' | 'audio/mpeg' | 'audio/x-m4a' = 'audio/webm';
    if (ext === 'm4a') ct = 'audio/x-m4a';
    else if (ext === 'mp3') ct = 'audio/mpeg';
    else if (ext === 'mp4') ct = 'audio/mp4';
    else if (mimeFromFile === 'audio/mp4') ct = 'audio/mp4';
    else if (mimeFromFile === 'audio/mpeg') ct = 'audio/mpeg';

    onBlob(file, file.name, ct);
  }
</script>

<div class="sys-card-pad space-y-4">
  <h2 class="sys-section-title">Audio de la reunión</h2>

  <!-- Tabs -->
  <div class="flex gap-1 border-b border-sys-borde">
    <button
      type="button"
      onclick={() => activeTab = 'grabar'}
      class="px-4 py-2 text-sm font-medium border-b-2 transition-colors {activeTab === 'grabar' ? 'border-sys-electrico text-sys-electrico' : 'border-transparent text-sys-medio hover:text-sys-oscuro'}"
    >
      Grabar
    </button>
    <button
      type="button"
      onclick={() => activeTab = 'subir'}
      class="px-4 py-2 text-sm font-medium border-b-2 transition-colors {activeTab === 'subir' ? 'border-sys-electrico text-sys-electrico' : 'border-transparent text-sys-medio hover:text-sys-oscuro'}"
    >
      Subir archivo
    </button>
  </div>

  {#if activeTab === 'grabar'}
    <div class="space-y-4">
      {#if recorderState === 'idle'}
        <button
          type="button"
          onclick={startRecording}
          class="sys-btn-primary min-h-[44px] w-full"
        >
          Iniciar grabación
        </button>
      {:else if recorderState === 'recording'}
        <div class="flex items-center gap-3">
          <span class="inline-block h-3 w-3 rounded-full bg-sys-rojo animate-pulse"></span>
          <span class="text-sm font-mono text-sys-oscuro">{formattedDuration()}</span>
          {#if durationMs >= MAX_DURATION_MS - 60_000}
            <span class="text-sm text-sys-naranja">Límite 120 min alcanzado</span>
          {/if}
        </div>
        <button
          type="button"
          onclick={stopRecording}
          class="sys-btn-secondary min-h-[44px] w-full"
        >
          Detener grabación
        </button>
      {:else}
        <p class="text-sm text-sys-verde">Grabación completada. El audio se procesará.</p>
      {/if}

      {#if recorderError}
        <p class="text-sm text-sys-rojo" role="alert">{recorderError}</p>
      {/if}
    </div>
  {:else}
    <div class="space-y-3">
      <label class="block">
        <span class="sys-field-label">Archivo de audio (.webm, .m4a, .mp3)</span>
        <input
          type="file"
          accept=".webm,.m4a,.mp3,.mp4,audio/webm,audio/mp4,audio/mpeg"
          onchange={handleFileChange}
          class="mt-1.5 block w-full text-sm text-sys-medio file:mr-3 file:rounded file:border-0 file:bg-sys-borde file:px-3 file:py-2 file:text-sm file:font-medium file:text-sys-oscuro hover:file:bg-sys-borde/70"
        />
      </label>
      <p class="text-xs text-sys-medio">Máximo 100 MB</p>
      {#if fileError}
        <p class="text-sm text-sys-rojo" role="alert">{fileError}</p>
      {/if}
    </div>
  {/if}
</div>
