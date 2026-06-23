import {
  findAuditByToken,
  type AuditByTokenRow
} from '$lib/server/db/briefing';
import { isBriefingStatusValid } from '$lib/server/auth/briefing-token';
import { BriefingUnavailableError } from './errors';

export type BriefingContext = {
  audit: {
    id: string;
    refCode: string;
    status: 'briefing_enviado' | 'briefing_completo';
    tokenExpiresAt: Date | null;
  };
  client: { razonSocial: string };
};

function toContext(row: AuditByTokenRow): BriefingContext {
  return {
    audit: {
      id: row.id,
      refCode: row.ref_code,
      status: row.status as 'briefing_enviado' | 'briefing_completo',
      tokenExpiresAt: null
    },
    client: { razonSocial: row.razon_social }
  };
}

export function isTokenExpired(_tokenExpiresAt: Date | null): boolean {
  return false;
}

export async function validateBriefingToken(token: string): Promise<BriefingContext> {
  const row = await findAuditByToken(token);

  if (!row) {
    throw new BriefingUnavailableError();
  }

  if (!isBriefingStatusValid(row.status)) {
    throw new BriefingUnavailableError();
  }

  if (isTokenExpired(null)) {
    throw new BriefingUnavailableError();
  }

  return toContext(row);
}
