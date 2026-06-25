/**
 * Render web público del informe (#15, R10–R12): implementación del template
 * oficial `docs/plantillas/informe/template_informe_web_v2.html` como HTML
 * generado a partir de InformeRenderModel (client_draft + snapshot canónico
 * via stripInternalFindings — jamás material interno).
 * Módulo puro: lo consumen report-web-render.svelte y el snapshot test.
 */

import {
  escapeHtml,
  LOGO_VERT_URL,
  semaphoreToNumClass,
  type InformeRenderModel,
  type RenderSemaphore
} from './render';
import { hayNorma, hayAlgunaNormaIt } from './render-shared';
import {
  WEB_GAUGE_CIRCUMFERENCE,
  webGaugeBadgeLabel,
  webGaugeColorVar
} from '$lib/client/informe/web-effects';
import { formatDuracion } from './visita';

const e = escapeHtml;

/** Clase de score-row del template: r = rojo · o = naranja · g = verde. */
export function semaphoreToRowClass(s: RenderSemaphore): 'r' | 'o' | 'g' {
  return s === 'green' ? 'g' : s === 'amber' ? 'o' : 'r';
}

const BADGE_BG: Record<RenderSemaphore, string> = {
  red: 'rgba(230,57,70,0.12)',
  amber: 'rgba(243,156,18,0.12)',
  green: 'rgba(39,174,96,0.12)'
};

const BADGE_BORDER: Record<RenderSemaphore, string> = {
  red: 'rgba(230,57,70,0.3)',
  amber: 'rgba(243,156,18,0.3)',
  green: 'rgba(39,174,96,0.3)'
};

function tipoLabel(tipo: InformeRenderModel['tipoAuditoria']): string {
  if (tipo === 'it') return 'IT';
  if (tipo === 'mixta') return 'IT + ERP';
  return 'ERP';
}

const STYLE = `
<style>
.informe-web { font-family: var(--sys-font, 'Montserrat', Arial, sans-serif); background: linear-gradient(160deg, var(--sys-azul-profundo) 0%, #0d2035 55%, var(--sys-azul-medio) 100%) fixed; color: rgba(255,255,255,0.88); overflow-x: hidden; min-height: 100vh; position:relative; z-index:0; -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale; text-rendering:optimizeLegibility; --ease: cubic-bezier(0.33,1,0.68,1); }
.informe-web *, .informe-web *::before, .informe-web *::after { margin:0; padding:0; box-sizing:border-box; }
.informe-web ::selection { background:rgba(33,150,243,0.32); color:#fff; }
.informe-web .amb-layer { position:fixed; inset:0; overflow:hidden; pointer-events:none; z-index:0; }
.informe-web .amb { position:absolute; border-radius:50%; border:1px solid var(--sys-celeste); opacity:0.05; }
.informe-web .amb.a1 { width:640px; height:640px; top:-220px; right:-260px; }
.informe-web .amb.a2 { width:460px; height:460px; bottom:-200px; left:-200px; }
.informe-web .prog { position:fixed; top:0; left:0; height:3px; width:0%; background:linear-gradient(90deg,var(--sys-azul-electrico),var(--sys-celeste)); z-index:9999; transition:width .08s linear; pointer-events:none; }
.informe-web .wrap { max-width:860px; margin:0 auto; padding-left:28px; padding-right:28px; }
.informe-web section { padding:96px 0; position:relative; z-index:1; }
.informe-web section + section { border-top:1px solid rgba(255,255,255,0.06); }
.informe-web .eyebrow { font-size:11px; font-weight:700; letter-spacing:4px; text-transform:uppercase; color:var(--sys-azul-electrico); margin-bottom:22px; display:flex; align-items:center; gap:10px; }
.informe-web .eyebrow::before { content:''; display:block; width:28px; height:2px; background:linear-gradient(90deg,var(--sys-azul-electrico),var(--sys-celeste)); flex-shrink:0; }
.informe-web h1 { font-size:clamp(38px,7vw,64px); font-weight:800; letter-spacing:-1.5px; color:#fff; line-height:1.04; text-wrap:balance; }
.informe-web h2 { font-size:clamp(24px,4vw,38px); font-weight:800; letter-spacing:-0.8px; color:#fff; margin-bottom:20px; line-height:1.1; text-wrap:balance; }
.informe-web p { font-size:16px; line-height:1.7; }
.informe-web .lead { font-size:18px; line-height:1.65; color:rgba(255,255,255,0.82); }
.informe-web .muted { color:rgba(255,255,255,0.55); }
.informe-web .hl { color:var(--sys-celeste); }
.informe-web .reveal { opacity:0; transform:translateY(18px); transition:opacity .75s var(--ease),transform .75s var(--ease); }
.informe-web .reveal.in { opacity:1; transform:none; }
.informe-web .hero { min-height:100vh; display:grid; place-items:center; text-align:center; padding:80px 28px; position:relative; overflow:hidden; }
.informe-web .hero::before { content:''; position:absolute; inset:0; background:radial-gradient(ellipse 70% 55% at 50% 38%,rgba(33,150,243,0.09) 0%,transparent 70%); pointer-events:none; }
.informe-web .hero::after { content:''; position:absolute; left:0; right:0; bottom:0; height:160px; background:linear-gradient(180deg,transparent 0%,rgba(10,25,41,0.55) 100%); pointer-events:none; z-index:0; }
.informe-web .hero-inner { position:relative; z-index:1; }
.informe-web .hero img.logo { height:110px; margin:0 auto 52px; display:block; }
.informe-web .hero .subject { margin-top:30px; }
.informe-web .hero .subject-label { font-size:10px; font-weight:700; letter-spacing:3px; text-transform:uppercase; color:rgba(255,255,255,0.4); margin-bottom:10px; }
.informe-web .hero .subject::before { content:''; display:block; width:40px; height:2px; margin:0 auto 18px; background:linear-gradient(90deg,transparent,var(--sys-celeste),transparent); }
.informe-web .scroll-cue { position:absolute; left:50%; bottom:30px; transform:translateX(-50%); width:24px; height:38px; border:2px solid rgba(255,255,255,0.28); border-radius:13px; z-index:1; }
.informe-web .scroll-cue::before { content:''; position:absolute; left:50%; top:7px; width:4px; height:8px; margin-left:-2px; border-radius:2px; background:var(--sys-celeste); animation:scrollcue 1.8s var(--ease) infinite; }
@keyframes scrollcue { 0%{opacity:0;transform:translateY(0)} 25%{opacity:1} 75%{opacity:1} 100%{opacity:0;transform:translateY(12px)} }
@media (prefers-reduced-motion:reduce){ .informe-web .scroll-cue::before{animation:none} }
@media print { .informe-web .scroll-cue, .informe-web .amb-layer, .informe-web .prog { display:none !important; } }
.informe-web .hero .tag { display:inline-block; font-size:11px; font-weight:700; letter-spacing:3px; text-transform:uppercase; color:var(--sys-azul-electrico); background:rgba(33,150,243,0.1); border:1px solid rgba(33,150,243,0.25); padding:6px 18px; border-radius:2px; margin-bottom:36px; }
.informe-web .hero .client { font-size:26px; font-weight:700; color:#fff; margin-top:0; }
.informe-web .hero .cuit { font-size:14px; color:rgba(255,255,255,0.4); margin-top:8px; }
.informe-web .hero .meta { font-size:13px; color:rgba(255,255,255,0.4); margin-top:44px; line-height:2; }
.informe-web .gauge-wrap { margin:52px auto 0; max-width:380px; }
.informe-web [data-gauge-arc] { filter:drop-shadow(0 1px 5px rgba(0,0,0,0.4)); }
.informe-web .gauge-badge { display:inline-block; font-size:11px; font-weight:700; letter-spacing:2.5px; text-transform:uppercase; padding:5px 16px; border-radius:2px; margin-top:14px; }
.informe-web .gauge-label { font-size:12px; font-weight:600; letter-spacing:1.5px; text-transform:uppercase; color:rgba(255,255,255,0.45); margin-top:8px; }
.informe-web .loom-section { padding-top:0; }
.informe-web .loom-section iframe { width:100%; aspect-ratio:16/9; border:0; border-radius:3px; box-shadow:0 8px 32px rgba(0,0,0,0.22); }
.informe-web .cardrow { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:16px; margin-top:48px; }
.informe-web .card { background:linear-gradient(180deg,#fff 0%,#f7f9fb 100%); border-top:3px solid var(--sys-azul-electrico); border-radius:3px; padding:32px 24px; text-align:center; box-shadow:0 8px 32px rgba(0,0,0,0.22),0 1px 4px rgba(0,0,0,0.12); transition:transform .3s var(--ease),box-shadow .3s var(--ease); }
.informe-web .card:hover { transform:translateY(-4px); box-shadow:0 20px 48px rgba(0,0,0,0.3); }
.informe-web .card .num { font-size:54px; font-weight:800; letter-spacing:-2px; line-height:1; color:var(--sys-azul-electrico); }
.informe-web .card .num.bad { color:var(--sys-rojo); }
.informe-web .card .num.warn { color:var(--sys-naranja); }
.informe-web .card .num.ok { color:var(--sys-verde); }
.informe-web .card .num span { font-size:20px; color:var(--sys-gris-neutro); font-weight:600; letter-spacing:0; }
.informe-web .card .label { font-size:13px; font-weight:600; color:var(--sys-azul-medio); margin-top:12px; line-height:1.45; }
.informe-web .score-list { margin-top:44px; display:flex; flex-direction:column; gap:8px; }
.informe-web .score-row { display:grid; grid-template-columns:1fr auto; gap:20px; align-items:center; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07); border-left:3px solid transparent; border-radius:3px; padding:14px 20px; transition:background .2s; }
.informe-web .score-row:hover { background:rgba(255,255,255,0.055); }
.informe-web .score-row.r { border-left-color:var(--sys-rojo); }
.informe-web .score-row.o { border-left-color:var(--sys-naranja); }
.informe-web .score-row.g { border-left-color:var(--sys-verde); }
.informe-web .score-info .name { font-size:14px; font-weight:600; color:rgba(255,255,255,0.9); }
.informe-web .score-info .detail { font-size:11px; color:rgba(255,255,255,0.42); margin-top:4px; }
.informe-web .score-right { display:flex; align-items:center; gap:14px; }
.informe-web .bar { width:140px; height:6px; background:rgba(255,255,255,0.08); border-radius:3px; overflow:hidden; }
.informe-web .bar i { display:block; height:100%; width:0; border-radius:3px; transition:width 1.2s var(--ease); }
.informe-web .score-row.r .bar i { background:var(--sys-rojo); }
.informe-web .score-row.o .bar i { background:var(--sys-naranja); }
.informe-web .score-row.g .bar i { background:var(--sys-verde); }
.informe-web .score-val { font-size:18px; font-weight:800; font-variant-numeric:tabular-nums; min-width:34px; text-align:right; }
.informe-web .score-row.r .score-val { color:var(--sys-rojo); }
.informe-web .score-row.o .score-val { color:var(--sys-naranja); }
.informe-web .score-row.g .score-val { color:var(--sys-verde); }
.informe-web .legend { margin-top:24px; font-size:13px; color:rgba(255,255,255,0.48); border-left:2px solid rgba(255,255,255,0.1); padding-left:14px; }
.informe-web .risks { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-top:48px; }
.informe-web .risk { background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07); border-left:4px solid var(--sys-rojo); border-radius:3px; padding:28px 26px; position:relative; overflow:hidden; transition:background .2s,transform .3s var(--ease); }
.informe-web .risk:hover { background:rgba(255,255,255,0.055); transform:translateY(-2px); }
.informe-web .risk .wm { position:absolute; right:-6px; top:-18px; font-size:120px; font-weight:800; color:rgba(255,255,255,0.025); line-height:1; pointer-events:none; user-select:none; }
.informe-web .risk .n { font-size:10px; font-weight:700; letter-spacing:3px; text-transform:uppercase; color:var(--sys-rojo); margin-bottom:12px; }
.informe-web .risk h3 { font-size:17px; font-weight:700; color:#fff; margin-bottom:12px; line-height:1.3; }
.informe-web .risk p { font-size:14px; color:rgba(255,255,255,0.7); line-height:1.6; }
.informe-web .risk .ev { font-size:11px; color:rgba(255,255,255,0.36); margin-top:16px; font-style:italic; }
.informe-web .fix-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-top:48px; }
.informe-web .fix { background:linear-gradient(180deg,#fff 0%,#f7f9fb 100%); border-radius:3px; padding:28px 24px; border-top:3px solid var(--sys-azul-electrico); box-shadow:0 8px 32px rgba(0,0,0,0.22); transition:transform .3s var(--ease),box-shadow .3s var(--ease); }
.informe-web .fix:hover { transform:translateY(-3px); box-shadow:0 18px 48px rgba(0,0,0,0.28); }
.informe-web .fix h3 { font-size:16px; font-weight:700; color:var(--sys-azul-profundo); display:flex; align-items:baseline; gap:6px; flex-wrap:wrap; }
.informe-web .fix .badge { font-size:11px; font-weight:700; color:var(--sys-rojo); background:rgba(230,57,70,0.08); padding:2px 8px; border-radius:2px; }
.informe-web .fix .badge.warn { color:var(--sys-naranja); background:rgba(243,156,18,0.08); }
.informe-web .fix .badge.ok { color:var(--sys-verde); background:rgba(39,174,96,0.08); }
.informe-web .fix .hoy { font-size:12.5px; color:var(--sys-gris-neutro); margin-top:10px; line-height:1.5; }
.informe-web .fix .hoy strong { color:var(--sys-azul-medio); font-weight:700; }
.informe-web .fix ul { list-style:none; margin-top:16px; }
.informe-web .fix li { font-size:13px; line-height:1.55; color:var(--sys-azul-medio); padding-left:18px; position:relative; margin-bottom:10px; }
.informe-web .fix li::before { content:''; position:absolute; left:0; top:6px; width:7px; height:7px; background:var(--sys-azul-electrico); border-radius:1px; }
.informe-web .callout { margin-top:32px; background:rgba(33,150,243,0.07); border:1px solid rgba(33,150,243,0.18); border-left:4px solid var(--sys-azul-electrico); border-radius:3px; padding:26px 30px; }
.informe-web .callout p { font-size:15px; color:rgba(255,255,255,0.88); }
.informe-web .callout-green { margin-top:32px; background:rgba(39,174,96,0.07); border:1px solid rgba(39,174,96,0.18); border-left:4px solid var(--sys-verde); border-radius:3px; padding:26px 30px; }
.informe-web .callout-green p { font-size:15px; color:rgba(255,255,255,0.88); }
.informe-web .tl-h { display:grid; margin-top:64px; position:relative; }
.informe-web .tl-h::before { content:''; position:absolute; top:9px; left:8%; right:8%; height:2px; background:rgba(33,150,243,0.2); }
.informe-web .tl-step { text-align:center; padding:0 8px; position:relative; }
.informe-web .tl-dot { width:20px; height:20px; border-radius:50%; background:var(--sys-azul-electrico); border:3px solid var(--sys-azul-profundo); margin:0 auto 18px; position:relative; z-index:1; box-shadow:0 0 0 4px rgba(33,150,243,0.15); }
.informe-web .tl-step .week { font-size:10px; font-weight:700; letter-spacing:1.5px; text-transform:uppercase; color:var(--sys-azul-electrico); margin-bottom:8px; }
.informe-web .tl-step h3 { font-size:14px; font-weight:700; color:#fff; margin-bottom:6px; }
.informe-web .tl-step p { font-size:12px; color:rgba(255,255,255,0.5); line-height:1.5; }
.informe-web .twocol { display:grid; grid-template-columns:1fr 1fr; gap:24px; margin-top:56px; }
.informe-web .twocol h3 { font-size:15px; font-weight:700; color:#fff; margin-bottom:12px; }
.informe-web .twocol ul { list-style:none; }
.informe-web .twocol li { font-size:14px; line-height:1.6; color:rgba(255,255,255,0.7); padding-left:18px; position:relative; margin-bottom:8px; }
.informe-web .twocol li::before { content:''; position:absolute; left:0; top:8px; width:7px; height:7px; background:var(--sys-azul-electrico); border-radius:1px; }
.informe-web .cta { text-align:center; padding:24px 0 16px; }
.informe-web .cta img.logo { height:100px; margin:0 auto 48px; display:block; }
.informe-web .firma { font-size:clamp(26px,4.5vw,44px); font-weight:800; letter-spacing:-1px; color:#fff; margin-bottom:40px; line-height:1.08; }
.informe-web .btn { display:inline-block; background:var(--sys-azul-electrico); color:#fff; font-family:var(--sys-font, 'Montserrat', Arial, sans-serif); font-size:15px; font-weight:700; padding:18px 44px; border-radius:3px; text-decoration:none; transition:transform .25s var(--ease),box-shadow .25s var(--ease); box-shadow:0 8px 28px rgba(33,150,243,0.35); }
.informe-web .btn:hover { transform:translateY(-3px); box-shadow:0 16px 44px rgba(33,150,243,0.45); }
.informe-web .contact { font-size:14px; color:rgba(255,255,255,0.48); line-height:2.3; margin-top:48px; }
.informe-web .contact a { color:var(--sys-celeste); text-decoration:none; }
.informe-web .contact a:hover { text-decoration:underline; }
.informe-web footer { border-top:1px solid rgba(255,255,255,0.07); padding:28px 0 36px; text-align:center; font-size:12px; color:rgba(255,255,255,0.3); letter-spacing:0.3px; }
.informe-web .equip-table-wrap { margin-top:44px; overflow-x:auto; -webkit-overflow-scrolling:touch; }
.informe-web .equip-table { width:100%; border-collapse:collapse; font-size:14px; }
.informe-web .equip-table th { text-align:left; font-size:11px; font-weight:700; letter-spacing:1.5px; text-transform:uppercase; color:var(--sys-celeste); padding:10px 14px; border-bottom:1px solid rgba(255,255,255,0.12); }
.informe-web .equip-table td { padding:12px 14px; color:rgba(255,255,255,0.82); border-bottom:1px solid rgba(255,255,255,0.06); vertical-align:top; }
.informe-web .equip-table tbody tr:hover { background:rgba(255,255,255,0.03); }
.informe-web .equip-eol { display:flex; align-items:center; gap:8px; }
.informe-web .equip-dot { width:9px; height:9px; border-radius:50%; background:var(--sys-gris-neutro); flex-shrink:0; }
.informe-web .equip-dot.r { background:var(--sys-rojo); }
.informe-web .equip-dot.o { background:var(--sys-naranja); }
.informe-web .equip-dot.g { background:var(--sys-verde); }
.informe-web .equip-gallery { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:16px; margin-top:32px; }
.informe-web .equip-fig { background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07); border-radius:3px; overflow:hidden; }
.informe-web .equip-fig img { width:100%; aspect-ratio:4/3; object-fit:cover; display:block; }
.informe-web .equip-ph { width:100%; aspect-ratio:4/3; display:grid; place-items:center; font-size:12px; font-weight:600; letter-spacing:1px; text-transform:uppercase; color:rgba(255,255,255,0.35); background:repeating-linear-gradient(45deg,rgba(255,255,255,0.02),rgba(255,255,255,0.02) 8px,rgba(255,255,255,0.04) 8px,rgba(255,255,255,0.04) 16px); }
.informe-web .equip-cap { font-size:12px; color:rgba(255,255,255,0.6); padding:10px 12px; line-height:1.4; }
@media print {
  .informe-web .equip-table-wrap { overflow:visible; }
  .informe-web .equip-gallery { grid-template-columns:repeat(3,1fr); }
  .informe-web .equip-fig, .informe-web .equip-table tbody tr { break-inside:avoid; }
}
@media (max-width:720px){
  .informe-web section { padding:68px 0; }
  .informe-web .risks, .informe-web .fix-grid, .informe-web .twocol { grid-template-columns:1fr; }
  .informe-web .equip-gallery { grid-template-columns:repeat(auto-fill,minmax(140px,1fr)); }
  .informe-web .tl-h { grid-template-columns:1fr !important; }
  .informe-web .tl-h::before { top:0; bottom:0; left:9px; right:auto; width:2px; height:auto; }
  .informe-web .tl-step { text-align:left; padding:0 0 28px 38px; position:relative; }
  .informe-web .tl-dot { position:absolute; left:0; top:0; margin:0; }
  .informe-web .score-right .bar { width:80px; }
}
</style>`;

function renderGauge(model: InformeRenderModel): string {
  const indices = model.draft.indices;
  const index = indices.erp ?? indices.it ?? null;
  if (!index) {
    return '';
  }
  const label = indices.erp ? 'Índice ERP general' : 'Índice IT general';
  const color = webGaugeColorVar(index.semaforo);
  return `
    <div class="gauge-wrap" data-gauge-score="${index.valor}">
      <svg viewBox="0 0 220 124" style="width:100%">
        <path d="M 22 108 A 88 88 0 0 1 198 108" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="16" stroke-linecap="round"/>
        <path data-gauge-arc="" d="M 22 108 A 88 88 0 0 1 198 108" fill="none" stroke="${color}" stroke-width="16" stroke-linecap="round" stroke-dasharray="${WEB_GAUGE_CIRCUMFERENCE}" stroke-dashoffset="${WEB_GAUGE_CIRCUMFERENCE}" style="transition:stroke-dashoffset 1.8s var(--ease);"/>
        <text data-gauge-num="" x="110" y="92" text-anchor="middle" font-family="Montserrat,Arial" font-weight="800" font-size="52" fill="${color}" letter-spacing="-1">0</text>
        <text x="110" y="114" text-anchor="middle" font-family="Montserrat,Arial" font-weight="600" font-size="13" fill="rgba(255,255,255,0.45)">de 100</text>
      </svg>
      <div class="gauge-badge" style="color:${color}; background:${BADGE_BG[index.semaforo]}; border:1px solid ${BADGE_BORDER[index.semaforo]};">${webGaugeBadgeLabel(index.semaforo)}</div>
      <div class="gauge-label">${label}</div>
    </div>`;
}

function renderHero(model: InformeRenderModel): string {
  const tipo = tipoLabel(model.tipoAuditoria);
  return `
<section class="hero wrap">
  <div class="hero-inner">
    <img class="logo" src="${LOGO_VERT_URL}" alt="Servicios y Sistemas">
    <div class="tag">Auditoría ${tipo} · ${e(model.periodo)}</div>
    <h1>Informe de<br>Auditoría ${tipo}</h1>
    <div class="subject">
      <div class="subject-label">Empresa auditada</div>
      <div class="client">${e(model.cliente.razonSocial)}</div>
      ${model.cliente.cuit ? `<div class="cuit">CUIT ${e(model.cliente.cuit)}</div>` : ''}
    </div>
    ${renderGauge(model)}
    <div class="meta">Relevamiento presencial · ${e(model.fechaInforme)} · Sistema auditado: ${e(model.sistema)}${model.refCode && model.refCode !== '—' ? ` · Ref: ${e(model.refCode)}` : ''}</div>${model.visita ? `\n    <div class="visita-meta">Visita: ${e(model.visita.inicio)}–${e(model.visita.fin)} · ${e(formatDuracion(model.visita.duracionMin))}</div>` : ''}
  </div>
  <div class="scroll-cue" aria-hidden="true"></div>
</section>`;
}

/** Sección Loom entre hero y resumen; sin loom_url no se renderiza (R11). */
function renderLoom(model: InformeRenderModel): string {
  const loomId = model.loomUrl ? model.loomUrl.split('/').pop() : null;
  if (!model.loomUrl || !loomId) {
    return '';
  }
  return `
<section class="wrap loom-section">
  <div class="reveal">
    <div class="eyebrow">El recorrido en video</div>
    <iframe src="https://www.loom.com/embed/${e(loomId)}" allowfullscreen title="Video del informe"></iframe>
  </div>
</section>`;
}

function renderResumen(model: InformeRenderModel): string {
  const d = model.draft;
  const indices = d.indices;
  const index = indices.erp ?? indices.it ?? null;
  const indexLabel = indices.erp ? 'Índice ERP general' : 'Índice IT general';
  const cc = d.resumen.circuitos_con_controles;
  const modulosLista = model.modulos.join(', ');

  const cards: string[] = [];
  if (index) {
    cards.push(`
    <div class="card">
      <div class="num ${semaphoreToNumClass(index.semaforo)}" data-count="${index.valor}">0<span>/100</span></div>
      <div class="label">${indexLabel}</div>
    </div>`);
  }
  if (cc !== null) {
    // Decisión puerta #15-4: campo null → card omitida en la vista pública.
    cards.push(`
    <div class="card">
      <div class="num warn" data-count="${cc.n}">0<span>&nbsp;de&nbsp;${cc.total}</span></div>
      <div class="label">circuitos con controles internos aplicados</div>
    </div>`);
  }
  if (model.modulos.length > 0) {
    cards.push(`
    <div class="card">
      <div class="num" data-count="${model.modulos.length}">0</div>
      <div class="label">módulos Tango en uso: ${e(modulosLista)}</div>
    </div>`);
  }

  return `
<section class="wrap">
  <div class="reveal">
    <div class="eyebrow">01 · Resumen ejecutivo</div>
    <h2>${e(d.resumen.diagnostico)}</h2>
    <p class="lead">${e(d.resumen.lead)}</p>
  </div>
  <div class="cardrow reveal">${cards.join('\n')}
  </div>
  <div class="reveal" style="margin-top:48px;">
    <p style="color:rgba(255,255,255,0.78);">${e(d.resumen.interpretacion)}</p>
    <p style="margin-top:18px; color:rgba(255,255,255,0.78);">Nuestra recomendación: <strong class="hl">${e(d.resumen.recomendacion_central)}</strong>.</p>
    ${
      d.resumen.fortalezas !== null
        ? `<div class="callout-green"><p><strong style="color:var(--sys-verde);">Lo que está bien y vamos a preservar:</strong> ${e(d.resumen.fortalezas)}</p></div>`
        : ''
    }
  </div>
</section>`;
}

function renderHallazgos(model: InformeRenderModel): string {
  const d = model.draft;
  const sectionByCode = new Map(model.secciones.map((s) => [s.code, s]));

  const rows = d.hallazgos.circuitos
    .map((c) => {
      const sec = sectionByCode.get(c.seccion_code);
      const title = sec?.title ?? c.seccion_code;
      const score = sec?.score ?? null;
      const rowClass = sec?.semaforo ? semaphoreToRowClass(sec.semaforo) : 'o';
      // #30 R8–R10: norma inline solo si hayNorma (domain it + standardRef CIS…);
      // sin norma → nada (ni separador, ni data-canonical="norma").
      const normaPiece =
        sec && hayNorma(sec)
          ? ` · <span data-canonical="norma">${e(sec.standardRef!.trim())}</span>`
          : '';
      const detail = `${e(c.doc)} · ${e(c.controles)} · ${e(c.madurez)}${normaPiece}`;
      return `
    <div class="score-row reveal ${rowClass}">
      <div class="score-info"><div class="name">${e(title)}</div><div class="detail">${detail}</div></div>
      <div class="score-right"><div class="bar"><i data-w="${score ?? 0}"></i></div><div class="score-val" data-canonical="score">${score ?? '—'}</div></div>
    </div>`;
    })
    .join('\n');

  const legend = d.hallazgos.lectura_transversal
    .map(
      (l) =>
        `<div class="legend reveal"><strong>${e(l.titulo)}.</strong> ${e(l.detalle)}</div>`
    )
    .join('\n');

  // #30 R10/R11: metodología IT solo cuando hay contexto IT (it/mixta) Y al menos
  // una sección con norma real; si ninguna sección tiene norma, no se muestra.
  const metodologia =
    (model.tipoAuditoria === 'it' || model.tipoAuditoria === 'mixta') && hayAlgunaNormaIt(model)
      ? `\n  <div class="legend reveal" data-metodologia="it">Los valores se evalúan contra CIS Controls v8 y el NIST Cybersecurity Framework. El estado de fin de vida del hardware se mide por los ciclos de vida de cada fabricante (HPE, Lenovo, Dell).</div>`
      : '';

  return `
<section class="wrap">
  <div class="reveal">
    <div class="eyebrow">02 · Hallazgos por circuito</div>
    <h2>Qué encontramos, sección por sección</h2>
    <p class="muted">Cada circuito se evaluó en tres dimensiones: proceso documentado, controles internos y madurez operativa.</p>
  </div>
  <div class="score-list">${rows}
  </div>
  ${legend}${metodologia}
</section>`;
}

/**
 * #45 (R8, R9, R10, R11) — sección "Inventario de equipos" para IT/mixta.
 * Devuelve '' en ERP puro o sin equipos (R9). Renderiza tabla `equip-table`
 * (tipo, modelo/categoría, antigüedad, EOL con semáforo) + galería de fotos por
 * equipo (`equip-gallery`/`equip-fig`/`equip-cap`); placeholder `equip-ph`
 * cuando un equipo no tiene fotos resolubles (R11).
 */
function renderInventario(model: InformeRenderModel): string {
  if (model.tipoAuditoria === 'erp') return '';
  if (model.inventarioIt.length === 0) return '';

  const rows = model.inventarioIt
    .map((eq) => {
      const semClass = eq.semaforo ? semaphoreToRowClass(eq.semaforo) : '';
      const dot = `<span class="equip-dot ${semClass}" aria-hidden="true"></span>`;
      const eol = eq.estadoEol ? `${dot}${e(eq.estadoEol)}` : `${dot}<span class="muted">s/d</span>`;
      return `
      <tr>
        <td>${e(eq.tipo || '—')}</td>
        <td>${e(eq.modeloCategoria || '—')}</td>
        <td>${e(eq.antiguedad || '—')}</td>
        <td class="equip-eol">${eol}</td>
      </tr>`;
    })
    .join('\n');

  const figs = model.inventarioIt
    .map((eq) => {
      const cap = [eq.tipo, eq.modeloCategoria].filter(Boolean).join(' · ') || 'Equipo relevado';
      const fotosValidas = eq.fotos.filter((f) => f.url);
      if (fotosValidas.length === 0) {
        return `
      <figure class="equip-fig">
        <div class="equip-ph" aria-hidden="true">Sin foto</div>
        <figcaption class="equip-cap">${e(cap)}</figcaption>
      </figure>`;
      }
      return fotosValidas
        .map(
          (f) => `
      <figure class="equip-fig">
        <img src="${e(f.url)}" alt="${e(f.alt)}" loading="lazy">
        <figcaption class="equip-cap">${e(cap)}</figcaption>
      </figure>`
        )
        .join('\n');
    })
    .join('\n');

  return `
<section class="wrap equip">
  <div class="reveal">
    <div class="eyebrow">Inventario de equipos</div>
    <h2>Qué hay instalado hoy</h2>
    <p class="muted">Relevamiento de equipos con su estado de fin de vida (EOL) según los ciclos de vida de cada fabricante.</p>
  </div>
  <div class="equip-table-wrap reveal">
    <table class="equip-table">
      <thead>
        <tr><th>Tipo</th><th>Modelo / categoría</th><th>Antigüedad / año</th><th>Estado EOL</th></tr>
      </thead>
      <tbody>${rows}
      </tbody>
    </table>
  </div>
  <div class="equip-gallery reveal">${figs}
  </div>
</section>`;
}

/**
 * Slot de inserción de inventario tras hallazgos: '' cuando no aplica (R9/R14, no
 * altera el HTML ERP) o el HTML de la sección precedido de salto de línea.
 */
function renderInventarioSlot(model: InformeRenderModel): string {
  // renderInventario ya emite su propio salto de línea inicial; '' cuando no aplica.
  return renderInventario(model);
}

function renderRiesgos(model: InformeRenderModel): string {
  const d = model.draft;
  const cards = d.riesgos.items
    .map(
      (r, i) => `
    <div class="risk reveal">
      <div class="wm">${i + 1}</div>
      <div class="n">Riesgo ${i + 1}</div>
      <h3>${e(r.titulo)}</h3>
      <p>${e(r.descripcion)}</p>
      <div class="ev">Evidencia: ${e(r.evidencia)}</div>
    </div>`
    )
    .join('\n');

  return `
<section class="wrap">
  <div class="reveal">
    <div class="eyebrow">03 · Riesgos priorizados</div>
    <h2>Qué está en juego si esto sigue igual</h2>
    <p class="muted">${e(d.riesgos.intro)}</p>
  </div>
  <div class="risks">${cards}
  </div>
</section>`;
}

function renderDiaADia(model: InformeRenderModel): string {
  const d = model.draft;
  const sectionByCode = new Map(model.secciones.map((s) => [s.code, s]));

  const cards = d.dia_a_dia.circuitos
    .map((c) => {
      const sec = sectionByCode.get(c.seccion_code);
      const title = sec?.title ?? c.seccion_code;
      const score = sec?.score ?? null;
      const badgeClass =
        sec?.semaforo === 'green' ? 'badge ok' : sec?.semaforo === 'amber' ? 'badge warn' : 'badge';
      const badge =
        score !== null
          ? `<span class="${badgeClass}">hoy <span data-canonical="score">${score}</span>/100</span>`
          : '';
      const items = c.funcionalidades
        .map((f) => `<li><strong>${e(f.nombre)}</strong>: ${e(f.que_resuelve)}.</li>`)
        .join('\n');
      const hoyLine =
        c.hoy !== null && c.hoy !== undefined && c.hoy !== ''
          ? `<div class="hoy"><strong>Hoy:</strong> ${e(c.hoy)}</div>`
          : '';
      return `
    <div class="fix reveal">
      <h3>${e(title)} ${badge}</h3>
      ${hoyLine}<ul>${items}</ul>
    </div>`;
    })
    .join('\n');

  return `
<section class="wrap">
  <div class="reveal">
    <div class="eyebrow">04 · Qué cambia en el día a día</div>
    <h2>Lo que Tango ya sabe hacer<br>y hoy no se usa</h2>
    <p class="muted">${e(d.dia_a_dia.intro)}</p>
  </div>
  <div class="fix-grid">${cards}
  </div>
  ${
    d.dia_a_dia.callout_transversal !== null
      ? `<div class="callout reveal"><p>${e(d.dia_a_dia.callout_transversal)}</p></div>`
      : ''
  }
</section>`;
}

function renderPlan(model: InformeRenderModel): string {
  const d = model.draft;
  const steps = d.plan.etapas
    .map(
      (et) => `
    <div class="tl-step"><div class="tl-dot"></div><div class="week">${e(et.semana)}</div><h3>${e(et.titulo)}</h3><p>${e(et.descripcion)}</p></div>`
    )
    .join('\n');

  const necesitamos = d.plan.necesitamos_cliente.map((it) => `<li>${e(it)}</li>`).join('\n');
  const noIncluye = d.plan.no_incluye.map((it) => `<li>${e(it)}</li>`).join('\n');

  return `
<section class="wrap">
  <div class="reveal">
    <div class="eyebrow">05 · El plan</div>
    <h2>${e(d.plan.titulo)}</h2>
    <p class="lead">${e(d.plan.descripcion)}</p>
  </div>
  <div class="tl-h reveal" style="grid-template-columns:repeat(${d.plan.etapas.length},1fr);">${steps}
  </div>
  <div class="twocol reveal">
    <div><h3>Qué necesitamos de ${e(model.cliente.razonSocial)}</h3><ul>${necesitamos}</ul></div>
    <div><h3>Qué no incluye esta etapa</h3><ul>${noIncluye}</ul></div>
  </div>
</section>`;
}

function renderCta(model: InformeRenderModel): string {
  const tipo = tipoLabel(model.tipoAuditoria);
  const subject = encodeURIComponent(
    `Auditoría ${tipo} ${model.cliente.razonSocial} — próximos pasos`
  );
  return `
<section class="wrap cta">
  <div class="reveal">
    <img class="logo" src="${LOGO_VERT_URL}" alt="Servicios y Sistemas">
    <div class="firma">Integral de verdad.</div>
    <a class="btn" href="mailto:info@serviciosysistemas.com.ar?subject=${subject}">Coordinar próximos pasos</a>
    <div class="contact">
      Servicios y Sistemas SRL · Más de 30 años y +1000 implementaciones Tango en el NEA<br>
      San Martín 1180, Corrientes · +54 3794 426022<br>
      <a href="mailto:info@serviciosysistemas.com.ar">info@serviciosysistemas.com.ar</a> ·
      <a href="https://www.serviciosysistemas.com.ar">www.serviciosysistemas.com.ar</a>
    </div>
  </div>
</section>`;
}

/**
 * HTML completo de la vista web pública (R10): hero + Loom condicional +
 * secciones 01–05 + CTA + footer de confidencialidad. Consume únicamente
 * InformeRenderModel (R12) — los scores/semáforos salen del snapshot canónico.
 */
export function renderInformeWebHtml(model: InformeRenderModel): string {
  return `${STYLE}
<div class="informe-web">
<div class="prog" data-informe-prog=""></div>
<div class="amb-layer"><div class="amb a1"></div><div class="amb a2"></div></div>
${renderHero(model)}
${renderLoom(model)}
${renderResumen(model)}
${renderHallazgos(model)}${renderInventarioSlot(model)}
${renderRiesgos(model)}
${renderDiaADia(model)}
${renderPlan(model)}
${renderCta(model)}
<footer class="wrap">Informe confidencial preparado para ${e(model.cliente.razonSocial)} · ${e(model.periodo)}</footer>
</div>`;
}
