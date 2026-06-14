import { describe, expect, it } from 'vitest';
import { renderInformeHtml } from '../src/lib/informe/render';
import { buildInformeRenderModel } from '../src/lib/server/informe/model';
import type { AuditReportRow } from '../src/lib/server/db/informe-reports';
import { indexToSemaphore } from '../src/lib/server/scoring/semaphore';
import {
  buildValidClientDraft,
  buildValidClientDraftIt,
  buildValidInternalDraft
} from './fixtures/informe-claude-mock';
import {
  loadInformeCanonicalIt,
  loadInformeCanonicalMixta
} from './fixtures/informe-canonical-variants';

function fakeItReport(): AuditReportRow {
  const canonical = loadInformeCanonicalIt();
  const codes = ['A1', 'A2', 'A3'];
  const draft = buildValidClientDraftIt(codes);
  draft.indices = {
    it: { valor: canonical.indices.it!, semaforo: indexToSemaphore(canonical.indices.it!) }
  };
  return {
    id: 'r-it',
    auditId: canonical.audit_id,
    version: 1,
    status: 'borrador',
    canonicalJson: canonical,
    schemaVersion: canonical.schema_version,
    clientDraft: draft,
    internalDraft: buildValidInternalDraft(),
    promptVersion: '2.1',
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

function fakeMixtaReport(): AuditReportRow {
  const canonical = loadInformeCanonicalMixta();
  const itCodes = canonical.sections.filter((s) => s.template_code === 'it' && s.score !== null).map((s) => s.code);
  const erpCodes = canonical.sections.filter((s) => s.template_code === 'erp-tango' && s.score !== null).map((s) => s.code);
  const codes = [...itCodes, ...erpCodes].slice(0, 4);
  const draft = buildValidClientDraft(codes.length ? codes : ['A1', 'A2', 'B1', 'B2']);
  draft.indices = {
    it: { valor: canonical.indices.it!, semaforo: indexToSemaphore(canonical.indices.it!) },
    erp: { valor: canonical.indices.erp!, semaforo: indexToSemaphore(canonical.indices.erp!) }
  };
  draft.hallazgos.lectura_transversal = [
    { titulo: 'Controles manuales', detalle: 'Dependencia de planillas en IT y ERP.' },
    { titulo: 'Sin documentación', detalle: 'Procedimientos ausentes en ambos dominios.' },
    { titulo: 'Datos dispersos', detalle: 'Información fuera de los sistemas.' }
  ];
  draft.dia_a_dia.circuitos = [
    { seccion_code: 'A1', hoy: 'área IT sin monitoreo formal', funcionalidades: buildValidClientDraftIt(['A1']).dia_a_dia.circuitos[0].funcionalidades },
    { seccion_code: 'B1', hoy: 'circuito ERP operado a mano', funcionalidades: buildValidClientDraft(['B1']).dia_a_dia.circuitos[0].funcionalidades }
  ];
  return {
    id: 'r-mix',
    auditId: canonical.audit_id,
    version: 1,
    status: 'borrador',
    canonicalJson: canonical,
    schemaVersion: canonical.schema_version,
    clientDraft: draft,
    internalDraft: buildValidInternalDraft(),
    promptVersion: '2.1',
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

describe('informe render IT (#19 R3, R4, R9, R11)', () => {
  const model = buildInformeRenderModel(fakeItReport());
  const html = renderInformeHtml(model);

  it('selecciona variante IT (R1)', () => {
    expect(html).toContain('data-template="it"');
  });

  it('siete páginas con estructura IT (R3)', () => {
    expect((html.match(/<section class="page/g) ?? []).length).toBe(7);
    expect(html).toContain('02 · Hallazgos por área');
    expect(html).toContain('05 · Mejoras prioritarias');
    expect(html).toContain('Inventario de activos');
    expect(html).not.toContain('CAB');
    expect(html).not.toContain('módulos Tango');
    expect(html).not.toContain('Módulos relevados');
    expect(html).not.toContain('Hallazgos por circuito');
    expect(html).not.toContain('Lo que Tango ya sabe hacer');
    expect(html).not.toContain('Sistema: Tango Gestión');
  });

  it('branding SyS compartido (R4)', () => {
    expect(html).toContain('--sys-azul-electrico');
    expect(html).toContain('sys_vertical_w.png');
    expect(html).toContain('sys_horizontal_b.png');
    expect(html).toContain('@media print');
  });

  it('modo edición: canónicos no editables (R9)', () => {
    const editable = renderInformeHtml(model, { editMode: true });
    expect(editable).toContain('data-field="resumen.lead" contenteditable="true"');
    expect(editable).not.toContain('data-canonical="score" contenteditable');
    expect(editable.match(/data-canonical="gauge"[^>]*contenteditable/)).toBeNull();
  });

  it('snapshot estable variante IT', () => {
    expect(html).toMatchSnapshot();
  });
});

describe('informe render mixto (#19 R5, R11)', () => {
  const model = buildInformeRenderModel(fakeMixtaReport());
  const html = renderInformeHtml(model);

  it('selecciona variante mixta (R1)', () => {
    expect(html).toContain('data-template="mixta"');
  });

  it('nueve páginas con doble gauge y tablas separadas (R5)', () => {
    expect((html.match(/<section class="page/g) ?? []).length).toBe(9);
    expect(html).toContain('Índice IT general');
    expect(html).toContain('Índice ERP general');
    expect(html).toContain('Hallazgos por área (IT)');
    expect(html).toContain('Hallazgos por circuito (ERP)');
    expect(html).toContain('05 · Riesgos priorizados');
    expect(html).toContain('06 · Recomendación y plan');
    expect(html).toContain('Mejoras prioritarias por área');
    expect(html).toContain('Qué cambia en el día a día');
  });

  it('snapshot estable variante mixta', () => {
    expect(html).toMatchSnapshot();
  });
});

describe('informe render despacho por types (R1)', () => {
  it('types it → data-template it', () => {
    const report = fakeItReport();
    const out = renderInformeHtml(buildInformeRenderModel(report));
    expect(out).toContain('data-template="it"');
  });

  it('types mixta → data-template mixta', () => {
    const out = renderInformeHtml(buildInformeRenderModel(fakeMixtaReport()));
    expect(out).toContain('data-template="mixta"');
  });
});
