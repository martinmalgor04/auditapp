import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderInformeHtml } from '../src/lib/informe/render';
import { renderInformeWebHtml } from '../src/lib/informe/web-render';
import { buildInformeRenderModel } from '../src/lib/server/informe/model';
import type { AuditReportRow } from '../src/lib/server/db/informe-reports';
import { indexToSemaphore } from '../src/lib/server/scoring/semaphore';
import {
  buildValidClientDraftIt,
  buildValidInternalDraft
} from './fixtures/informe-claude-mock';
import { loadInformeCanonicalIt } from './fixtures/informe-canonical-variants';

const VERT_URL =
  'https://pub-9195f8a94602486395419c2bb7beab6b.r2.dev/LOGOS/sys_vertical_w.png';
const COLOR_URL =
  'https://pub-9195f8a94602486395419c2bb7beab6b.r2.dev/LOGOS/sys_horizontal_b.png';

function itReport(): AuditReportRow {
  const canonical = loadInformeCanonicalIt();
  const draft = buildValidClientDraftIt(['A1', 'A2', 'A3', 'A4']);
  draft.indices = {
    it: { valor: canonical.indices.it!, semaforo: indexToSemaphore(canonical.indices.it!) }
  };
  return {
    id: 'r-le',
    auditId: canonical.audit_id,
    version: 1,
    status: 'borrador',
    canonicalJson: canonical,
    schemaVersion: canonical.schema_version,
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

describe('#30 logos 100% CDN — plantillas A4 (R16)', () => {
  const files = [
    'docs/plantillas/informe/template_informe_pdf_a4_v1.html',
    'docs/plantillas/informe/template_informe_pdf_a4_it_v1.html'
  ];

  for (const rel of files) {
    it(`${rel}: sin base64 ni placeholders; con URLs CDN (R16)`, () => {
      const html = readFileSync(join(process.cwd(), rel), 'utf8');
      expect(html).not.toContain('__LOGO_VERT__');
      expect(html).not.toContain('__LOGO_COLOR__');
      expect(html).not.toContain('data:image/png;base64');
      expect(html).toContain(VERT_URL);
      expect(html).toContain(COLOR_URL);
    });
  }
});

describe('#30 logos 100% CDN — render PDF y web (R14, R15)', () => {
  const model = buildInformeRenderModel(itReport());
  const pdf = renderInformeHtml(model);
  const web = renderInformeWebHtml(model);

  it('PDF: vertical blanco (portada/cierre) y horizontal oscuro (footer), sin base64 (R14, R15)', () => {
    expect(pdf).toContain(VERT_URL);
    expect(pdf).toContain(COLOR_URL);
    expect(pdf).not.toContain('data:image/png;base64');
    // footer branded usa el logo horizontal sobre fondo claro.
    expect(pdf).toContain(`<div class="footer"><img src="${COLOR_URL}"`);
  });

  it('web: logo vertical blanco desde el CDN, sin base64 (R14)', () => {
    expect(web).toContain(VERT_URL);
    expect(web).not.toContain('data:image/png;base64');
  });
});

describe('#30 editor inline preservado sobre el markup restilado (R20b, R20c)', () => {
  const model = buildInformeRenderModel(itReport());

  it('editMode: bloques del client_draft con data-field + contenteditable (R20b)', () => {
    const editable = renderInformeHtml(model, { editMode: true });
    expect(editable).toContain('data-field="resumen.lead" contenteditable="true"');
    expect(editable).toContain('data-field="riesgos.items.0.titulo" contenteditable="true"');
    expect(editable).toContain('data-field="plan.titulo" contenteditable="true"');
    // Doc/Controles/Madurez del score-row siguen siendo editables.
    expect(editable).toMatch(/data-field="hallazgos\.circuitos\.\d+\.doc" contenteditable="true"/);
  });

  it('editMode: canónicos (score/gauge/norma) NUNCA editables (R20c)', () => {
    const editable = renderInformeHtml(model, { editMode: true });
    expect(editable).not.toContain('data-canonical="score" contenteditable');
    expect(editable.match(/data-canonical="gauge"[^>]*contenteditable/)).toBeNull();
    expect(editable).not.toContain('data-canonical="norma" contenteditable');
  });

  it('sin editMode: ningún bloque del draft es editable, pero los data-field existen', () => {
    const html = renderInformeHtml(model);
    expect(html.match(/data-field="[^"]+" contenteditable/)).toBeNull();
    expect(html).toContain('data-field="resumen.lead"');
  });
});
