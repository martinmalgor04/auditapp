import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gaugeDasharray, renderInformeHtml } from '../src/lib/informe/render';
import { buildInformeRenderModel } from '../src/lib/server/informe/model';
import type { AuditReportRow } from '../src/lib/server/db/informe-reports';
import { indexToSemaphore } from '../src/lib/server/scoring/semaphore';
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
    status: 'borrador',
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
    approvedBy: null,
    approvedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

describe('informe render (R12, R16, R25, R26, R30)', () => {
  const model = buildInformeRenderModel(fakeReport());
  const html = renderInformeHtml(model);

  it('contiene las siete páginas del template A4', () => {
    expect((html.match(/<section class="page/g) ?? []).length).toBe(7);
    expect(html).toContain('page dark cover');
    expect(html).toContain('01 · Resumen ejecutivo');
    expect(html).toContain('02 · Hallazgos por circuito');
    expect(html).toContain('03 · Riesgos priorizados');
    expect(html).toContain('04 · Recomendación y plan');
    expect(html).toContain('05 · Qué cambia en el día a día');
    expect(html).toContain('06 · Próximos pasos');
    expect(html).toContain('page dark backcover');
    expect(html).toContain('Integral de verdad.');
  });

  it('gauge con stroke-dasharray derivado del índice canónico (R12)', () => {
    expect(html).toContain(`stroke-dasharray="${gaugeDasharray(golden.indices.erp!)}"`);
    expect(gaugeDasharray(42)).toBe('105.6 251.4');
  });

  it('dots de semáforo coherentes con indexToSemaphore', () => {
    // A1 = 20 → red, A2 = 100 → green, A3 = 55 → amber/orange
    expect(html).toContain('dot red');
    expect(html).toContain('dot green');
    expect(html).toContain('dot orange');
  });

  it('los scores de la tabla salen del snapshot canónico, no del draft', () => {
    expect(html).toContain('data-canonical="score">20<');
    expect(html).toContain('data-canonical="score">100<');
    expect(html).toContain('data-canonical="score">55<');
  });

  it('usa variables --sys-* y regla @media print (R26)', () => {
    expect(html).toContain('--sys-azul-electrico');
    expect(html).toContain('--sys-rojo');
    expect(html).toContain('@media print');
  });

  it('logos directo del CDN R2 (R26)', () => {
    expect(html).toContain(
      'https://pub-9195f8a94602486395419c2bb7beab6b.r2.dev/LOGOS/sys_vertical_w.png'
    );
    expect(html).toContain(
      'https://pub-9195f8a94602486395419c2bb7beab6b.r2.dev/LOGOS/sys_horizontal_b.png'
    );
  });

  it('no contiene textos de upsell_findings (R16)', () => {
    expect(golden.upsell_findings.length).toBeGreaterThan(0);
    for (const finding of golden.upsell_findings) {
      expect(html).not.toContain(finding.text);
    }
  });

  it('iframe Loom presente con loom_url y ausente sin ella, oculto en print (R25)', () => {
    expect(html).not.toContain('loom.com/embed');
    const withLoom = renderInformeHtml(
      buildInformeRenderModel(
        fakeReport({ loomUrl: 'https://www.loom.com/share/abc123' })
      )
    );
    expect(withLoom).toContain('https://www.loom.com/embed/abc123');
    expect(withLoom).toContain('.informe-loom { display:none; }');
  });

  it('modo edición: bloques del draft con contenteditable + data-field; canónicos no (R30)', () => {
    const editable = renderInformeHtml(model, { editMode: true });
    expect(editable).toContain('data-field="resumen.lead" contenteditable="true"');
    expect(editable).toContain('data-field="riesgos.items.0.titulo" contenteditable="true"');
    // Los bloques canónicos no son editables
    expect(editable).not.toContain('data-canonical="score" contenteditable');
    expect(editable.match(/data-canonical="gauge"[^>]*contenteditable/)).toBeNull();
    // Sin modo edición ningún bloque es editable (el selector CSS no cuenta)
    expect(html.match(/data-field="[^"]+" contenteditable/)).toBeNull();
    expect(html).toContain('data-field="resumen.lead"');
  });

  it('circuitos_con_controles null renderiza «a editar» (decisión puerta 8)', () => {
    const report = fakeReport();
    report.clientDraft!.resumen.circuitos_con_controles = null;
    const out = renderInformeHtml(buildInformeRenderModel(report));
    expect(out).toContain('a editar');
  });

  it('portada con cliente, CUIT, módulos y período del canónico', () => {
    expect(html).toContain(golden.client.razon_social);
    expect(html).toContain('CUIT 30-12345678-9');
    expect(html).toContain('ventas, stock');
    expect(html).toContain('Junio 2026');
    expect(html).toContain('Tango Gestión');
  });

  it('report-render.svelte usa renderInformeHtml (única fuente del HTML)', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/lib/components/informe/report-render.svelte'),
      'utf8'
    );
    expect(source).toContain("from '$lib/informe/render'");
    expect(source).toContain('renderInformeHtml');
  });

  it('snapshot estable del render', () => {
    expect(html).toMatchSnapshot();
  });
});
