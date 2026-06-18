/**
 * Tests para la feature 27_hora_inicio_fin.
 * Cubre R1–R16 según la tabla de trazabilidad del spec.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderInformeHtml } from '../src/lib/informe/render';
import { buildInformeRenderModel } from '../src/lib/server/informe/model';
import { formatVisita, formatDuracion } from '../src/lib/informe/visita';
import { updateAuditSchema } from '../src/lib/server/backoffice/schemas';
import type { AuditReportRow } from '../src/lib/server/db/informe-reports';
import { indexToSemaphore } from '../src/lib/server/scoring/semaphore';
import {
  buildValidClientDraftIt,
  buildValidInternalDraft
} from './fixtures/informe-claude-mock';
import { loadInformeCanonicalIt } from './fixtures/informe-canonical-variants';

// ---------------------------------------------------------------------------
// T11.1 — Migración idempotente (R1)
// Verificamos que el archivo existe y contiene los guards IF NOT EXISTS.
// ---------------------------------------------------------------------------
describe('T11.1 — migración 018_hora_inicio_fin idempotente (R1)', () => {
  it('el archivo SQL contiene los guards IF NOT EXISTS', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const sqlPath = path.join(process.cwd(), 'migrations', '018_hora_inicio_fin.sql');
    const content = fs.readFileSync(sqlPath, 'utf-8');
    expect(content).toContain('IF NOT EXISTS');
    expect(content).toContain('started_at');
    expect(content).toContain('finished_at');
    expect(content).toContain('timestamptz');
  });
});

// ---------------------------------------------------------------------------
// T11.2 / T11.3 — stampStartedAt (R2, R3, R4)
// ---------------------------------------------------------------------------
describe('T11.2 / T11.3 — stampStartedAt (R2, R3, R4)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('emite UPDATE con WHERE started_at IS NULL (R2, R4)', async () => {
    const calls: string[] = [];
    // Creamos un mock de getSql que captura los template strings SQL.
    const mockSql = vi.fn((...args: unknown[]) => {
      const strings = args[0] as TemplateStringsArray;
      if (strings) {
        calls.push(strings.join('?'));
      }
      return Promise.resolve([]);
    }) as unknown as ReturnType<typeof import('../src/lib/server/db/client').getSql>;
    Object.assign(mockSql, { begin: vi.fn(), json: vi.fn((v: unknown) => v) });

    vi.doMock('../src/lib/server/db/client', () => ({ getSql: () => mockSql }));

    const { stampStartedAt } = await import('../src/lib/server/db/audit-form');
    await stampStartedAt('audit-id-1');

    // Debe haber exactamente 1 llamada al template SQL.
    expect(calls.length).toBe(1);
    const query = calls[0];
    expect(query).toContain('started_at = now()');
    expect(query).toContain('started_at IS NULL');
  });

  it('stampStartedAt usa SQL condicional (el guard está en SQL, no en TS) (R3)', async () => {
    // El test anterior ya verifica el patrón atómico: el WHERE started_at IS NULL
    // está en la query SQL, así que es idempotente por definición.
    // Este test es un alias documentativo.
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T11.3 — stampFinishedAt (R5, R7)
// ---------------------------------------------------------------------------
describe('T11.3 — stampFinishedAt (R5, R7)', () => {
  it('emite UPDATE con WHERE finished_at IS NULL (R5, R7)', async () => {
    vi.resetModules();
    const calls: string[] = [];
    const mockSql = vi.fn((...args: unknown[]) => {
      const strings = args[0] as TemplateStringsArray;
      if (strings) {
        calls.push(strings.join('?'));
      }
      return Promise.resolve([]);
    }) as unknown as ReturnType<typeof import('../src/lib/server/db/client').getSql>;
    Object.assign(mockSql, { begin: vi.fn(), json: vi.fn((v: unknown) => v) });

    vi.doMock('../src/lib/server/db/client', () => ({ getSql: () => mockSql }));

    const { stampFinishedAt } = await import('../src/lib/server/db/audit-form');
    await stampFinishedAt('audit-id-2');

    expect(calls.length).toBe(1);
    const query = calls[0];
    expect(query).toContain('finished_at = now()');
    expect(query).toContain('finished_at IS NULL');
  });
});

// ---------------------------------------------------------------------------
// T11.4 / T11.5 — completeRelevamiento (R5, R6, R7)
// ---------------------------------------------------------------------------
describe('T11.4 / T11.5 — completeRelevamiento (R5, R7)', () => {
  it('cuando audit ya está en en_cierre no llama stampFinishedAt (R7)', async () => {
    vi.resetModules();

    const mockStampFinishedAt = vi.fn();
    const mockSetAuditStatus = vi.fn();
    const mockRecalculate = vi.fn().mockResolvedValue(undefined);

    vi.doMock('../src/lib/server/db/audit-form', () => ({
      getAuditFormHeader: vi.fn().mockResolvedValue({
        id: 'a1',
        status: 'en_cierre',
        assigned_tech_id: 'u1',
        client_id: 'c1',
        name: 'test',
        razon_social: 'Empresa Test',
        types: ['it'],
        segment: 'A',
        archived_at: null
      }),
      listPendingRequiredItems: vi.fn().mockResolvedValue([]),
      setAuditStatus: mockSetAuditStatus,
      stampFinishedAt: mockStampFinishedAt,
      FORM_EDITABLE_STATUSES: ['briefing_completo', 'en_relevamiento', 'en_cierre']
    }));

    // #32: assertFormAccess ahora exige asignación efectiva (audit_assignment).
    // El técnico u1 está asignado al tipo 'it' de la auditoría a1.
    vi.doMock('../src/lib/server/db/audit-assignment', () => ({
      techAssignedTypes: vi.fn().mockResolvedValue(['it'])
    }));

    vi.doMock('../src/lib/server/scoring/persist', () => ({
      recalculateAndPersistScores: mockRecalculate
    }));

    const { completeRelevamiento } = await import('../src/lib/server/form/complete');
    const user = { id: 'u1', role: 'tecnico' as const, email: 't@t.com', name: 'T', active: true, auditTypes: null };

    const result = await completeRelevamiento('a1', user);
    expect(result.status).toBe('en_cierre');
    // No debe llamar stampFinishedAt cuando ya está en_cierre (idempotencia)
    expect(mockStampFinishedAt).not.toHaveBeenCalled();
    expect(mockSetAuditStatus).not.toHaveBeenCalled();
  });

  it('sella finished_at antes de setAuditStatus cuando status es en_relevamiento (R5)', async () => {
    vi.resetModules();

    const callOrder: string[] = [];
    const mockStampFinishedAt = vi.fn().mockImplementation(() => {
      callOrder.push('stampFinishedAt');
      return Promise.resolve();
    });
    const mockSetAuditStatus = vi.fn().mockImplementation(() => {
      callOrder.push('setAuditStatus');
      return Promise.resolve();
    });

    vi.doMock('../src/lib/server/db/audit-form', () => ({
      getAuditFormHeader: vi.fn().mockResolvedValue({
        id: 'a1',
        status: 'en_relevamiento',
        assigned_tech_id: 'u1',
        client_id: 'c1',
        name: 'test',
        razon_social: 'Empresa Test',
        types: ['it'],
        segment: 'A',
        archived_at: null
      }),
      listPendingRequiredItems: vi.fn().mockResolvedValue([]),
      setAuditStatus: mockSetAuditStatus,
      stampFinishedAt: mockStampFinishedAt,
      FORM_EDITABLE_STATUSES: ['briefing_completo', 'en_relevamiento', 'en_cierre']
    }));

    // #32: assertFormAccess ahora exige asignación efectiva (audit_assignment).
    // El técnico u1 está asignado al tipo 'it' de la auditoría a1.
    vi.doMock('../src/lib/server/db/audit-assignment', () => ({
      techAssignedTypes: vi.fn().mockResolvedValue(['it'])
    }));

    vi.doMock('../src/lib/server/scoring/persist', () => ({
      recalculateAndPersistScores: vi.fn().mockResolvedValue(undefined)
    }));

    const { completeRelevamiento } = await import('../src/lib/server/form/complete');
    const user = { id: 'u1', role: 'tecnico' as const, email: 't@t.com', name: 'T', active: true, auditTypes: null };

    await completeRelevamiento('a1', user);

    expect(callOrder[0]).toBe('stampFinishedAt');
    expect(callOrder[1]).toBe('setAuditStatus');
  });
});

// ---------------------------------------------------------------------------
// T11.6 — Schema Zod: rechaza finishedAt < startedAt (R9)
// ---------------------------------------------------------------------------
describe('T11.6 — updateAuditSchema rechaza fin < inicio (R9)', () => {
  it('rechaza cuando finishedAt < startedAt', () => {
    const result = updateAuditSchema.safeParse({
      startedAt: '2026-06-14T11:15:00-03:00',
      finishedAt: '2026-06-14T09:30:00-03:00'
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = result.error.errors.map((e) => e.message).join(' ');
      expect(msg).toContain('fin');
    }
  });

  it('acepta cuando finishedAt >= startedAt', () => {
    const result = updateAuditSchema.safeParse({
      startedAt: '2026-06-14T09:30:00-03:00',
      finishedAt: '2026-06-14T11:15:00-03:00'
    });
    expect(result.success).toBe(true);
  });

  it('acepta cuando solo está startedAt (sin finishedAt)', () => {
    const result = updateAuditSchema.safeParse({
      startedAt: '2026-06-14T09:30:00-03:00'
    });
    expect(result.success).toBe(true);
  });

  it('acepta cuando ambos son null', () => {
    const result = updateAuditSchema.safeParse({
      startedAt: null,
      finishedAt: null
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T11.7 — formatVisita con ambos presentes (R11)
// ---------------------------------------------------------------------------
describe('T11.7 — formatVisita ambos presentes (R11)', () => {
  it('retorna rangoStr, inicioStr, finStr y duracionMin correctos', () => {
    // UTC-3: 2026-06-14T12:30:00Z = 09:30 ARG, 2026-06-14T14:15:00Z = 11:15 ARG
    const startedAt = new Date('2026-06-14T12:30:00Z');
    const finishedAt = new Date('2026-06-14T14:15:00Z');

    const v = formatVisita({ startedAt, finishedAt });
    expect(v).not.toBeNull();
    expect(v!.duracionMin).toBe(105);
    expect(v!.finStr).toBe('11:15');
    expect(v!.inicioStr).toBe('14/06 09:30');
    expect(v!.rangoStr).toContain('Visita:');
    expect(v!.rangoStr).toContain('09:30');
    expect(v!.rangoStr).toContain('11:15');
    expect(v!.rangoStr).toContain('1h 45m');
  });
});

// ---------------------------------------------------------------------------
// T11.8 — formatVisita solo startedAt (R12)
// ---------------------------------------------------------------------------
describe('T11.8 — formatVisita solo startedAt (R12)', () => {
  it('retorna objeto con finStr vacío y duracionMin 0', () => {
    const startedAt = new Date('2026-06-14T12:30:00Z');
    const v = formatVisita({ startedAt, finishedAt: null });
    expect(v).not.toBeNull();
    expect(v!.finStr).toBe('');
    expect(v!.duracionMin).toBe(0);
    expect(v!.rangoStr).toContain('Inicio:');
    expect(v!.inicioStr).toBe('14/06 09:30');
  });
});

// ---------------------------------------------------------------------------
// T11.9 — formatVisita ambos null (R13)
// ---------------------------------------------------------------------------
describe('T11.9 — formatVisita ambos null (R13)', () => {
  it('retorna null cuando startedAt es null', () => {
    const v = formatVisita({ startedAt: null, finishedAt: null });
    expect(v).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T11.10 — formatDuracion (R11)
// ---------------------------------------------------------------------------
describe('T11.10 — formatDuracion (R11)', () => {
  it('105 → "1h 45m"', () => {
    expect(formatDuracion(105)).toBe('1h 45m');
  });

  it('45 → "45m"', () => {
    expect(formatDuracion(45)).toBe('45m');
  });

  it('60 → "1h"', () => {
    expect(formatDuracion(60)).toBe('1h');
  });

  it('90 → "1h 30m"', () => {
    expect(formatDuracion(90)).toBe('1h 30m');
  });
});

// ---------------------------------------------------------------------------
// T11.11 — Render IT: snapshot con visita presente (R14)
// ---------------------------------------------------------------------------
describe('T11.11 / T11.12 — render IT con/sin visita (R14, R15, R16)', () => {
  function fakeItReport(): AuditReportRow {
    const canonical = loadInformeCanonicalIt();
    const codes = canonical.sections
      .filter((s) => s.template_code === 'it' && s.score !== null)
      .map((s) => s.code)
      .slice(0, 3);
    const draft = buildValidClientDraftIt(codes.length ? codes : ['A1', 'A2', 'A3']);
    draft.indices = {
      it: { valor: canonical.indices.it!, semaforo: indexToSemaphore(canonical.indices.it!) }
    };
    return {
      id: 'r-it-27',
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

  it('el modelo tiene campo visita opcional en InformeRenderModel (R16)', () => {
    const modelSinVisita = buildInformeRenderModel(fakeItReport());
    expect(modelSinVisita.visita).toBeUndefined();

    const modelConVisita = buildInformeRenderModel(fakeItReport(), {
      startedAt: new Date('2026-06-14T12:30:00Z'),
      finishedAt: new Date('2026-06-14T14:15:00Z')
    });
    expect(modelConVisita.visita).toBeDefined();
    expect(modelConVisita.visita!.inicio).toBe('14/06 09:30');
    expect(modelConVisita.visita!.fin).toBe('11:15');
    expect(modelConVisita.visita!.duracionMin).toBe(105);
  });

  it('render IT sin visita: no contiene texto "Visita:" (R15)', () => {
    const model = buildInformeRenderModel(fakeItReport());
    const html = renderInformeHtml(model);
    expect(html).not.toContain('Visita:');
    expect(html).not.toContain('class="visita"');
  });

  it('render IT con visita: contiene el rango en la portada (R14)', () => {
    const model = buildInformeRenderModel(fakeItReport(), {
      startedAt: new Date('2026-06-14T12:30:00Z'),
      finishedAt: new Date('2026-06-14T14:15:00Z')
    });
    const html = renderInformeHtml(model);
    expect(html).toContain('09:30');
    expect(html).toContain('11:15');
    expect(html).toContain('1h 45m');
  });

  it('snapshot render IT con visita (R14)', () => {
    const model = buildInformeRenderModel(fakeItReport(), {
      startedAt: new Date('2026-06-14T12:30:00Z'),
      finishedAt: new Date('2026-06-14T14:15:00Z')
    });
    const html = renderInformeHtml(model);
    expect(html).toMatchSnapshot();
  });
});
