/**
 * Tests para el endpoint /api/push/subscribe (#53).
 * Cubre: R4 (upsert), R5 (baja), R6 (401/ownership).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { POST, DELETE } from '../../src/routes/api/push/subscribe/+server';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { findUserIdByEmail } from '../helpers/auth';

type LocalsUser = { id: string; name: string; email: string; role: string; active: boolean };

function makeLocals(user: LocalsUser | null = null) {
  return { user } as unknown as App.Locals;
}

function makeRequest(body: unknown, method = 'POST'): Request {
  return new Request('http://localhost/api/push/subscribe', {
    method,
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'test-agent' },
    body: JSON.stringify(body)
  });
}

const SUB_1 = {
  endpoint: 'https://push-test.example.com/sub/device-1',
  keys: { p256dh: 'pubkey1abc', auth: 'auth1abc' }
};
const SUB_2 = {
  endpoint: 'https://push-test.example.com/sub/device-2',
  keys: { p256dh: 'pubkey2abc', auth: 'auth2abc' }
};

describe('push subscribe endpoint (#53 R4, R5, R6)', () => {
  let sql: postgres.Sql;
  let adminUser: LocalsUser;
  let techUser: LocalsUser;

  beforeAll(async () => {
    sql = await setupTestDb();
  }, 30_000);

  beforeEach(async () => {
    setSqlForTests(sql);
    const adminId = await findUserIdByEmail(sql, 'admin@serviciosysistemas.com.ar');
    const techId = await findUserIdByEmail(sql, 'facu@serviciosysistemas.com.ar');
    adminUser = {
      id: adminId,
      name: 'Admin',
      email: 'admin@serviciosysistemas.com.ar',
      role: 'admin',
      active: true
    };
    techUser = {
      id: techId,
      name: 'Facu',
      email: 'facu@serviciosysistemas.com.ar',
      role: 'tecnico',
      active: true
    };
    // Limpiar suscripciones de test
    await sql`DELETE FROM push_subscription WHERE endpoint LIKE 'https://push-test.example.com/%'`;
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  // R6: sin sesión → 401
  it('POST sin sesión devuelve 401 y no inserta', async () => {
    const req = makeRequest(SUB_1);
    const res = await POST({ request: req, locals: makeLocals(null) } as Parameters<typeof POST>[0]);
    expect(res.status).toBe(401);
    const rows = await sql<{ id: string }[]>`
      SELECT id FROM push_subscription WHERE endpoint = ${SUB_1.endpoint}
    `;
    expect(rows).toHaveLength(0);
  });

  it('DELETE sin sesión devuelve 401', async () => {
    const req = makeRequest({ endpoint: SUB_1.endpoint }, 'DELETE');
    const res = await DELETE({
      request: req,
      locals: makeLocals(null)
    } as Parameters<typeof DELETE>[0]);
    expect(res.status).toBe(401);
  });

  // R4: POST upsert — inserta una fila
  it('POST con sesión válida inserta la suscripción', async () => {
    const req = makeRequest(SUB_1);
    const res = await POST({
      request: req,
      locals: makeLocals(adminUser)
    } as Parameters<typeof POST>[0]);
    expect(res.status).toBe(200);

    const rows = await sql<
      { id: string; user_id: string; endpoint: string; p256dh: string }[]
    >`
      SELECT id, user_id, endpoint, p256dh
      FROM push_subscription
      WHERE endpoint = ${SUB_1.endpoint}
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(adminUser.id);
    expect(rows[0].p256dh).toBe(SUB_1.keys.p256dh);
  });

  // R4: upsert — mismo endpoint no duplica
  it('POST mismo endpoint actualiza la fila sin duplicar', async () => {
    const req1 = makeRequest(SUB_1);
    await POST({ request: req1, locals: makeLocals(adminUser) } as Parameters<typeof POST>[0]);

    const updatedSub = { ...SUB_1, keys: { p256dh: 'updatedPubKey', auth: 'updatedAuth' } };
    const req2 = makeRequest(updatedSub);
    const res2 = await POST({
      request: req2,
      locals: makeLocals(adminUser)
    } as Parameters<typeof POST>[0]);
    expect(res2.status).toBe(200);

    const rows = await sql<{ p256dh: string }[]>`
      SELECT p256dh FROM push_subscription WHERE endpoint = ${SUB_1.endpoint}
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].p256dh).toBe('updatedPubKey');
  });

  // R4: multi-dispositivo — dos endpoints distintos del mismo usuario
  it('POST dos endpoints distintos del mismo usuario crea dos filas', async () => {
    const req1 = makeRequest(SUB_1);
    const req2 = makeRequest(SUB_2);
    await POST({ request: req1, locals: makeLocals(adminUser) } as Parameters<typeof POST>[0]);
    await POST({ request: req2, locals: makeLocals(adminUser) } as Parameters<typeof POST>[0]);

    const rows = await sql<{ id: string }[]>`
      SELECT id FROM push_subscription
      WHERE user_id = ${adminUser.id}
        AND endpoint IN (${SUB_1.endpoint}, ${SUB_2.endpoint})
    `;
    expect(rows).toHaveLength(2);
  });

  // R5: DELETE borra la fila del usuario
  it('DELETE endpoint existente elimina la fila', async () => {
    // Insertar primero
    const req1 = makeRequest(SUB_1);
    await POST({ request: req1, locals: makeLocals(adminUser) } as Parameters<typeof POST>[0]);

    const delReq = makeRequest({ endpoint: SUB_1.endpoint }, 'DELETE');
    const res = await DELETE({
      request: delReq,
      locals: makeLocals(adminUser)
    } as Parameters<typeof DELETE>[0]);
    expect(res.status).toBe(200);

    const rows = await sql<{ id: string }[]>`
      SELECT id FROM push_subscription WHERE endpoint = ${SUB_1.endpoint}
    `;
    expect(rows).toHaveLength(0);
  });

  // R6: ownership — usuario no puede borrar endpoint ajeno
  it('DELETE endpoint de otro usuario no afecta filas ajenas', async () => {
    // Admin inserta su suscripción
    const req1 = makeRequest(SUB_1);
    await POST({ request: req1, locals: makeLocals(adminUser) } as Parameters<typeof POST>[0]);

    // Tech intenta borrar el endpoint del admin
    const delReq = makeRequest({ endpoint: SUB_1.endpoint }, 'DELETE');
    const res = await DELETE({
      request: delReq,
      locals: makeLocals(techUser)
    } as Parameters<typeof DELETE>[0]);
    expect(res.status).toBe(200); // responde OK pero sin efecto

    // La fila del admin sigue intacta
    const rows = await sql<{ id: string }[]>`
      SELECT id FROM push_subscription
      WHERE endpoint = ${SUB_1.endpoint} AND user_id = ${adminUser.id}
    `;
    expect(rows).toHaveLength(1);
  });
});
