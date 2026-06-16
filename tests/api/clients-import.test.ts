import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { POST as importPost } from '../../src/routes/api/crm/clients/import/+server';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { findUserByEmail } from '../helpers/auth';

function requestWithForm(form: FormData, user: unknown) {
  return importPost({
    request: new Request('http://localhost/api/crm/clients/import', {
      method: 'POST',
      body: form
    }),
    locals: { user }
  } as never);
}

function csvFile(content: string, name = 'clientes.csv', type = 'text/csv'): File {
  return new File([content], name, { type });
}

describe('clients import API (R2, R4, R13)', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(async () => {
    setSqlForTests(sql);
    await sql`DELETE FROM client WHERE cuit IN ('30710000001', '30710000002')`;
  });

  afterAll(async () => {
    await sql`DELETE FROM client WHERE cuit IN ('30710000001', '30710000002')`;
    await teardownTestDb();
  });

  async function countClients(): Promise<number> {
    const [r] = await sql<{ c: string }[]>`SELECT count(*)::text AS c FROM client`;
    return Number(r.c);
  }

  it('sin sesión responde 401 y no escribe (R2)', async () => {
    const before = await countClients();
    const form = new FormData();
    form.append('file', csvFile('razon_social,cuit\nX SA,30-71000000-1\n'));
    const res = await requestWithForm(form, null);
    expect(res.status).toBe(401);
    expect(await countClients()).toBe(before);
  });

  it('rol tecnico responde 403 y no escribe (R2)', async () => {
    const tech = await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar');
    const before = await countClients();
    const form = new FormData();
    form.append('file', csvFile('razon_social,cuit\nX SA,30-71000000-1\n'));
    const res = await requestWithForm(form, tech);
    expect(res.status).toBe(403);
    expect(await countClients()).toBe(before);
  });

  it('formato no soportado responde 415 sin escribir (R4)', async () => {
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');
    const before = await countClients();
    const form = new FormData();
    form.append('file', csvFile('{"a":1}', 'datos.json', 'application/json'));
    form.append('relacion', 'cliente');
    const res = await requestWithForm(form, admin);
    expect(res.status).toBe(415);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(await countClients()).toBe(before);
  });

  it('falta el archivo responde 400', async () => {
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');
    const res = await requestWithForm(new FormData(), admin);
    expect(res.status).toBe(400);
  });

  it('relacion ausente o inválida responde 400 sin escribir (R31)', async () => {
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');
    const before = await countClients();

    // Sin relacion en el form.
    const sinRelacion = new FormData();
    sinRelacion.append('file', csvFile('razon_social,cuit\nX SA,30-71000000-1\n'));
    const r1 = await requestWithForm(sinRelacion, admin);
    expect(r1.status).toBe(400);
    expect((await r1.json()).success).toBe(false);

    // relacion no permitida por el selector (ex_cliente es solo manual desde la ficha).
    const relacionInvalida = new FormData();
    relacionInvalida.append('file', csvFile('razon_social,cuit\nX SA,30-71000000-1\n'));
    relacionInvalida.append('relacion', 'ex_cliente');
    const r2 = await requestWithForm(relacionInvalida, admin);
    expect(r2.status).toBe(400);

    expect(await countClients()).toBe(before);
  });

  it('admin con CSV válido responde 200 y reporte completo (R13)', async () => {
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');
    const form = new FormData();
    form.append(
      'file',
      csvFile(
        'id,razon_social,cuit,categoria_iva\n' +
          'uuid-x,Alpha SA,30-71000000-1,RI\n' + // válida -> creada
          'uuid-y,Beta SA,30-71000000-2,RI\n' + // válida -> creada
          'uuid-z,,30-71000000-3,RI\n' + // inválida (sin razon_social)
          'uuid-w,Sin Cuit SA,,RI\n' // skipped (sin cuit)
      )
    );
    form.append('relacion', 'cliente');
    const res = await requestWithForm(form, admin);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    const r = body.data;
    expect(r.total).toBe(4);
    expect(r.created).toBe(2);
    expect(r.updated).toBe(0);
    expect(r.invalid).toHaveLength(1);
    expect(r.skipped).toHaveLength(1);
    // categorías separadas (R13)
    expect(r.invalid[0].row).toBe(3);
    expect(r.skipped[0].row).toBe(4);
    expect(r.skipped[0].reason).toBe('sin CUIT, no deduplicable');
    // columnas ignoradas reportadas (R5.ter)
    expect(r.ignoredColumns).toContain('id');
    expect(r.ignoredColumns).toContain('categoria_iva');
  });
});
