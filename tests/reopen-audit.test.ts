/**
 * T14 — reopenAudit (#39 R8-R12)
 *
 * Cubre:
 *  - transición cerrada → en_cierre OK (admin)
 *  - transición cerrada → en_cierre OK (técnico asignado)
 *  - markReportsStale se llama dentro de la tx
 *  - ForbiddenError para técnico no asignado
 *  - ForbiddenError para rol inválido
 *  - InvalidStateTransitionError para estado no cerrado
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { setSqlForTests } from '../src/lib/server/db/client';
import { setupTestDb, teardownTestDb } from './helpers/db';
import { findUserByEmail } from './helpers/auth';
import { insertTestAuditRow } from './helpers/backoffice';
import { reopenAudit } from '../src/lib/server/scoring/persist';
import {
  ForbiddenError,
  InvalidStateTransitionError
} from '../src/lib/server/backoffice/errors';
import type { AppUser } from '../src/lib/server/auth/types';

describe('reopenAudit (#39 R8-R12)', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(() => {
    setSqlForTests(sql);
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  async function seedWithStatus(status: 'cerrada' | 'en_cierre' | 'en_relevamiento') {
    return insertTestAuditRow(sql, {
      razonSocial: 'Reopen Test SA',
      types: ['it'],
      status,
      assignedTechEmail: 'facu@serviciosysistemas.com.ar'
    });
  }

  it('admin puede reabrir auditoría cerrada → queda en_cierre (R8)', async () => {
    const { auditId } = await seedWithStatus('cerrada');
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');

    await expect(reopenAudit(auditId, admin!)).resolves.toBeUndefined();

    const [row] = await sql<{ status: string }[]>`
      SELECT status FROM audit WHERE id = ${auditId}
    `;
    expect(row.status).toBe('en_cierre');
  });

  it('técnico asignado puede reabrir auditoría cerrada (R9)', async () => {
    const { auditId } = await seedWithStatus('cerrada');
    const tecnico = await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar');

    await expect(reopenAudit(auditId, tecnico!)).resolves.toBeUndefined();

    const [row] = await sql<{ status: string }[]>`
      SELECT status FROM audit WHERE id = ${auditId}
    `;
    expect(row.status).toBe('en_cierre');
  });

  it('reopenAudit llama markReportsStale: informes quedan con stale_since != null (R13)', async () => {
    const { auditId } = await seedWithStatus('cerrada');
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');

    // Insertar un informe para la auditoría
    await sql`
      INSERT INTO audit_report (audit_id, version, status, canonical_json, schema_version, requested_by)
      VALUES (
        ${auditId}, 1, 'borrador', '{}'::jsonb, '1.0',
        ${admin!.id}
      )
    `;

    await reopenAudit(auditId, admin!);

    const [report] = await sql<{ stale_since: Date | null }[]>`
      SELECT stale_since FROM audit_report WHERE audit_id = ${auditId}
    `;
    expect(report.stale_since).not.toBeNull();
  });

  it('técnico no asignado recibe ForbiddenError (R10)', async () => {
    const { auditId } = await seedWithStatus('cerrada');
    const unassignedTech = await findUserByEmail(sql, 'simon@serviciosysistemas.com.ar');

    await expect(reopenAudit(auditId, unassignedTech!)).rejects.toThrow(ForbiddenError);
  });

  it('rol cliente recibe ForbiddenError (R11)', async () => {
    const { auditId } = await seedWithStatus('cerrada');
    const clienteUser: AppUser = {
      id: '00000000-0000-4000-8000-000000000099',
      email: 'cliente@test.com',
      name: 'Cliente',
      role: 'cliente' as never,
      active: true,
      auditTypes: []
    };

    await expect(reopenAudit(auditId, clienteUser)).rejects.toThrow(ForbiddenError);
  });

  it('estado no cerrado lanza InvalidStateTransitionError (R12)', async () => {
    const { auditId } = await seedWithStatus('en_cierre');
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');

    await expect(reopenAudit(auditId, admin!)).rejects.toThrow(InvalidStateTransitionError);
  });
});
