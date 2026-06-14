import type { RequestHandler } from '@sveltejs/kit';
import { apiError, apiSuccess } from '$lib/server/api/envelope';
import { requireAdminApi, requireReportReadAccess } from '$lib/server/api/guards';
import {
  appendEditEntry,
  getReportByAuditVersion,
  saveClientDraftEdit,
  saveLoomUrl,
  type AuditReportRow
} from '$lib/server/db/informe-reports';
import { getAuditForReport, informeErrorResponse } from '$lib/server/informe/access';
import { InformeDraftValidationError } from '$lib/server/informe/errors';
import {
  assertSeccionCodesExist,
  overwriteIndicesFromCanonical
} from '$lib/server/informe/pipeline';
import { patchReportSchema, reportClientDraftSchemaFor, type ReportClientDraft } from '$lib/server/informe/schemas';
import { tipoAuditoria } from '$lib/server/informe/tipo';
import { stripHtmlDeep } from '$lib/server/informe/sanitize';

function toDetail(r: AuditReportRow, opts: { includeInternal: boolean }) {
  return {
    report_id: r.id,
    audit_id: r.auditId,
    version: r.version,
    status: r.status,
    schema_version: r.schemaVersion,
    client_draft: r.clientDraft,
    ...(opts.includeInternal
      ? { internal_draft: r.internalDraft, canonical_json: r.canonicalJson }
      : {}),
    prompt_version: r.promptVersion,
    model: r.model,
    error_message: r.errorMessage,
    loom_url: r.loomUrl,
    edited_by: r.editedBy,
    edited_at: r.editedAt,
    approved_by: r.approvedBy,
    approved_at: r.approvedAt,
    created_at: r.createdAt,
    updated_at: r.updatedAt
  };
}

type LoadedReport =
  | { ok: false; error: Response }
  | { ok: true; audit: Awaited<ReturnType<typeof getAuditForReport>> & object; report: AuditReportRow };

async function loadAuditAndReport(auditId: string, versionRaw: string): Promise<LoadedReport> {
  const audit = await getAuditForReport(auditId);
  if (!audit) {
    return { ok: false, error: apiError('Auditoría no encontrada', 404) };
  }
  const version = Number(versionRaw);
  if (!Number.isInteger(version) || version < 1) {
    return { ok: false, error: apiError('Versión inválida', 404) };
  }
  const report = await getReportByAuditVersion(auditId, version);
  if (!report) {
    return { ok: false, error: apiError('Informe no encontrado', 404) };
  }
  return { ok: true, audit, report };
}

/** GET detalle (R17): internal_draft solo admin; técnico asignado solo aprobado (R1). */
export const GET: RequestHandler = async ({ params, locals }): Promise<Response> => {
  const loaded = await loadAuditAndReport(params.id!, params.version!);
  if (!loaded.ok) {
    return loaded.error;
  }

  const userOrResponse = requireReportReadAccess(locals, loaded.audit, loaded.report);
  if (userOrResponse instanceof Response) {
    return userOrResponse;
  }

  const includeInternal = userOrResponse.role === 'admin';
  return apiSuccess(toDetail(loaded.report, { includeInternal }));
};

/** PATCH (R20, R25, R30, R31): editar client_draft / loom_url solo en borrador. */
export const PATCH: RequestHandler = async ({ params, locals, request }): Promise<Response> => {
  const userOrResponse = requireAdminApi(locals);
  if (userOrResponse instanceof Response) {
    return userOrResponse;
  }

  const loaded = await loadAuditAndReport(params.id!, params.version!);
  if (!loaded.ok) {
    return loaded.error;
  }
  const { report } = loaded;

  if (report.status !== 'borrador') {
    return apiError('El informe solo se puede editar en estado borrador', 409);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError('Body JSON inválido', 400);
  }

  const parsed = patchReportSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(`Datos inválidos: ${parsed.error.issues[0]?.message ?? 'schema'}`, 400);
  }

  try {
    let updated: AuditReportRow = report;
    let seq: number | undefined;

    if (parsed.data.client_draft !== undefined) {
      // R30: edición inline siempre texto plano (HTML embebido descartado).
      const incoming =
        parsed.data.origin === 'inline'
          ? stripHtmlDeep(parsed.data.client_draft)
          : parsed.data.client_draft;
      // R12 también aplica a ediciones: índices del canónico + seccion_code válidos.
      const draft = overwriteIndicesFromCanonical(
        incoming as ReportClientDraft,
        report.canonicalJson
      );
      assertSeccionCodesExist(draft, report.canonicalJson);

      const draftSchema = reportClientDraftSchemaFor(tipoAuditoria(report.canonicalJson.types));
      const validated = draftSchema.safeParse(draft);
      if (!validated.success) {
        throw new InformeDraftValidationError(
          `Borrador cliente inválido: ${validated.error.issues[0]?.message ?? 'schema'}`
        );
      }
      const validDraft = validated.data;
      const saved = await saveClientDraftEdit(report.id, validDraft, userOrResponse.id);
      if (!saved) {
        return apiError('El informe solo se puede editar en estado borrador', 409);
      }
      updated = saved;

      if (parsed.data.origin === 'inline') {
        const entry = await appendEditEntry({
          reportId: report.id,
          clientDraft: validDraft,
          changeSummary: 'Edición inline',
          editedBy: userOrResponse.id
        });
        seq = entry.seq;
      }
    }

    if (parsed.data.loom_url !== undefined) {
      const saved = await saveLoomUrl(report.id, parsed.data.loom_url, userOrResponse.id);
      if (!saved) {
        return apiError('El informe solo se puede editar en estado borrador', 409);
      }
      updated = saved;
    }

    return apiSuccess({ ...toDetail(updated, { includeInternal: true }), seq });
  } catch (err) {
    if (err instanceof InformeDraftValidationError) {
      return apiError(err.message, 400);
    }
    return informeErrorResponse(err);
  }
};
