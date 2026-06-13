import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderInformeWebHtml } from '../src/lib/informe/web-render';
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
});
