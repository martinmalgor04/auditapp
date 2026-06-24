import { beforeEach, describe, expect, it } from 'vitest';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { GET as mercadoGet } from '../../src/routes/api/mercado/+server';
import * as mercadoServer from '../../src/routes/api/mercado/+server';
import { seedMercadoDashboardFixtures } from '../fixtures/mercado-audit';
import {
  insertAccionableAudit,
  seedMercadoAccionable
} from '../fixtures/mercado-accionable';
import { findUserByEmail } from '../helpers/auth';
import { getTestSql } from '../helpers/db';

function locals(user: unknown) {
  return { user } as never;
}

describe('mercado API', () => {
  let identifiable: Awaited<ReturnType<typeof seedMercadoDashboardFixtures>>['identifiable'];

  beforeEach(async () => {
    const sql = getTestSql();
    setSqlForTests(sql);
    const seed = await seedMercadoDashboardFixtures(sql);
    identifiable = seed.identifiable;
  });

  it('R1 — 401 sin sesión, 403 técnico, 200 admin', async () => {
    const admin = await findUserByEmail(getTestSql(), 'admin@serviciosysistemas.com.ar');
    const tech = await findUserByEmail(getTestSql(), 'facu@serviciosysistemas.com.ar');

    expect((await mercadoGet({ locals: locals(null), url: new URL('http://x') } as never)).status).toBe(
      401
    );
    expect(
      (await mercadoGet({ locals: locals(tech), url: new URL('http://x') } as never)).status
    ).toBe(403);

    const ok = await mercadoGet({ locals: locals(admin), url: new URL('http://x') } as never);
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.success).toBe(true);
    expect(body.data.universe.n).toBe(5);
  });

  it('R10 — respuesta anonimizada sin identificadores del seed', async () => {
    const admin = await findUserByEmail(getTestSql(), 'admin@serviciosysistemas.com.ar');
    const res = await mercadoGet({ locals: locals(admin), url: new URL('http://x') } as never);
    const serialized = JSON.stringify(await res.json());

    expect(serialized).not.toContain(identifiable.razonSocial);
    expect(serialized).not.toContain(identifiable.cuit);
    expect(serialized).not.toContain(identifiable.referenteNombre);
    expect(serialized).not.toMatch(/client_id|audit_id|razon_social/);
  });

  it('R11 — filtros segmento, rubro y fechas', async () => {
    const admin = await findUserByEmail(getTestSql(), 'admin@serviciosysistemas.com.ar');

    const bySegment = await mercadoGet({
      locals: locals(admin),
      url: new URL('http://x?segment=B')
    } as never);
    expect((await bySegment.json()).data.universe.n).toBe(1);

    const byRubro = await mercadoGet({
      locals: locals(admin),
      url: new URL('http://x?rubro=Industria')
    } as never);
    expect((await byRubro.json()).data.universe.n).toBe(2);

    const byDates = await mercadoGet({
      locals: locals(admin),
      url: new URL('http://x?from=2026-02-01&to=2026-03-31')
    } as never);
    expect((await byDates.json()).data.universe.n).toBe(3);

    const combined = await mercadoGet({
      locals: locals(admin),
      url: new URL('http://x?segment=A&rubro=Industria&from=2026-01-01&to=2026-01-31')
    } as never);
    expect((await combined.json()).data.universe.n).toBe(2);
  });

  it('R12 — filtros inválidos responden 400 apiError', async () => {
    const admin = await findUserByEmail(getTestSql(), 'admin@serviciosysistemas.com.ar');

    for (const query of ['segment=Z', 'from=ayer', 'from=2026-06-01&to=2026-05-01']) {
      const res = await mercadoGet({
        locals: locals(admin),
        url: new URL(`http://x?${query}`)
      } as never);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toBeTruthy();
    }
  });

  it('R16 — solo GET exportado', async () => {
    expect(mercadoServer.GET).toBeDefined();
    expect((mercadoServer as { POST?: unknown }).POST).toBeUndefined();
    expect((mercadoServer as { PATCH?: unknown }).PATCH).toBeUndefined();
    expect((mercadoServer as { DELETE?: unknown }).DELETE).toBeUndefined();
  });

  it('R4 — filtro provincia normaliza (case/espacios) y reduce el universo', async () => {
    const sql = getTestSql();
    await seedMercadoAccionable(sql);
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');

    const exact = await mercadoGet({
      locals: locals(admin),
      url: new URL('http://x?provincia=Chaco')
    } as never);
    expect((await exact.json()).data.universe.n).toBe(2);

    const messy = await mercadoGet({
      locals: locals(admin),
      url: new URL('http://x?provincia=%20%20chaco%20')
    } as never);
    expect((await messy.json()).data.universe.n).toBe(2);

    const missing = await mercadoGet({
      locals: locals(admin),
      url: new URL('http://x?provincia=Mendoza')
    } as never);
    expect((await missing.json()).data.universe.n).toBe(0);
  });

  it('R13/R16 — el payload no expone textos de hallazgos ni identificadores', async () => {
    const sql = getTestSql();
    const secretRisk = 'SECRETO_RIESGO_UNICO_XYZ backup';
    const secretWin = 'SECRETO_WIN_UNICO_XYZ licencia';
    await insertAccionableAudit(sql, {
      razonSocial: 'Acc Anonimizacion SA',
      segment: 'A',
      rubro: 'Industria',
      erpActual: 'Tango',
      provincia: 'Chaco',
      relacion: 'cliente',
      indiceIt: 60,
      indiceErp: 60,
      topRisks: [{ text: secretRisk, severity: 'alta' }],
      quickWins: [secretWin],
      closedAt: new Date('2026-03-01T12:00:00Z')
    });

    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');
    const res = await mercadoGet({ locals: locals(admin), url: new URL('http://x') } as never);
    const body = await res.json();
    const serialized = JSON.stringify(body);

    expect(serialized).not.toContain('SECRETO_RIESGO_UNICO_XYZ');
    expect(serialized).not.toContain('SECRETO_WIN_UNICO_XYZ');
    expect(serialized).not.toMatch(/empresa_id|client_id|audit_id|razon_social|cuit/);
    // El bloque agregado sí viaja, con categorías y conteos (no textos).
    expect(body.data.recurring_findings.internal).toBe(true);
    expect(body.data.recurring_findings.total_risks).toBeGreaterThan(0);
  });
});
