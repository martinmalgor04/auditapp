import { isRedirect } from '@sveltejs/kit';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setSqlForTests } from '../../src/lib/server/db/client';
import {
  archiveAudit,
  createAudit,
  getAuditById,
  updateAudit
} from '../../src/lib/server/backoffice/audits';
import { AuditClosedError } from '../../src/lib/server/backoffice/errors';
import { listDashboardAudits } from '../../src/lib/server/backoffice/dashboard';
import { actions as auditDetailActions } from '../../src/routes/(app)/auditorias/[id]/+page.server';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { findUserIdByEmail } from '../helpers/auth';
import { getCabItemId, insertTestAuditRow } from '../helpers/backoffice';
import type postgres from 'postgres';

describe('audit CRUD', () => {
  let sql: postgres.Sql;
  let adminId: string;
  let tecnicoId: string;

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(async () => {
    setSqlForTests(sql);
    adminId = await findUserIdByEmail(sql, 'admin@serviciosysistemas.com.ar');
    tecnicoId = await findUserIdByEmail(sql, 'facu@serviciosysistemas.com.ar');
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('create audit sets borrador and freezes template_ids', async () => {
    const [client] = await sql<{ id: string }[]>`
      SELECT id FROM client LIMIT 1
    `;
    const cabItemId = await getCabItemId(sql, 'it');

    const { id } = await createAudit(
      {
        clientId: client.id,
        types: ['it'],
        segment: 'B',
        techByType: { it: tecnicoId },
        scheduledAt: '2026-07-01',
        cabResponses: { [cabItemId]: 'Test SA' }
      },
      adminId
    );

    const audit = await getAuditById(id);
    expect(audit?.status).toBe('borrador');
    expect(audit?.templateIds.length).toBe(1);

    const [tpl] = await sql<{ code: string }[]>`
      SELECT code FROM template WHERE id = ${audit!.templateIds[0]}
    `;
    expect(tpl.code).toBe('it');
  });

  it('update header and reassign tech when not closed', async () => {
    const { auditId } = await insertTestAuditRow(sql, { razonSocial: 'Editable' });
    const cabItemId = await getCabItemId(sql, 'it');

    await updateAudit(
      auditId,
      {
        segment: 'C',
        assignedTechId: adminId,
        scheduledAt: '2026-09-01',
        cabResponses: { [cabItemId]: 'Actualizado' }
      },
      adminId
    );

    const audit = await getAuditById(auditId);
    expect(audit?.segment).toBe('C');
    expect(audit?.assignedTechId).toBe(adminId);
    expect(audit?.cabItems.find((i) => i.id === cabItemId)?.value).toBe('Actualizado');
  });

  it('update on closed audit returns 403 or 409', async () => {
    const { auditId } = await insertTestAuditRow(sql, {
      razonSocial: 'Cerrada',
      status: 'cerrada'
    });

    await expect(
      updateAudit(auditId, { segment: 'B' }, adminId)
    ).rejects.toThrow(AuditClosedError);
  });

  it('archive sets archived_at; audit hidden from tablero', async () => {
    const { auditId } = await insertTestAuditRow(sql, { razonSocial: 'Para archivar' });

    await archiveAudit(auditId, adminId);

    const [row] = await sql<{ archived_at: Date | null }[]>`
      SELECT archived_at FROM audit WHERE id = ${auditId}
    `;
    expect(row.archived_at).not.toBeNull();

    const dashboard = await listDashboardAudits({ page: 1, sort: 'last_activity_desc' });
    expect(dashboard.rows.find((r) => r.id === auditId)).toBeUndefined();
  });

  it('archive action allows tecnico', async () => {
    const { auditId } = await insertTestAuditRow(sql, { razonSocial: 'Staff archive' });

    try {
      await auditDetailActions.archive({
        locals: {
          user: {
            id: tecnicoId,
            email: 'facu@serviciosysistemas.com.ar',
            name: 'Facu',
            role: 'tecnico',
            active: true,
            auditTypes: ['it']
          }
        },
        params: { id: auditId }
      } as never);
      expect.fail('should redirect');
    } catch (e) {
      expect(isRedirect(e)).toBe(true);
    }
  });
});
