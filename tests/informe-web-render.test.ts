import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderInformeWebHtml, TL_HORIZONTAL_MAX } from '../src/lib/informe/web-render';
import { buildInformeRenderModel } from '../src/lib/server/informe/model';
import type { AuditReportRow } from '../src/lib/server/db/informe-reports';
import { indexToSemaphore } from '../src/lib/server/scoring/semaphore';
import {
  webGaugeBadgeLabel,
  webGaugeColorVar,
  webGaugeDashoffset
} from '../src/lib/client/informe/web-effects';
import {
  buildValidClientDraft,
  buildValidInternalDraft,
  loadInformeCanonicalGolden
} from './fixtures/informe-claude-mock';

const golden = loadInformeCanonicalGolden();

function fakeReport(overrides: Partial<AuditReportRow> = {}): AuditReportRow {
  const draft = buildValidClientDraft(['A1', 'A2', 'A3']);
  draft.indices = {
    it: { valor: golden.indices.it!, semaforo: indexToSemaphore(golden.indices.it!) },
    erp: { valor: golden.indices.erp!, semaforo: indexToSemaphore(golden.indices.erp!) }
  };
  return {
    id: 'r1',
    auditId: golden.audit_id,
    version: 1,
    status: 'aprobado',
    canonicalJson: golden,
    schemaVersion: golden.schema_version,
    clientDraft: draft,
    internalDraft: buildValidInternalDraft(),
    promptVersion: '1.0',
    model: 'claude-opus-4-8',
    errorMessage: null,
    loomUrl: null,
    requestedBy: 'u1',
    editedBy: null,
    editedAt: null,
    approvedBy: 'u1',
    approvedAt: new Date(),
    ejemplar: false,
    contextMeta: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

describe('informe web render (R10, R11, R12)', () => {
  const model = buildInformeRenderModel(fakeReport());
  const html = renderInformeWebHtml(model);

  it('hero con logo vertical CDN R2, tag, cliente y CUIT (R10)', () => {
    expect(html).toContain(
      'https://pub-9195f8a94602486395419c2bb7beab6b.r2.dev/LOGOS/sys_vertical_w.png'
    );
    expect(html).toContain('class="tag"');
    expect(html).toContain(golden.client.razon_social);
    expect(html).toContain('CUIT 30-12345678-9');
    expect(html).toContain('Sistema auditado: Tango Gestión');
  });

  it('gauge con score del snapshot canónico y badge por semáforo (R10)', () => {
    expect(html).toContain(`data-gauge-score="${golden.indices.erp}"`);
    const sem = indexToSemaphore(golden.indices.erp!);
    expect(html).toContain(webGaugeBadgeLabel(sem));
    expect(html).toContain(webGaugeColorVar(sem));
  });

  it('helpers puros del gauge: color, badge y dashoffset', () => {
    expect(webGaugeColorVar('red')).toBe('var(--sys-rojo)');
    expect(webGaugeColorVar('amber')).toBe('var(--sys-naranja)');
    expect(webGaugeColorVar('green')).toBe('var(--sys-verde)');
    expect(webGaugeBadgeLabel('red')).toBe('CRÍTICO');
    expect(webGaugeBadgeLabel('amber')).toBe('REGULAR');
    expect(webGaugeBadgeLabel('green')).toBe('BUENO');
    expect(webGaugeDashoffset(0)).toBe(276.5);
    expect(webGaugeDashoffset(100)).toBe(0);
    expect(webGaugeDashoffset(50)).toBeCloseTo(138.3, 1);
  });

  it('secciones 01–05 + CTA + footer de confidencialidad (R10)', () => {
    expect(html).toContain('01 · Resumen ejecutivo');
    expect(html).toContain('02 · Hallazgos por circuito');
    expect(html).toContain('03 · Riesgos priorizados');
    expect(html).toContain('04 · Qué cambia en el día a día');
    expect(html).toContain('05 · El plan');
    expect(html).toContain('Coordinar próximos pasos');
    expect(html).toContain('Integral de verdad.');
    expect(html).toContain(
      `Informe confidencial preparado para ${golden.client.razon_social}`
    );
  });

  it('score-rows con valores y semáforos del snapshot canónico (R10, R12)', () => {
    // A1 = 20 → r, A2 = 100 → g, A3 = 55 → o (golden canónico, no draft)
    expect(html).toContain('data-canonical="score">20<');
    expect(html).toContain('data-canonical="score">100<');
    expect(html).toContain('data-canonical="score">55<');
    expect(html).toContain('score-row reveal r');
    expect(html).toContain('score-row reveal g');
    expect(html).toContain('score-row reveal o');
    expect(html).toContain('data-w="20"');
    expect(html).toContain('data-w="100"');
  });

  it('contadores data-count, clases reveal y tokens --sys-* (R10)', () => {
    expect(html).toContain(`data-count="${golden.indices.erp}"`);
    expect(html).toContain('data-count="2"');
    expect((html.match(/class="[^"]*reveal/g) ?? []).length).toBeGreaterThan(5);
    expect(html).toContain('--sys-azul-electrico');
    expect(html).toContain('--sys-rojo');
    expect(html).toContain('--sys-verde');
    expect(html).toContain('--sys-celeste');
  });

  it('iframe Loom presente con loom_url y ausente sin ella (R11)', () => {
    expect(html).not.toContain('loom.com/embed');
    const withLoom = renderInformeWebHtml(
      buildInformeRenderModel(fakeReport({ loomUrl: 'https://www.loom.com/share/abc123' }))
    );
    expect(withLoom).toContain('https://www.loom.com/embed/abc123');
    expect(withLoom).toContain('loom-section');
  });

  it('no contiene upsell_findings ni internal_draft (R12, acceptance explícito)', () => {
    const report = fakeReport({ loomUrl: 'https://www.loom.com/share/abc123' });
    const out = renderInformeWebHtml(buildInformeRenderModel(report));

    expect(golden.upsell_findings.length).toBeGreaterThan(0);
    for (const finding of golden.upsell_findings) {
      expect(out).not.toContain(finding.text);
    }
    for (const rec of report.internalDraft!.recomendaciones_presupuesto) {
      expect(out).not.toContain(rec.linea);
      expect(out).not.toContain(rec.rango_estimado);
      expect(out).not.toContain(rec.justificacion);
    }
    expect(out).not.toContain('upsell');
    expect(out).not.toContain('recomendaciones_presupuesto');
  });

  it('card de circuitos con controles omitida si el campo quedó null (decisión 4)', () => {
    const report = fakeReport();
    report.clientDraft!.resumen.circuitos_con_controles = null;
    const out = renderInformeWebHtml(buildInformeRenderModel(report));
    expect(out).not.toContain('circuitos con controles internos aplicados');
    expect(out).not.toContain('a editar');
  });

  it('report-web-render.svelte usa renderInformeWebHtml (única fuente del HTML)', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/lib/components/informe/report-web-render.svelte'),
      'utf8'
    );
    expect(source).toContain("from '$lib/informe/web-render'");
    expect(source).toContain('renderInformeWebHtml');
  });

  it('snapshot estable del render web', () => {
    expect(html).toMatchSnapshot();
  });

  // #45 — ERP puro no incluye la sección de inventario (R9, R14).
  it('ERP puro no renderiza la sección de inventario (R9, R14)', () => {
    const erpGolden = {
      ...golden,
      types: ['erp-tango'],
      templates: golden.templates.filter((t) => t.code === 'erp-tango'),
      sections: golden.sections.filter((s) => s.template_code === 'erp-tango'),
      indices: { erp: golden.indices.erp! }
    };
    const out = renderInformeWebHtml(
      buildInformeRenderModel(fakeReport({ canonicalJson: erpGolden }))
    );
    expect(out).not.toContain('Inventario de equipos');
    // el selector CSS .equip-table está en el STYLE; lo que no debe existir es la
    // tabla renderizada ni la sección de inventario.
    expect(out).not.toContain('<table class="equip-table"');
    expect(out).not.toContain('class="wrap equip"');
    // El slot de inventario no altera el flujo hallazgos → riesgos (R14).
    expect(out.indexOf('02 · Hallazgos por circuito')).toBeLessThan(
      out.indexOf('03 · Riesgos priorizados')
    );
  });
});

// #45 (R8, R10, R11, R5, R15) — render de inventario IT.
const A1_PHOTO_KEY = 'audits/x/A1/photo-1.jpg';

function goldenWithInventory(rows: unknown[]): typeof golden {
  return {
    ...golden,
    sections: golden.sections.map((s) =>
      s.code === 'A1'
        ? {
            ...s,
            items: s.items.map((i) =>
              i.field_type === 'table' ? { ...i, rows } : i
            )
          }
        : s
    )
  } as typeof golden;
}

describe('informe web render — inventario IT (#45)', () => {
  const fakePhotoUrl = (key: string) => `/photos/${key}`;

  it('tabla equip-table + galería con foto resuelta vía resolvedor (R8, R10)', () => {
    const canonicalJson = goldenWithInventory([
      {
        row_id: 'r-1',
        cells: { tipo: 'Notebook', modelo: 'Lenovo T14', anio: 2018, estado_eol: 'eol' },
        attachments: [A1_PHOTO_KEY]
      }
    ]);
    const model = buildInformeRenderModel(fakeReport({ canonicalJson }), {
      photoUrl: fakePhotoUrl
    });
    const out = renderInformeWebHtml(model);

    expect(out).toContain('Inventario de equipos');
    expect(out).toContain('class="equip-table"');
    expect(out).toContain('Notebook');
    expect(out).toContain('Lenovo T14');
    expect(out).toContain(`/photos/${A1_PHOTO_KEY}`);
    expect(out).toContain('class="equip-fig"');
    expect(out).toContain('equip-dot r');
    // con foto no se renderiza el placeholder (el selector CSS .equip-ph sí está
    // en el STYLE, pero no el div del placeholder).
    expect(out).not.toContain('<div class="equip-ph"');
  });

  it('equipo sin fotos resolubles renderiza placeholder equip-ph (R11)', () => {
    const canonicalJson = goldenWithInventory([
      { row_id: 'r-1', cells: { tipo: 'Servidor', anio: 2015 }, attachments: [] }
    ]);
    const model = buildInformeRenderModel(fakeReport({ canonicalJson }), {
      photoUrl: fakePhotoUrl
    });
    const out = renderInformeWebHtml(model);
    expect(out).toContain('Inventario de equipos');
    expect(out).toContain('<div class="equip-ph"');
    expect(out).toContain('Servidor');
  });

  it('snapshot inventario IT con y sin fotos', () => {
    const conFoto = renderInformeWebHtml(
      buildInformeRenderModel(
        fakeReport({
          canonicalJson: goldenWithInventory([
            {
              row_id: 'r-1',
              cells: { tipo: 'Notebook', modelo: 'Lenovo T14', anio: 2018, estado_eol: 'vigente' },
              attachments: [A1_PHOTO_KEY]
            }
          ])
        }),
        { photoUrl: fakePhotoUrl }
      )
    );
    expect(conFoto).toMatchSnapshot('inventario-con-foto');

    const sinFoto = renderInformeWebHtml(
      buildInformeRenderModel(
        fakeReport({
          canonicalJson: goldenWithInventory([
            { row_id: 'r-1', cells: { tipo: 'Servidor', anio: 2015 }, attachments: [] }
          ])
        }),
        { photoUrl: fakePhotoUrl }
      )
    );
    expect(sinFoto).toMatchSnapshot('inventario-sin-foto');
  });

  it('no-fuga: inventario sin material interno (R5, R15)', () => {
    const canonicalJson = goldenWithInventory([
      { row_id: 'r-1', cells: { tipo: 'Notebook', anio: 2018 }, attachments: [A1_PHOTO_KEY] }
    ]);
    const report = fakeReport({ canonicalJson, loomUrl: null });
    const out = renderInformeWebHtml(
      buildInformeRenderModel(report, { photoUrl: fakePhotoUrl })
    );
    for (const finding of golden.upsell_findings) {
      expect(out).not.toContain(finding.text);
    }
    expect(out).not.toContain('upsell');
    expect(out).not.toContain('internal');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// #46 — paridad informe gold: tabla de seguridad, próximos pasos + excl-grid,
// timeline vertical, print A4. Cada test mapea a R<n> de
// specs/46_paridad_informe_gold/requirements.md.
// ─────────────────────────────────────────────────────────────────────────────

/** Golden recortado a una sección de seguridad con ítems control/estado/obs. */
function goldenSoloSeguridad(): typeof golden {
  const seg = golden.sections.find((s) => /seguridad|usuario/i.test(s.title));
  if (!seg) throw new Error('fixture sin sección de seguridad');
  return { ...golden, sections: [seg] } as typeof golden;
}

/** Golden sin ninguna sección cuyo título mencione seguridad/usuarios. */
function goldenSinSeguridad(): typeof golden {
  const sections = golden.sections.filter((s) => !/seguridad|usuario/i.test(s.title));
  return { ...golden, sections } as typeof golden;
}

describe('informe web render — tabla de seguridad (#46 R1–R4)', () => {
  it('renderiza tabla equip-table de seguridad cuando hay sección relevada (R1, R3)', () => {
    const segSection = golden.sections.find((s) => /seguridad|usuario/i.test(s.title))!;
    const out = renderInformeWebHtml(
      buildInformeRenderModel(fakeReport({ canonicalJson: goldenSoloSeguridad() }))
    );
    expect(out).toContain('class="seguridad-block reveal"');
    expect(out).toContain('equip-table equip-table--seguridad');
    expect(out).toContain('<th>Control</th><th>Estado</th><th>Observaciones</th>');
    expect(out).toContain(segSection.title);
    // El control sale del label del primer ítem no-na de la sección canónica (R3).
    const primerItem = segSection.items.find((i) => !i.na)!;
    expect(out).toContain(primerItem.label);
    // data-label para responsive (R1).
    expect(out).toContain('data-label="Control"');
    expect(out).toContain('data-label="Estado"');
    expect(out).toContain('data-label="Observaciones"');
  });

  it('omite por completo la tabla cuando no hay sección de seguridad (R2)', () => {
    const out = renderInformeWebHtml(
      buildInformeRenderModel(fakeReport({ canonicalJson: goldenSinSeguridad() }))
    );
    // No debe existir el markup renderizado (las clases CSS sí viven en el STYLE).
    expect(out).not.toContain('class="seguridad-block reveal"');
    expect(out).not.toContain('equip-table equip-table--seguridad');
    expect(out).not.toContain('<th>Control</th><th>Estado</th><th>Observaciones</th>');
  });

  it('escapa el texto dinámico de cada celda con escapeHtml (R4)', () => {
    const malicious = goldenSoloSeguridad();
    malicious.sections = malicious.sections.map((s) => ({
      ...s,
      items: s.items.map((i, idx) =>
        idx === 0
          ? { ...i, na: false, label: '<script>x</script>', observations: 'a & b <b>' }
          : i
      )
    }));
    const out = renderInformeWebHtml(
      buildInformeRenderModel(fakeReport({ canonicalJson: malicious }))
    );
    expect(out).not.toContain('<script>x</script>');
    expect(out).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(out).toContain('a &amp; b &lt;b&gt;');
  });

  it('snapshots: tabla de seguridad presente y ausente (R1, R2)', () => {
    const conSeg = renderInformeWebHtml(
      buildInformeRenderModel(fakeReport({ canonicalJson: goldenSoloSeguridad() }))
    );
    expect(conSeg).toMatchSnapshot('seguridad-presente');
    const sinSeg = renderInformeWebHtml(
      buildInformeRenderModel(fakeReport({ canonicalJson: goldenSinSeguridad() }))
    );
    expect(sinSeg).toMatchSnapshot('seguridad-ausente');
  });

  it('la tabla de seguridad no expone material interno (R3, R18)', () => {
    const report = fakeReport({ canonicalJson: goldenSoloSeguridad() });
    const out = renderInformeWebHtml(buildInformeRenderModel(report));
    for (const finding of golden.upsell_findings) {
      expect(out).not.toContain(finding.text);
    }
    for (const rec of report.internalDraft!.recomendaciones_presupuesto) {
      expect(out).not.toContain(rec.linea);
      expect(out).not.toContain(rec.justificacion);
    }
    expect(out).not.toContain('upsell');
    expect(out).not.toContain('recomendaciones_presupuesto');
  });
});

describe('informe web render — próximos pasos + excl-grid (#46 R5–R8)', () => {
  const html = renderInformeWebHtml(buildInformeRenderModel(fakeReport()));

  it('renderiza pasos numerados steps/step/sn desde proximos_pasos (R5)', () => {
    expect(html).toContain('<div class="steps reveal">');
    expect(html).toContain('<div class="sn">1</div>');
    expect(html).toContain('<div class="sn">2</div>');
    expect(html).toContain('<div class="sn">3</div>');
    expect(html).toContain('El cliente aprueba este informe y designa su referente.');
  });

  it('renderiza excl-grid con dos excl-box necesitamos/no_incluye (R6)', () => {
    expect(html).toContain('<div class="excl-grid reveal">');
    expect((html.match(/class="excl-box"/g) ?? []).length).toBe(2);
    expect(html).toContain(`Qué necesitamos de ${golden.client.razon_social}`);
    expect(html).toContain('Qué no incluye esta etapa');
    expect(html).toContain('Referente del proyecto designado.');
    expect(html).toContain('Desarrollo a medida.');
  });

  it('omite el bloque de pasos cuando proximos_pasos está vacío (R7)', () => {
    const report = fakeReport();
    report.clientDraft!.proximos_pasos = [];
    const out = renderInformeWebHtml(buildInformeRenderModel(report));
    expect(out).not.toContain('<div class="steps reveal">');
    expect(out).not.toContain('<div class="sn">');
    // pero el excl-grid sigue presente.
    expect(out).toContain('<div class="excl-grid reveal">');
  });

  it('no renderiza el bloque twocol previo (R8)', () => {
    expect(html).not.toContain('class="twocol"');
    expect(html).not.toContain('<div><h3>Qué no incluye esta etapa</h3>');
  });

  it('snapshot próximos pasos: con pasos y sin pasos (R5–R8)', () => {
    expect(html).toMatchSnapshot('proximos-pasos-con-pasos');
    const report = fakeReport();
    report.clientDraft!.proximos_pasos = [];
    const sinPasos = renderInformeWebHtml(buildInformeRenderModel(report));
    expect(sinPasos).toMatchSnapshot('proximos-pasos-sin-pasos');
  });
});

describe('informe web render — timeline horizontal vs vertical (#46 R9–R11)', () => {
  function reportConEtapas(n: number) {
    const report = fakeReport();
    report.clientDraft!.plan.etapas = Array.from({ length: n }, (_, i) => ({
      semana: `Sem ${i + 1}`,
      titulo: `Etapa ${i + 1}`,
      descripcion: `Descripción ${i + 1}.`
    }));
    return report;
  }

  it(`conserva el horizontal tl-h con <= ${TL_HORIZONTAL_MAX} etapas (R10)`, () => {
    const out = renderInformeWebHtml(buildInformeRenderModel(reportConEtapas(TL_HORIZONTAL_MAX)));
    expect(out).toContain('class="tl-h reveal"');
    expect(out).not.toContain('class="tl reveal"');
    expect(out).toContain('Etapa 1');
    expect(out).toContain(`Etapa ${TL_HORIZONTAL_MAX}`);
  });

  it(`pasa a vertical tl/tl-item con > ${TL_HORIZONTAL_MAX} etapas (R9, R11)`, () => {
    const out = renderInformeWebHtml(buildInformeRenderModel(reportConEtapas(TL_HORIZONTAL_MAX + 1)));
    expect(out).toContain('class="tl reveal"');
    expect(out).toContain('class="tl-item"');
    expect(out).not.toContain('class="tl-h reveal"');
    expect(out).toContain('Etapa 1');
    expect(out).toContain(`Etapa ${TL_HORIZONTAL_MAX + 1}`);
  });

  it('escapa semana/titulo/descripcion en el vertical (R11)', () => {
    const report = reportConEtapas(5);
    report.clientDraft!.plan.etapas[0] = {
      semana: 'S<1>',
      titulo: 'T & T',
      descripcion: 'D <b>'
    };
    const out = renderInformeWebHtml(buildInformeRenderModel(report));
    expect(out).toContain('S&lt;1&gt;');
    expect(out).toContain('T &amp; T');
    expect(out).toContain('D &lt;b&gt;');
  });

  it('snapshots timeline horizontal y vertical (R9, R10)', () => {
    expect(
      renderInformeWebHtml(buildInformeRenderModel(reportConEtapas(TL_HORIZONTAL_MAX)))
    ).toMatchSnapshot('timeline-horizontal');
    expect(
      renderInformeWebHtml(buildInformeRenderModel(reportConEtapas(TL_HORIZONTAL_MAX + 1)))
    ).toMatchSnapshot('timeline-vertical');
  });
});

describe('informe web render — print A4 robusto (#46 R12–R17)', () => {
  const html = renderInformeWebHtml(buildInformeRenderModel(fakeReport()));

  it('declara @page A4 portrait y bloque @media print (R12)', () => {
    expect(html).toContain('@page { size: A4 portrait; margin: 14mm 16mm; }');
    expect(html).toContain('@media print');
    expect(html).toContain('page-break-after:always');
    expect(html).toContain('page-break-before:always');
  });

  it('gauge con valor final estático para print, sin depender de JS (R13)', () => {
    // arco con offset final en --gauge-final y regla print que lo fija.
    expect(html).toContain('--gauge-final:');
    expect(html).toContain('stroke-dashoffset:var(--gauge-final) !important');
    // número final estático en gauge-num-print (no el "0" animado).
    expect(html).toContain('class="gauge-num-print"');
    expect(html).toContain('.informe-web .gauge-num-print { display:block !important; }');
  });

  it('barras y contadores en valor final estático (R14)', () => {
    expect(html).toContain('.informe-web .bar i { transition:none !important; }');
    // regla por ancho concreto presente en el snapshot canónico.
    expect(html).toMatch(/\.informe-web \.bar i\[data-w="\d+"\] \{ width:\d+% !important; \}/);
    // el número de las cards está en el DOM como texto estático (no solo data-count).
    expect(html).toMatch(/data-count="\d+">\d+/);
  });

  it('tema claro legible en secciones, hero azul, acentos --sys-* (R15, R17)', () => {
    expect(html).toContain('.informe-web { background:#fff !important; color:#102A43 !important; }');
    expect(html).toContain('.informe-web section:not(.hero) { background:#fff !important; }');
    expect(html).toContain('section.hero { min-height:auto !important;');
    expect(html).toContain('var(--sys-azul-electrico) !important');
  });

  it('break-inside avoid en card/score-row/risk/fix/tabla/step/tl-item/excl-box (R16)', () => {
    const printBlock = html.slice(html.indexOf('R16: anti-corte'));
    for (const sel of [
      '.card',
      '.score-row',
      '.risk',
      '.fix',
      '.equip-table tr',
      '.step',
      '.tl-item',
      '.excl-box'
    ]) {
      expect(printBlock).toContain(`.informe-web ${sel}`);
    }
    expect(printBlock).toContain('break-inside:avoid; page-break-inside:avoid;');
  });

  it('snapshot del render con bloques print (R12–R17)', () => {
    expect(html).toMatchSnapshot('print-a4-render');
  });
});
