import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { seedReportForShare } from '../fixtures/informe-share';
import type { AppUser } from '../../src/lib/server/auth/types';
import {
  DELETE as shareDelete,
  GET as shareGet,
  POST as sharePost
} from '../../src/routes/api/audits/[id]/report/[version]/share/+server';

function locals(user: AppUser | null) {
  return { user } as never;
}

function sharePath(auditId: string, version: number): { id: string; version: string } {
  return { id: auditId, version: String(version) };
}

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

describe('informe share admin API (R3–R9)', () => {
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

  it('401 sin sesión en POST/GET/DELETE (R4)', async () => {
    const { auditId, version } = await seedReportForShare(sql, 'aprobado');
    const params = sharePath(auditId, version);

    expect((await sharePost({ params, locals: locals(null), request: postRequest({}) } as never)).status).toBe(401);
    expect((await shareGet({ params, locals: locals(null) } as never)).status).toBe(401);
    expect((await shareDelete({ params, locals: locals(null) } as never)).status).toBe(401);
  });

  it('403 técnico en POST/GET/DELETE (R4)', async () => {
    const { auditId, version, tech } = await seedReportForShare(sql, 'aprobado');
    const params = sharePath(auditId, version);
    const loc = locals(tech);

    expect((await sharePost({ params, locals: loc, request: postRequest({}) } as never)).status).toBe(403);
    expect((await shareGet({ params, locals: loc } as never)).status).toBe(403);
    expect((await shareDelete({ params, locals: loc } as never)).status).toBe(403);
  });

  it('POST sobre borrador 409 sin fila (R4)', async () => {
    const { auditId, version, admin, reportId } = await seedReportForShare(sql, 'borrador');
    const res = await sharePost({
      params: sharePath(auditId, version),
      locals: locals(admin),
      request: postRequest({ expires_in_days: 90 })
    } as never);
    expect(res.status).toBe(409);

    const [count] = await sql<{ count: string }[]>`
      SELECT count(*) FROM audit_report_share WHERE report_id = ${reportId}
    `;
    expect(Number(count.count)).toBe(0);
  });

  it('POST crea share con metadatos (R3, R8)', async () => {
    const { auditId, version, admin, reportId } = await seedReportForShare(sql, 'aprobado');
    const res = await sharePost({
      params: sharePath(auditId, version),
      locals: locals(admin),
      request: postRequest({ expires_in_days: 30 })
    } as never);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.token).toHaveLength(43);
    expect(body.data.token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(body.data.url).toBe(`${process.env.PUBLIC_APP_URL}/informe/${body.data.token}`);
    expect(body.data.estado).toBe('activo');
    expect(body.data.created_by).toBe(admin.id);
    expect(body.data.created_by_name).toBeTruthy();
    expect(body.data.created_at).toBeTruthy();
    expect(body.data.expires_at).toBeTruthy();
    expect(body.data.view_count).toBe(0);
    expect(body.data.first_viewed_at).toBeNull();

    const [row] = await sql<{ token: string }[]>`
      SELECT token FROM audit_report_share WHERE report_id = ${reportId}
    `;
    expect(row.token).toBe(body.data.token);
  });

  it('segundo POST regenera: nuevo token y anterior con revoked_at (R5)', async () => {
    const { auditId, version, admin, reportId } = await seedReportForShare(sql, 'aprobado');
    const params = sharePath(auditId, version);
    const loc = locals(admin);

    const first = await sharePost({ params, locals: loc, request: postRequest({}) } as never);
    const firstBody = await first.json();
    const second = await sharePost({ params, locals: loc, request: postRequest({}) } as never);
    const secondBody = await second.json();

    expect(second.status).toBe(201);
    expect(secondBody.data.token).not.toBe(firstBody.data.token);

    const rows = await sql<{ token: string; revoked_at: Date | null }[]>`
      SELECT token, revoked_at FROM audit_report_share
      WHERE report_id = ${reportId}
      ORDER BY created_at ASC
    `;
    expect(rows).toHaveLength(2);
    expect(rows[0].revoked_at).not.toBeNull();
    expect(rows[1].revoked_at).toBeNull();
    expect(rows[1].token).toBe(secondBody.data.token);
  });

  it('expires_in_days: 0 → 400 Zod (R7)', async () => {
    const { auditId, version, admin } = await seedReportForShare(sql, 'aprobado');
    const res = await sharePost({
      params: sharePath(auditId, version),
      locals: locals(admin),
      request: postRequest({ expires_in_days: 0 })
    } as never);
    expect(res.status).toBe(400);
  });

  it('DELETE revoca (fila persiste) y segundo DELETE 404 (R6)', async () => {
    const { auditId, version, admin, reportId } = await seedReportForShare(sql, 'aprobado');
    const params = sharePath(auditId, version);
    const loc = locals(admin);

    await sharePost({ params, locals: loc, request: postRequest({}) } as never);

    const del1 = await shareDelete({ params, locals: loc } as never);
    expect(del1.status).toBe(200);
    const del1Body = await del1.json();
    expect(del1Body.data.revoked_at).toBeTruthy();

    const [row] = await sql<{ revoked_at: Date | null }[]>`
      SELECT revoked_at FROM audit_report_share WHERE report_id = ${reportId}
    `;
    expect(row.revoked_at).not.toBeNull();

    const del2 = await shareDelete({ params, locals: loc } as never);
    expect(del2.status).toBe(404);
  });

  it('GET devuelve url, metadatos, estado y stats de vistas (R8, R9)', async () => {
    const { auditId, version, admin, reportId } = await seedReportForShare(sql, 'aprobado');
    const params = sharePath(auditId, version);
    const loc = locals(admin);

    const empty = await shareGet({ params, locals: loc } as never);
    expect(empty.status).toBe(200);
    expect((await empty.json()).data).toBeNull();

    const created = await sharePost({
      params,
      locals: loc,
      request: postRequest({ expires_in_days: null })
    } as never);
    const createdBody = await created.json();

    await sql`
      UPDATE audit_report_share
      SET view_count = 3,
          first_viewed_at = '2026-06-01T10:00:00Z',
          last_viewed_at = '2026-06-12T12:00:00Z'
      WHERE report_id = ${reportId} AND revoked_at IS NULL
    `;

    const res = await shareGet({ params, locals: loc } as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.url).toBe(createdBody.data.url);
    expect(body.data.created_by_name).toBeTruthy();
    expect(body.data.created_at).toBeTruthy();
    expect(body.data.expires_at).toBeNull();
    expect(body.data.estado).toBe('activo');
    expect(body.data.view_count).toBe(3);
    expect(body.data.first_viewed_at).toBe('2026-06-01T10:00:00.000Z');
    expect(body.data.last_viewed_at).toBeTruthy();
  });
});
