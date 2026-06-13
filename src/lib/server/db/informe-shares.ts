import { getSql } from './client';
import type { InformeStatus } from '$lib/server/informe/state';

export type AuditReportShareRow = {
  id: string;
  reportId: string;
  token: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdBy: string;
  createdAt: Date;
  viewCount: number;
  firstViewedAt: Date | null;
  lastViewedAt: Date | null;
};

export type AuditReportShareWithAuthor = AuditReportShareRow & { createdByName: string };

const SHARE_COLUMNS = `
  id, report_id, token, expires_at, revoked_at, created_by, created_at,
  view_count, first_viewed_at, last_viewed_at
`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: Record<string, any>): AuditReportShareRow {
  return {
    id: row.id,
    reportId: row.report_id,
    token: row.token,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    viewCount: row.view_count,
    firstViewedAt: row.first_viewed_at,
    lastViewedAt: row.last_viewed_at
  };
}

/**
 * Regenerar = revocar el activo + INSERT nuevo en la misma transacción (R3, R5).
 * El índice único parcial (report_id WHERE revoked_at IS NULL) es la red de seguridad.
 */
export async function createShareRevokingPrevious(input: {
  reportId: string;
  token: string;
  expiresAt: Date | null;
  createdBy: string;
}): Promise<AuditReportShareRow> {
  const sql = getSql();
  const row = await sql.begin(async (tx) => {
    await tx`
      UPDATE audit_report_share
      SET revoked_at = now()
      WHERE report_id = ${input.reportId} AND revoked_at IS NULL
    `;
    const rows = await tx.unsafe(
      `INSERT INTO audit_report_share (report_id, token, expires_at, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING ${SHARE_COLUMNS}`,
      [input.reportId, input.token, input.expiresAt, input.createdBy]
    );
    return rows[0];
  });
  return mapRow(row as never);
}

export async function getActiveShareByReport(
  reportId: string
): Promise<AuditReportShareRow | null> {
  const sql = getSql();
  const rows = await sql.unsafe(
    `SELECT ${SHARE_COLUMNS} FROM audit_report_share
     WHERE report_id = $1 AND revoked_at IS NULL
     LIMIT 1`,
    [reportId]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

/** Historial de envíos (R8): más reciente primero, con nombre de quien generó. */
export async function listSharesByReport(
  reportId: string
): Promise<AuditReportShareWithAuthor[]> {
  const sql = getSql();
  const rows = await sql.unsafe(
    `SELECT s.id, s.report_id, s.token, s.expires_at, s.revoked_at, s.created_by,
            s.created_at, s.view_count, s.first_viewed_at, s.last_viewed_at,
            u.name AS created_by_name
     FROM audit_report_share s
     JOIN app_user u ON u.id = s.created_by
     WHERE s.report_id = $1
     ORDER BY s.created_at DESC, s.id DESC`,
    [reportId]
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((row: Record<string, any>) => ({
    ...mapRow(row),
    createdByName: row.created_by_name
  }));
}

/** Lookup público por token, con el status del informe asociado (R1, R2). */
export async function findShareByToken(
  token: string
): Promise<(AuditReportShareRow & { reportStatus: InformeStatus }) | null> {
  const sql = getSql();
  const rows = await sql.unsafe(
    `SELECT s.id, s.report_id, s.token, s.expires_at, s.revoked_at, s.created_by,
            s.created_at, s.view_count, s.first_viewed_at, s.last_viewed_at,
            r.status AS report_status
     FROM audit_report_share s
     JOIN audit_report r ON r.id = s.report_id
     WHERE s.token = $1
     LIMIT 1`,
    [token]
  );
  if (!rows[0]) {
    return null;
  }
  return { ...mapRow(rows[0]), reportStatus: rows[0].report_status };
}

/** Revoca el share activo sin borrar la fila (R6). Null si no hay activo. */
export async function revokeShare(reportId: string): Promise<AuditReportShareRow | null> {
  const sql = getSql();
  const rows = await sql.unsafe(
    `UPDATE audit_report_share
     SET revoked_at = now()
     WHERE report_id = $1 AND revoked_at IS NULL
     RETURNING ${SHARE_COLUMNS}`,
    [reportId]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

/** Contador de vistas atómico: first_viewed_at solo la primera vez (R9). */
export async function registerShareView(shareId: string): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE audit_report_share
    SET view_count = view_count + 1,
        first_viewed_at = COALESCE(first_viewed_at, now()),
        last_viewed_at = now()
    WHERE id = ${shareId}
  `;
}
