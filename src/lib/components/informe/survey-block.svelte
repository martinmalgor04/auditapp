<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SurveyState, SurveyResponseView } from '$lib/server/informe/survey';

  let { survey, token }: { survey: SurveyState; token: string } = $props();

  // Estado local: arranca del load (respondida si ya existe) y conmuta tras enviar.
  let respondida = $state(survey.estado === 'respondida');
  let respuesta: SurveyResponseView | null = $state(
    survey.estado === 'respondida' ? survey.respuesta : null
  );
  let mensajeError = $state('');
  let enviando = $state(false);

  let valoracion = $state(0);
  let claridad = $state(0);
  let conforme: 'true' | 'false' | '' = $state('');
  let comentario = $state('');

  const escalas = [1, 2, 3, 4, 5];

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

<section class="survey" data-testid="survey-block">
  <h2 class="survey-title">Tu conformidad con el informe</h2>

  {#if respondida && respuesta}
    <div class="survey-thanks" data-testid="survey-thanks">
      <p class="survey-thanks-lead">¡Gracias por tu respuesta!</p>
      <dl class="survey-summary">
        <div>
          <dt>Valoración general</dt>
          <dd data-testid="survey-summary-valoracion">{respuesta.valoracion_global} / 5</dd>
        </div>
        <div>
          <dt>Claridad del informe</dt>
          <dd>{respuesta.claridad_informe} / 5</dd>
        </div>
        <div>
          <dt>Conforme con los hallazgos</dt>
          <dd>{respuesta.conforme_hallazgos ? 'Sí' : 'No'}</dd>
        </div>
        {#if respuesta.comentario}
          <div class="survey-summary-comment">
            <dt>Comentario</dt>
            <dd>{respuesta.comentario}</dd>
          </div>
        {/if}
        <div>
          <dt>Respondida</dt>
          <dd>{fecha(respuesta.submitted_at)}</dd>
        </div>
      </dl>
    </div>
  {:else}
    <p class="survey-intro">
      Tu opinión nos ayuda a mejorar. Lleva menos de un minuto.
    </p>

    {#if mensajeError}
      <p class="survey-error" role="alert" data-testid="survey-error">{mensajeError}</p>
    {/if}

    <form
      method="POST"
      action="/informe/{token}?/responder"
      data-testid="survey-form"
      use:enhance={() => {
        enviando = true;
        mensajeError = '';
        return ({ result }) => {
          enviando = false;
          if (result.type === 'success' && result.data?.ok) {
            respondida = true;
            respuesta = (result.data.encuesta as { respuesta: SurveyResponseView }).respuesta;
          } else if (result.type === 'failure') {
            mensajeError =
              (result.data?.mensaje as string) ?? 'No pudimos registrar tu respuesta.';
          } else if (result.type === 'error') {
            mensajeError = 'Este enlace ya no está disponible.';
          }
        };
      }}
    >
      <fieldset class="survey-field">
        <legend>¿Cómo valorás el informe en general?</legend>
        <div class="survey-scale" role="radiogroup">
          {#each escalas as n (n)}
            <label class="survey-scale-opt" class:selected={valoracion === n}>
              <input
                type="radio"
                name="valoracion_global"
                value={n}
                bind:group={valoracion}
                required
              />
              <span>{n}</span>
            </label>
          {/each}
        </div>
      </fieldset>

      <fieldset class="survey-field">
        <legend>¿Qué tan claro te resultó el informe?</legend>
        <div class="survey-scale" role="radiogroup">
          {#each escalas as n (n)}
            <label class="survey-scale-opt" class:selected={claridad === n}>
              <input
                type="radio"
                name="claridad_informe"
                value={n}
                bind:group={claridad}
                required
              />
              <span>{n}</span>
            </label>
          {/each}
        </div>
      </fieldset>

      <fieldset class="survey-field">
        <legend>¿Estás conforme con los hallazgos?</legend>
        <div class="survey-toggle">
          <label class="survey-toggle-opt" class:selected={conforme === 'true'}>
            <input type="radio" name="conforme_hallazgos" value="true" bind:group={conforme} required />
            <span>Sí</span>
          </label>
          <label class="survey-toggle-opt" class:selected={conforme === 'false'}>
            <input type="radio" name="conforme_hallazgos" value="false" bind:group={conforme} required />
            <span>No</span>
          </label>
        </div>
      </fieldset>

      <label class="survey-field survey-comment">
        <span class="survey-legend">Comentario (opcional)</span>
        <textarea
          name="comentario"
          rows="3"
          maxlength="2000"
          placeholder="Si querés, contanos algo más…"
          bind:value={comentario}
        ></textarea>
      </label>

      <button type="submit" class="survey-submit" data-testid="survey-submit" disabled={enviando}>
        {enviando ? 'Enviando…' : 'Enviar respuesta'}
      </button>
    </form>
  {/if}
</section>

<style>
  .survey {
    max-width: 820px;
    margin: 32px auto 96px;
    padding: 28px 32px;
    background: #fff;
    border: 1px solid rgba(0, 0, 0, 0.08);
    border-radius: 6px;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.05);
    font-family: var(--sys-font, 'Montserrat', Arial, sans-serif);
    color: var(--sys-azul-noche, #0d1b2a);
  }
  .survey-title {
    font-size: 18px;
    font-weight: 700;
    margin: 0 0 6px;
    color: var(--sys-azul-electrico, #2196f3);
  }
  .survey-intro {
    font-size: 14px;
    color: var(--sys-medio, #5a6b7b);
    margin: 0 0 20px;
  }
  .survey-field {
    border: none;
    margin: 0 0 20px;
    padding: 0;
  }
  .survey-field legend,
  .survey-legend {
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 8px;
    padding: 0;
  }
  .survey-scale,
  .survey-toggle {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .survey-scale-opt,
  .survey-toggle-opt {
    cursor: pointer;
    border: 1px solid rgba(0, 0, 0, 0.15);
    border-radius: 4px;
    padding: 8px 16px;
    font-size: 14px;
    font-weight: 600;
    user-select: none;
    transition: all 0.12s ease;
  }
  .survey-scale-opt.selected,
  .survey-toggle-opt.selected {
    background: var(--sys-azul-electrico, #2196f3);
    border-color: var(--sys-azul-electrico, #2196f3);
    color: #fff;
  }
  .survey-scale-opt input,
  .survey-toggle-opt input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }
  .survey-comment {
    display: block;
  }
  .survey-comment textarea {
    width: 100%;
    border: 1px solid rgba(0, 0, 0, 0.15);
    border-radius: 4px;
    padding: 10px;
    font-family: inherit;
    font-size: 14px;
    resize: vertical;
  }
  .survey-submit {
    background: var(--sys-azul-electrico, #2196f3);
    color: #fff;
    font-family: inherit;
    font-size: 14px;
    font-weight: 700;
    border: none;
    padding: 12px 28px;
    border-radius: 3px;
    cursor: pointer;
  }
  .survey-submit:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .survey-error {
    background: rgba(244, 67, 54, 0.08);
    color: var(--sys-rojo, #f44336);
    font-size: 13px;
    padding: 10px 14px;
    border-radius: 4px;
    margin: 0 0 16px;
  }
  .survey-thanks-lead {
    font-size: 16px;
    font-weight: 700;
    color: var(--sys-verde, #4caf50);
    margin: 0 0 12px;
  }
  .survey-summary {
    display: grid;
    gap: 8px;
    margin: 0;
  }
  .survey-summary div {
    display: flex;
    gap: 8px;
    font-size: 14px;
  }
  .survey-summary dt {
    color: var(--sys-medio, #5a6b7b);
    margin: 0;
  }
  .survey-summary dd {
    margin: 0;
    font-weight: 600;
  }
  .survey-summary-comment {
    flex-direction: column;
  }
  @media print {
    .survey {
      display: none;
    }
  }
</style>
