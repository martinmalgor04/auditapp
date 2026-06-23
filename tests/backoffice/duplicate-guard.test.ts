import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { setSqlForTests } from '../../src/lib/server/db/client';
import type { AuditType } from '../../src/lib/audit-types';
import { createAudit } from '../../src/lib/server/backoffice/audits';
import { DuplicateAuditWarning } from '../../src/lib/server/backoffice/errors';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { findUserIdByEmail } from '../helpers/auth';

describe('guard anti-duplicado (#41 R21–R24)', () => {
  let sql: postgres.Sql;
  let adminId: string;
  let tecnicoItId: string;
  let tecnicoErpId: string;
  let empresaId: string;

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(async () => {
    setSqlForTests(sql);
    adminId = await findUserIdByEmail(sql, 'admin@serviciosysistemas.com.ar');
    tecnicoItId = await findUserIdByEmail(sql, 'facu@serviciosysistemas.com.ar');
    tecnicoErpId = await findUserIdByEmail(sql, 'simon@serviciosysistemas.com.ar');
    const cuit = '30-88000005-2';
    await sql`DELETE FROM audit WHERE empresa_id IN (SELECT id FROM empresa WHERE cuit = ${cuit})`;
    await sql`DELETE FROM audit_ref_counter WHERE empresa_id IN (SELECT id FROM empresa WHERE cuit = ${cuit})`;
    await sql`DELETE FROM empresa WHERE cuit = ${cuit}`;
    const [emp] = await sql<{ id: string }[]>`
      INSERT INTO empresa (razon_social, cuit, relacion, codigo)
      VALUES ('Duplicado Guard SA', ${cuit}, 'cliente', 'DUPG')
      RETURNING id
    `;
    empresaId = emp.id;
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  const baseInput = () => ({
    clientId: empresaId,
    types: ['erp-tango'] as [AuditType],
    segment: 'B' as const,
    techByType: { 'erp-tango': tecnicoErpId } as Record<AuditType, string>,
    scheduledAt: '2026-09-01',
    cabResponses: {}
  });

  it('ERP activa → aviso sin confirmDuplicate', async () => {
    const first = await createAudit({ ...baseInput() }, adminId);
    const [existing] = await sql<
      { ref_code: string; status: string; encargada: string | null }[]
    >`
      SELECT a.ref_code, a.status, u.name AS encargada
      FROM audit a
      LEFT JOIN app_user u ON u.id = a.assigned_tech_id
      WHERE a.id = ${first.id}
    `;

    let caught: unknown;
    try {
      await createAudit({ ...baseInput() }, adminId);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(DuplicateAuditWarning);
    const warning = caught as DuplicateAuditWarning;
    expect(warning.conflicts.length).toBeGreaterThanOrEqual(1);

    for (const conflict of warning.conflicts) {
      expect(conflict.refCode).toMatch(/^[A-Z0-9]+-(IT|ERP|ERPE)-[0-9]{4,}$/);
      expect(conflict.status).toBeTruthy();
      expect(conflict.encargada === null || typeof conflict.encargada === 'string').toBe(true);
    }

    expect(warning.conflicts[0].refCode).toBe(existing.ref_code);
    expect(warning.conflicts[0].status).toBe(existing.status);
    expect(warning.conflicts[0].encargada).toBe(existing.encargada);
  });

  it('confirmDuplicate → crea con correlativo siguiente', async () => {
    const first = await createAudit({ ...baseInput() }, adminId);
    const second = await createAudit({ ...baseInput(), confirmDuplicate: true }, adminId);
    const rows = await sql<{ ref_code: string }[]>`
      SELECT ref_code FROM audit WHERE id IN (${first.id}::uuid, ${second.id}::uuid) ORDER BY ref_code
    `;
    expect(rows[0].ref_code).toMatch(/-ERP-0001$/);
    expect(rows[1].ref_code).toMatch(/-ERP-0002$/);
  });

  it('sin conflicto → crea directo', async () => {
    const { id } = await createAudit({ ...baseInput(), types: ['it'], techByType: { it: tecnicoItId } }, adminId);
    const [row] = await sql<{ ref_code: string }[]>`SELECT ref_code FROM audit WHERE id = ${id}`;
    expect(row.ref_code).toMatch(/-IT-0001$/);
  });

  it('cerrada/archivada no bloquea nueva del mismo tipo', async () => {
    const first = await createAudit({ ...baseInput() }, adminId);
    await sql`UPDATE audit SET status = 'cerrada' WHERE id = ${first.id}`;
    const second = await createAudit({ ...baseInput() }, adminId);
    expect(second.id).not.toBe(first.id);
  });
});
