import { findAuditByPublicToken } from '../db/audits';
import type { BriefingAuditContext } from './types';

export type BriefingTokenResult =
  | { ok: true; audit: BriefingAuditContext }
  | { ok: false; reason: 'not_found' | 'invalid_status' };

export const BRIEFING_VALID_STATUSES = ['briefing_enviado', 'briefing_completo'] as const;

export type BriefingValidStatus = (typeof BRIEFING_VALID_STATUSES)[number];

export const BRIEFING_UNAVAILABLE_MESSAGE = 'Este enlace ya no está disponible';

export function isBriefingStatusValid(status: string): status is BriefingValidStatus {
  return (BRIEFING_VALID_STATUSES as readonly string[]).includes(status);
}

export async function resolveBriefingByToken(token: string): Promise<BriefingTokenResult> {
  const audit = await findAuditByPublicToken(token);

  if (!audit) {
    return { ok: false, reason: 'not_found' };
  }

  if (!isBriefingStatusValid(audit.status)) {
    return { ok: false, reason: 'invalid_status' };
  }

  return {
    ok: true,
    audit: {
      auditId: audit.id,
      clientId: audit.client_id,
      status: audit.status,
      publicToken: audit.public_token
    }
  };
}
