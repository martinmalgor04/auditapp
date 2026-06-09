import { isRedirect } from '@sveltejs/kit';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { load as tableroLoad } from '../../src/routes/(app)/tablero/+page.server';
import { load as usuariosLoad } from '../../src/routes/(app)/usuarios/+page.server';
import { actions as auditActions } from '../../src/routes/(app)/auditorias/[id]/+page.server';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { findUserIdByEmail } from '../helpers/auth';
import { insertTestAuditRow } from '../helpers/backoffice';
import type postgres from 'postgres';

describe('backoffice routes auth', () => {
  let sql: postgres.Sql;
  let adminId: string;
  let tecnicoId: string;

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(async () => {
    adminId = await findUserIdByEmail(sql, 'admin@serviciosysistemas.com.ar');
    tecnicoId = await findUserIdByEmail(sql, 'facu@serviciosysistemas.com.ar');
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('unauthenticated GET /tablero returns 302 to login', async () => {
    try {
      await tableroLoad({
        locals: { user: null },
        url: new URL('http://localhost/tablero')
      } as never);
      expect.fail('should redirect');
    } catch (e) {
      expect(isRedirect(e)).toBe(true);
      if (isRedirect(e)) {
        expect(e.status).toBe(303);
        expect(e.location).toBe('/login');
      }
    }
  });

  it('authenticated staff can load tablero', async () => {
    await insertTestAuditRow(sql, { razonSocial: 'Visible' });

    const data = (await tableroLoad({
      locals: {
        user: {
          id: tecnicoId,
          email: 'facu@serviciosysistemas.com.ar',
          name: 'Facu',
          role: 'tecnico',
          active: true
        }
      },
      url: new URL('http://localhost/tablero')
    } as never)) as { dashboard: { rows: unknown[] } };

    expect(data.dashboard.rows.length).toBeGreaterThanOrEqual(1);
  });

  it('role guards block tecnico from admin routes', async () => {
    try {
      await usuariosLoad({ locals: { user: { id: tecnicoId, email: 'f', name: 'F', role: 'tecnico', active: true } } } as never);
      expect.fail('should 403');
    } catch (e) {
      expect((e as { status: number }).status).toBe(403);
    }
  });

  it('tecnico cannot archive audits', async () => {
    const { auditId } = await insertTestAuditRow(sql, { razonSocial: 'Guard test' });

    const result = await auditActions.archive({
      locals: {
        user: {
          id: tecnicoId,
          email: 'facu@serviciosysistemas.com.ar',
          name: 'Facu',
          role: 'tecnico',
          active: true
        }
      },
      params: { id: auditId }
    } as never);

    expect(result).toMatchObject({ status: 403 });
  });

  it('admin can archive audits', async () => {
    const { auditId } = await insertTestAuditRow(sql, { razonSocial: 'Archive ok' });

    try {
      await auditActions.archive({
        locals: {
          user: {
            id: adminId,
            email: 'admin@serviciosysistemas.com.ar',
            name: 'Admin',
            role: 'admin',
            active: true
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
