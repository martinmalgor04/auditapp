import { hash } from '@node-rs/argon2';
import type postgres from 'postgres';

type DbExecutor = postgres.Sql | postgres.TransactionSql;

export type DevUser = {
  email: string;
  name: string;
  role: 'admin' | 'tecnico';
  password: string;
  auditTypes: string[] | null;
};

export const DEV_USERS: DevUser[] = [
  {
    email: 'admin@serviciosysistemas.com.ar',
    name: 'Admin SyS',
    role: 'admin',
    password: 'changeme-admin',
    auditTypes: null
  },
  {
    email: 'facu@serviciosysistemas.com.ar',
    name: 'Facu',
    role: 'tecnico',
    password: 'changeme-tech',
    auditTypes: ['it']
  },
  {
    email: 'simon@serviciosysistemas.com.ar',
    name: 'Simón',
    role: 'tecnico',
    password: 'changeme-tech',
    auditTypes: ['erp-tango', 'erp-estandar']
  }
];

export async function seedUsers(sql: DbExecutor): Promise<void> {
  for (const user of DEV_USERS) {
    const passwordHash = await hash(user.password);
    await sql`
      INSERT INTO app_user (email, name, password_hash, role, active, audit_types)
      VALUES (${user.email}, ${user.name}, ${passwordHash}, ${user.role}, true, ${user.auditTypes})
      ON CONFLICT (email) DO UPDATE SET
        name = EXCLUDED.name,
        password_hash = EXCLUDED.password_hash,
        role = EXCLUDED.role,
        active = EXCLUDED.active,
        audit_types = EXCLUDED.audit_types
    `;
  }
}
