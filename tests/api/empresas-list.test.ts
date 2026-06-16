import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { setSqlForTests } from '../../src/lib/server/db/client';
import {
  listEmpresas,
  countEmpresas,
  getEmpresaById,
  searchEmpresasForPicker
} from '../../src/lib/server/db/empresa';
import { setupTestDb, teardownTestDb } from '../helpers/db';

/**
 * #23 Fase 4 (T18, R16/R17/R18): listado del cockpit `/crm`. Cubre búsqueda case-insensitive por
 * razón social y CUIT (ILIKE), filtros por relacion y estado efectivo, y paginación server-side
 * (LIMIT/OFFSET) coherente con el count.
 */
describe('#23 Fase 4 — listEmpresas/countEmpresas (R16, R17, R18)', () => {
  let sql: postgres.Sql;

  // CUITs aislados del seed real para no chocar.
  const cuitA = '30990000001';
  const cuitB = '30990000002';
  const cuitC = '30990000003';
  const RAZON_A = 'ZZZ Empresa Lista Cliente SA';
  const RAZON_B = 'ZZZ Empresa Lista Prospecto SRL';
  const RAZON_C = 'ZZZ Empresa Lista ExCliente SA';

  async function cleanup() {
    await sql`DELETE FROM empresa WHERE cuit IN (${cuitA}, ${cuitB}, ${cuitC})`;
  }

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(async () => {
    setSqlForTests(sql);
    await cleanup();
    await sql`
      INSERT INTO empresa (razon_social, cuit, relacion, rubro, provincia, origen)
      VALUES
        (${RAZON_A}, ${cuitA}, 'cliente', 'Industria', 'CHACO', 'presupuestos'),
        (${RAZON_B}, ${cuitB}, 'prospecto', 'Comercio', 'CORRIENTES', 'prospecto'),
        (${RAZON_C}, ${cuitC}, 'ex_cliente', 'Servicios', 'MISIONES', 'presupuestos')
    `;
  });

  afterAll(async () => {
    setSqlForTests(sql);
    await cleanup();
    await teardownTestDb();
  });

  it('búsqueda por razón social es case-insensitive y parcial (R17)', async () => {
    const res = await listEmpresas({ q: 'empresa lista cliente', page: 1, perPage: 50 });
    expect(res.rows.some((r) => r.cuit === cuitA)).toBe(true);
    // No trae las otras dos (distinta razón social).
    expect(res.rows.some((r) => r.cuit === cuitB)).toBe(false);
  });

  it('búsqueda por CUIT (parcial) encuentra la empresa (R17)', async () => {
    const res = await listEmpresas({ q: '3099000000', page: 1, perPage: 50 });
    const cuits = res.rows.map((r) => r.cuit);
    expect(cuits).toContain(cuitA);
    expect(cuits).toContain(cuitB);
    expect(cuits).toContain(cuitC);
  });

  it('filtra por relacion (R16)', async () => {
    const res = await listEmpresas({ relacion: 'prospecto', q: 'ZZZ Empresa Lista', page: 1, perPage: 50 });
    expect(res.rows.every((r) => r.relacion === 'prospecto')).toBe(true);
    expect(res.rows.some((r) => r.cuit === cuitB)).toBe(true);
    expect(res.rows.some((r) => r.cuit === cuitA)).toBe(false);
  });

  it('el estado efectivo se deriva: ex_cliente → inactiva, prospecto sin actividad → sin_contactar (R16)', async () => {
    const res = await listEmpresas({ q: 'ZZZ Empresa Lista', page: 1, perPage: 50 });
    const byCuit = new Map(res.rows.map((r) => [r.cuit, r]));
    expect(byCuit.get(cuitC)!.estado).toBe('inactiva'); // ex_cliente
    expect(byCuit.get(cuitB)!.estado).toBe('sin_contactar'); // prospecto sin eventos/audits
    expect(byCuit.get(cuitC)!.estadoSource).toBe('derived');
  });

  it('filtra por estado efectivo derivado (R16)', async () => {
    const res = await listEmpresas({
      estado: 'inactiva',
      q: 'ZZZ Empresa Lista',
      page: 1,
      perPage: 50
    });
    // ex_cliente deriva inactiva; cliente sin actividad reciente también deriva inactiva.
    expect(res.rows.some((r) => r.cuit === cuitC)).toBe(true);
    expect(res.rows.some((r) => r.cuit === cuitB)).toBe(false); // prospecto → sin_contactar
  });

  it('paginación server-side: perPage limita filas y el total cuenta todas (R18)', async () => {
    const page1 = await listEmpresas({ q: 'ZZZ Empresa Lista', page: 1, perPage: 2 });
    expect(page1.rows.length).toBe(2);
    expect(page1.total).toBe(3);
    expect(page1.totalPages).toBe(2);

    const page2 = await listEmpresas({ q: 'ZZZ Empresa Lista', page: 2, perPage: 2 });
    expect(page2.rows.length).toBe(1);
    expect(page2.page).toBe(2);

    // Sin solapamiento entre páginas (orden estable por razón social).
    const ids1 = new Set(page1.rows.map((r) => r.id));
    expect(page2.rows.every((r) => !ids1.has(r.id))).toBe(true);
  });

  it('countEmpresas respeta relacion + búsqueda (R16/R17)', async () => {
    const total = await countEmpresas({ q: 'ZZZ Empresa Lista', page: 1, perPage: 50 });
    expect(total).toBe(3);
    const soloCliente = await countEmpresas({
      q: 'ZZZ Empresa Lista',
      relacion: 'cliente',
      page: 1,
      perPage: 50
    });
    expect(soloCliente).toBe(1);
  });

  it('getEmpresaById trae datos maestros + estado efectivo (R16/R19)', async () => {
    const [row] = await sql<{ id: string }[]>`SELECT id FROM empresa WHERE cuit = ${cuitA}`;
    const detail = await getEmpresaById(row.id);
    expect(detail).toBeTruthy();
    expect(detail!.razonSocial).toBe(RAZON_A);
    expect(detail!.relacion).toBe('cliente');
    expect(detail!.provincia).toBe('CHACO');
    expect(['activa', 'inactiva']).toContain(detail!.estado); // cliente sin actividad reciente
  });

  it('searchEmpresasForPicker (R17): match por razón social y CUIT, mínimo 2 chars', async () => {
    expect(await searchEmpresasForPicker('z')).toEqual([]);
    const byName = await searchEmpresasForPicker('ZZZ Empresa Lista Prospecto');
    expect(byName.some((r) => r.cuit === cuitB)).toBe(true);
    const byCuit = await searchEmpresasForPicker(cuitC);
    expect(byCuit.some((r) => r.cuit === cuitC)).toBe(true);
  });
});
