import { isRedirect } from '@sveltejs/kit';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertAdminOnly,
  AuthError,
  requireAdmin,
  requireStaff
} from '../../src/lib/server/auth/guards';
import { load as appLayoutLoad } from '../../src/routes/(app)/+layout.server';
import { createSession } from '../../src/lib/server/auth/session';
import { setupTestDb, teardownTestDb, truncateSeedTables } from '../helpers/db';
import { seedAuthUsers, findUserIdByEmail } from '../helpers/auth';
import type { AppUser } from '../../src/lib/server/auth/types';
import type postgres from 'postgres';

function userFixture(role: 'admin' | 'tecnico', email: string): AppUser {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    email,
    name: role === 'admin' ? 'Admin' : 'Técnico',
    role,
    active: true
  };
}

describe('auth guards', () => {
  let sql: postgres.Sql;
  let adminUser: AppUser;
  let tecnicoUser: AppUser;

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(async () => {
    await truncateSeedTables(sql);
    await seedAuthUsers(sql);

    const adminId = await findUserIdByEmail(sql, 'admin@serviciosysistemas.com.ar');
    const tecnicoId = await findUserIdByEmail(sql, 'facu@serviciosysistemas.com.ar');

    adminUser = { ...userFixture('admin', 'admin@serviciosysistemas.com.ar'), id: adminId };
    tecnicoUser = { ...userFixture('tecnico', 'facu@serviciosysistemas.com.ar'), id: tecnicoId };
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('redirects anonymous users from protected layout to login', async () => {
    try {
      await appLayoutLoad({ locals: { user: null } } as never);
      expect.fail('should redirect');
    } catch (e) {
      expect(isRedirect(e)).toBe(true);
      if (isRedirect(e)) {
        expect(e.status).toBe(303);
        expect(e.location).toBe('/login');
      }
    }
  });

  it('allows staff admin through requireStaff', () => {
    const user = requireStaff({ user: adminUser });
    expect(user.role).toBe('admin');
  });

  it('allows staff tecnico through requireStaff', () => {
    const user = requireStaff({ user: tecnicoUser });
    expect(user.role).toBe('tecnico');
  });

  it('allows admin through requireAdmin', () => {
    const user = requireAdmin({ user: adminUser });
    expect(user.role).toBe('admin');
  });

  it('returns 403 for tecnico on admin-only action', () => {
    expect(() => assertAdminOnly({ user: tecnicoUser }, 'manage_users')).toThrow(AuthError);
    try {
      assertAdminOnly({ user: tecnicoUser }, 'manage_users');
    } catch (e) {
      expect(e).toBeInstanceOf(AuthError);
      expect((e as AuthError).status).toBe(403);
    }
  });

  it('allows admin on admin-only actions', () => {
    expect(() => assertAdminOnly({ user: adminUser }, 'reopen_audit')).not.toThrow();
    expect(() => assertAdminOnly({ user: adminUser }, 'manage_users')).not.toThrow();
    expect(() => assertAdminOnly({ user: adminUser }, 'edit_templates')).not.toThrow();
  });

  it('protected layout load succeeds for authenticated staff', async () => {
    const data = (await appLayoutLoad({ locals: { user: tecnicoUser } } as never)) as {
      user: AppUser | null;
    };
    expect(data.user?.role).toBe('tecnico');
  });

  it('session-backed tecnico passes staff guard via layout', async () => {
    const { id } = await createSession(tecnicoUser.id);
    const { resolveSession } = await import('../../src/lib/server/auth/session');
    const user = await resolveSession(id);
    expect(user?.role).toBe('tecnico');

    const data = (await appLayoutLoad({ locals: { user } } as never)) as {
      user: AppUser | null;
    };
    expect(data.user?.email).toBe('facu@serviciosysistemas.com.ar');
  });
});
