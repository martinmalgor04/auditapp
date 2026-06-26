import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import type postgres from 'postgres';
import { load as perfilLoad, actions as perfilActions } from '../../src/routes/(app)/perfil/+page.server';
import { findUserById } from '../../src/lib/server/db/users';
import { hashPassword } from '../../src/lib/server/auth/password';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { setSqlForTests } from '../../src/lib/server/db/client';
import type { AppUser } from '../../src/lib/server/auth/types';

function postRequest(fields: Record<string, string>): Request {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    body.set(k, v);
  }
  return new Request('http://localhost/perfil', { method: 'POST', body });
}

/** Crea un app_user aislado (email único) — no muta el seed compartido. */
async function createIsolatedUser(
  sql: postgres.Sql,
  role: 'admin' | 'tecnico'
): Promise<AppUser> {
  const email = `perfil-${randomBytes(6).toString('hex')}@test.local`;
  const hash = await hashPassword('clave-de-prueba-1');
  const [row] = await sql<{ id: string; email: string; name: string }[]>`
    INSERT INTO app_user (email, name, password_hash, role, active, audit_types)
    VALUES (${email}, 'Perfil Test', ${hash}, ${role}, true, NULL)
    RETURNING id, email, name
  `;
  return { id: row.id, email: row.email, name: row.name, role, active: true, auditTypes: null };
}

describe('perfil — edición de datos (R1–R5, R12)', () => {
  let sql: postgres.Sql;
  let tecnico: AppUser;
  let otro: AppUser;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(async () => {
    // Re-bindea el `sql` global a la conexión de test: otros archivos de test
    // pueden haber dejado bindeada otra conexión (los actions usan getSql()).
    setSqlForTests(sql);

    tecnico = await createIsolatedUser(sql, 'tecnico');
    otro = await createIsolatedUser(sql, 'admin');
    createdUserIds.push(tecnico.id, otro.id);
  });

  afterAll(async () => {
    if (createdUserIds.length) {
      await sql`DELETE FROM app_user WHERE id IN ${sql(createdUserIds)}`;
    }
    await teardownTestDb();
  });

  it('R1: load sin user redirige 303 a /login', async () => {
    try {
      await perfilLoad({ locals: {} } as never);
      expect.fail('debería redirigir');
    } catch (e) {
      expect((e as { status: number; location: string }).status).toBe(303);
      expect((e as { location: string }).location).toBe('/login');
    }
  });

  it('R2: load devuelve name/email/role de locals.user y no acepta id', async () => {
    const data = await perfilLoad({ locals: { user: tecnico } } as never);
    expect(data).toEqual({ name: tecnico.name, email: tecnico.email, role: tecnico.role });
  });

  it('R3/R12: POST con role=admin y userId inyectado no cambia rol ni toca a otro', async () => {
    const res = await perfilActions.perfil({
      request: postRequest({
        name: 'Facu Editado',
        email: tecnico.email,
        role: 'admin',
        userId: otro.id
      }),
      locals: { user: tecnico }
    } as never);

    expect((res as { ok?: boolean }).ok).toBe(true);

    const facu = await findUserById(tecnico.id);
    expect(facu?.role).toBe('tecnico');
    expect(facu?.name).toBe('Facu Editado');

    // El otro (id inyectado) quedó intacto.
    const otroAfter = await findUserById(otro.id);
    expect(otroAfter?.name).toBe(otro.name);
  });

  it('R4: edición inválida (email mal formado) no modifica la fila', async () => {
    const res = await perfilActions.perfil({
      request: postRequest({ name: 'Ok', email: 'no-es-email' }),
      locals: { user: tecnico }
    } as never);

    expect((res as { status?: number }).status).toBe(400);
    expect((res as { data: { errors: Record<string, string> } }).data.errors.email).toBeTruthy();

    const facu = await findUserById(tecnico.id);
    expect(facu?.email).toBe(tecnico.email);
  });

  it('R5: cambiar email a uno de otro usuario es rechazado y no modifica la fila', async () => {
    const res = await perfilActions.perfil({
      request: postRequest({ name: tecnico.name, email: otro.email }),
      locals: { user: tecnico }
    } as never);

    expect((res as { status?: number }).status).toBe(409);
    const facu = await findUserById(tecnico.id);
    expect(facu?.email).toBe(tecnico.email);
  });

  it('R5: guardar el mismo email propio (sin cambio real) no falla', async () => {
    const res = await perfilActions.perfil({
      request: postRequest({ name: 'Nuevo Nombre', email: tecnico.email }),
      locals: { user: tecnico }
    } as never);

    expect((res as { ok?: boolean }).ok).toBe(true);
    const facu = await findUserById(tecnico.id);
    expect(facu?.name).toBe('Nuevo Nombre');
  });
});
