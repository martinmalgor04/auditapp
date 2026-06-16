import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { POST as updatePost } from '../../src/routes/api/crm/empresas/[id]/+server';
import { getEmpresaById, updateEmpresa } from '../../src/lib/server/db/empresa';
import { EmpresaNotFoundError } from '../../src/lib/server/crm/errors';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { findUserByEmail } from '../helpers/auth';

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

/**
 * #23 Fase 4 (T18, R19/R29): editar datos maestros y `relacion` de una empresa persiste; el
 * endpoint exige staff, valida con Zod y devuelve 404 si la empresa no existe.
 */
describe('#23 Fase 4 — actualizar empresa (R19, R29)', () => {
  let sql: postgres.Sql;
  let admin: unknown;
  let tecnico: unknown;
  const cuit = '30980000001';

  async function newEmpresa(relacion = 'prospecto'): Promise<string> {
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO empresa (razon_social, cuit, relacion, rubro)
      VALUES ('Update Empresa Original SA', ${cuit}, ${relacion}, 'Industria')
      RETURNING id
    `;
    return row.id;
  }

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(async () => {
    setSqlForTests(sql);
    admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');
    tecnico = await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar');
    await sql`DELETE FROM empresa WHERE cuit = ${cuit}`;
  });

  afterAll(async () => {
    setSqlForTests(sql);
    await sql`DELETE FROM empresa WHERE cuit = ${cuit}`;
    await teardownTestDb();
  });

  it('updateEmpresa persiste datos maestros y relacion (R19)', async () => {
    const id = await newEmpresa('prospecto');
    const detail = await updateEmpresa(id, {
      razon_social: 'Update Empresa Editada SA',
      relacion: 'cliente',
      rubro: 'Comercio',
      empleados: 42,
      telefono: '+54 362 4000000'
    });
    expect(detail.razonSocial).toBe('Update Empresa Editada SA');
    expect(detail.relacion).toBe('cliente');
    expect(detail.rubro).toBe('Comercio');
    expect(detail.empleados).toBe(42);

    const reread = await getEmpresaById(id);
    expect(reread!.razonSocial).toBe('Update Empresa Editada SA');
    expect(reread!.relacion).toBe('cliente');
    expect(reread!.telefono).toBe('+54 362 4000000');
  });

  it('updateEmpresa con null limpia un campo nullable (R19)', async () => {
    const id = await newEmpresa();
    await updateEmpresa(id, { rubro: null });
    const reread = await getEmpresaById(id);
    expect(reread!.rubro).toBeNull();
  });

  it('updateEmpresa NO pisa columnas ausentes del patch (R19)', async () => {
    const id = await newEmpresa();
    await updateEmpresa(id, { telefono: '111' });
    const reread = await getEmpresaById(id);
    // rubro no estaba en el patch → conserva el valor original.
    expect(reread!.rubro).toBe('Industria');
    expect(reread!.telefono).toBe('111');
  });

  it('updateEmpresa lanza EmpresaNotFoundError si no existe', async () => {
    await expect(
      updateEmpresa('00000000-0000-0000-0000-000000000000', { rubro: 'X' })
    ).rejects.toBeInstanceOf(EmpresaNotFoundError);
  });

  it('endpoint POST con staff (admin) actualiza y devuelve la empresa (R19)', async () => {
    const id = await newEmpresa();
    const res = await callUpdate(id, { relacion: 'cliente', razon_social: 'Editada Endpoint SA' }, admin);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.empresa.relacion).toBe('cliente');
    expect(json.data.empresa.razonSocial).toBe('Editada Endpoint SA');
  });

  it('endpoint POST con staff (tecnico) también puede editar (R29)', async () => {
    const id = await newEmpresa();
    const res = await callUpdate(id, { rubro: 'Agro' }, tecnico);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.empresa.rubro).toBe('Agro');
  });

  it('endpoint POST con id inexistente → 404', async () => {
    const res = await callUpdate('00000000-0000-0000-0000-000000000000', { rubro: 'X' }, admin);
    expect(res.status).toBe(404);
  });

  it('endpoint POST con relacion inválida → 400 (Zod)', async () => {
    const id = await newEmpresa();
    const res = await callUpdate(id, { relacion: 'no_existe' }, admin);
    expect(res.status).toBe(400);
    // No mutó.
    const reread = await getEmpresaById(id);
    expect(reread!.relacion).toBe('prospecto');
  });

  it('endpoint POST con campo no editable → 400 (.strict)', async () => {
    const id = await newEmpresa();
    const res = await callUpdate(id, { estado_override: 'activa' }, admin);
    expect(res.status).toBe(400);
  });

  it('endpoint POST con body vacío → 400 (sin cambios)', async () => {
    const id = await newEmpresa();
    const res = await callUpdate(id, {}, admin);
    expect(res.status).toBe(400);
  });
});
