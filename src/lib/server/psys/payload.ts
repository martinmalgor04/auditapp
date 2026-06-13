import type { CanonicalAudit } from '$lib/server/canonical/schema';
import type { AuditReportRow } from '$lib/server/db/informe-reports';
import { PsysPayloadError } from './errors';
import {
  PSYS_CONTRACT_VERSION,
  psysProposalPayloadSchema,
  type PsysProposalPayload
} from './schemas';

const DEFAULT_TEMPLATE_SLUG = 'propuesta-comercial-mixta';

function buildInformeUrl(auditId: string, version: number): string {
  const base = process.env.PUBLIC_APP_URL?.replace(/\/$/, '') ?? 'http://localhost:5173';
  return `${base}/auditorias/${auditId}/informe/${version}`;
}

/** Arma el payload M2M desde informe aprobado + canónico (R4, R14). */
export function buildPsysPayload(args: {
  auditId: string;
  report: AuditReportRow;
  canonical: CanonicalAudit;
}): PsysProposalPayload {
  if (args.report.status !== 'aprobado') {
    throw new PsysPayloadError('El informe debe estar aprobado');
  }
  if (!args.report.internalDraft) {
    throw new PsysPayloadError('Falta borrador interno del informe');
  }

  const payload: PsysProposalPayload = {
    contract_version: PSYS_CONTRACT_VERSION,
    source: {
      system: 'auditapp',
      audit_id: args.auditId,
      report_version: args.report.version
    },
    template_slug: DEFAULT_TEMPLATE_SLUG,
    cliente: {
      razon_social: args.canonical.client.razon_social,
      cuit: args.canonical.client.cuit,
      email: null,
      telefono: null,
      direccion: null,
      provincia: null
    },
    titulo: `Propuesta post-auditoría — ${args.canonical.client.razon_social}`,
    moneda: 'ARS',
    internal_notes: {
      recomendaciones_presupuesto: args.report.internalDraft.recomendaciones_presupuesto,
      upsell_findings: args.canonical.upsell_findings,
      indices: {
        ...(args.canonical.indices.it !== undefined ? { it: args.canonical.indices.it } : {}),
        ...(args.canonical.indices.erp !== undefined ? { erp: args.canonical.indices.erp } : {})
      },
      informe_url: buildInformeUrl(args.auditId, args.report.version)
    }
  };

  const parsed = psysProposalPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    throw new PsysPayloadError(parsed.error.message);
  }
  return parsed.data;
}

export function buildPsysIdempotencyKey(auditId: string, reportVersion: number): string {
  return `audit:${auditId}:report:${reportVersion}`;
}
