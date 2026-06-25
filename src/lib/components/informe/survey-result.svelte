<script lang="ts">
  import type { SurveyState } from '$lib/server/informe/survey';

  let { encuesta }: { encuesta: SurveyState | null } = $props();

  function fecha(iso: string): string {
    return new Date(iso).toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
</script>

<!-- Respuesta de la encuesta de conformidad del cliente (#47, R9). Solo admin. -->
<div class="sys-card-pad space-y-3" data-testid="survey-result">
  <h2 class="sys-section-title">Conformidad del cliente</h2>

  {#if encuesta && encuesta.estado === 'respondida'}
    {@const r = encuesta.respuesta}
    <dl class="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
      <div class="flex gap-2">
        <dt class="text-sys-medio">Valoración general:</dt>
        <dd data-testid="survey-result-valoracion">{r.valoracion_global} / 5</dd>
      </div>
      <div class="flex gap-2">
        <dt class="text-sys-medio">Claridad del informe:</dt>
        <dd>{r.claridad_informe} / 5</dd>
      </div>
      <div class="flex gap-2">
        <dt class="text-sys-medio">Conforme con hallazgos:</dt>
        <dd>{r.conforme_hallazgos ? 'Sí' : 'No'}</dd>
      </div>
      <div class="flex gap-2">
        <dt class="text-sys-medio">Respondida:</dt>
        <dd>{fecha(r.submitted_at)}</dd>
      </div>
    </dl>
    {#if r.comentario}
      <div class="text-sm">
        <span class="text-sys-medio">Comentario:</span>
        <p class="mt-1 whitespace-pre-line">{r.comentario}</p>
      </div>
    {/if}
  {:else}
    <p class="text-sm text-sys-medio" data-testid="survey-result-empty">Sin respuesta aún</p>
  {/if}
</div>
