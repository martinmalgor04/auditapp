import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { findUserByEmail } from '../helpers/auth';
import {
  clearPsysEnv,
  mockPsysFetch,
  seedActiveProposalLink,
  seedApprovedReportFixture,
  setPsysEnv
} from '../fixtures/psys-proposal';
import { GET as syncGet } from '../../src/routes/api/audits/[id]/proposal/+server';
import { logger } from '../../src/lib/server/logger';

function locals(user: unknown) {
  return { user } as never;
}

describe('psys proposal API — GET sync', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(() => {
    setSqlForTests(sql);
    setPsysEnv();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearPsysEnv();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('actualiza psys_status y synced_at (R10)', async () => {
    const proposalId = randomUUID();
    mockPsysFetch((call) => {
      if (call.url.endsWith(`/api/m2m/proposals/${proposalId}`)) {
        return {
          status: 200,
          body: {
            proposal: {
              id: proposalId,
              number_display: '0000100000999',
              status: 'enviado',
              url: `https://presupuestos.serviciosysistemas.com.ar/presupuestos/${proposalId}`
            }
          }
        };
      }
      return { status: 404, body: { error: 'not found' } };
    });

    const fixture = await seedApprovedReportFixture(sql);
    await seedActiveProposalLink(sql, fixture, proposalId);
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');

    const res = await syncGet({ params: { id: fixture.auditId }, locals: locals(admin) } as never);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.psys_status).toBe('enviado');
    expect(body.data.sync_error).toBe(false);
    expect(body.data.synced_at).toBeTruthy();

    const [row] = await sql<{ psys_status: string; synced_at: Date | null }[]>`
      SELECT psys_status, synced_at FROM audit_proposal_link
      WHERE audit_id = ${fixture.auditId} AND status = 'activo'
    `;
    expect(row.psys_status).toBe('enviado');
    expect(row.synced_at).not.toBeNull();
  });

  it('estado fuera de enum conserva valor y loguea warning (R11)', async () => {
    const proposalId = randomUUID();
    mockPsysFetch(() => ({
      status: 200,
      body: {
        proposal: {
          id: proposalId,
          number_display: '0000100000999',
          status: 'inventado',
          url: `https://presupuestos.serviciosysistemas.com.ar/presupuestos/${proposalId}`
        }
      }
    }));
    const warnSpy = vi.spyOn(logger, 'warn');

    const fixture = await seedApprovedReportFixture(sql);
    await seedActiveProposalLink(sql, fixture, proposalId);
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');

    const res = await syncGet({ params: { id: fixture.auditId }, locals: locals(admin) } as never);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.psys_status).toBe('borrador');
    expect(warnSpy).toHaveBeenCalled();
  });

  it('fallo remoto devuelve sync_error sin modificar fila (R12)', async () => {
    const proposalId = randomUUID();
    mockPsysFetch(() => ({ status: 503, body: { error: 'down' } }));

    const fixture = await seedApprovedReportFixture(sql);
    await seedActiveProposalLink(sql, fixture, proposalId);
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');
    const [before] = await sql<{ psys_status: string; synced_at: Date | null }[]>`
      SELECT psys_status, synced_at FROM audit_proposal_link
      WHERE audit_id = ${fixture.auditId} AND status = 'activo'
    `;

    const res = await syncGet({ params: { id: fixture.auditId }, locals: locals(admin) } as never);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.sync_error).toBe(true);
    expect(body.data.psys_status).toBe('borrador');

    const [after] = await sql<{ psys_status: string; synced_at: Date | null }[]>`
      SELECT psys_status, synced_at FROM audit_proposal_link
      WHERE audit_id = ${fixture.auditId} AND status = 'activo'
    `;
    expect(after.psys_status).toBe(before.psys_status);
    expect(after.synced_at).toEqual(before.synced_at);
  });
});
