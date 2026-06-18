import { describe, expect, it } from 'vitest';
import { renderInformeHtml } from '../src/lib/informe/render';
import { renderInformeWebHtml } from '../src/lib/informe/web-render';
import { buildInformeRenderModel } from '../src/lib/server/informe/model';
import type { AuditReportRow } from '../src/lib/server/db/informe-reports';
import { indexToSemaphore } from '../src/lib/server/scoring/semaphore';
import {
  buildValidClientDraft,
  buildValidInternalDraft,
  loadInformeCanonicalGolden
} from './fixtures/informe-claude-mock';

/**
 * #30 R18/R19/R20 — invariantes del informe al cliente: jamás aparecen quick_wins
 * ni upsell_findings (material interno), ni la propuesta/cotización comercial.
 * Se usa el canónico golden, que SÍ trae quick_wins y upsell_findings, para
 * blindar que el render cliente (PDF y web) nunca los filtra a la salida.
 */
const golden = loadInformeCanonicalGolden();

function goldenReport(): AuditReportRow {
  const codes = golden.sections.filter((s) => s.score !== null).map((s) => s.code).slice(0, 3);
  const draft = buildValidClientDraft(codes.length ? codes : ['B1', 'B2', 'B3']);
  const idx = golden.indices.erp ?? golden.indices.it!;
  draft.indices = golden.indices.erp
    ? { erp: { valor: idx, semaforo: indexToSemaphore(idx) } }
    : { it: { valor: idx, semaforo: indexToSemaphore(idx) } };
  return {
    id: 'r-inv',
    auditId: golden.audit_id,
    version: 1,
    status: 'borrador',
    canonicalJson: golden,
    schemaVersion: golden.schema_version,
    clientDraft: draft,
    internalDraft: buildValidInternalDraft(),
    promptVersion: '2.2',
    model: 'claude-opus-4-8',
    errorMessage: null,
    loomUrl: null,
    requestedBy: 'u1',
    editedBy: null,
    editedAt: null,
    approvedBy: null,
    approvedAt: null,
    ejemplar: false,
    contextMeta: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

describe('#30 invariantes informe cliente — quick_wins / upsell / propuesta (R18, R19, R20)', () => {
  const model = buildInformeRenderModel(goldenReport());
  const pdf = renderInformeHtml(model);
  const web = renderInformeWebHtml(model);

  it('el canónico de prueba sí contiene quick_wins y upsell_findings', () => {
    expect(golden.quick_wins.length).toBeGreaterThan(0);
    expect(golden.upsell_findings.length).toBeGreaterThan(0);
  });

  it('el PDF NO contiene textos de quick_wins (R18)', () => {
    for (const qw of golden.quick_wins) {
      expect(pdf).not.toContain(qw);
    }
  });

  it('la web NO contiene textos de quick_wins (R18)', () => {
    for (const qw of golden.quick_wins) {
      expect(web).not.toContain(qw);
    }
  });

  it('el PDF NO contiene textos de upsell_findings (R19)', () => {
    for (const f of golden.upsell_findings) {
      expect(pdf).not.toContain(f.text);
    }
  });

  it('la web NO contiene textos de upsell_findings (R19)', () => {
    for (const f of golden.upsell_findings) {
      expect(web).not.toContain(f.text);
    }
  });

  it('ni PDF ni web contienen marcadores de propuesta comercial (R20)', () => {
    for (const html of [pdf, web]) {
      expect(html).not.toMatch(/\bps-[a-z]/); // clases .ps-* del bloque de propuesta
      expect(html).not.toContain('Validez de la propuesta');
      expect(html).not.toContain('Inversión');
      expect(html).not.toContain('rango_estimado');
      expect(html).not.toContain('USD 2.000');
    }
  });
});
