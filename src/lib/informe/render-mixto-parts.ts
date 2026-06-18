import {
  e,
  field,
  footer,
  LOGO_VERT_URL,
  renderCircuitoCards,
  renderGaugeCover,
  renderGaugeErpOnly,
  renderGaugeIt,
  renderHallazgosScoreRows,
  renderStatCircuitos,
  tipoLabel,
  tituloPortada,
  type InformeRenderModel,
  type RenderOptions
} from './render-shared';

/** Página 4 ERP para composición mixta (sin lectura transversal). */
export function renderHallazgosErpPage(
  model: InformeRenderModel,
  opts: RenderOptions,
  pagenum: string
): string {
  const filas = renderHallazgosScoreRows(model, opts, 'erp');

  return `
<section class="page">
  <div class="eyebrow">03 · Hallazgos por circuito (ERP)</div>
  <h2>Qué encontramos en los circuitos del ERP</h2>
  <p class="muted">Cada circuito se evaluó en tres dimensiones: proceso documentado, controles internos y madurez operativa.</p>
  <div class="score-list">${filas}</div>
  ${footer(pagenum)}
</section>`;
}

/** Página 8 ERP para composición mixta. */
export function renderDiaADiaErpPage(
  model: InformeRenderModel,
  opts: RenderOptions,
  pagenum: string,
  eyebrow: string
): string {
  const d = model.draft;
  const circuitoCards = renderCircuitoCards(model, opts, 'erp');

  return `
<section class="page">
  <div class="eyebrow">${eyebrow}</div>
  <h2>Lo que Tango ya sabe hacer<br>y hoy no se usa</h2>
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

export function renderResumenMixto(model: InformeRenderModel, opts: RenderOptions): string {
  const d = model.draft;
  const modulosLista = model.modulos.join(', ') || '—';

  return `
<section class="page">
  <div class="eyebrow">01 · Resumen ejecutivo</div>
  <h2>${field('resumen.diagnostico', d.resumen.diagnostico, opts)}</h2>
  <p class="lead">${field('resumen.lead', d.resumen.lead, opts)}</p>
  <div style="height:5mm"></div>
  <div class="stats">
    <div class="stat" data-canonical="gauge">${renderGaugeIt(model)}</div>
    <div class="stat" data-canonical="gauge">${renderGaugeErpOnly(model)}</div>
    <div class="stat">
      ${renderStatCircuitos(model, opts)}
      <div class="label">circuitos/áreas con controles aplicados</div>
    </div>
  </div>
  <div style="height:3mm"></div>
  <div class="stats">
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
}

export function renderPortadaMixta(model: InformeRenderModel): string {
  const modulosLista = model.modulos.join(', ') || '—';

  return `
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
    <div class="meta">Módulos relevados: ${e(modulosLista)}<br>${e(model.fechaInforme)} · Sistema: ${e(model.sistema)}</div>
  </div>
</section>`;
}
