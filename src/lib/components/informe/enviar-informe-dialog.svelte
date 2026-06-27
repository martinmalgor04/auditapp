<script lang="ts">
  /**
   * #51 — Modal de confirmación para enviar el informe al cliente.
   * Emite `sent` con el email destino al completar, o `error` con el mensaje.
   */
  interface Props {
    auditId: string;
    version: number;
    empresaEmail: string;
    onSent: (to: string) => void;
    onError: (message: string) => void;
    onClose: () => void;
  }

  let { auditId, version, empresaEmail, onSent, onError, onClose }: Props = $props();

  let to = $state(empresaEmail);
  let busy = $state(false);
  let validationError = $state('');

  function validateEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  }

  async function handleConfirm() {
    validationError = '';
    const trimmed = to.trim();
    if (!validateEmail(trimmed)) {
      validationError = 'El destinatario no es un email válido.';
      return;
    }

    busy = true;
    try {
      const res = await fetch(`/api/audits/${auditId}/report/${version}/enviar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: trimmed })
      });
      const data = (await res.json()) as { success: boolean; data?: { to: string }; error?: string };
      if (data.success) {
        onSent(trimmed);
      } else {
        onError(data.error ?? 'No se pudo enviar el informe');
      }
    } catch {
      onError('Error de red al enviar el informe');
    } finally {
      busy = false;
    }
  }
</script>

<!-- Overlay -->
<div
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
  role="dialog"
  aria-modal="true"
  aria-label="Enviar informe por email"
>
  <div class="w-full max-w-md rounded-sys-app bg-white p-6 shadow-lg">
    <h2 class="mb-4 text-lg font-semibold text-sys-profundo">Enviar informe por email</h2>

    <p class="mb-4 text-sm text-[var(--sys-text-muted-light)]">
      Se enviará el informe aprobado al siguiente destinatario. Podés editar el email si es necesario.
    </p>

    <label class="mb-4 block space-y-1">
      <span class="text-xs font-medium text-sys-profundo">Destinatario</span>
      <input
        type="email"
        bind:value={to}
        class="w-full rounded-sys-app border border-[var(--sys-border-subtle)] px-3 py-2 text-sm focus:border-sys-electrico focus:outline-none"
        placeholder="email@empresa.com"
        disabled={busy}
        data-testid="enviar-email-input"
      />
      {#if validationError}
        <p class="text-xs text-sys-rojo">{validationError}</p>
      {/if}
    </label>

    <div class="flex justify-end gap-3">
      <button
        type="button"
        onclick={onClose}
        disabled={busy}
        class="rounded-sys-app border border-[var(--sys-border-subtle)] px-4 py-2 text-sm text-sys-profundo hover:bg-gray-50 disabled:opacity-50"
      >
        Cancelar
      </button>
      <button
        type="button"
        onclick={handleConfirm}
        disabled={busy}
        class="rounded-sys-app bg-sys-electrico px-4 py-2 text-sm font-medium text-white hover:bg-sys-electrico/90 disabled:opacity-50"
        data-testid="enviar-confirmar"
      >
        {busy ? 'Enviando…' : 'Enviar informe'}
      </button>
    </div>
  </div>
</div>
