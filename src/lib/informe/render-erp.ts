import {
  e,
  field,
  footer,
  LOGO_VERT_URL,
  renderCircuitoCards,
  renderCierrePage,
  renderGaugeErp,
  renderHallazgosFilas,
  renderLecturaTransversal,
  renderLoomBlock,
  renderPlanPage,
  renderRiesgosPage,
  renderStatCircuitos,
  tipoLabel,
  tituloPortada,
  wrapInforme,
  type InformeRenderModel,
  type RenderOptions
} from './render-shared';

export function renderInformeErp(model: InformeRenderModel, opts: RenderOptions = {}): string {
  const d = model.draft;
  const modulosLista = model.modulos.join(', ') || '—';

  const portada = `
<section class="page dark cover">
  <div class="circle c1"></div><div class="circle c2"></div>
  <img class="logo-vert" src="${LOGO_VERT_URL}" alt="Servicios y Sistemas">
  <div>
    <div class="eyebrow-cover">Informe de auditoría ${tipoLabel(model.tipoAuditoria)} · ${e(model.periodo)}</div>
    <h1>${tituloPortada(model.tipoAuditoria)}</h1>
    <div style="height:8mm"></div>
    <div class="client">${e(model.cliente.razonSocial)}</div>
    <div class="cuit">${model.cliente.cuit ? `CUIT ${e(model.cliente.cuit)}` : ''}</div>
    <div class="meta">Módulos relevados: ${e(modulosLista)}<br>${e(model.fechaInforme)} · Sistema: ${e(model.sistema)}</div>
  </div>
</section>`;

  const resumen = `
<section class="page">
  <div class="eyebrow">01 · Resumen ejecutivo</div>
  <h2>${field('resumen.diagnostico', d.resumen.diagnostico, opts)}</h2>
  <p class="lead">${field('resumen.lead', d.resumen.lead, opts)}</p>
  <div style="height:5mm"></div>
  <div class="stats">
    <div class="stat" data-canonical="gauge">${renderGaugeErp(model)}</div>
    <div class="stat">
      ${renderStatCircuitos(model, opts)}
      <div class="label">circuitos con controles internos aplicados</div>
    </div>
    <div class="stat">
      <div class="num">${model.modulos.length}</div>
      <div class="label">módulos Tango en uso: ${e(modulosLista)}</div>
    </div>
  </div>
  <div style="height:5mm"></div>
  <p>${field('resumen.interpretacion', d.resumen.interpretacion, opts)}</p>
  <div style="height:3mm"></div>
  <p>Nuestra recomendación: <strong>${field('resumen.recomendacion_central', d.resumen.recomendacion_central, opts)}</strong>.</p>
  ${
    d.resumen.fortalezas !== null
      ? `<div style="height:4mm"></div><div class="callout"><p><strong style="color:var(--sys-verde);">Lo que está bien y vamos a preservar:</strong> ${field('resumen.fortalezas', d.resumen.fortalezas, opts)}</p></div>`
      : ''
  }
  ${footer('02')}
</section>`;

  const filas = renderHallazgosFilas(model, opts);
  const lectura = renderLecturaTransversal(d, opts);

  const hallazgos = `
<section class="page">
  <div class="eyebrow">02 · Hallazgos por circuito</div>
  <h2>Qué encontramos, sección por sección</h2>
  <table>
    <tr><th style="width:42%">Circuito</th><th class="num" style="width:14%">Score</th><th style="width:14%">Doc.</th><th style="width:16%">Controles</th><th style="width:14%">Madurez</th></tr>
    ${filas}
  </table>
  <div style="height:14mm"></div>
  <h3>Lectura transversal</h3>
  <ul class="clean">${lectura}</ul>
  ${footer('03')}
</section>`;

  const circuitoCards = renderCircuitoCards(model, opts);

  const diaADia = `
<section class="page">
  <div class="eyebrow">05 · Qué cambia en el día a día</div>
  <h2>Lo que Tango ya sabe hacer<br>y hoy no se usa</h2>
  <p style="font-size:9.5pt; color:var(--sys-gris-neutro);">${field('dia_a_dia.intro', d.dia_a_dia.intro, opts)}</p>
  <div style="height:4mm"></div>
  <div class="circuitos">${circuitoCards}</div>
  ${
    d.dia_a_dia.callout_transversal !== null
      ? `<div style="height:4mm"></div><div class="callout"><p>${field('dia_a_dia.callout_transversal', d.dia_a_dia.callout_transversal, opts)}</p></div>`
      : ''
  }
  ${footer('06')}
</section>`;

  return wrapInforme(
    'erp',
    `${portada}${resumen}${hallazgos}${renderRiesgosPage(model, opts, '04', '03 · Riesgos priorizados')}${renderPlanPage(model, opts, '05', '04 · Recomendación y plan')}${diaADia}${renderCierrePage(model, opts, '06 · Próximos pasos')}`,
    renderLoomBlock(model)
  );
}
