import type { AuditStatus } from '$lib/server/db/audit-status';
import type { AppUser } from '$lib/server/auth/types';
import { getSql } from '$lib/server/db/client';
import { ReunionAuditNotEditableError, ReunionNotAllowedError } from './errors';

export const REUNION_EDITABLE_STATUSES: AuditStatus[] = [
  'briefing_enviado',
  'briefing_completo',
  'en_relevamiento',
  'en_cierre'
];

type AuditRow = {
  id: string;
  status: AuditStatus;
  assigned_tech_id: string | null;
};

/**
 * Carga la auditoría y verifica que el usuario tenga acceso
 * (admin siempre; técnico solo si es el asignado).
 */
export async function assertReunionAccess(
  auditId: string,
  user: AppUser
): Promise<AuditRow> {
  const sql = getSql();
  const [row] = await sql<AuditRow[]>`
    SELECT id, status, assigned_tech_id
    FROM audit
    WHERE id = ${auditId}
      AND archived_at IS NULL
    LIMIT 1
  `;

  if (!row) {
    throw new ReunionNotAllowedError('Auditoría no encontrada');
  }

  if (user.role !== 'admin' && row.assigned_tech_id !== user.id) {
    throw new ReunionNotAllowedError();
  }

  return row;
}

/**
 * Lanza error si el estado de la auditoría no permite sesiones de reunión.
 */
export function assertReunionEditableStatus(status: AuditStatus): void {
  if (!REUNION_EDITABLE_STATUSES.includes(status)) {
    throw new ReunionAuditNotEditableError();
  }
}
