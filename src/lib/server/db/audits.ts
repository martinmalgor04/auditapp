import { getSql } from './client';
import type { AuditStatus } from './audit-status';

export type AuditByTokenRow = {
  id: string;
  client_id: string;
  status: AuditStatus;
  public_token: string;
};

export async function findAuditByPublicToken(token: string): Promise<AuditByTokenRow | null> {
  const sql = getSql();
  const [row] = await sql<AuditByTokenRow[]>`
    SELECT id, client_id, status, public_token
    FROM audit
    WHERE public_token = ${token}
    LIMIT 1
  `;
  return row ?? null;
}
