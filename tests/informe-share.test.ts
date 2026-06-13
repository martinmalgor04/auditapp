import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { setSqlForTests } from '../src/lib/server/db/client';
import { setupTestDb, teardownTestDb } from './helpers/db';
import { seedReportForShare } from './fixtures/informe-share';
import {
  buildShareUrl,
  computeExpiresAt,
  createReportShare,
  generateShareToken,
  INFORME_SHARE_DEFAULT_DAYS,
  resolveShareByToken,
  shareEstado
} from '../src/lib/server/informe/share';
import { InformeReportNotApprovedError } from '../src/lib/server/informe/errors';

describe('informe share — token y expiración (R2, R3, R7)', () => {
  it('genera tokens de 43 caracteres base64url (256 bits)', () => {
    const token = generateShareToken();
    expect(token).toHaveLength(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('tokens únicos en 500 generaciones', () => {
    const tokens = new Set(Array.from({ length: 500 }, () => generateShareToken()));
    expect(tokens.size).toBe(500);
  });

  it('computeExpiresAt calcula días desde ahora y null = sin vencimiento (R7)', () => {
    const now = new Date('2026-06-12T00:00:00Z');
    expect(computeExpiresAt(90, now)?.toISOString()).toBe('2026-09-10T00:00:00.000Z');
    expect(computeExpiresAt(1, now)?.toISOString()).toBe('2026-06-13T00:00:00.000Z');
    expect(computeExpiresAt(null, now)).toBeNull();
    expect(INFORME_SHARE_DEFAULT_DAYS).toBe(90);
  });

  it('buildShareUrl arma PUBLIC_APP_URL/informe/<token>', () => {
    const url = buildShareUrl('abc123');
    expect(url).toBe(`${process.env.PUBLIC_APP_URL}/informe/abc123`);
  });

  it('shareEstado deriva activo / revocado / expirado (R8)', () => {
    const now = new Date('2026-06-12T00:00:00Z');
    expect(shareEstado({ revokedAt: null, expiresAt: null }, now)).toBe('activo');
    expect(
      shareEstado({ revokedAt: null, expiresAt: new Date('2026-12-01T00:00:00Z') }, now)
    ).toBe('activo');
    expect(shareEstado({ revokedAt: now, expiresAt: null }, now)).toBe('revocado');
    expect(
      shareEstado({ revokedAt: null, expiresAt: new Date('2026-06-11T00:00:00Z') }, now)
    ).toBe('expirado');
  });
});

describe('informe share — resolución pública (R2)', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = await setupTestDb();
    setSqlForTests(sql);
  });

  beforeEach(() => {
    setSqlForTests(sql);
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('token vigente de informe aprobado resuelve ok con share y report (R1)', async () => {
    const { reportId, admin } = await seedReportForShare(sql, 'aprobado');
    const share = await createReportShare({
      reportId,
      createdBy: admin.id,
      expiresInDays: 90
    });

    const resolution = await resolveShareByToken(share.token);
    expect(resolution.ok).toBe(true);
    if (resolution.ok) {
      expect(resolution.share.id).toBe(share.id);
      expect(resolution.report.id).toBe(reportId);
      expect(resolution.report.status).toBe('aprobado');
    }
  });

  it('token inexistente, revocado, expirado y no aprobado → { ok: false } uniforme', async () => {
    const { reportId, admin } = await seedReportForShare(sql, 'aprobado');

    expect(await resolveShareByToken('token-que-no-existe')).toEqual({ ok: false });

    const revocado = await createReportShare({
      reportId,
      createdBy: admin.id,
      expiresInDays: null
    });
    await sql`UPDATE audit_report_share SET revoked_at = now() WHERE id = ${revocado.id}`;
    expect(await resolveShareByToken(revocado.token)).toEqual({ ok: false });

    const expirado = await createReportShare({
      reportId,
      createdBy: admin.id,
      expiresInDays: 30
    });
    await sql`
      UPDATE audit_report_share
      SET expires_at = now() - interval '1 day'
      WHERE id = ${expirado.id}
    `;
    expect(await resolveShareByToken(expirado.token)).toEqual({ ok: false });

    const vigente = await createReportShare({
      reportId,
      createdBy: admin.id,
      expiresInDays: null
    });
    await sql`UPDATE audit_report SET status = 'borrador' WHERE id = ${reportId}`;
    expect(await resolveShareByToken(vigente.token)).toEqual({ ok: false });
  });

  it('createReportShare rechaza informe no aprobado sin crear fila (R4)', async () => {
    const { reportId, admin } = await seedReportForShare(sql, 'borrador');
    await expect(
      createReportShare({ reportId, createdBy: admin.id, expiresInDays: 90 })
    ).rejects.toBeInstanceOf(InformeReportNotApprovedError);
    const [count] = await sql<{ count: string }[]>`
      SELECT count(*) FROM audit_report_share WHERE report_id = ${reportId}
    `;
    expect(Number(count.count)).toBe(0);
  });
});
