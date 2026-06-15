<script lang="ts">
  type SessionType = 'kickoff' | 'visita' | 'otro';

  type Props = {
    accepted: boolean;
    sessionType: SessionType;
    onConfirm: (opts: { sessionType: SessionType; consentNote: string }) => void;
  };

  let { accepted = $bindable(false), sessionType = $bindable('visita' as SessionType), onConfirm }: Props = $props();

  let consentNote = $state('');

  function handleConfirm() {
    if (!accepted) return;
    onConfirm({ sessionType, consentNote });
  }
</script>

<div class="sys-card-pad space-y-5">
  <h2 class="sys-section-title">Consentimiento de grabación</h2>

  <p class="text-sm text-sys-medio">
    La conversación puede grabarse con autorización del cliente. El audio es procesado por IA
    para extraer datos relevantes de la auditoría. El técnico es responsable de informar y
    obtener el consentimiento verbal antes de iniciar la grabación.
  </p>

  <label class="block space-y-1.5">
    <span class="sys-field-label">Tipo de sesión</span>
    <select bind:value={sessionType} class="sys-field">
      <option value="kickoff">Kickoff</option>
      <option value="visita">Visita técnica</option>
      <option value="otro">Otro</option>
    </select>
  </label>

  <label class="block space-y-1.5">
    <span class="sys-field-label">Nota de consentimiento (opcional)</span>
    <input
      type="text"
      bind:value={consentNote}
      placeholder="Ej: Cliente Juan García autorizó verbalmente"
      class="sys-field"
      maxlength="500"
    />
  </label>

  <label class="flex items-start gap-3 cursor-pointer">
    <input
      type="checkbox"
      bind:checked={accepted}
      class="mt-0.5 h-5 w-5 shrink-0 rounded border-sys-borde accent-sys-electrico"
    />
    <span class="text-sm text-sys-oscuro">
      Confirmo que el cliente autorizó verbalmente la grabación de esta sesión
    </span>
  </label>

  <button
    type="button"
    onclick={handleConfirm}
    disabled={!accepted}
    class="sys-btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed"
  >
    Confirmar y continuar
  </button>
</div>
