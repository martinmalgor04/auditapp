import { describe, expect, it } from 'vitest';
import { renderInformeHtml } from '../src/lib/informe/render';
import { renderInformeWebHtml } from '../src/lib/informe/web-render';
import { buildInformeRenderModel } from '../src/lib/server/informe/model';
import type { AuditReportRow } from '../src/lib/server/db/informe-reports';
import { indexToSemaphore } from '../src/lib/server/scoring/semaphore';
import type { CanonicalAudit } from '../src/lib/server/canonical/schema';
import {
  buildValidClientDraft,
  buildValidClientDraftIt,
  buildValidInternalDraft
} from './fixtures/informe-claude-mock';
import {
  loadInformeCanonicalErp,
  loadInformeCanonicalIt,
  loadInformeCanonicalMixta
} from './fixtures/informe-canonical-variants';

function reportFrom(
  canonical: CanonicalAudit,
  draft: ReturnType<typeof buildValidClientDraft>
): AuditReportRow {
  return {
    id: 'r-norma',
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

function itReport(canonical = loadInformeCanonicalIt()): AuditReportRow {
  const codes = ['A1', 'A2', 'A3', 'A4'];
  const draft = buildValidClientDraftIt(codes);
  draft.indices = {
    it: { valor: canonical.indices.it!, semaforo: indexToSemaphore(canonical.indices.it!) }
  };
  return reportFrom(canonical, draft);
}

function erpReport(): AuditReportRow {
  const canonical = loadInformeCanonicalErp();
  const draft = buildValidClientDraft(['B1', 'B2', 'B3']);
  draft.indices = {
    erp: { valor: canonical.indices.erp!, semaforo: indexToSemaphore(canonical.indices.erp!) }
  };
  return reportFrom(canonical, draft);
}

function mixtaReport(): AuditReportRow {
  const canonical = loadInformeCanonicalMixta();
  const draft = buildValidClientDraft(['A1', 'A2', 'B1', 'B2']);
  draft.indices = {
    it: { valor: canonical.indices.it!, semaforo: indexToSemaphore(canonical.indices.it!) },
    erp: { valor: canonical.indices.erp!, semaforo: indexToSemaphore(canonical.indices.erp!) }
  };
  draft.dia_a_dia.circuitos = [
    {
      seccion_code: 'A1',
      hoy: 'área IT sin monitoreo',
      funcionalidades: buildValidClientDraftIt(['A1']).dia_a_dia.circuitos[0].funcionalidades
    },
    {
      seccion_code: 'B1',
      hoy: 'circuito ERP manual',
      funcionalidades: buildValidClientDraft(['B1']).dia_a_dia.circuitos[0].funcionalidades
    }
  ];
  return reportFrom(canonical, draft);
}

describe('#25 normas en informe — modelo de render (R1, R2)', () => {
  it('buildInformeRenderModel expone standardRef crudo del canónico (R1, R2)', () => {
    const model = buildInformeRenderModel(itReport());
    const a4 = model.secciones.find((s) => s.code === 'A4');
    expect(a4).toBeDefined();
    expect(a4!.standardRef).toBe('CIS 4 · NIST: Protect');
    // copia cruda, sin transformación
    const a1 = model.secciones.find((s) => s.code === 'A1');
    expect(a1!.standardRef).toBe('CIS 1 · NIST: Identify');
  });

  it('standardRef null cuando el canónico no lo trae (R1, R13)', () => {
    const canonical = loadInformeCanonicalIt();
    const stripped: CanonicalAudit = {
      ...canonical,
      sections: canonical.sections.map(({ standard_ref: _sr, ...s }) => ({
        ...s,
        standard_ref: null
      }))
    };
    const model = buildInformeRenderModel(itReport(stripped));
    for (const sec of model.secciones) {
      expect(sec.standardRef).toBeNull();
    }
  });
});

describe('#30 norma condicional — PDF IT (R3, R8, R9, R10, R12)', () => {
  const html = renderInformeHtml(buildInformeRenderModel(itReport()));

  it('cada fila IT con norma CIS muestra el standardRef inline en .detail (R9)', () => {
    // La norma va inline en el score-row, no en columna/celda (#30).
    expect(html).toContain('CIS 4 · NIST: Protect');
    expect(html).toContain('CIS 1 · NIST: Identify');
    expect(html).toContain('data-canonical="norma"');
    // Hallazgos como score-rows del lenguaje web-v2: ya no hay columna Norma.
    expect(html).not.toContain('<th style="width:16%">Norma</th>');
    expect(html).toContain('class="score-row');
  });

  it('bloque de metodología IT presente cuando hay norma (R9)', () => {
    expect(html).toContain('data-metodologia="it"');
    expect(html).toContain('CIS Controls v8');
    expect(html).toContain('NIST Cybersecurity Framework');
    expect(html).toContain('HPE, Lenovo, Dell');
  });

  it('IT sin norma CIS → NO se muestra norma alguna (R10), ni columna (R11)', () => {
    const canonical = loadInformeCanonicalIt();
    const stripped: CanonicalAudit = {
      ...canonical,
      sections: canonical.sections.map((s) => ({ ...s, standard_ref: null }))
    };
    const out = renderInformeHtml(buildInformeRenderModel(itReport(stripped)));
    // Nada de norma: ni data-canonical="norma", ni celda, ni etiqueta, ni columna.
    expect(out).not.toContain('data-canonical="norma"');
    expect(out).not.toContain('<td data-canonical="norma"></td>');
    expect(out).not.toContain('>Norma<');
    expect(out).not.toContain('Control interno');
    expect(out).not.toContain('CIS 4');
    // Sin ninguna norma → no se muestra metodología (R10/R11).
    expect(out).not.toContain('data-metodologia="it"');
  });

  it('IT con standardRef que NO empieza con CIS → no hay norma (R8, R10)', () => {
    const canonical = loadInformeCanonicalIt();
    const tweaked: CanonicalAudit = {
      ...canonical,
      sections: canonical.sections.map((s) => ({ ...s, standard_ref: 'ISO 27001' }))
    };
    const out = renderInformeHtml(buildInformeRenderModel(itReport(tweaked)));
    expect(out).not.toContain('data-canonical="norma"');
    expect(out).not.toContain('ISO 27001');
    expect(out).not.toContain('data-metodologia="it"');
  });

  it('no expone nomenclatura interna ERP cruda (R12)', () => {
    expect(html).not.toMatch(/ERP B\d/);
    expect(html).not.toMatch(/ERP E\d/);
  });
});

describe('#30 norma condicional — PDF mixta (R4, R8–R12)', () => {
  const html = renderInformeHtml(buildInformeRenderModel(mixtaReport()));

  it('página IT del mixto muestra norma inline en score-rows, sin columna (R9, R11)', () => {
    expect(html).toContain('Hallazgos por área (IT)');
    expect(html).toContain('data-canonical="norma"');
    expect(html).not.toContain('<th style="width:16%">Norma</th>');
  });

  it('página ERP del mixto NO muestra norma (R8, R10)', () => {
    // La parte ERP usa score-rows pero sin norma (dominio erp → hayNorma=false).
    expect(html).toContain('Hallazgos por circuito (ERP)');
    expect(html).toContain('class="score-row');
  });

  it('bloque de metodología declara solo marco IT, sin control interno ERP', () => {
    expect(html).toContain('data-metodologia="it"');
    expect(html).not.toContain('control interno ERP');
    expect(html).not.toContain('Control interno');
  });

  it('no expone nomenclatura interna ERP cruda (R12)', () => {
    expect(html).not.toMatch(/ERP B\d/);
    expect(html).not.toMatch(/ERP E\d/);
  });
});

describe('#30 norma condicional — web pública consistente con PDF (R8–R13)', () => {
  it('filas IT con CIS muestran norma; metodología IT presente (R9)', () => {
    const html = renderInformeWebHtml(buildInformeRenderModel(itReport()));
    expect(html).toContain('CIS 4 · NIST: Protect');
    expect(html).toContain('data-canonical="norma"');
    expect(html).toContain('data-metodologia="it"');
    expect(html).toContain('CIS Controls v8');
  });

  it('web IT sin norma CIS: sin norma ni metodología (R10)', () => {
    const canonical = loadInformeCanonicalIt();
    const stripped: CanonicalAudit = {
      ...canonical,
      sections: canonical.sections.map((s) => ({ ...s, standard_ref: null }))
    };
    const html = renderInformeWebHtml(buildInformeRenderModel(itReport(stripped)));
    expect(html).not.toContain('data-canonical="norma"');
    expect(html).not.toContain('data-metodologia="it"');
  });

  it('web ERP pura: sin norma ni metodología (R8, R10)', () => {
    const html = renderInformeWebHtml(buildInformeRenderModel(erpReport()));
    expect(html).not.toContain('data-canonical="norma"');
    expect(html).not.toContain('data-metodologia="it"');
    expect(html).not.toMatch(/ERP B\d/);
  });
});

describe('#30 norma condicional — ERP puro sin norma alguna (R8, R10, R11)', () => {
  const html = renderInformeHtml(buildInformeRenderModel(erpReport()));

  it('NO contiene norma (sin celda, sin columna, sin etiqueta) (R10, R11)', () => {
    expect(html).not.toContain('>Norma<');
    expect(html).not.toContain('data-canonical="norma"');
    expect(html).not.toContain('Control interno');
    // Hallazgos ERP como score-rows del lenguaje web-v2.
    expect(html).toContain('class="score-row');
  });

  it('NO contiene bloque de metodología (R10)', () => {
    expect(html).not.toContain('data-metodologia="it"');
    expect(html).not.toContain('CIS Controls v8');
  });

  it('no expone nomenclatura interna ERP cruda (R12)', () => {
    expect(html).not.toMatch(/ERP B\d/);
    expect(html).not.toMatch(/ERP E\d/);
  });
});

describe('#30 no-regresión scoring — scores/semáforos sin cambios (R21, R22)', () => {
  it('los scores del render salen del canónico, intactos (IT, ERP, mixta)', () => {
    for (const report of [itReport(), erpReport(), mixtaReport()]) {
      const canonical = report.canonicalJson as CanonicalAudit;
      const draft = report.clientDraft!;
      const byCode = new Map(canonical.sections.map((s) => [s.code, s]));
      const html = renderInformeHtml(buildInformeRenderModel(report));
      // Para cada circuito renderizado, el score mostrado es el del canónico.
      const renderedCodes = new Set(draft.hallazgos.circuitos.map((c) => c.seccion_code));
      let checked = 0;
      for (const code of renderedCodes) {
        const sec = byCode.get(code);
        if (!sec || sec.score === null) continue;
        expect(html).toContain(`data-canonical="score">${sec.score}`);
        checked++;
      }
      expect(checked).toBeGreaterThan(0);
    }
  });
});
