import { randomBytes } from 'node:crypto';
import { getSql } from '$lib/server/db/client';
import { getServerEnv } from '$lib/env';
import { AuditNotFoundError, InvalidStateTransitionError } from './errors';
import type { AuditStatus } from '$lib/server/db/audit-status';

function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

function buildUrl(token: string): string {
  const env = getServerEnv();
  return `${env.PUBLIC_APP_URL}/briefing/${token}`;
}

async function getAuditForBriefing(auditId: string): Promise<{
  id: string;
  status: AuditStatus;
  public_token: string | null;
  archived_at: Date | null;
}> {
  const sql = getSql();
  const [row] = await sql<
    { id: string; status: AuditStatus; public_token: string | null; archived_at: Date | null }[]
  >`
    SELECT id, status, public_token, archived_at
    FROM audit
    WHERE id = ${auditId}
    LIMIT 1
  `;

  if (!row || row.archived_at) {
    throw new AuditNotFoundError();
  }

  return row;
}

export async function generateBriefingLink(
  auditId: string
): Promise<{ url: string; token: string }> {
  const audit = await getAuditForBriefing(auditId);

  if (audit.status !== 'borrador') {
    throw new InvalidStateTransitionError(
      'Solo se puede generar link desde estado borrador'
    );
  }

  const token = generateToken();
  const sql = getSql();

  await sql`
    UPDATE audit
    SET public_token = ${token}, status = 'briefing_enviado'
    WHERE id = ${auditId}
  `;

  return { url: buildUrl(token), token };
}

export async function regenerateBriefingLink(
  auditId: string
): Promise<{ url: string; token: string }> {
  const audit = await getAuditForBriefing(auditId);

  if (audit.status !== 'briefing_enviado' && audit.status !== 'briefing_completo') {
    throw new InvalidStateTransitionError(
      'Solo se puede regenerar link en briefing_enviado o briefing_completo'
    );
  }

  const oldToken = audit.public_token;
  const token = generateToken();
  const sql = getSql();

  await sql`
    UPDATE audit
    SET public_token = ${token}
    WHERE id = ${auditId}
  `;

  if (oldToken) {
    const [stale] = await sql<{ id: string }[]>`
      SELECT id FROM audit WHERE public_token = ${oldToken} AND id <> ${auditId}
    `;
    void stale;
  }

  return { url: buildUrl(token), token };
}

export function canShowBriefingLink(status: AuditStatus, publicToken: string | null): boolean {
  if (!publicToken) {
    return false;
  }
  return status === 'briefing_enviado' || status === 'briefing_completo';
}

export function getBriefingUrl(publicToken: string): string {
  return buildUrl(publicToken);
}
