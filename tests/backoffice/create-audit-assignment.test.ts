import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { createAudit, getAuditById } from '../../src/lib/server/backoffice/audits';
import { listAuditAssignments } from '../../src/lib/server/db/audit-assignment';
import { ValidationError } from '../../src/lib/server/backoffice/errors';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { findUserIdByEmail } from '../helpers/auth';

// #32 — alta de auditoría con asignación por área. Cubre R7, R8, R9, R10, R25.
describe('#32 createAudit — asignación por área', () => {
  let sql: postgres.Sql;
  let adminId: string;
  let itTech: string; // facu → it
  let erpTech: string; // simon → erp-tango / erp-estandar

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(async () => {
    setSqlForTests(sql);
    adminId = await findUserIdByEmail(sql, 'admin@serviciosysistemas.com.ar');
    itTech = await findUserIdByEmail(sql, 'facu@serviciosysistemas.com.ar');
    erpTech = await findUserIdByEmail(sql, 'simon@serviciosysistemas.com.ar');
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  async function newClient(razon: string): Promise<string> {
    const [c] = await sql<{ id: string }[]>`
      INSERT INTO empresa (razon_social, relacion) VALUES (${razon}, 'cliente') RETURNING id
    `;
    return c.id;
  }

  it('(R8, R9, R10) mixta IT+ERP con dos técnicos distintos → 2 asignaciones + lead determinístico', async () => {
    const clientId = await newClient('Mixta Dos Tecnicos SA');
    const { id } = await createAudit(
      {
        clientId,
        types: ['it', 'erp-tango'],
        segment: 'B',
        techByType: { it: itTech, 'erp-tango': erpTech },
        scheduledAt: '2026-07-01',
        cabResponses: {}
      },
      adminId
    );

    const assignments = await listAuditAssignments(id);
    expect(assignments).toEqual(
      expect.arrayContaining([
        { auditType: 'it', techId: itTech },
        { auditType: 'erp-tango', techId: erpTech }
      ])
    );
    expect(assignments.length).toBe(2);

    // R10: assigned_tech_id = técnico del tipo líder (it < erp-tango) → itTech, nunca nulo.
    const audit = await getAuditById(id);
    expect(audit?.assignedTechId).toBe(itTech);
  });

  it('(R7) técnico IT asignado a tipo ERP → rechazo, sin auditoría creada', async () => {
    const clientId = await newClient('Especialidad Invalida SA');
    const [{ count: before }] = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count FROM audit WHERE empresa_id = ${clientId}
    `;

    await expect(
      createAudit(
        {
          clientId,
          types: ['erp-tango'],
          segment: 'A',
          // facu (IT) no puede erp-tango.
          techByType: { 'erp-tango': itTech },
          scheduledAt: '2026-07-01',
          cabResponses: {}
        },
        adminId
      )
    ).rejects.toThrow(ValidationError);

    const [{ count: after }] = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count FROM audit WHERE empresa_id = ${clientId}
    `;
    expect(after).toBe(before);
  });

  it('(R25) single-type → 1 asignación, sin regresión', async () => {
    const clientId = await newClient('Single Type SA');
    const { id } = await createAudit(
      {
        clientId,
        types: ['it'],
        segment: 'A',
        techByType: { it: itTech },
        scheduledAt: '2026-07-01',
        cabResponses: {}
      },
      adminId
    );

    const assignments = await listAuditAssignments(id);
    expect(assignments).toEqual([{ auditType: 'it', techId: itTech }]);

    const audit = await getAuditById(id);
    expect(audit?.assignedTechId).toBe(itTech);
    expect(audit?.status).toBe('borrador');
  });
});
