import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { POST as updatePost } from '../../src/routes/api/crm/empresas/[id]/+server';
import { POST as importPost } from '../../src/routes/api/crm/clients/import/+server';
import { load as cockpitLoad } from '../../src/routes/(app)/crm/+page.server';
import { AuthError } from '../../src/lib/server/auth/guards';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { findUserByEmail } from '../helpers/auth';

/**
 * #23 Fase 4 (T18, R29): guards de permisos del cockpit y de las mutaciones.
 * - 401 sin sesión en el endpoint de update.
 * - 403 si el rol no es staff en el update.
 * - El import masivo sigue admin-only (403 a técnico).
 * - El load del cockpit requiere staff (lanza AuthError sin sesión / rol no staff).
 */
describe('#23 Fase 4 — guards del cockpit y mutaciones (R29)', () => {
  let sql: postgres.Sql;
  let tecnico: unknown;
  const cuit = '30970000001';
  let empresaId: string;

  function callUpdate(id: string, body: unknown, user: unknown) {
    return updatePost({
      request: new Request(`http://localhost/api/crm/empresas/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }),
      params: { id },
      locals: { user }
    } as never);
  }

  function callImport(user: unknown) {
    const form = new FormData();
    form.append('file', new File(['razon_social,cuit\nX SA,30-71000000-1\n'], 'x.csv', { type: 'text/csv' }));
    form.append('relacion', 'cliente');
    return importPost({
      request: new Request('http://localhost/api/crm/clients/import', { method: 'POST', body: form }),
      locals: { user }
    } as never);
  }

  function callCockpitLoad(user: unknown) {
    return cockpitLoad({
      locals: { user },
      url: new URL('http://localhost/crm')
    } as never);
  }

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(async () => {
    setSqlForTests(sql);
    tecnico = await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar');
    await sql`DELETE FROM empresa WHERE cuit = ${cuit}`;
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO empresa (razon_social, cuit, relacion)
      VALUES ('Guard Empresa SA', ${cuit}, 'prospecto')
      RETURNING id
    `;
    empresaId = row.id;
  });

  afterAll(async () => {
    setSqlForTests(sql);
    await sql`DELETE FROM empresa WHERE cuit = ${cuit}`;
    await teardownTestDb();
  });

  it('update sin sesión → 401 y no muta (R29)', async () => {
    const res = await callUpdate(empresaId, { rubro: 'Hackeado' }, null);
    expect(res.status).toBe(401);
    const [row] = await sql<{ rubro: string | null }[]>`SELECT rubro FROM empresa WHERE id = ${empresaId}`;
    expect(row.rubro).toBeNull();
  });

  it('update con rol no staff → 403 y no muta (R29)', async () => {
    // Solo existen roles admin/tecnico (ambos staff); se construye un user sintético con un rol
    // no-staff para ejercitar la rama 403 del guard requireStaff.
    const noStaff = { id: '00000000-0000-0000-0000-000000000001', email: 'x@x', name: 'X', role: 'cliente', active: true, auditTypes: [] };
    const res = await callUpdate(empresaId, { rubro: 'Hackeado' }, noStaff);
    expect(res.status).toBe(403);
    const [row] = await sql<{ rubro: string | null }[]>`SELECT rubro FROM empresa WHERE id = ${empresaId}`;
    expect(row.rubro).toBeNull();
  });

  it('update con staff (tecnico) → 200 (R29)', async () => {
    const res = await callUpdate(empresaId, { rubro: 'OK' }, tecnico);
    expect(res.status).toBe(200);
  });

  it('import masivo sigue admin-only: técnico → 403 (R29)', async () => {
    const res = await callImport(tecnico);
    expect(res.status).toBe(403);
  });

  it('import masivo sin sesión → 401 (R29)', async () => {
    const res = await callImport(null);
    expect(res.status).toBe(401);
  });

  it('cockpit load sin sesión lanza redirect a /login (requireUser)', async () => {
    // requireStaff → requireUser lanza redirect (303) cuando no hay user. handleLoadError lo
    // re-lanza. Un redirect de SvelteKit es un throw con status 3xx.
    await expect(callCockpitLoad(null)).rejects.toMatchObject({ status: 303 });
  });

  it('cockpit load con rol no staff → AuthError 403', async () => {
    const noStaff = { id: '00000000-0000-0000-0000-000000000002', email: 'y@y', name: 'Y', role: 'cliente', active: true, auditTypes: [] };
    await expect(callCockpitLoad(noStaff)).rejects.toMatchObject({ status: 403 });
    // Sanity: el AuthError es la causa (handleLoadError convierte a error 403).
    expect(new AuthError('FORBIDDEN', 'x').status).toBe(403);
  });
});
