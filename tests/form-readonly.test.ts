/**
 * T13 — assertFormReadonlyAccess + loadAuditFormReadonly (#39)
 *
 * Cubre:
 *  - admin → siempre permitido
 *  - técnico asignado → permitido
 *  - técnico no asignado → AuditFormNotAllowedError (403)
 *  - loadAuditFormReadonly no inserta/actualiza audit_response
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { setSqlForTests } from '../src/lib/server/db/client';
import { setupTestDb, teardownTestDb } from './helpers/db';
import { findUserByEmail } from './helpers/auth';
import { insertTestAuditRow } from './helpers/backoffice';
import {
  assertFormReadonlyAccess,
  loadAuditFormReadonly
} from '../src/lib/server/form/load-form';
import { getAuditFormHeader } from '../src/lib/server/db/audit-form';
import { AuditFormNotAllowedError } from '../src/lib/server/form/errors';

describe('assertFormReadonlyAccess (#39 R5-R7)', () => {
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

  async function seedClosedAudit(techEmail = 'facu@serviciosysistemas.com.ar') {
    const { auditId } = await insertTestAuditRow(sql, {
      razonSocial: 'Readonly Test SA',
      types: ['it'],
      status: 'cerrada',
      assignedTechEmail: techEmail
    });
    const header = await getAuditFormHeader(auditId);
    if (!header) throw new Error('header not found');
    return { auditId, header };
  }

  it('admin puede acceder a auditoría cerrada (R5)', async () => {
    const { header } = await seedClosedAudit();
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');
    await expect(assertFormReadonlyAccess(header, admin!)).resolves.toBeUndefined();
  });

  it('técnico asignado puede acceder (R6)', async () => {
    const { header } = await seedClosedAudit('facu@serviciosysistemas.com.ar');
    const tecnico = await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar');
    await expect(assertFormReadonlyAccess(header, tecnico!)).resolves.toBeUndefined();
  });

  it('técnico no asignado recibe AuditFormNotAllowedError (R7)', async () => {
    const { header } = await seedClosedAudit('facu@serviciosysistemas.com.ar');
    const unassignedTech = await findUserByEmail(sql, 'simon@serviciosysistemas.com.ar');
    await expect(assertFormReadonlyAccess(header, unassignedTech!)).rejects.toThrow(
      AuditFormNotAllowedError
    );
  });
});

describe('loadAuditFormReadonly — no toca audit_response (#39 R1-R4)', () => {
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

  it('devuelve secciones e items sin modificar audit_response', async () => {
    const { auditId } = await insertTestAuditRow(sql, {
      razonSocial: 'LoadReadonly SA',
      types: ['it'],
      status: 'cerrada',
      assignedTechEmail: 'facu@serviciosysistemas.com.ar'
    });

    // Contar respuestas antes
    const [before] = await sql<{ count: string }[]>`
      SELECT COUNT(*)::text AS count FROM audit_response WHERE audit_id = ${auditId}
    `;
    const countBefore = parseInt(before.count, 10);

    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');
    const result = await loadAuditFormReadonly(auditId, admin!);

    // Validar estructura retornada
    expect(result.audit.id).toBe(auditId);
    expect(result.audit.status).toBe('cerrada');
    expect(Array.isArray(result.sections)).toBe(true);
    expect(typeof result.progressPct).toBe('number');

    // No se crearon/modificaron respuestas
    const [after] = await sql<{ count: string }[]>`
      SELECT COUNT(*)::text AS count FROM audit_response WHERE audit_id = ${auditId}
    `;
    expect(parseInt(after.count, 10)).toBe(countBefore);
  });
});
