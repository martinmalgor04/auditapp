import {
  countItAreasRelevadas,
  e,
  field,
  footer,
  hayAlgunaNormaIt,
  LOGO_VERT_URL,
  renderCircuitoCards,
  renderCierrePage,
  renderGaugeCover,
  renderGaugeIt,
  renderHallazgosScoreRows,
  renderLecturaTransversal,
  renderLoomBlock,
  renderMetodologiaBlock,
  renderPlanPage,
  renderRiesgosPage,
  renderStatCircuitos,
  tipoLabel,
  tituloPortada,
  wrapInforme,
  type InformeRenderModel,
  type RenderOptions
} from './render-shared';
import { formatDuracion } from './visita';

export function renderInformeIt(model: InformeRenderModel, opts: RenderOptions = {}): string {
  const d = model.draft;
  const areasCount = countItAreasRelevadas(model);

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
    ${renderGaugeCover(model)}
    <div class="meta">Áreas relevadas: ${areasCount}<br>${e(model.fechaInforme)}</div>${model.visita ? `\n    <p class="visita">${e(model.visita.inicio)}–${e(model.visita.fin)} · ${e(formatDuracion(model.visita.duracionMin))}</p>` : ''}
  </div>
</section>`;

  const resumen = `
<section class="page">
  <div class="eyebrow">01 · Resumen ejecutivo</div>
  <h2>${field('resumen.diagnostico', d.resumen.diagnostico, opts)}</h2>
  <p class="lead">${field('resumen.lead', d.resumen.lead, opts)}</p>
  <div style="height:5mm"></div>
  <div class="stats">
    <div class="stat" data-canonical="gauge">${renderGaugeIt(model)}</div>
    <div class="stat">
      ${renderStatCircuitos(model, opts)}
      <div class="label">áreas con controles internos aplicados</div>
    </div>
    <div class="stat">
      <div class="num">${areasCount}</div>
      <div class="label">áreas relevadas</div>
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

  const filas = renderHallazgosScoreRows(model, opts, 'it');
  const lectura = renderLecturaTransversal(d, opts);
  const metodologia = hayAlgunaNormaIt(model) ? renderMetodologiaBlock('it') : '';

  const hallazgos = `
<section class="page">
  <div class="eyebrow">02 · Hallazgos por área</div>
  <h2>Qué encontramos, área por área</h2>
  <p class="muted">Cada área se evaluó en tres dimensiones: proceso documentado, controles internos y madurez operativa.</p>
  <div class="score-list">${filas}</div>
  <div style="height:8mm"></div>
  <h3>Lectura transversal</h3>
  <ul class="clean">${lectura}</ul>
  ${metodologia}
  ${footer('03')}
</section>`;

  const circuitoCards = renderCircuitoCards(model, opts, 'it');

  const mejoras = `
<section class="page">
  <div class="eyebrow">05 · Mejoras prioritarias</div>
  <h2>Lo que tu infraestructura necesita<br>y hoy no tiene</h2>
  <p class="muted">${field('dia_a_dia.intro', d.dia_a_dia.intro, opts)}</p>
  <div style="height:4mm"></div>
  <div class="fix-grid">${circuitoCards}</div>
  ${
    d.dia_a_dia.callout_transversal !== null
      ? `<div style="height:4mm"></div><div class="callout"><p>${field('dia_a_dia.callout_transversal', d.dia_a_dia.callout_transversal, opts)}</p></div>`
      : ''
  }
  ${footer('06')}
</section>`;

  return wrapInforme(
    'it',
    `${portada}${resumen}${hallazgos}${renderRiesgosPage(model, opts, '04', '03 · Riesgos priorizados')}${renderPlanPage(model, opts, '05', '04 · Recomendación y plan')}${mejoras}${renderCierrePage(model, opts, '06 · Próximos pasos')}`,
    renderLoomBlock(model)
  );
}

/** Página 3 IT para composición mixta (lectura transversal incluida). */
export function renderHallazgosItPage(
  model: InformeRenderModel,
  opts: RenderOptions,
  pagenum: string
): string {
  const d = model.draft;
  const filas = renderHallazgosScoreRows(model, opts, 'it');
  const lectura = renderLecturaTransversal(d, opts);
  const metodologia = hayAlgunaNormaIt(model) ? renderMetodologiaBlock('mixta') : '';

  return `
<section class="page">
  <div class="eyebrow">02 · Hallazgos por área (IT)</div>
  <h2>Qué encontramos en infraestructura y seguridad</h2>
  <p class="muted">Cada área se evaluó en tres dimensiones: proceso documentado, controles internos y madurez operativa.</p>
  <div class="score-list">${filas}</div>
  <div style="height:8mm"></div>
  <h3>Lectura transversal</h3>
  <ul class="clean">${lectura}</ul>
  ${metodologia}
  ${footer(pagenum)}
</section>`;
}

/** Página 6 IT para composición mixta. */
export function renderMejorasItPage(
  model: InformeRenderModel,
  opts: RenderOptions,
  pagenum: string,
  eyebrow: string
): string {
  const d = model.draft;
  const circuitoCards = renderCircuitoCards(model, opts, 'it');

  return `
<section class="page">
  <div class="eyebrow">${eyebrow}</div>
  <h2>Lo que tu infraestructura necesita<br>y hoy no tiene</h2>
  <p class="muted">${field('dia_a_dia.intro', d.dia_a_dia.intro, opts)}</p>
  <div style="height:4mm"></div>
  <div class="fix-grid">${circuitoCards}</div>
  ${
    d.dia_a_dia.callout_transversal !== null
      ? `<div style="height:4mm"></div><div class="callout"><p>${field('dia_a_dia.callout_transversal', d.dia_a_dia.callout_transversal, opts)}</p></div>`
      : ''
  }
  ${footer(pagenum)}
</section>`;
}
