import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type postgres from 'postgres';
import { setSqlForTests } from '../src/lib/server/db/client';
import { setupTestDb, teardownTestDb } from './helpers/db';
import { findUserByEmail } from './helpers/auth';
import { seedCanonicalAuditFixture } from './fixtures/canonical-audit';
import {
  buildValidEnvelope,
  loadInformeCanonicalGolden,
  mockAdapterInvalid,
  mockAdapterThrows,
  mockAdapterUnknownSection,
  mockAdapterValid,
  type AdapterCall
} from './fixtures/informe-claude-mock';
import { getReportById, insertReport } from '../src/lib/server/db/informe-reports';
import { createReport, runInformePipeline } from '../src/lib/server/informe/pipeline';
import {
  INFORME_DEFAULT_MODEL,
  createClaudeAdapter,
  resolveInformeModel
} from '../src/lib/server/informe/claude';
import { INFORME_PROMPT_VERSION } from '../src/lib/server/informe/prompts/generate-report';
import { contextMetaSchema } from '../src/lib/server/informe/context/schemas';
import type { RagRetriever } from '../src/lib/server/informe/rag/retriever';
import { indexToSemaphore } from '../src/lib/server/scoring/semaphore';
import { CANONICAL_SCHEMA_VERSION } from '../src/lib/server/canonical/version';
import { loadCatalogoSys } from '../src/lib/server/informe/catalogo/catalogo-sys';

describe('informe pipeline', () => {
  let sql: postgres.Sql;
  const golden = loadInformeCanonicalGolden();

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(() => {
    setSqlForTests(sql);
    process.env.ANTHROPIC_API_KEY = 'test-key';
    delete process.env.INFORME_RAG_ENABLED;
    delete process.env.INFORME_CATALOGO_ENABLED;
    delete process.env.INFORME_FEWSHOT_ENABLED;
  });

  afterEach(() => {
    delete process.env.INFORME_CLAUDE_MODEL;
    delete process.env.INFORME_RAG_ENABLED;
    delete process.env.INFORME_CATALOGO_ENABLED;
    delete process.env.INFORME_FEWSHOT_ENABLED;
  });

  afterAll(async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await teardownTestDb();
  });

  async function seedReport(canonical = golden) {
    const { auditId } = await seedCanonicalAuditFixture(sql);
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');
    const row = await insertReport({
      auditId,
      canonicalJson: canonical,
      schemaVersion: canonical.schema_version,
      requestedBy: admin!.id
    });
    return { auditId, reportId: row.id, admin: admin! };
  }

  it('createReport usa el builder canónico con allowOpen:false (R5)', async () => {
    const { auditId, admin } = await seedReport();
    const spy = vi.fn().mockResolvedValue(golden);

    const result = await createReport(
      { auditId, userId: admin.id },
      { buildCanonical: spy, runPipeline: false }
    );

    expect(spy).toHaveBeenCalledWith(auditId, { allowOpen: false });
    expect(result.status).toBe('pendiente');
    expect(result.version).toBe(2); // ya había una versión seedReport
  });

  it('rechaza snapshot con schema_version distinta (R5)', async () => {
    const tampered = { ...golden, schema_version: '9.9' };
    const { reportId } = await seedReport(tampered);

    await runInformePipeline(reportId, { claude: mockAdapterValid() });

    const row = await getReportById(reportId);
    expect(row!.status).toBe('error');
    expect(row!.errorMessage).toContain('schema_version');
  });

  it('pasa el modelo de env al adapter (override y default, R8)', async () => {
    expect(resolveInformeModel()).toBe(INFORME_DEFAULT_MODEL);
    process.env.INFORME_CLAUDE_MODEL = 'claude-test-model';
    expect(resolveInformeModel()).toBe('claude-test-model');

    const calls: AdapterCall[] = [];
    const { reportId } = await seedReport();
    await runInformePipeline(reportId, { claude: mockAdapterValid(calls) });

    expect(calls).toHaveLength(1);
    expect(calls[0].model).toBe('claude-test-model');
  });

  it('el adapter real arma model + system + messages y parsea el JSON (R8)', async () => {
    // R8: el adapter dejó de usar output_config (salida estructurada) — ver
    // commits eb02144 / 63c8d40 — y ahora pide JSON por prompt y lo extrae del
    // texto. El test refleja el contrato vigente de la llamada a la API.
    const create = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(buildValidEnvelope(['A1'])) }]
    });
    const adapter = createClaudeAdapter({ client: { messages: { create } } });

    const result = await adapter.generateDraft({
      prompt: { system: 's', user: JSON.stringify(golden) },
      model: 'claude-x'
    });

    const params = create.mock.calls[0][0];
    expect(params.model).toBe('claude-x');
    expect(params.system).toBe('s');
    expect(params.messages[0].content).toBe(JSON.stringify(golden));
    // Ya no se envía salida estructurada: es JSON libre extraído del texto.
    expect(params.output_config).toBeUndefined();
    expect(result).toBeTruthy();
  });

  it('sobrescribe índices inventados con los del canónico + semáforo (R12)', async () => {
    const { reportId } = await seedReport();
    await runInformePipeline(reportId, { claude: mockAdapterValid() });

    const row = await getReportById(reportId);
    expect(row!.status).toBe('borrador');
    expect(row!.clientDraft!.indices.erp).toEqual({
      valor: golden.indices.erp,
      semaforo: indexToSemaphore(golden.indices.erp!)
    });
    expect(row!.clientDraft!.indices.it).toEqual({
      valor: golden.indices.it,
      semaforo: indexToSemaphore(golden.indices.it!)
    });
    // El mock había inventado erp = 99 / green
    expect(row!.clientDraft!.indices.erp!.valor).not.toBe(99);
  });

  it('draft con seccion_code inexistente termina en error (R12)', async () => {
    const { reportId } = await seedReport();
    await runInformePipeline(reportId, { claude: mockAdapterUnknownSection() });

    const row = await getReportById(reportId);
    expect(row!.status).toBe('error');
    expect(row!.errorMessage).toContain('seccion_code');
    expect(row!.clientDraft).toBeNull();
  });

  it('persiste prompt_version y model en la fila (R9)', async () => {
    const { reportId } = await seedReport();
    await runInformePipeline(reportId, { claude: mockAdapterValid() });

    const row = await getReportById(reportId);
    expect(row!.promptVersion).toBe(INFORME_PROMPT_VERSION);
    expect(row!.model).toBe(INFORME_DEFAULT_MODEL);
    expect(row!.schemaVersion).toBe(CANONICAL_SCHEMA_VERSION);
  });

  it('mock que lanza deja error con mensaje y drafts NULL (R13)', async () => {
    const { reportId } = await seedReport();
    await runInformePipeline(reportId, { claude: mockAdapterThrows('API caída') });

    const row = await getReportById(reportId);
    expect(row!.status).toBe('error');
    expect(row!.errorMessage).toContain('API caída');
    expect(row!.clientDraft).toBeNull();
    expect(row!.internalDraft).toBeNull();
  });

  it('mock inválido contra Zod deja error sin drafts parciales (R13)', async () => {
    const { reportId } = await seedReport();
    await runInformePipeline(reportId, { claude: mockAdapterInvalid() });

    const row = await getReportById(reportId);
    expect(row!.status).toBe('error');
    expect(row!.errorMessage).not.toBe('');
    expect(row!.clientDraft).toBeNull();
    expect(row!.internalDraft).toBeNull();
  });

  it('pipeline exitoso termina en borrador, nunca aprobado (R24)', async () => {
    const { reportId } = await seedReport();
    await runInformePipeline(reportId, { claude: mockAdapterValid() });

    const row = await getReportById(reportId);
    expect(row!.status).toBe('borrador');
    expect(row!.approvedBy).toBeNull();
    expect(row!.approvedAt).toBeNull();
  });

  it('retry desde error reejecuta y conserva versión (R22)', async () => {
    const { reportId } = await seedReport();
    await runInformePipeline(reportId, { claude: mockAdapterThrows() });
    const errored = await getReportById(reportId);
    expect(errored!.status).toBe('error');

    await runInformePipeline(reportId, { claude: mockAdapterValid() });
    const retried = await getReportById(reportId);
    expect(retried!.status).toBe('borrador');
    expect(retried!.version).toBe(errored!.version);
  });

  it('flags off no invocan fuentes de contexto (R2, R15)', async () => {
    const ragSpy = vi.fn(async () => ({ chunks: [], discarded: 0 }));
    const catalogoSpy = vi.fn(() => ({ version: '1.0', lineas: [] }));
    const fewshotSpy = vi.fn(async () => []);

    const { reportId } = await seedReport();
    await runInformePipeline(reportId, {
      claude: mockAdapterValid(),
      context: {
        rag: { retrieve: ragSpy },
        catalogo: { load: catalogoSpy },
        fewshot: { listEjemplarReports: fewshotSpy }
      },
      env: {}
    });

    expect(ragSpy).not.toHaveBeenCalled();
    expect(catalogoSpy).not.toHaveBeenCalled();
    expect(fewshotSpy).not.toHaveBeenCalled();
    const row = await getReportById(reportId);
    expect(row!.status).toBe('borrador');
    expect(contextMetaSchema.safeParse(row!.contextMeta).success).toBe(true);
    expect(row!.contextMeta?.flags).toEqual({ rag: false, catalogo: false, fewshot: false });
  });

  it('RAG que lanza → borrador con context_meta.rag.error (R6)', async () => {
    process.env.INFORME_RAG_ENABLED = '1';
    const rag: RagRetriever = {
      retrieve: vi.fn(async () => {
        throw new Error('red caída');
      })
    };
    const calls: AdapterCall[] = [];
    const { reportId } = await seedReport();
    await runInformePipeline(reportId, {
      claude: mockAdapterValid(calls),
      context: { rag, fewshot: { listEjemplarReports: async () => [] } },
      env: { INFORME_RAG_ENABLED: '1' }
    });

    const row = await getReportById(reportId);
    expect(row!.status).toBe('borrador');
    expect(row!.contextMeta?.rag.error).toContain('red caída');
    expect(calls[0].prompt.system).not.toContain('<contexto_tango>');
    expect(row!.promptVersion).toBe('2.2');
  });

  it('RAG timeout → borrador sin bloque RAG (R6)', async () => {
    const rag: RagRetriever = {
      retrieve: vi.fn(
        (): Promise<import('../src/lib/server/informe/context/schemas').RagResult> =>
          new Promise(() => {
            /* never resolves */
          })
      )
    };
    const { reportId } = await seedReport();
    await runInformePipeline(reportId, {
      claude: mockAdapterValid(),
      context: { rag, fewshot: { listEjemplarReports: async () => [] } },
      env: { INFORME_RAG_ENABLED: '1', INFORME_RAG_TIMEOUT_MS: '50' }
    });

    const row = await getReportById(reportId);
    expect(row!.status).toBe('borrador');
    expect(row!.contextMeta?.rag.error).toBeTruthy();
  });

  it('contexto completo on persiste context_meta válido (R13)', async () => {
    process.env.INFORME_RAG_ENABLED = '1';
    process.env.INFORME_CATALOGO_ENABLED = '1';
    process.env.INFORME_FEWSHOT_ENABLED = '1';

    const { reportId } = await seedReport();
    await runInformePipeline(reportId, {
      claude: mockAdapterValid(),
      context: {
        rag: {
          retrieve: async () => ({
            chunks: [{ id: '1', content: 'doc tango', modulo: 'ventas', similarity: 0.8 }],
            discarded: 0
          })
        },
        catalogo: { load: loadCatalogoSys },
        fewshot: {
          listEjemplarReports: async () => [
            {
              id: 'ex-1',
              approvedAt: new Date(),
              clientDraft: buildValidEnvelope(['A1']).cliente
            }
          ]
        }
      },
      env: {
        INFORME_RAG_ENABLED: '1',
        INFORME_CATALOGO_ENABLED: '1',
        INFORME_FEWSHOT_ENABLED: '1'
      }
    });

    const row = await getReportById(reportId);
    expect(row!.status).toBe('borrador');
    expect(contextMetaSchema.safeParse(row!.contextMeta).success).toBe(true);
    expect(row!.contextMeta?.flags).toEqual({ rag: true, catalogo: true, fewshot: true });
    expect(row!.promptVersion).toContain('2.2');
  });

  it('mixta sin template_code resoluble → error (#19 R6)', async () => {
    const mixtaNoDomain = {
      ...golden,
      sections: golden.sections.map(({ template_code: _tc, ...s }) => s)
    };
    const { reportId } = await seedReport(mixtaNoDomain);
    await runInformePipeline(reportId, { claude: mockAdapterValid() });
    const row = await getReportById(reportId);
    expect(row!.status).toBe('error');
    expect(row!.errorMessage).toMatch(/template_code|dominio/i);
  });
});
