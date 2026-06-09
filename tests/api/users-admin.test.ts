import { error } from '@sveltejs/kit';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { authenticate } from '../../src/lib/server/auth/login';
import { createUser, listUsers, resetUserPassword } from '../../src/lib/server/backoffice/users';
import { load as usuariosLoad, actions as usuariosActions } from '../../src/routes/(app)/usuarios/+page.server';
import { findUserIdByEmail } from '../helpers/auth';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import type postgres from 'postgres';

describe('users admin', () => {
  let sql: postgres.Sql;
  let adminId: string;
  let tecnicoId: string;

  const adminUser = () => ({
    id: adminId,
    email: 'admin@serviciosysistemas.com.ar',
    name: 'Admin SyS',
    role: 'admin' as const,
    active: true
  });

  const tecnicoUser = () => ({
    id: tecnicoId,
    email: 'facu@serviciosysistemas.com.ar',
    name: 'Facu',
    role: 'tecnico' as const,
    active: true
  });

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(async () => {
    adminId = await findUserIdByEmail(sql, 'admin@serviciosysistemas.com.ar');
    tecnicoId = await findUserIdByEmail(sql, 'facu@serviciosysistemas.com.ar');
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('admin can create and deactivate user', async () => {
    const { id } = await createUser({
      email: 'nuevo@example.com',
      name: 'Nuevo Técnico',
      role: 'tecnico',
      temporaryPassword: 'temp-pass-123'
    });

    let users = await listUsers();
    expect(users.find((u) => u.id === id)?.active).toBe(true);

    const formData = new FormData();
    formData.set('userId', id);

    await usuariosActions.deactivate({
      request: new Request('http://localhost/usuarios', { method: 'POST', body: formData }),
      locals: { user: adminUser() }
    } as never);

    users = await listUsers();
    expect(users.find((u) => u.id === id)?.active).toBe(false);
  });

  it('reset password updates hash; login with new password succeeds', async () => {
    const tempPass = 'NewTempPass99!';

    await resetUserPassword({ userId: tecnicoId, temporaryPassword: tempPass });

    const result = await authenticate('facu@serviciosysistemas.com.ar', tempPass);
    expect(result.ok).toBe(true);
  });

  it('tecnico GET /usuarios returns 403', async () => {
    try {
      await usuariosLoad({ locals: { user: tecnicoUser() } } as never);
      expect.fail('should throw 403');
    } catch (e) {
      expect(error).toBeDefined();
      expect((e as { status: number }).status).toBe(403);
    }
  });
});
