import type postgres from 'postgres';
import { getSql } from '$lib/server/db/client';
import type { AuditType } from '$lib/audit-types';

type DbExecutor = postgres.Sql | postgres.TransactionSql;

export type AuditAssignment = { auditType: AuditType; techId: string };

/** Asignaciones por área de una auditoría. */
export async function listAuditAssignments(auditId: string): Promise<AuditAssignment[]> {
  const sql = getSql();
  const rows = await sql<{ audit_type: AuditType; tech_id: string }[]>`
    SELECT audit_type, tech_id
    FROM audit_assignment
    WHERE audit_id = ${auditId}
    ORDER BY audit_type
  `;
  return rows.map((r) => ({ auditType: r.audit_type, techId: r.tech_id }));
}

/** Tipos que un técnico tiene asignados en una auditoría (vacío = no asignado). */
export async function techAssignedTypes(auditId: string, techId: string): Promise<AuditType[]> {
  const sql = getSql();
  const rows = await sql<{ audit_type: AuditType }[]>`
    SELECT audit_type
    FROM audit_assignment
    WHERE audit_id = ${auditId} AND tech_id = ${techId}
    ORDER BY audit_type
  `;
  return rows.map((r) => r.audit_type);
}

/** Inserta las asignaciones (una por tipo) dentro de una tx de alta. */
export async function insertAuditAssignments(
  tx: DbExecutor,
  auditId: string,
  assignments: AuditAssignment[]
): Promise<void> {
  for (const { auditType, techId } of assignments) {
    await tx`
      INSERT INTO audit_assignment (audit_id, audit_type, tech_id)
      VALUES (${auditId}, ${auditType}, ${techId})
      ON CONFLICT (audit_id, audit_type) DO UPDATE SET
        tech_id = EXCLUDED.tech_id
    `;
  }
}

/** True si el técnico está asignado a ≥1 tipo de la auditoría. */
export async function techIsAssigned(auditId: string, techId: string): Promise<boolean> {
  const sql = getSql();
  const [row] = await sql<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM audit_assignment
      WHERE audit_id = ${auditId} AND tech_id = ${techId}
    ) AS exists
  `;
  return row?.exists ?? false;
}
