<script lang="ts">
  import { goto } from '$app/navigation';

  const { auditId, onClose } = $props<{ auditId: string; onClose: () => void }>();

  let file: File | null = $state(null);
  let uploading = $state(false);
  let error = $state('');

  async function handleUpload() {
    if (!file) {
      error = 'Selecciona un archivo HTML';
      return;
    }

    uploading = true;
    error = '';

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`/api/audits/${auditId}/report/manual`, {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const parsed = (await res.json().catch(() => null)) as { error?: string } | null;
        error = parsed?.error ?? 'Error en la subida';
        uploading = false;
        return;
      }

      const data = (await res.json()) as { data?: { id: string; version: number } };
      if (data.data?.version) {
        // Navegar a la nueva versión
        await goto(`/auditorias/${auditId}/informe/${data.data.version}`);
        onClose();
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error desconocido';
      uploading = false;
    }
  }

  function handleFileChange(e: Event) {
    const target = e.target as HTMLInputElement;
    file = target.files?.[0] ?? null;
    error = '';
  }
</script>

<div class="dialog-overlay">
  <div class="dialog-content">
    <div class="dialog-header">
      <h3>Subir HTML del informe</h3>
      <button
        type="button"
        class="dialog-close"
        onclick={onClose}
        aria-label="Cerrar"
      >
        ✕
      </button>
    </div>

    <div class="dialog-body">
      <p class="text-sm text-gray-600">
        Sube el archivo HTML que puliste a mano. El archivo se servirá a través
        del link tokenizado de entrega al cliente.
      </p>

      <div class="form-group">
        <label for="html-file" class="form-label">Archivo HTML</label>
        <input
          id="html-file"
          type="file"
          accept=".html"
          onchange={handleFileChange}
          disabled={uploading}
          class="form-input"
        />
        {#if file}
          <p class="text-xs text-gray-500 mt-1">
            Archivo: {file.name} ({(file.size / 1024).toFixed(1)} KB)
          </p>
        {/if}
      </div>

      {#if error}
        <div class="alert alert-error" role="alert">
          {error}
        </div>
      {/if}
    </div>

    <div class="dialog-footer">
      <button
        type="button"
        class="sys-btn-secondary"
        onclick={onClose}
        disabled={uploading}
      >
        Cancelar
      </button>
      <button
        type="button"
        class="sys-btn-primary"
        onclick={handleUpload}
        disabled={!file || uploading}
      >
        {uploading ? 'Subiendo...' : 'Subir'}
      </button>
    </div>
  </div>
</div>

<style>
  .dialog-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .dialog-content {
    background: white;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
    max-width: 500px;
    width: 90%;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
  }

  .dialog-header {
    padding: 1.5rem;
    border-bottom: 1px solid #e5e5e5;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .dialog-header h3 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
  }

  .dialog-close {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: #999;
  }

  .dialog-close:hover {
    color: #333;
  }

  .dialog-body {
    padding: 1.5rem;
    overflow-y: auto;
    flex: 1;
  }

  .form-group {
    margin-bottom: 1.5rem;
  }

  .form-label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 500;
    font-size: 0.875rem;
  }

  .form-input {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 0.875rem;
  }

  .alert {
    padding: 0.75rem;
    border-radius: 4px;
    margin-bottom: 1rem;
    font-size: 0.875rem;
  }

  .alert-error {
    background: #fee;
    color: #c33;
    border: 1px solid #f99;
  }

  .dialog-footer {
    padding: 1rem 1.5rem;
    border-top: 1px solid #e5e5e5;
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
  }
</style>
