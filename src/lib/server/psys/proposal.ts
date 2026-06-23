import {
  findActiveLinkByAuditReport,
  findLatestActiveLinkByAudit,
  insertActiveProposalLink,
  insertErrorProposalLink,
  isUniqueViolation,
  toProposalLinkView,
  updateProposalLinkSync
} from '$lib/server/db/psys-links';
import { getLatestApprovedReport } from '$lib/server/db/informe-reports';
import { getSql } from '$lib/server/db/client';
import { createPsysProposal, getPsysProposal } from './client';
import { PsysLinkNotFoundError, PsysNoApprovedReportError, PsysRemoteError } from './errors';
import { logger } from '$lib/server/logger';
import { buildPsysIdempotencyKey, buildPsysPayload } from './payload';
import { PSYS_CONTRACT_VERSION, isKnownPsysStatus } from './schemas';

async function fetchAuditRefCode(auditId: string): Promise<string> {
  const sql = getSql();
  const [row] = await sql<{ ref_code: string }[]>`
    SELECT ref_code FROM audit WHERE id = ${auditId} LIMIT 1
  `;
  if (!row) {
    throw new PsysNoApprovedReportError();
  }
  return row.ref_code;
}

export async function createAuditProposal(input: {
  auditId: string;
  userId: string;
}): Promise<{ link: ReturnType<typeof toProposalLinkView>; created: boolean }> {
  const report = await getLatestApprovedReport(input.auditId);
  if (!report) {
    throw new PsysNoApprovedReportError();
  }

  const existing = await findActiveLinkByAuditReport(input.auditId, report.id);
  if (existing) {
    return {
      link: { ...toProposalLinkView(existing), report_version: report.version },
      created: false
    };
  }

  const payload = buildPsysPayload({
    auditId: input.auditId,
    refCode: await fetchAuditRefCode(input.auditId),
    report,
    canonical: report.canonicalJson
  });
  const idempotencyKey = buildPsysIdempotencyKey(input.auditId, report.version);

  try {
    const { proposal } = await createPsysProposal(payload, { idempotencyKey });
    try {
      const row = await insertActiveProposalLink({
        auditId: input.auditId,
        reportId: report.id,
        proposalId: proposal.id,
        numberDisplay: proposal.number_display,
        proposalUrl: proposal.url,
        psysStatus: proposal.status,
        contractVersion: PSYS_CONTRACT_VERSION,
        sentPayload: payload,
        createdBy: input.userId
      });
      return {
        link: { ...toProposalLinkView(row), report_version: report.version },
        created: true
      };
    } catch (err) {
      if (isUniqueViolation(err)) {
        const winner = await findActiveLinkByAuditReport(input.auditId, report.id);
        if (winner) {
          return {
            link: { ...toProposalLinkView(winner), report_version: report.version },
            created: false
          };
        }
      }
      throw err;
    }
  } catch (err) {
    if (!(err instanceof PsysRemoteError)) {
      throw err;
    }
    await insertErrorProposalLink({
      auditId: input.auditId,
      reportId: report.id,
      contractVersion: PSYS_CONTRACT_VERSION,
      sentPayload: payload,
      errorMessage: err.message,
      createdBy: input.userId
    });
    throw err;
  }
}

export async function syncAuditProposal(input: {
  auditId: string;
}): Promise<ReturnType<typeof toProposalLinkView> & { sync_error: boolean }> {
  const link = await findLatestActiveLinkByAudit(input.auditId);
  if (!link?.proposalId) {
    throw new PsysLinkNotFoundError();
  }

  const base = { ...toProposalLinkView(link), sync_error: false };

  try {
    const remote = await getPsysProposal(link.proposalId);
    if (!isKnownPsysStatus(remote.status)) {
      logger.warn('psys sync: estado desconocido', {
        auditId: input.auditId,
        proposalId: link.proposalId,
        status: remote.status
      });
      return base;
    }

    const updated = await updateProposalLinkSync({ id: link.id, psysStatus: remote.status });
    return {
      ...(updated ? toProposalLinkView(updated) : base),
      sync_error: false
    };
  } catch (err) {
    if (err instanceof PsysRemoteError) {
      return { ...base, sync_error: true };
    }
    throw err;
  }
}
