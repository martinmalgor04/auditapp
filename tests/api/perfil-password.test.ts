import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import type postgres from 'postgres';
import { actions as perfilActions } from '../../src/routes/(app)/perfil/+page.server';
import { hashPassword, verifyPassword } from '../../src/lib/server/auth/password';
import { insertSession } from '../../src/lib/server/db/sessions';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { setSqlForTests } from '../../src/lib/server/db/client';
import type { AppUser } from '../../src/lib/server/auth/types';

const CURRENT_PASSWORD = 'actual-pass-123';
const NEW_PASSWORD = 'nueva-pass-456';

function passwordRequest(
  fields: Record<string, string>,
  sessionId: string
): { request: Request; cookies: { get: () => string } } {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    body.set(k, v);
  }
  return {
    request: new Request('http://localhost/perfil', { method: 'POST', body }),
    cookies: { get: () => sessionId } as never
  };
}

async function sessionsOf(sql: postgres.Sql, userId: string): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`SELECT id FROM session WHERE user_id = ${userId}`;
  return rows.map((r) => r.id);
}

// Helper local: lee password_hash por id.
let sqlRef: postgres.Sql;
async function findUserByEmailById(userId: string): Promise<string> {
  const [row] = await sqlRef<{ password_hash: string }[]>`
    SELECT password_hash FROM app_user WHERE id = ${userId} LIMIT 1
  `;
  return row.password_hash;
}

/** Crea un app_user aislado (email único) y devuelve su AppUser. */
async function createIsolatedUser(
  sql: postgres.Sql,
  role: 'admin' | 'tecnico',
  password: string
): Promise<AppUser> {
  const email = `perfil-pwd-${randomBytes(6).toString('hex')}@test.local`;
  const hash = await hashPassword(password);
  const [row] = await sql<{ id: string; email: string; name: string }[]>`
    INSERT INTO app_user (email, name, password_hash, role, active, audit_types)
    VALUES (${email}, 'Perfil Test', ${hash}, ${role}, true, NULL)
    RETURNING id, email, name
  `;
  return { id: row.id, email: row.email, name: row.name, role, active: true, auditTypes: null };
}

describe('perfil — cambio de contraseña (R6–R12)', () => {
  let sql: postgres.Sql;
  let tecnico: AppUser;
  let currentSessionId: string;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    sql = await setupTestDb();
    sqlRef = sql;
  });

  beforeEach(async () => {
    // Re-bindea el `sql` global a la conexión de test: otros archivos de test
    // pueden haber dejado bindeada otra conexión (el action usa getSql()).
    setSqlForTests(sql);

    // Usuario aislado por test (email único): no muta el seed compartido ni
    // colisiona con otros archivos de test que corren en paralelo.
    tecnico = await createIsolatedUser(sql, 'tecnico', CURRENT_PASSWORD);
    createdUserIds.push(tecnico.id);

    // Tres sesiones del usuario: una actual + dos extra (R11).
    currentSessionId = randomBytes(16).toString('hex');
    const future = new Date(Date.now() + 86_400_000);
    await insertSession(currentSessionId, tecnico.id, future);
    await insertSession(randomBytes(16).toString('hex'), tecnico.id, future);
    await insertSession(randomBytes(16).toString('hex'), tecnico.id, future);
  });

  afterAll(async () => {
    if (createdUserIds.length) {
      await sql`DELETE FROM app_user WHERE id IN ${sql(createdUserIds)}`;
    }
    await teardownTestDb();
  });

  it('R6: contraseña actual incorrecta no cambia el hash', async () => {
    const before = await findUserByEmailById(tecnico.id);
    const { request, cookies } = passwordRequest(
      { actual: 'incorrecta', nueva: NEW_PASSWORD, confirmacion: NEW_PASSWORD },
      currentSessionId
    );
    const res = await perfilActions.password({ request, cookies, locals: { user: tecnico } } as never);

    expect((res as { status?: number }).status).toBe(400);
    expect(await findUserByEmailById(tecnico.id)).toBe(before);
  });

  it('R7: nueva débil es rechazada y no cambia el hash', async () => {
    const before = await findUserByEmailById(tecnico.id);
    const { request, cookies } = passwordRequest(
      { actual: CURRENT_PASSWORD, nueva: 'corta', confirmacion: 'corta' },
      currentSessionId
    );
    const res = await perfilActions.password({ request, cookies, locals: { user: tecnico } } as never);

    expect((res as { status?: number }).status).toBe(400);
    expect(await findUserByEmailById(tecnico.id)).toBe(before);
  });

  it('R8: confirmación distinta es rechazada', async () => {
    const before = await findUserByEmailById(tecnico.id);
    const { request, cookies } = passwordRequest(
      { actual: CURRENT_PASSWORD, nueva: NEW_PASSWORD, confirmacion: 'otra-cosa-99' },
      currentSessionId
    );
    const res = await perfilActions.password({ request, cookies, locals: { user: tecnico } } as never);

    expect((res as { status?: number }).status).toBe(400);
    expect(await findUserByEmailById(tecnico.id)).toBe(before);
  });

  it('R9: nueva igual a la actual es rechazada', async () => {
    const before = await findUserByEmailById(tecnico.id);
    const { request, cookies } = passwordRequest(
      { actual: CURRENT_PASSWORD, nueva: CURRENT_PASSWORD, confirmacion: CURRENT_PASSWORD },
      currentSessionId
    );
    const res = await perfilActions.password({ request, cookies, locals: { user: tecnico } } as never);

    expect((res as { status?: number }).status).toBe(400);
    expect(await findUserByEmailById(tecnico.id)).toBe(before);
  });

  it('R10: éxito → hash cambia; verify nueva=true, actual=false', async () => {
    const before = await findUserByEmailById(tecnico.id);
    const { request, cookies } = passwordRequest(
      { actual: CURRENT_PASSWORD, nueva: NEW_PASSWORD, confirmacion: NEW_PASSWORD },
      currentSessionId
    );
    const res = await perfilActions.password({ request, cookies, locals: { user: tecnico } } as never);

    expect((res as { ok?: boolean }).ok).toBe(true);
    const after = await findUserByEmailById(tecnico.id);
    expect(after).not.toBe(before);
    expect(await verifyPassword(NEW_PASSWORD, after)).toBe(true);
    expect(await verifyPassword(CURRENT_PASSWORD, after)).toBe(false);
  });

  it('R11: tras el cambio queda solo la sesión actual', async () => {
    expect((await sessionsOf(sql, tecnico.id)).length).toBe(3);

    const { request, cookies } = passwordRequest(
      { actual: CURRENT_PASSWORD, nueva: NEW_PASSWORD, confirmacion: NEW_PASSWORD },
      currentSessionId
    );
    await perfilActions.password({ request, cookies, locals: { user: tecnico } } as never);
    const remaining = await sessionsOf(sql, tecnico.id);
    expect(remaining).toEqual([currentSessionId]);
  });

  it('R12: el cambio opera sobre locals.user aunque se inyecte userId', async () => {
    const otro = await createIsolatedUser(sql, 'admin', 'otra-clave-789');
    createdUserIds.push(otro.id);
    const otroBefore = await findUserByEmailById(otro.id);

    const { request, cookies } = passwordRequest(
      {
        actual: CURRENT_PASSWORD,
        nueva: NEW_PASSWORD,
        confirmacion: NEW_PASSWORD,
        userId: otro.id
      },
      currentSessionId
    );
    await perfilActions.password({ request, cookies, locals: { user: tecnico } } as never);

    // El otro usuario (id inyectado) no fue tocado.
    expect(await findUserByEmailById(otro.id)).toBe(otroBefore);
  });
});
