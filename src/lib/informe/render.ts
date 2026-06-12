/**
 * Render imprimible del informe IA (R26): implementación del template A4 oficial
 * `docs/plantillas/informe/template_informe_pdf_a4_v1.html` como HTML generado.
 * Módulo puro (sin deps server): lo consumen report-render.svelte y el snapshot test.
 */

export const LOGO_VERT_URL =
  'https://pub-9195f8a94602486395419c2bb7beab6b.r2.dev/LOGOS/sys_vertical_w.png';
export const LOGO_COLOR_URL =
  'https://pub-9195f8a94602486395419c2bb7beab6b.r2.dev/LOGOS/sys_horizontal_b.png';

export type RenderSemaphore = 'green' | 'amber' | 'red';

type IndexWithSemaphore = { valor: number; semaforo: RenderSemaphore };

export type RenderClientDraft = {
  resumen: {
    diagnostico: string;
    lead: string;
    circuitos_con_controles: { n: number; total: number } | null;
    interpretacion: string;
    recomendacion_central: string;
    fortalezas: string | null;
  };
  indices: { it?: IndexWithSemaphore; erp?: IndexWithSemaphore };
  hallazgos: {
    circuitos: Array<{ seccion_code: string; doc: string; controles: string; madurez: string }>;
    lectura_transversal: Array<{ titulo: string; detalle: string }>;
  };
  riesgos: {
    intro: string;
    items: Array<{ titulo: string; descripcion: string; evidencia: string; severidad: string }>;
  };
  plan: {
    titulo: string;
    descripcion: string;
    etapas: Array<{ semana: string; titulo: string; descripcion: string }>;
    necesitamos_cliente: string[];
    no_incluye: string[];
  };
  dia_a_dia: {
    intro: string;
    circuitos: Array<{
      seccion_code: string;
      funcionalidades: Array<{ nombre: string; que_resuelve: string }>;
    }>;
    callout_transversal: string | null;
  };
  proximos_pasos: string[];
};

export type InformeRenderModel = {
  cliente: { razonSocial: string; cuit: string | null; rubro: string | null };
  periodo: string;
  fechaInforme: string;
  tipoAuditoria: 'erp' | 'it' | 'mixta';
  modulos: string[];
  sistema: string;
  secciones: Array<{
    code: string;
    title: string;
    score: number | null;
    semaforo: RenderSemaphore | null;
  }>;
  draft: RenderClientDraft;
  loomUrl: string | null;
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const e = escapeHtml;

/** Semáforo → clase de dot del template: green/.ok · amber/.orange/.warn · red/.bad. */
export function semaphoreToDotClass(s: RenderSemaphore): 'green' | 'orange' | 'red' {
  return s === 'green' ? 'green' : s === 'amber' ? 'orange' : 'red';
}

export function semaphoreToNumClass(s: RenderSemaphore): 'ok' | 'warn' | 'bad' {
  return s === 'green' ? 'ok' : s === 'amber' ? 'warn' : 'bad';
}

const SEM_COLOR: Record<RenderSemaphore, string> = {
  green: 'var(--sys-verde)',
  amber: 'var(--sys-naranja)',
  red: 'var(--sys-rojo)'
};

/** stroke-dasharray del gauge: valor × 2.514 sobre 251.4 (template). */
export function gaugeDasharray(valor: number): string {
  return `${(valor * 2.514).toFixed(1)} 251.4`;
}

export type RenderOptions = { editMode?: boolean };

/** Bloque de texto del draft: data-field siempre; contenteditable solo en edición (R30). */
function field(path: string, text: string, opts: RenderOptions, tag = 'span'): string {
  const editable = opts.editMode ? ' contenteditable="true"' : '';
  return `<${tag} data-field="${e(path)}"${editable}>${e(text)}</${tag}>`;
}

function tituloPortada(tipo: InformeRenderModel['tipoAuditoria']): string {
  if (tipo === 'it') return 'Auditoría<br>IT';
  if (tipo === 'mixta') return 'Auditoría<br>IT + ERP';
  return 'Auditoría<br>ERP';
}

function tipoLabel(tipo: InformeRenderModel['tipoAuditoria']): string {
  if (tipo === 'it') return 'IT';
  if (tipo === 'mixta') return 'IT + ERP';
  return 'ERP';
}

const STYLE = `
<style>
.informe-a4 { font-family: var(--sys-font, 'Montserrat', Arial, sans-serif); color: var(--sys-azul-profundo); }
.informe-a4 *, .informe-a4 *::before, .informe-a4 *::after { margin:0; padding:0; box-sizing:border-box; }
.informe-a4 .page {
  width:210mm; min-height:297mm; max-height:297mm; overflow:hidden;
  padding:18mm 18mm 14mm; font-size:10.5pt; line-height:1.55;
  color:var(--sys-azul-profundo); background:#fff;
  border-top:6mm solid var(--sys-azul-electrico); position:relative; page-break-after:always;
  margin:0 auto;
}
.informe-a4 .page:last-of-type { page-break-after:auto; }
.informe-a4 .page.dark {
  background: var(--sys-bg-gradient, linear-gradient(135deg, var(--sys-azul-profundo) 0%, #0F2238 60%, var(--sys-azul-medio) 100%));
  color:#fff; display:flex; flex-direction:column; justify-content:space-between;
}
.informe-a4 .page.dark .eyebrow { color: var(--sys-celeste); }
.informe-a4 .eyebrow { font-size:8pt; font-weight:700; letter-spacing:3pt; text-transform:uppercase; color:var(--sys-azul-electrico); margin-bottom:5mm; }
.informe-a4 h1 { font-size:34pt; font-weight:800; letter-spacing:-1pt; line-height:1.05; color:#fff; }
.informe-a4 h2 { font-size:20pt; font-weight:800; letter-spacing:-0.5pt; color:var(--sys-azul-profundo); margin-bottom:5mm; line-height:1.1; }
.informe-a4 h3 { font-size:13pt; font-weight:700; color:var(--sys-azul-profundo); margin-bottom:3mm; }
.informe-a4 p { font-size:10.5pt; line-height:1.6; }
.informe-a4 .lead { font-size:12pt; line-height:1.6; color:var(--sys-azul-medio); }
.informe-a4 strong { font-weight:700; }
.informe-a4 .footer { position:absolute; bottom:10mm; left:18mm; right:18mm; display:flex; justify-content:space-between; align-items:center; padding-top:3mm; border-top:0.3mm solid rgba(0,0,0,0.1); }
.informe-a4 .footer img { height:7mm; }
.informe-a4 .pagenum { font-size:8pt; font-weight:700; color:var(--sys-gris-neutro); letter-spacing:1pt; }
.informe-a4 .stats { display:flex; gap:5mm; margin:6mm 0; }
.informe-a4 .stat { flex:1; background:#fff; border-top:2mm solid var(--sys-azul-electrico); border-radius:1mm; padding:5mm 4mm 6mm; box-shadow:0 2mm 6mm rgba(0,0,0,0.08); text-align:center; }
.informe-a4 .stat .num { font-size:38pt; font-weight:800; letter-spacing:-1pt; color:var(--sys-azul-electrico); line-height:1; }
.informe-a4 .stat .num.bad { color:var(--sys-rojo); }
.informe-a4 .stat .num.warn { color:var(--sys-naranja); }
.informe-a4 .stat .num.ok { color:var(--sys-verde); }
.informe-a4 .stat .num small { font-size:16pt; color:var(--sys-gris-neutro); font-weight:600; }
.informe-a4 .stat .label { font-size:8.5pt; font-weight:600; color:var(--sys-azul-medio); margin-top:2mm; line-height:1.35; }
.informe-a4 table { width:100%; border-collapse:collapse; margin-top:4mm; font-size:9.5pt; }
.informe-a4 th { text-align:left; font-size:8pt; font-weight:700; letter-spacing:1pt; text-transform:uppercase; color:var(--sys-gris-neutro); border-bottom:0.5mm solid rgba(0,0,0,0.12); padding:2.5mm 3mm; }
.informe-a4 th.num, .informe-a4 td.num { text-align:center; }
.informe-a4 tr:nth-child(even) td { background:var(--sys-offwhite); }
.informe-a4 td { padding:2.8mm 3mm; border-bottom:0.3mm solid rgba(0,0,0,0.06); }
.informe-a4 .dot { display:inline-block; width:2.2mm; height:2.2mm; border-radius:50%; margin-right:1.5mm; vertical-align:middle; }
.informe-a4 .dot.red { background:var(--sys-rojo); }
.informe-a4 .dot.orange { background:var(--sys-naranja); }
.informe-a4 .dot.green { background:var(--sys-verde); }
.informe-a4 .score-pill { font-weight:800; font-size:10pt; }
.informe-a4 .risks { display:grid; grid-template-columns:1fr 1fr; gap:4mm; margin-top:4mm; }
.informe-a4 .risk { background:var(--sys-offwhite); border-left:3mm solid var(--sys-rojo); border-radius:1mm; padding:4mm 4.5mm; }
.informe-a4 .risk .n { font-size:7.5pt; font-weight:700; letter-spacing:2pt; text-transform:uppercase; color:var(--sys-rojo); margin-bottom:2mm; }
.informe-a4 .risk h3 { font-size:11pt; margin-bottom:2mm; }
.informe-a4 .risk p { font-size:9pt; color:#3a4a5a; line-height:1.5; }
.informe-a4 .risk .ev { font-size:8pt; color:var(--sys-gris-neutro); margin-top:2.5mm; }
.informe-a4 .callout { background:rgba(33,150,243,0.06); border:0.3mm solid rgba(33,150,243,0.3); border-left:3mm solid var(--sys-azul-electrico); border-radius:1mm; padding:4mm 5mm; margin:5mm 0; }
.informe-a4 .callout p { font-size:10pt; }
.informe-a4 .timeline { display:grid; grid-template-columns:repeat(6,1fr); gap:3mm; margin-top:6mm; position:relative; }
.informe-a4 .timeline::before { content:''; position:absolute; top:3.5mm; left:8%; right:8%; height:0.5mm; background:rgba(33,150,243,0.25); }
.informe-a4 .tl-item { text-align:center; position:relative; }
.informe-a4 .tl-dot { width:7mm; height:7mm; border-radius:50%; background:var(--sys-azul-electrico); margin:0 auto 3mm; border:1mm solid #fff; position:relative; z-index:1; box-shadow:0 0 0 0.5mm rgba(33,150,243,0.3); }
.informe-a4 .tl-week { font-size:7pt; font-weight:700; letter-spacing:1pt; text-transform:uppercase; color:var(--sys-azul-electrico); margin-bottom:2mm; }
.informe-a4 .tl-item h3 { font-size:9pt; font-weight:700; margin-bottom:1.5mm; }
.informe-a4 .tl-item p { font-size:8pt; color:#4a5a6a; line-height:1.45; }
.informe-a4 .circuitos { display:grid; grid-template-columns:1fr 1fr; gap:4mm; margin:4mm 0; }
.informe-a4 .circuito { background:var(--sys-offwhite); border-left:2.5mm solid var(--sys-azul-electrico); border-radius:1mm; padding:4mm 4.5mm; }
.informe-a4 .circuito h3 { font-size:10.5pt; margin-bottom:2mm; }
.informe-a4 .circuito ul { list-style:none; }
.informe-a4 .circuito li { font-size:9pt; line-height:1.5; color:#2a3a4a; padding-left:3.5mm; position:relative; margin-bottom:1.5mm; }
.informe-a4 .circuito li::before { content:''; position:absolute; left:0; top:2.2mm; width:1.8mm; height:1.8mm; background:var(--sys-azul-electrico); border-radius:0.3mm; }
.informe-a4 .cover { padding:22mm 20mm; }
.informe-a4 .cover .logo-vert { height:28mm; margin-bottom:auto; display:block; }
.informe-a4 .cover .eyebrow-cover { font-size:9pt; font-weight:700; letter-spacing:3pt; text-transform:uppercase; color:var(--sys-celeste); margin-bottom:6mm; }
.informe-a4 .cover h1 { margin-bottom:8mm; }
.informe-a4 .cover .client { font-size:18pt; font-weight:700; color:var(--sys-celeste); margin-bottom:2mm; }
.informe-a4 .cover .cuit { font-size:10pt; color:rgba(255,255,255,0.5); margin-bottom:10mm; }
.informe-a4 .cover .meta { font-size:9pt; color:rgba(255,255,255,0.55); line-height:2; }
.informe-a4 .circle { position:absolute; border-radius:50%; border:1px solid var(--sys-celeste); opacity:0.06; pointer-events:none; }
.informe-a4 .c1 { width:130mm; height:130mm; top:-40mm; right:-50mm; }
.informe-a4 .c2 { width:90mm; height:90mm; bottom:-30mm; left:-35mm; }
.informe-a4 .backcover { display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:22mm 20mm; }
.informe-a4 .backcover .logo-vert { height:28mm; margin-bottom:10mm; }
.informe-a4 .backcover .firma { font-size:22pt; font-weight:800; letter-spacing:-0.5pt; color:#fff; margin-bottom:10mm; }
.informe-a4 .backcover .contact { font-size:9pt; color:rgba(255,255,255,0.6); line-height:2; }
.informe-a4 ul.clean { list-style:none; }
.informe-a4 ul.clean li { padding-left:5mm; position:relative; margin-bottom:2.5mm; font-size:10pt; }
.informe-a4 ul.clean li::before { content:''; position:absolute; left:0; top:2.2mm; width:2mm; height:2mm; background:var(--sys-azul-electrico); }
.informe-a4 .twocol { display:grid; grid-template-columns:1fr 1fr; gap:6mm; margin-top:4mm; }
.informe-a4 .twocol h3 { font-size:11pt; margin-bottom:2mm; }
.informe-a4 .twocol ul.clean li { font-size:9pt; }
.informe-a4 .informe-loom { max-width:210mm; margin:8mm auto; }
.informe-a4 .informe-loom iframe { width:100%; aspect-ratio:16/9; border:0; border-radius:2mm; }
.informe-a4 [contenteditable="true"] { outline:1px dashed var(--sys-azul-electrico); outline-offset:2px; min-width:1em; display:inline-block; }
.informe-a4 [data-field].informe-field-error { outline:2px solid var(--sys-rojo); }
@media print {
  .informe-a4 .stat { box-shadow:none; border:0.3mm solid rgba(0,0,0,0.1); border-top:2mm solid var(--sys-azul-electrico); }
  .informe-a4 .informe-loom { display:none; }
}
</style>`;

function footer(pagenum: string): string {
  return `<div class="footer"><img src="${LOGO_COLOR_URL}" alt="SyS"><span class="pagenum">${pagenum}</span></div>`;
}

function renderStatCircuitos(model: InformeRenderModel, opts: RenderOptions): string {
  const cc = model.draft.resumen.circuitos_con_controles;
  if (cc === null) {
    // Decisión puerta 8: sin evidencia → placeholder «a editar».
    return `<div class="num warn" data-field="resumen.circuitos_con_controles"><small>a editar</small></div>`;
  }
  void opts;
  return `<div class="num warn" data-field="resumen.circuitos_con_controles">${cc.n}<small>&nbsp;de&nbsp;${cc.total}</small></div>`;
}

function renderGauge(model: InformeRenderModel): string {
  const indices = model.draft.indices;
  const index = indices.erp ?? indices.it ?? null;
  const label = indices.erp ? 'Índice ERP general' : 'Índice IT general';
  if (!index) {
    return `<div class="num"><small>s/d</small></div><div class="label">Índice general</div>`;
  }
  const color = SEM_COLOR[index.semaforo];
  return `
    <svg viewBox="0 0 200 112" style="max-width:54mm; width:100%; margin:0 auto; display:block;">
      <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="rgba(0,0,0,0.08)" stroke-width="14" stroke-linecap="round"/>
      <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="${color}" stroke-width="14" stroke-linecap="round" stroke-dasharray="${gaugeDasharray(index.valor)}"/>
      <text x="100" y="84" text-anchor="middle" font-family="Montserrat,Arial" font-weight="800" font-size="46" fill="${color}" letter-spacing="-1">${index.valor}</text>
      <text x="100" y="104" text-anchor="middle" font-family="Montserrat,Arial" font-weight="600" font-size="12" fill="#908A82">de 100</text>
    </svg>
    <div class="label">${label}</div>`;
}

export function renderInformeHtml(model: InformeRenderModel, opts: RenderOptions = {}): string {
  const d = model.draft;
  const sectionByCode = new Map(model.secciones.map((s) => [s.code, s]));
  const modulosLista = model.modulos.join(', ') || '—';

  // Página 1 · portada
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

  // Página 2 · resumen ejecutivo
  const resumen = `
<section class="page">
  <div class="eyebrow">01 · Resumen ejecutivo</div>
  <h2>${field('resumen.diagnostico', d.resumen.diagnostico, opts)}</h2>
  <p class="lead">${field('resumen.lead', d.resumen.lead, opts)}</p>
  <div style="height:5mm"></div>
  <div class="stats">
    <div class="stat" data-canonical="gauge">${renderGauge(model)}</div>
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

  // Página 3 · hallazgos por circuito (scores del snapshot, R12)
  const filas = d.hallazgos.circuitos
    .map((c, i) => {
      const sec = sectionByCode.get(c.seccion_code);
      const title = sec?.title ?? c.seccion_code;
      const score = sec?.score ?? null;
      const dot = sec?.semaforo ? semaphoreToDotClass(sec.semaforo) : null;
      const scoreCell =
        score !== null && dot !== null
          ? `<span class="dot ${dot}"></span><span class="score-pill" data-canonical="score">${score}</span>`
          : '<span class="score-pill" data-canonical="score">—</span>';
      return `<tr><td>${e(title)}</td><td class="num">${scoreCell}</td><td>${field(`hallazgos.circuitos.${i}.doc`, c.doc, opts)}</td><td>${field(`hallazgos.circuitos.${i}.controles`, c.controles, opts)}</td><td>${field(`hallazgos.circuitos.${i}.madurez`, c.madurez, opts)}</td></tr>`;
    })
    .join('\n');

  const lectura = d.hallazgos.lectura_transversal
    .map(
      (l, i) =>
        `<li><strong>${field(`hallazgos.lectura_transversal.${i}.titulo`, l.titulo, opts)}.</strong> ${field(`hallazgos.lectura_transversal.${i}.detalle`, l.detalle, opts)}</li>`
    )
    .join('\n');

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

  // Página 4 · riesgos priorizados
  const riesgoCards = d.riesgos.items
    .map(
      (r, i) => `
    <div class="risk">
      <div class="n">Riesgo ${i + 1}</div>
      <h3>${field(`riesgos.items.${i}.titulo`, r.titulo, opts)}</h3>
      <p>${field(`riesgos.items.${i}.descripcion`, r.descripcion, opts)}</p>
      <div class="ev">Evidencia: ${field(`riesgos.items.${i}.evidencia`, r.evidencia, opts)}</div>
    </div>`
    )
    .join('\n');

  const riesgos = `
<section class="page">
  <div class="eyebrow">03 · Riesgos priorizados</div>
  <h2>Qué está en juego si esto sigue igual</h2>
  <p style="color:var(--sys-gris-neutro); font-size:9.5pt;">${field('riesgos.intro', d.riesgos.intro, opts)}</p>
  <div style="height:5mm"></div>
  <div class="risks">${riesgoCards}</div>
  ${footer('04')}
</section>`;

  // Página 5 · recomendación + plan
  const etapas = d.plan.etapas
    .map(
      (et, i) =>
        `<div class="tl-item"><div class="tl-dot"></div><div class="tl-week">${field(`plan.etapas.${i}.semana`, et.semana, opts)}</div><h3>${field(`plan.etapas.${i}.titulo`, et.titulo, opts)}</h3><p>${field(`plan.etapas.${i}.descripcion`, et.descripcion, opts)}</p></div>`
    )
    .join('\n');

  const necesitamos = d.plan.necesitamos_cliente
    .map((it, i) => `<li>${field(`plan.necesitamos_cliente.${i}`, it, opts)}</li>`)
    .join('\n');
  const noIncluye = d.plan.no_incluye
    .map((it, i) => `<li>${field(`plan.no_incluye.${i}`, it, opts)}</li>`)
    .join('\n');

  const plan = `
<section class="page">
  <div class="eyebrow">04 · Recomendación y plan</div>
  <h2>${field('plan.titulo', d.plan.titulo, opts)}</h2>
  <div class="callout"><p>${field('plan.descripcion', d.plan.descripcion, opts)}</p></div>
  <div style="height:7mm"></div>
  <div class="timeline" style="grid-template-columns:repeat(${d.plan.etapas.length},1fr);">${etapas}</div>
  <div style="height:7mm"></div>
  <div class="twocol">
    <div><h3>Qué necesitamos de ${e(model.cliente.razonSocial)}</h3><ul class="clean">${necesitamos}</ul></div>
    <div><h3>Qué no incluye esta etapa</h3><ul class="clean">${noIncluye}</ul></div>
  </div>
  ${footer('05')}
</section>`;

  // Página 6 · qué cambia en el día a día («hoy N/100» del snapshot, R12)
  const circuitoCards = d.dia_a_dia.circuitos
    .map((c, i) => {
      const sec = sectionByCode.get(c.seccion_code);
      const title = sec?.title ?? c.seccion_code;
      const hoy = sec?.score !== null && sec?.score !== undefined ? sec.score : '—';
      const items = c.funcionalidades
        .map(
          (f, j) =>
            `<li><strong>${field(`dia_a_dia.circuitos.${i}.funcionalidades.${j}.nombre`, f.nombre, opts)}</strong>: ${field(`dia_a_dia.circuitos.${i}.funcionalidades.${j}.que_resuelve`, f.que_resuelve, opts)}.</li>`
        )
        .join('\n');
      return `<div class="circuito"><h3>${e(title)} — hoy <span data-canonical="score">${hoy}</span>/100</h3><ul>${items}</ul></div>`;
    })
    .join('\n');

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

  // Página 7 · cierre dark
  const pasos = d.proximos_pasos
    .map(
      (paso, i) => `
      <li style="display:flex; gap:4mm; margin-bottom:3mm; font-size:10.5pt; align-items:flex-start;">
        <span style="min-width:6mm; height:6mm; border-radius:50%; background:var(--sys-azul-electrico); display:grid; place-items:center; font-weight:800; font-size:9pt;">${i + 1}</span>
        ${field(`proximos_pasos.${i}`, paso, opts)}
      </li>`
    )
    .join('\n');

  const cierre = `
<section class="page dark backcover">
  <div class="circle c1"></div><div class="circle c2"></div>
  <div style="text-align:left; width:100%; margin-bottom:16mm;">
    <div class="eyebrow" style="color:var(--sys-celeste);">06 · Próximos pasos</div>
    <h2 style="color:#fff;">Cómo arrancamos</h2>
    <ol style="list-style:none; counter-reset:steps; color:rgba(255,255,255,0.88);">${pasos}</ol>
  </div>
  <img class="logo-vert" src="${LOGO_VERT_URL}" alt="Servicios y Sistemas">
  <div class="firma">Integral de verdad.</div>
  <div class="contact">
    Servicios y Sistemas SRL · CUIT 30-70859237-0<br>
    Centro de Ventas y Servicios Certificado Tango · Más de 30 años en el NEA<br>
    San Martín 1180, Corrientes · +54 3794 426022<br>
    info@serviciosysistemas.com.ar · www.serviciosysistemas.com.ar
  </div>
</section>`;

  // Bloque Loom: solo pantalla, oculto en @media print (R25)
  const loomId = model.loomUrl ? model.loomUrl.split('/').pop() : null;
  const loom =
    model.loomUrl && loomId
      ? `<div class="informe-loom"><iframe src="https://www.loom.com/embed/${e(loomId)}" allowfullscreen title="Video Loom"></iframe></div>`
      : '';

  return `${STYLE}
<div class="informe-a4">
${portada}
${resumen}
${hallazgos}
${riesgos}
${plan}
${diaADia}
${cierre}
${loom}
</div>`;
}
