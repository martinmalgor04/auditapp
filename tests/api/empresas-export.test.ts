import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { GET as exportGet } from '../../src/routes/api/crm/empresas/export/+server';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { findUserByEmail } from '../helpers/auth';

/**
 * #23 Fase 5 (T25, R26): export CSV del listado **filtrado** de empresas.
 *
 * - `GET /api/crm/empresas/export` devuelve `text/csv` con BOM, header `Content-Disposition`
 *   attachment, y la fila de encabezados + una fila por empresa que cumple el filtro.
 * - Respeta los filtros relacion/estado/búsqueda del query string (mismos predicados que el cockpit).
 * - Guard staff (R29): 401 sin sesión, 403 rol no staff (`requireStaffApi`).
 */
describe('#23 Fase 5 — export CSV (R26)', () => {
  let sql: postgres.Sql;
  let admin: unknown;
  let tecnico: unknown;
  const cuitA = '30940000001';
  const cuitB = '30940000002';
  const cuitC = '30940000003';
  const RAZON_A = 'ZZZ Export Cliente SA';
  const RAZON_B = 'ZZZ Export Prospecto SRL';
  const RAZON_C = 'ZZZ Export ExCliente SA';

  async function cleanup() {
    await sql`DELETE FROM empresa WHERE cuit IN (${cuitA}, ${cuitB}, ${cuitC})`;
  }

  function callExport(query: string, user: unknown) {
    return exportGet({
      url: new URL(`http://localhost/api/crm/empresas/export${query}`),
      locals: { user }
    } as never);
  }

  beforeAll(async () => {
    sql = await setupTestDb();
    admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');
    tecnico = await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar');
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

  it('devuelve CSV con headers correctos (Content-Type, attachment, BOM) (R26)', async () => {
    const res = await callExport('?q=ZZZ Export', admin);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/csv');
    expect(res.headers.get('Content-Disposition')).toMatch(/attachment; filename="empresas-\d{4}-\d{2}-\d{2}\.csv"/);

    // BOM UTF-8: en bytes crudos el CSV arranca con EF BB BF (Response.text() lo normaliza al
    // decodificar, así que verificamos sobre el ArrayBuffer).
    const bytes = new Uint8Array(await res.clone().arrayBuffer());
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);

    const text = await res.text();
    const firstLine = text.replace(/^﻿/, '').split('\r\n')[0];
    expect(firstLine).toContain('razon_social');
    expect(firstLine).toContain('relacion');
    expect(firstLine).toContain('estado');
  });

  it('exporta todas las empresas que cumplen la búsqueda (sin paginar) (R26)', async () => {
    const res = await callExport('?q=ZZZ Export', admin);
    const text = await res.text();
    expect(text).toContain(RAZON_A);
    expect(text).toContain(RAZON_B);
    expect(text).toContain(RAZON_C);
  });

  it('respeta el filtro relacion (R26)', async () => {
    const res = await callExport('?q=ZZZ Export&relacion=prospecto', admin);
    const text = await res.text();
    expect(text).toContain(RAZON_B);
    expect(text).not.toContain(RAZON_A);
    expect(text).not.toContain(RAZON_C);
  });

  it('respeta el filtro estado efectivo (ex_cliente → inactiva) (R26)', async () => {
    const res = await callExport('?q=ZZZ Export&estado=inactiva', admin);
    const text = await res.text();
    // ex_cliente deriva inactiva; el cliente sin actividad también deriva inactiva.
    expect(text).toContain(RAZON_C);
    // El prospecto sin actividad deriva sin_contactar → no aparece.
    expect(text).not.toContain(RAZON_B);
  });

  it('combina búsqueda textual y filtro (R26)', async () => {
    const res = await callExport('?q=Prospecto SRL', admin);
    const text = await res.text();
    expect(text).toContain(RAZON_B);
    expect(text).not.toContain(RAZON_A);
  });

  it('guard: 401 sin sesión (R29)', async () => {
    const res = await callExport('?q=ZZZ Export', null);
    expect(res.status).toBe(401);
  });

  it('guard: técnico (staff) puede exportar (R29)', async () => {
    const res = await callExport('?q=ZZZ Export', tecnico);
    expect(res.status).toBe(200);
  });
});
