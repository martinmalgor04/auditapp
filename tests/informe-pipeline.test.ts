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
import { indexToSemaphore } from '../src/lib/server/scoring/semaphore';
import { CANONICAL_SCHEMA_VERSION } from '../src/lib/server/canonical/version';

describe('informe pipeline', () => {
  let sql: postgres.Sql;
  const golden = loadInformeCanonicalGolden();

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(() => {
    setSqlForTests(sql);
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  afterEach(() => {
    delete process.env.INFORME_CLAUDE_MODEL;
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

  it('el adapter real envía output_config.format derivado de Zod (R8)', async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(buildValidEnvelope(['A1'])) }]
    });
    const adapter = createClaudeAdapter({ client: { messages: { create } } });

    await adapter.generateDraft({
      prompt: { system: 's', user: JSON.stringify(golden) },
      model: 'claude-x'
    });

    const params = create.mock.calls[0][0];
    expect(params.model).toBe('claude-x');
    expect(params.output_config.format.type).toBe('json_schema');
    expect(params.output_config.format.schema).toBeTruthy();
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
});
