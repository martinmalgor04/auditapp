import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { actions as cierreActions } from '../../src/routes/(app)/auditorias/[id]/cierre/+page.server';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { findUserByEmail } from '../helpers/auth';
import { seedClosureAuditFixture } from '../fixtures/closure-audit';
import type { AppUser } from '../../src/lib/server/auth/types';
import type postgres from 'postgres';

function confirmEvent(auditId: string, user: AppUser, fd: FormData) {
  return {
    locals: { user },
    params: { id: auditId },
    request: new Request(`http://localhost/auditorias/${auditId}/cierre`, {
      method: 'POST',
      body: fd
    })
  } as never;
}

describe('cierre — action confirmClosure', () => {
  let sql: postgres.Sql;
  let tech: AppUser;

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(async () => {
    setSqlForTests(sql);
    tech = (await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar'))!;
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('sin top_risks/quick_wins/next_step no cierra y devuelve warnings', async () => {
    const { auditId } = await seedClosureAuditFixture(sql, { status: 'en_cierre' });

    const result = await cierreActions.confirmClosure(confirmEvent(auditId, tech, new FormData()));

    expect(result).toMatchObject({
      status: 400,
      data: {
        warnings: expect.arrayContaining(['top_risks', 'quick_wins', 'next_step'])
      }
    });

    const [audit] = await sql<{ status: string }[]>`
      SELECT status FROM audit WHERE id = ${auditId}
    `;
    expect(audit.status).toBe('en_cierre');
  });

  it('confirmar guarda los campos tipeados antes de cerrar (no se descartan)', async () => {
    const { auditId } = await seedClosureAuditFixture(sql, { status: 'en_cierre' });

    const fd = new FormData();
    fd.set('topRisks', JSON.stringify([{ text: 'Backup de base Tango sin probar', severity: 'alta' }]));
    fd.set('quickWins', JSON.stringify(['Activar Tango Backup (gratis)']));
    fd.set('nextStep', 'Reunión de devolución con el cliente');

    await expect(
      cierreActions.confirmClosure(confirmEvent(auditId, tech, fd))
    ).rejects.toMatchObject({ status: 303 });

    const [audit] = await sql<{ status: string }[]>`
      SELECT status FROM audit WHERE id = ${auditId}
    `;
    expect(audit.status).toBe('cerrada');

    const [closure] = await sql<{ top_risks: unknown[]; quick_wins: unknown[] }[]>`
      SELECT top_risks, quick_wins FROM audit_closure WHERE audit_id = ${auditId}
    `;
    expect(closure.top_risks).toHaveLength(1);
    expect(closure.quick_wins).toHaveLength(1);
  });

  it('con forceClose=1 cierra aunque falten campos', async () => {
    const { auditId } = await seedClosureAuditFixture(sql, { status: 'en_cierre' });

    const fd = new FormData();
    fd.set('forceClose', '1');

    await expect(
      cierreActions.confirmClosure(confirmEvent(auditId, tech, fd))
    ).rejects.toMatchObject({ status: 303 });

    const [audit] = await sql<{ status: string }[]>`
      SELECT status FROM audit WHERE id = ${auditId}
    `;
    expect(audit.status).toBe('cerrada');
  });
});
