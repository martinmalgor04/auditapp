import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { findUserByEmail } from '../helpers/auth';
import {
  clearPsysEnv,
  defaultCreateHandler,
  mockPsysFetch,
  seedActiveProposalLink,
  seedApprovedReportFixture,
  setPsysEnv,
  type PsysFetchCall
} from '../fixtures/psys-proposal';
import { GET as syncGet, POST as createPost } from '../../src/routes/api/audits/[id]/proposal/+server';

function locals(user: unknown) {
  return { user } as never;
}

async function countLinks(sql: postgres.Sql): Promise<number> {
  const [row] = await sql<{ count: string }[]>`SELECT count(*) FROM audit_proposal_link`;
  return Number(row.count);
}

describe('psys proposal API — POST', () => {
  let sql: postgres.Sql;
  let fetchCalls: PsysFetchCall[];

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(() => {
    setSqlForTests(sql);
    setPsysEnv();
    fetchCalls = [];
    mockPsysFetch((call) => {
      fetchCalls.push(call);
      return defaultCreateHandler()(call);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearPsysEnv();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('401 sin sesión, 403 tecnico, 201 admin (R1)', async () => {
    const fixture = await seedApprovedReportFixture(sql);
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');
    const tech = await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar');

    expect((await createPost({ params: { id: fixture.auditId }, locals: locals(null) } as never)).status).toBe(
      401
    );
    expect(
      (await createPost({ params: { id: fixture.auditId }, locals: locals(tech) } as never)).status
    ).toBe(403);
    expect(
      (await createPost({ params: { id: fixture.auditId }, locals: locals(admin) } as never)).status
    ).toBe(201);
  });

  it('409 sin informe aprobado; mock sin llamadas (R2)', async () => {
    const fixture = await seedApprovedReportFixture(sql);
    await sql`UPDATE audit_report SET status = 'borrador' WHERE id = ${fixture.reportId}`;
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');
    const before = await countLinks(sql);

    const res = await createPost({ params: { id: fixture.auditId }, locals: locals(admin) } as never);
    expect(res.status).toBe(409);
    expect(fetchCalls).toHaveLength(0);
    expect(await countLinks(sql)).toBe(before);
  });

  it('503 sin env; sin filas ni llamadas (R3)', async () => {
    clearPsysEnv();
    const fixture = await seedApprovedReportFixture(sql);
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');
    const before = await countLinks(sql);

    const res = await createPost({ params: { id: fixture.auditId }, locals: locals(admin) } as never);
    const body = await res.json();
    expect(res.status).toBe(503);
    expect(body.error).toContain('presupuestossys');
    expect(fetchCalls).toHaveLength(0);
    expect(await countLinks(sql)).toBe(before);
  });

  it('201 persiste vínculo con snapshot enviado (R7)', async () => {
    const proposalId = randomUUID();
    mockPsysFetch((call) => {
      fetchCalls.push(call);
      return defaultCreateHandler(proposalId)(call);
    });
    const fixture = await seedApprovedReportFixture(sql);
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');

    const res = await createPost({ params: { id: fixture.auditId }, locals: locals(admin) } as never);
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.data.proposal_id).toBe(proposalId);
    expect(body.data.number_display).toBe('0000100000123');

    const [row] = await sql<
      {
        proposal_id: string;
        number_display: string;
        proposal_url: string;
        sent_payload: { contract_version: string };
      }[]
    >`
      SELECT proposal_id, number_display, proposal_url, sent_payload
      FROM audit_proposal_link
      WHERE audit_id = ${fixture.auditId} AND status = 'activo'
    `;
    expect(row.proposal_id).toBe(proposalId);
    expect(row.sent_payload.contract_version).toBe('1.1');
  });

  it('segundo POST idempotente: 200 y una sola llamada remota (R6)', async () => {
    const fixture = await seedApprovedReportFixture(sql);
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');
    const first = await createPost({ params: { id: fixture.auditId }, locals: locals(admin) } as never);
    expect(first.status).toBe(201);
    fetchCalls.length = 0;

    const second = await createPost({ params: { id: fixture.auditId }, locals: locals(admin) } as never);
    expect(second.status).toBe(200);
    expect(fetchCalls).toHaveLength(0);
    const body = await second.json();
    expect(body.data.proposal_id).toBeTruthy();
  });

  it('remoto 200 existente persiste vínculo sin duplicar activos (R9)', async () => {
    const proposalId = randomUUID();
    mockPsysFetch((call) => {
      fetchCalls.push(call);
      if (call.method === 'POST') {
        return {
          status: 200,
          body: {
            proposal: {
              id: proposalId,
              number_display: '0000100000777',
              status: 'borrador',
              url: `https://presupuestos.serviciosysistemas.com.ar/presupuestos/${proposalId}`
            }
          }
        };
      }
      return { status: 404, body: { error: 'not found' } };
    });
    const fixture = await seedApprovedReportFixture(sql);
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');
    const res = await createPost({ params: { id: fixture.auditId }, locals: locals(admin) } as never);
    expect(res.status).toBe(201);
    const [count] = await sql<{ count: string }[]>`
      SELECT count(*) FROM audit_proposal_link
      WHERE audit_id = ${fixture.auditId} AND status = 'activo'
    `;
    expect(Number(count.count)).toBe(1);
  });

  it('error remoto 502 + fila error; reintento vuelve a llamar (R8)', async () => {
    let calls = 0;
    mockPsysFetch((call) => {
      fetchCalls.push(call);
      calls += 1;
      if (calls === 1) {
        return { status: 500, body: { error: 'falló' } };
      }
      return defaultCreateHandler()(call);
    });
    const fixture = await seedApprovedReportFixture(sql);
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');

    const fail = await createPost({ params: { id: fixture.auditId }, locals: locals(admin) } as never);
    expect(fail.status).toBe(502);
    const [errorRow] = await sql<{ status: string; error_message: string; proposal_id: string | null }[]>`
      SELECT status, error_message, proposal_id FROM audit_proposal_link
      WHERE audit_id = ${fixture.auditId} ORDER BY created_at DESC LIMIT 1
    `;
    expect(errorRow.status).toBe('error');
    expect(errorRow.error_message).toBeTruthy();
    expect(errorRow.proposal_id).toBeNull();

    const retry = await createPost({ params: { id: fixture.auditId }, locals: locals(admin) } as never);
    expect(retry.status).toBe(201);
    expect(calls).toBe(2);
  });

  it('colisión UNIQUE devuelve vínculo ganador 200 (R16)', async () => {
    const fixture = await seedApprovedReportFixture(sql);
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');
    const winnerId = randomUUID();
    await seedActiveProposalLink(sql, fixture, winnerId);

    const res = await createPost({ params: { id: fixture.auditId }, locals: locals(admin) } as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.proposal_id).toBe(winnerId);
    expect(fetchCalls).toHaveLength(0);
  });

  it('GET sync requiere admin (R1)', async () => {
    const fixture = await seedApprovedReportFixture(sql);
    const tech = await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar');
    expect(
      (await syncGet({ params: { id: fixture.auditId }, locals: locals(tech) } as never)).status
    ).toBe(403);
  });
});
