import { randomBytes } from 'node:crypto';
import { getServerEnv } from '$lib/server/env';
import { logger } from '$lib/server/logger';
import {
  createShareRevokingPrevious,
  findShareByToken,
  type AuditReportShareRow,
  type AuditReportShareWithAuthor
} from '$lib/server/db/informe-shares';
import { getReportById, type AuditReportRow } from '$lib/server/db/informe-reports';
import type { ShareEstado, ShareView } from '$lib/informe/share-view';
import { InformeReportNotApprovedError, InformeReportNotFoundError } from './errors';

export const INFORME_SHARE_DEFAULT_DAYS = 90;

export const INFORME_SHARE_UNAVAILABLE_MESSAGE = 'Este enlace ya no está disponible';

/** Token opaco de 256 bits, patrón briefing (R3). */
export function generateShareToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Expiración server-side: días desde ahora; null = sin vencimiento (R7). */
export function computeExpiresAt(days: number | null, now: Date = new Date()): Date | null {
  if (days === null) {
    return null;
  }
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

export function buildShareUrl(token: string): string {
  const env = getServerEnv();
  return `${env.PUBLIC_APP_URL}/informe/${token}`;
}

/** Estado derivado del share para backoffice (R8). */
export function shareEstado(
  share: Pick<AuditReportShareRow, 'revokedAt' | 'expiresAt'>,
  now: Date = new Date()
): ShareEstado {
  if (share.revokedAt !== null) {
    return 'revocado';
  }
  if (share.expiresAt !== null && share.expiresAt.getTime() < now.getTime()) {
    return 'expirado';
  }
  return 'activo';
}

export type { ShareEstado, ShareView } from '$lib/informe/share-view';

/** Serialización para API/backoffice: url completa + metadatos + estado (R8, R9). */
export function buildShareView(share: AuditReportShareWithAuthor, now?: Date): ShareView {
  return {
    url: buildShareUrl(share.token),
    estado: shareEstado(share, now),
    created_by: share.createdBy,
    created_by_name: share.createdByName,
    created_at: share.createdAt.toISOString(),
    expires_at: share.expiresAt ? share.expiresAt.toISOString() : null,
    revoked_at: share.revokedAt ? share.revokedAt.toISOString() : null,
    view_count: share.viewCount,
    first_viewed_at: share.firstViewedAt ? share.firstViewedAt.toISOString() : null,
    last_viewed_at: share.lastViewedAt ? share.lastViewedAt.toISOString() : null
  };
}

/**
 * Genera el link de entrega (R3, R5, R7): guard `aprobado` (R4) y regeneración
 * atómica (revoca el activo previo + INSERT en una transacción).
 */
export async function createReportShare(input: {
  reportId: string;
  createdBy: string;
  expiresInDays: number | null;
}): Promise<AuditReportShareRow> {
  const report = await getReportById(input.reportId);
  if (!report) {
    throw new InformeReportNotFoundError();
  }
  if (report.status !== 'aprobado') {
    throw new InformeReportNotApprovedError();
  }
  return createShareRevokingPrevious({
    reportId: report.id,
    token: generateShareToken(),
    expiresAt: computeExpiresAt(input.expiresInDays),
    createdBy: input.createdBy
  });
}

export type ShareResolution =
  | { ok: true; share: AuditReportShareRow; report: AuditReportRow }
  | { ok: false };

/**
 * Resolución pública del token (R1, R2): existe + no revocado + no expirado +
 * informe `aprobado`. La causa NO se expone hacia afuera; se loggea server-side.
 */
export async function resolveShareByToken(token: string): Promise<ShareResolution> {
  const share = await findShareByToken(token);
  if (!share) {
    logger.info('informe_share_rejected', { reason: 'not_found' });
    return { ok: false };
  }
  if (share.revokedAt !== null) {
    logger.info('informe_share_rejected', { reason: 'revoked', shareId: share.id });
    return { ok: false };
  }
  if (share.expiresAt !== null && share.expiresAt.getTime() < Date.now()) {
    logger.info('informe_share_rejected', { reason: 'expired', shareId: share.id });
    return { ok: false };
  }
  if (share.reportStatus !== 'aprobado') {
    logger.info('informe_share_rejected', { reason: 'not_approved', shareId: share.id });
    return { ok: false };
  }
  const report = await getReportById(share.reportId);
  if (!report || !report.clientDraft) {
    logger.info('informe_share_rejected', { reason: 'report_missing', shareId: share.id });
    return { ok: false };
  }
  return { ok: true, share, report };
}
