import { describe, expect, it } from 'vitest';
import { renderInformeHtml } from '../../src/lib/informe/render';
import { buildInformeRenderModel } from '../../src/lib/server/informe/model';
import type { AuditReportRow } from '../../src/lib/server/db/informe-reports';
import { buildValidClientDraft, buildValidInternalDraft, loadInformeCanonicalGolden } from '../fixtures/informe-claude-mock';

describe('informe ref_code render (#41 R18)', () => {
  const golden = loadInformeCanonicalGolden();

  function fakeReport(): AuditReportRow {
    return {
      id: 'r1',
      auditId: golden.audit_id,
      version: 1,
      status: 'aprobado',
      canonicalJson: golden,
      schemaVersion: golden.schema_version,
      clientDraft: buildValidClientDraft(['B1']),
      internalDraft: buildValidInternalDraft(),
      promptVersion: null,
      model: null,
      errorMessage: null,
      loomUrl: null,
      requestedBy: 'u1',
      editedBy: null,
      editedAt: null,
      approvedBy: null,
      approvedAt: new Date(),
      ejemplar: false,
      contextMeta: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  it('render incluye ref_code en portada', () => {
    const model = buildInformeRenderModel(fakeReport(), { refCode: 'ISX-ERP-0002' });
    const html = renderInformeHtml(model);
    expect(html).toContain('Ref: ISX-ERP-0002');
  });
});
