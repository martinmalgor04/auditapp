import { getSql } from '$lib/server/db/client';
import { AuditNotFoundError } from '$lib/server/backoffice/errors';
import { buildCanonicalAuditJson } from '$lib/server/canonical/build';
import {
  assertSchemaVersionMatchesConstant,
  type CanonicalAudit
} from '$lib/server/canonical/schema';
import { indexToSemaphore } from '$lib/server/scoring/semaphore';
import { logger } from '$lib/server/logger';
import {
  getReportById,
  insertReport,
  listEjemplarReports,
  markReportError,
  saveDraftsAndFinish,
  updateReportStatus
} from '$lib/server/db/informe-reports';
import {
  assertAnthropicConfigured,
  createClaudeAdapter,
  resolveInformeModel,
  type InformeClaudeAdapter
} from './claude';
import { buildInformeContext, type ContextDeps } from './context/build';
import { resolveContextConfig } from './context/config';
import type { ContextMeta } from './context/schemas';
import { createRagRetriever } from './rag/retriever';
import {
  InformeAuditNotClosedError,
  InformeDraftValidationError,
  InformeGenerationError,
  InformeReportNotFoundError
} from './errors';
import {
  buildInformePrompt,
  resolvePromptVersion
} from './prompts/generate-report';
import {
  reportClientDraftSchema,
  reportInternalDraftSchema,
  type ReportClientDraft
} from './schemas';

export type CreateReportDeps = {
  buildCanonical?: typeof buildCanonicalAuditJson;
  runPipeline?: boolean;
  claude?: InformeClaudeAdapter;
  context?: ContextDeps;
  env?: Record<string, string | undefined>;
};

function defaultContextDeps(env: Record<string, string | undefined>): ContextDeps {
  const config = resolveContextConfig(env);
  const deps: ContextDeps = {
    fewshot: { listEjemplarReports }
  };
  if (config.rag.enabled) {
    deps.rag = createRagRetriever(env);
  }
  return deps;
}

/**
 * Crea una versión de informe (R2, R3, R4) y dispara el pipeline en background (R6).
 * Sirve también para «regenerar» (nueva versión, R21).
 */
export async function createReport(
  input: { auditId: string; userId: string },
  deps: CreateReportDeps = {}
): Promise<{ reportId: string; version: number; status: 'pendiente' }> {
  assertAnthropicConfigured();

  const sql = getSql();
  const [audit] = await sql<{ status: string; archived_at: Date | null }[]>`
    SELECT status, archived_at FROM audit WHERE id = ${input.auditId} LIMIT 1
  `;
  if (!audit || audit.archived_at) {
    throw new AuditNotFoundError();
  }
  if (audit.status !== 'cerrada') {
    throw new InformeAuditNotClosedError();
  }

  const build = deps.buildCanonical ?? buildCanonicalAuditJson;
  const canonical = await build(input.auditId, { allowOpen: false });

  const row = await insertReport({
    auditId: input.auditId,
    canonicalJson: canonical,
    schemaVersion: canonical.schema_version,
    requestedBy: input.userId
  });

  if (deps.runPipeline !== false) {
    void runInformePipeline(row.id, {
      claude: deps.claude,
      context: deps.context,
      env: deps.env
    });
  }

  return { reportId: row.id, version: row.version, status: 'pendiente' };
}

/** Sobrescribe los índices del draft con los del canónico (R12). */
export function overwriteIndicesFromCanonical(
  draft: ReportClientDraft,
  canonical: CanonicalAudit
): ReportClientDraft {
  const { it, erp } = canonical.indices;
  return {
    ...draft,
    indices: {
      ...(it !== undefined ? { it: { valor: it, semaforo: indexToSemaphore(it) } } : {}),
      ...(erp !== undefined ? { erp: { valor: erp, semaforo: indexToSemaphore(erp) } } : {})
    }
  };
}

/** Todo seccion_code del draft debe existir en el snapshot canónico (R12). */
export function assertSeccionCodesExist(
  draft: ReportClientDraft,
  canonical: CanonicalAudit
): void {
  const known = new Set(canonical.sections.map((s) => s.code));
  const used = [
    ...draft.hallazgos.circuitos.map((c) => c.seccion_code),
    ...draft.dia_a_dia.circuitos.map((c) => c.seccion_code)
  ];
  for (const code of used) {
    if (!known.has(code)) {
      throw new InformeDraftValidationError(
        `seccion_code desconocido en el draft: ${code} (no existe en el snapshot canónico)`
      );
    }
  }
}

export type PipelineDeps = {
  claude?: InformeClaudeAdapter;
  context?: ContextDeps;
  env?: Record<string, string | undefined>;
};

/**
 * Pipeline de generación (R5–R13, R24). pendiente|error → generando → borrador | error.
 * Nunca transiciona a aprobado.
 */
export async function runInformePipeline(
  reportId: string,
  deps: PipelineDeps = {}
): Promise<void> {
  const report = await getReportById(reportId);
  if (!report) {
    throw new InformeReportNotFoundError();
  }
  if (report.status !== 'pendiente' && report.status !== 'error') {
    throw new InformeGenerationError(
      `El informe está en estado ${report.status}; no se puede generar`
    );
  }

  try {
    await updateReportStatus(reportId, report.status, 'generando');
  } catch (err) {
    logger.warn('informe pipeline: no se pudo tomar la fila', {
      reportId,
      error: err instanceof Error ? err.message : String(err)
    });
    return;
  }

  const env = deps.env ?? process.env;
  const model = resolveInformeModel();
  const config = resolveContextConfig(env);
  const contextDeps = deps.context ?? defaultContextDeps(env);
  let contextMeta: ContextMeta | undefined;
  let promptVersion = resolvePromptVersion(null);

  try {
    assertSchemaVersionMatchesConstant(report.canonicalJson);

    const context = await buildInformeContext(report.canonicalJson, config, contextDeps);
    contextMeta = context.meta;
    promptVersion = resolvePromptVersion(context);

    if (context.promptBudgetError) {
      throw new InformeGenerationError(context.promptBudgetError);
    }

    const prompt = buildInformePrompt(report.canonicalJson, context);
    const adapter = deps.claude ?? createClaudeAdapter();
    const raw = await adapter.generateDraft({ prompt, model });

    const envelope = raw as { cliente?: unknown; interna?: unknown };
    const clientParsed = reportClientDraftSchema.safeParse(envelope?.cliente);
    if (!clientParsed.success) {
      throw new InformeDraftValidationError(
        `Borrador cliente inválido: ${clientParsed.error.issues[0]?.message ?? 'schema'}`
      );
    }
    const internalParsed = reportInternalDraftSchema.safeParse(envelope?.interna);
    if (!internalParsed.success) {
      throw new InformeDraftValidationError(
        `Salida interna inválida: ${internalParsed.error.issues[0]?.message ?? 'schema'}`
      );
    }

    const clientDraft = overwriteIndicesFromCanonical(clientParsed.data, report.canonicalJson);
    assertSeccionCodesExist(clientDraft, report.canonicalJson);

    await saveDraftsAndFinish({
      id: reportId,
      clientDraft,
      internalDraft: internalParsed.data,
      promptVersion,
      model,
      contextMeta
    });
  } catch (err) {
    const message = err instanceof Error && err.message ? err.message : 'Fallo de generación';
    logger.error('informe pipeline failed', { reportId, error: message });
    await markReportError(reportId, message, {
      promptVersion,
      model,
      contextMeta
    });
  }
}
