import { AuditNotFoundError } from '$lib/server/backoffice/errors';
import { getInstanceId } from '$lib/env';
import {
  loadAttachmentsWithItemKeys,
  loadAuditForBundle,
  loadClosure,
  loadResponsesWithItemKeys,
  loadSectionScoresWithCodes
} from '$lib/server/db/audit-bundle';
import { auditBundleSchema, type AuditBundle, type BundleStatus } from './schema';
import { BUNDLE_SCHEMA_VERSION } from './version';

function isoOrNull(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

function userRef(email: string | null): { email: string } | null {
  return email ? { email } : null;
}

/**
 * Construye el bundle portable de una auditoría (R1, R3, R5, R6).
 * Toda referencia a entidades va por clave natural; nunca incluye UUID de origen
 * (salvo `attachment.origin_id`, que solo sirve para remapear attachment_ids embebidos
 * y no se persiste como FK en destino — R11).
 */
export async function buildAuditBundle(auditId: string): Promise<AuditBundle> {
  const audit = await loadAuditForBundle(auditId);
  if (!audit) {
    throw new AuditNotFoundError();
  }

  const [responses, scores, closure, attachments] = await Promise.all([
    loadResponsesWithItemKeys(auditId),
    loadSectionScoresWithCodes(auditId),
    loadClosure(auditId),
    loadAttachmentsWithItemKeys(auditId)
  ]);

  const bundle: AuditBundle = {
    bundle_schema_version: BUNDLE_SCHEMA_VERSION,
    dedupe_key: {
      origin_instance_id: getInstanceId(),
      origin_audit_id: audit.id
    },
    exported_at: new Date().toISOString(),
    header: {
      name: audit.name,
      types: audit.types,
      templates: audit.templates,
      segment: audit.segment,
      status: audit.status as BundleStatus,
      client: {
        cuit: audit.client_cuit,
        razon_social: audit.client_razon_social,
        rubro: audit.client_rubro,
        provincia: audit.client_provincia
      },
      assigned_tech: userRef(audit.assigned_tech_email),
      created_by: userRef(audit.created_by_email),
      scheduled_at: isoOrNull(audit.scheduled_at),
      closed_at: isoOrNull(audit.closed_at)
    },
    responses: responses.map((r) => ({
      item_key: r.item_key,
      value: r.value,
      na: r.na,
      observations: r.observations,
      source: r.source,
      updated_by: userRef(r.updated_by_email)
    })),
    section_scores: scores.map((s) => ({
      template: s.template,
      section_code: s.section_code,
      score: s.score,
      score_breakdown: s.score_breakdown,
      observations: s.observations
    })),
    closure: closure
      ? {
          indice_it: closure.indice_it,
          indice_erp: closure.indice_erp,
          top_risks: closure.top_risks,
          quick_wins: closure.quick_wins,
          upsell_findings: closure.upsell_findings,
          next_step: closure.next_step,
          closed_by: userRef(closure.closed_by_email),
          closed_at: isoOrNull(closure.closed_at)
        }
      : null,
    attachments: attachments.map((a) => ({
      origin_id: a.origin_id,
      r2_key: a.r2_key,
      filename: a.filename,
      content_type: a.content_type,
      size_bytes: a.size_bytes,
      kind: a.kind,
      item_key: a.item_key,
      uploaded_by: userRef(a.uploaded_by_email)
    }))
  };

  // Garantía de contrato: el bundle siempre valida contra su schema antes de salir.
  return auditBundleSchema.parse(bundle);
}
