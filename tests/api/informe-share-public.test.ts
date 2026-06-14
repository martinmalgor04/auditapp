import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { seedReportForShare } from '../fixtures/informe-share';
import { createReportShare, INFORME_SHARE_UNAVAILABLE_MESSAGE } from '../../src/lib/server/informe/share';
import { resetInformeShareRateLimit } from '../../src/lib/server/informe/rate-limit';
import { load as publicLoad } from '../../src/routes/informe/[token]/+page.server';
import { load as printLoad } from '../../src/routes/informe/[token]/imprimir/+page.server';
import { renderInformeWebHtml } from '../../src/lib/informe/web-render';
import { renderInformeHtml, type InformeRenderModel } from '../../src/lib/informe/render';
import { buildValidInternalDraft, loadInformeCanonicalGolden } from '../fixtures/informe-claude-mock';

const golden = loadInformeCanonicalGolden();
const internal = buildValidInternalDraft();

type PublicInformeLoad = { model: InformeRenderModel; token: string };

function loadCtx(token: string, ip = '10.0.0.2') {
  const headers: Record<string, string> = {};
  return {
    params: { token },
    locals: { user: null },
    setHeaders: (h: Record<string, string>) => Object.assign(headers, h),
    getClientAddress: () => ip,
    headers
  };
}

async function expectUnavailable(token: string): Promise<void> {
  await expect(
    publicLoad(loadCtx(token) as never)
  ).rejects.toMatchObject({
    status: 404,
    body: { message: INFORME_SHARE_UNAVAILABLE_MESSAGE }
  });
}

describe('informe share public routes (R1–R2, R5–R7, R9, R12–R14)', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(() => {
    setSqlForTests(sql);
    resetInformeShareRateLimit();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('GET token vigente 200 sin sesión con contenido del informe (R1)', async () => {
    const { reportId, admin } = await seedReportForShare(sql, 'aprobado');
    const share = await createReportShare({ reportId, createdBy: admin.id, expiresInDays: 90 });
    const ctx = loadCtx(share.token);

    const data = (await publicLoad(ctx as never)) as PublicInformeLoad;
    expect(data.model.cliente.razonSocial).toBe(golden.client.razon_social);
    expect(data.model.draft.resumen).toBeTruthy();
    expect(data.model.draft.indices?.erp ?? data.model.draft.indices?.it).toBeTruthy();
    expect(data.token).toBe(share.token);
    expect(ctx.headers['X-Robots-Tag']).toBe('noindex, nofollow');

    const html = renderInformeWebHtml(data.model);
    expect(html).toContain('01 · Resumen ejecutivo');
    expect(html).toContain(golden.client.razon_social);
  });

  it('token inexistente/revocado/expirado/no aprobado → 404 uniforme sin datos del cliente (R2)', async () => {
    await expectUnavailable('token-inexistente-xyz');

    const { reportId, admin } = await seedReportForShare(sql, 'aprobado');
    const revocado = await createReportShare({
      reportId,
      createdBy: admin.id,
      expiresInDays: null
    });
    await sql`UPDATE audit_report_share SET revoked_at = now() WHERE id = ${revocado.id}`;
    await expectUnavailable(revocado.token);

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
    await expectUnavailable(expirado.token);

    const noAprobado = await createReportShare({
      reportId,
      createdBy: admin.id,
      expiresInDays: null
    });
    await sql`UPDATE audit_report SET status = 'borrador' WHERE id = ${reportId}`;
    await expectUnavailable(noAprobado.token);

    for (const token of [revocado.token, expirado.token, noAprobado.token]) {
      try {
        await publicLoad(loadCtx(token) as never);
        expect.unreachable('debió fallar');
      } catch (err) {
        expect(JSON.stringify(err)).not.toContain(golden.client.razon_social);
        expect(JSON.stringify(err)).not.toContain(internal.recomendaciones_presupuesto[0].linea);
      }
    }
  });

  it('dos GET exitosos → view_count = 2 con first_viewed_at estable (R9)', async () => {
    const { reportId, admin } = await seedReportForShare(sql, 'aprobado');
    const share = await createReportShare({ reportId, createdBy: admin.id, expiresInDays: null });
    const ctx = loadCtx(share.token, '10.0.0.3');

    await publicLoad(ctx as never);
    await publicLoad(ctx as never);

    const [row] = await sql<
      { view_count: number; first_viewed_at: Date; last_viewed_at: Date }[]
    >`SELECT view_count, first_viewed_at, last_viewed_at FROM audit_report_share WHERE id = ${share.id}`;

    expect(row.view_count).toBe(2);
    expect(row.first_viewed_at).toBeTruthy();
    expect(row.last_viewed_at.getTime()).toBeGreaterThanOrEqual(row.first_viewed_at.getTime());
  });

  it('GET fallido no incrementa view_count (R9)', async () => {
    const { reportId, admin } = await seedReportForShare(sql, 'aprobado');
    const share = await createReportShare({ reportId, createdBy: admin.id, expiresInDays: null });
    await sql`UPDATE audit_report_share SET revoked_at = now() WHERE id = ${share.id}`;

    await expectUnavailable(share.token);

    const [row] = await sql<{ view_count: number }[]>`
      SELECT view_count FROM audit_report_share WHERE id = ${share.id}
    `;
    expect(row.view_count).toBe(0);
  });

  it('HTML público sin textos de internal_draft (R12)', async () => {
    const { reportId, admin } = await seedReportForShare(sql, 'aprobado');
    const share = await createReportShare({ reportId, createdBy: admin.id, expiresInDays: 90 });
    const data = (await publicLoad(loadCtx(share.token) as never)) as PublicInformeLoad;
    const html = renderInformeWebHtml(data.model);

    for (const rec of internal.recomendaciones_presupuesto) {
      expect(html).not.toContain(rec.linea);
      expect(html).not.toContain(rec.rango_estimado);
      expect(html).not.toContain(rec.justificacion);
    }
    expect(html).not.toContain('recomendaciones_presupuesto');
  });

  it('/imprimir 200 con 7 páginas y @media print; 404 con token revocado (R13)', async () => {
    const { reportId, admin } = await seedReportForShare(sql, 'aprobado');
    const share = await createReportShare({ reportId, createdBy: admin.id, expiresInDays: 90 });
    const ctx = loadCtx(share.token, '10.0.0.4');

    const data = (await printLoad(ctx as never)) as PublicInformeLoad;
    expect(ctx.headers['X-Robots-Tag']).toBe('noindex, nofollow');
    expect(data.model.loomUrl).toBeNull();

    const html = renderInformeHtml(data.model);
    const pageCount = (html.match(/<section class="page/g) ?? []).length;
    const expected =
      data.model.tipoAuditoria === 'mixta' ? 9 : data.model.tipoAuditoria === 'it' ? 7 : 7;
    expect(pageCount).toBe(expected);

    const pageSource = readFileSync(
      join(process.cwd(), 'src/routes/informe/[token]/imprimir/+page.svelte'),
      'utf8'
    );
    expect(pageSource).toContain('@media print');

    await sql`UPDATE audit_report_share SET revoked_at = now() WHERE id = ${share.id}`;
    await expect(printLoad(ctx as never)).rejects.toMatchObject({ status: 404 });
  });

  it('layout público incluye meta noindex (R14)', () => {
    const layout = readFileSync(
      join(process.cwd(), 'src/routes/informe/[token]/+layout.svelte'),
      'utf8'
    );
    expect(layout).toContain('name="robots"');
    expect(layout).toContain('noindex, nofollow');
  });

  it('ráfaga de tokens inválidos termina en 429 (R14)', async () => {
    let lastStatus = 200;
    for (let i = 0; i < 65; i++) {
      try {
        await publicLoad(loadCtx(`invalid-token-${i}`, '10.0.0.99') as never);
      } catch (err) {
        lastStatus = (err as { status: number }).status;
        if (lastStatus === 429) break;
      }
    }
    expect(lastStatus).toBe(429);
  });
});
