<script lang="ts">
  // Vista interna solo SyS (R17): upsell_findings del snapshot + recomendaciones internas.
  type Recomendacion = {
    linea: string;
    rango_estimado: string;
    urgencia: string;
    probabilidad_cierre: string;
    candidato_financiacion: boolean;
    candidato_abono: boolean;
    justificacion: string;
  };

  let {
    upsellFindings,
    internalDraft
  }: {
    upsellFindings: Array<{ text: string }>;
    internalDraft: { recomendaciones_presupuesto: Recomendacion[] } | null;
  } = $props();
</script>

<div class="space-y-6" data-testid="internal-view">
  <section>
    <h3 class="mb-2 text-sm font-bold uppercase tracking-wide text-sys-medio">
      Hallazgos de upsell (internos)
    </h3>
    {#if upsellFindings.length === 0}
      <p class="text-sm text-sys-gris">Sin hallazgos internos.</p>
    {:else}
      <ul class="list-disc space-y-1 pl-5 text-sm">
        {#each upsellFindings as finding}
          <li>{finding.text}</li>
        {/each}
      </ul>
    {/if}
  </section>

  <section>
    <h3 class="mb-2 text-sm font-bold uppercase tracking-wide text-sys-medio">
      Recomendaciones de presupuesto
    </h3>
    {#if !internalDraft}
      <p class="text-sm text-sys-gris">Todavía no hay salida interna generada.</p>
    {:else}
      <div class="space-y-3">
        {#each internalDraft.recomendaciones_presupuesto as rec}
          <div class="rounded-sys border border-sys-offwhite bg-white p-4 shadow-sm">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <strong class="text-sys-profundo">{rec.linea}</strong>
              <span class="font-semibold text-sys-electrico">{rec.rango_estimado}</span>
            </div>
            <p class="mt-1 text-sm text-sys-medio">{rec.justificacion}</p>
            <div class="mt-2 flex flex-wrap gap-2 text-xs">
              <span class="rounded-sys bg-sys-offwhite px-2 py-0.5">Urgencia: {rec.urgencia}</span>
              <span class="rounded-sys bg-sys-offwhite px-2 py-0.5">
                Prob. cierre: {rec.probabilidad_cierre}
              </span>
              {#if rec.candidato_financiacion}
                <span class="rounded-sys bg-sys-electrico/10 px-2 py-0.5 text-sys-electrico">
                  Candidato a financiación
                </span>
              {/if}
              {#if rec.candidato_abono}
                <span class="rounded-sys bg-sys-verde/10 px-2 py-0.5 text-sys-verde">
                  Candidato a abono
                </span>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </section>
</div>
