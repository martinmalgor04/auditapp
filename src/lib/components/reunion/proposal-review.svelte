<script lang="ts">
  import type { ReunionProposalWithItem } from '$lib/server/db/reunion-proposals';

  type Props = {
    proposals: ReunionProposalWithItem[];
    onAccept: (id: string) => void;
    onReject: (id: string) => void;
    onEdit: (id: string, value: unknown) => void;
  };

  let { proposals, onAccept, onReject, onEdit }: Props = $props();

  // Estado de edición por propuesta
  let editingId = $state<string | null>(null);
  let editValue = $state<string>('');

  function confidenceBadge(confidence: number): { label: string; cls: string } {
    if (confidence >= 0.8) return { label: 'Alta', cls: 'bg-sys-verde/10 text-sys-verde border-sys-verde/30' };
    if (confidence >= 0.5) return { label: 'Media', cls: 'bg-sys-naranja/10 text-sys-naranja border-sys-naranja/30' };
    return { label: 'Baja', cls: 'bg-sys-rojo/10 text-sys-rojo border-sys-rojo/30' };
  }

  function formatValue(proposal: ReunionProposalWithItem): string {
    const val = proposal.proposed_value;
    if (val === null || val === undefined) return '—';
    if (typeof val === 'boolean') return val ? 'Sí' : 'No';
    return String(val);
  }

  function startEdit(proposal: ReunionProposalWithItem) {
    editingId = proposal.id;
    const val = proposal.proposed_value;
    editValue = val !== null && val !== undefined ? String(val) : '';
  }

  function confirmEdit(proposal: ReunionProposalWithItem) {
    // Parsear según field_type
    let parsed: unknown = editValue;
    const ft = proposal.item_field_type;
    if (ft === 'number') {
      parsed = parseFloat(editValue);
    } else if (ft === 'bool') {
      parsed = editValue === 'true' || editValue === '1';
    }
    onEdit(proposal.id, parsed);
    editingId = null;
  }

  function cancelEdit() {
    editingId = null;
    editValue = '';
  }

  function getEditInputType(fieldType: string): string {
    if (fieldType === 'number') return 'number';
    if (fieldType === 'date') return 'date';
    return 'text';
  }
</script>

<div class="space-y-4">
  {#if proposals.length === 0}
    <p class="text-sm text-sys-medio">No se detectaron sugerencias en esta sesión.</p>
  {/if}

  {#each proposals as proposal (proposal.id)}
    {@const badge = confidenceBadge(proposal.confidence)}
    <div class="rounded-sys-app border border-sys-borde bg-white p-4 space-y-3 {proposal.review_status !== 'pending' ? 'opacity-60' : ''}">
      <!-- Header -->
      <div class="flex items-start justify-between gap-2">
        <div class="space-y-0.5 min-w-0">
          <p class="text-xs text-sys-medio">{proposal.section_title}</p>
          <p class="text-sm font-semibold text-sys-oscuro truncate">{proposal.item_label}</p>
        </div>
        <div class="flex shrink-0 flex-col items-end gap-1">
          <span class="rounded border px-2 py-0.5 text-xs font-medium {badge.cls}">
            {badge.label}
          </span>
          {#if proposal.verification_status === 'unverified'}
            <span
              class="rounded border border-sys-naranja/40 bg-sys-naranja/10 px-2 py-0.5 text-xs font-medium text-sys-naranja"
              data-testid="verification-badge"
            >
              No verificada — revisar
            </span>
          {/if}
        </div>
      </div>

      <!-- Valor propuesto -->
      <div class="rounded bg-sys-fondo px-3 py-2">
        <p class="text-xs text-sys-medio mb-0.5">Valor sugerido</p>
        <p class="text-sm font-medium text-sys-oscuro">{formatValue(proposal)}</p>
      </div>

      <!-- Cita -->
      <blockquote class="border-l-2 border-sys-electrico pl-3">
        <p class="text-xs italic text-sys-medio">&ldquo;{proposal.quote}&rdquo;</p>
      </blockquote>

      <!-- Estado si ya revisado -->
      {#if proposal.review_status !== 'pending'}
        <p class="text-xs font-medium {proposal.review_status === 'accepted' || proposal.review_status === 'edited' ? 'text-sys-verde' : 'text-sys-rojo'}">
          {proposal.review_status === 'accepted' ? 'Aceptado' : proposal.review_status === 'edited' ? 'Editado y aceptado' : 'Rechazado'}
        </p>
      {:else}
        <!-- Edición inline -->
        {#if editingId === proposal.id}
          <div class="space-y-2">
            {#if proposal.item_field_type === 'tri'}
              <select bind:value={editValue} class="sys-field">
                <option value="si">Sí</option>
                <option value="no">No</option>
                <option value="parcial">Parcial</option>
              </select>
            {:else if proposal.item_field_type === 'bool'}
              <select bind:value={editValue} class="sys-field">
                <option value="true">Sí</option>
                <option value="false">No</option>
              </select>
            {:else if proposal.item_field_type === 'select'}
              {@const opts = proposal.item_options as { choices?: string[] } | null}
              <select bind:value={editValue} class="sys-field">
                {#each opts?.choices ?? [] as choice}
                  <option value={choice}>{choice}</option>
                {/each}
              </select>
            {:else}
              <input
                type={getEditInputType(proposal.item_field_type)}
                bind:value={editValue}
                class="sys-field"
              />
            {/if}
            <div class="flex gap-2">
              <button
                type="button"
                onclick={() => confirmEdit(proposal)}
                class="min-h-[44px] flex-1 rounded-sys-app bg-sys-electrico px-3 py-2 text-sm font-medium text-white"
              >
                Confirmar edición
              </button>
              <button
                type="button"
                onclick={cancelEdit}
                class="min-h-[44px] rounded-sys-app border border-sys-borde px-3 py-2 text-sm text-sys-medio"
              >
                Cancelar
              </button>
            </div>
          </div>
        {:else}
          <!-- Acciones -->
          <div class="flex gap-2">
            <button
              type="button"
              onclick={() => onAccept(proposal.id)}
              class="min-h-[44px] flex-1 rounded-sys-app bg-sys-verde px-3 py-2 text-sm font-medium text-white"
            >
              Aceptar
            </button>
            <button
              type="button"
              onclick={() => onReject(proposal.id)}
              class="min-h-[44px] flex-1 rounded-sys-app border border-sys-rojo/40 px-3 py-2 text-sm font-medium text-sys-rojo"
            >
              Rechazar
            </button>
            {#if ['text', 'tri', 'select', 'number', 'bool', 'date'].includes(proposal.item_field_type)}
              <button
                type="button"
                onclick={() => startEdit(proposal)}
                class="min-h-[44px] flex-1 rounded-sys-app border border-sys-borde px-3 py-2 text-sm text-sys-medio hover:border-sys-electrico hover:text-sys-electrico"
              >
                Editar
              </button>
            {/if}
          </div>
        {/if}
      {/if}
    </div>
  {/each}
</div>
