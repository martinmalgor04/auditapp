import type postgres from 'postgres';
import { seedClients } from './clients';
import { seedTemplates } from './templates';
import { seedUsers } from './users';

export type SeedOptions = {
  users?: boolean;
  templates?: boolean;
  clients?: boolean;
};

type DbExecutor = postgres.Sql | postgres.TransactionSql;

/** Seed idempotente de usuarios, plantillas y clientes. */
export async function runSeed(
  sql: DbExecutor,
  opts: SeedOptions = { users: true, templates: true, clients: true }
): Promise<void> {
  if (opts.users !== false) {
    await seedUsers(sql);
  }
  if (opts.templates !== false) {
    await seedTemplates(sql);
  }
  if (opts.clients !== false) {
    await seedClients(sql);
  }
}

function isAutoSeedDisabled(): boolean {
  const value = process.env.AUTO_SEED?.trim().toLowerCase();
  return value === '0' || value === 'false' || value === 'no';
}

/** True cuando la DB no tiene usuarios (primer deploy). */
export async function needsInitialSeed(sql: DbExecutor): Promise<boolean> {
  const [{ count }] = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count FROM app_user
  `;
  return Number(count) === 0;
}

/** Corre seed completo solo en DB vacía; idempotente en restarts. */
export async function runInitialSeedIfNeeded(
  sql: DbExecutor,
  opts: SeedOptions = { users: true, templates: true, clients: true }
): Promise<{ seeded: boolean; reason: 'seeded' | 'already_initialized' | 'disabled' }> {
  if (isAutoSeedDisabled()) {
    return { seeded: false, reason: 'disabled' };
  }
  if (!(await needsInitialSeed(sql))) {
    return { seeded: false, reason: 'already_initialized' };
  }
  await runSeed(sql, opts);
  return { seeded: true, reason: 'seeded' };
}

export { seedUsers, DEV_USERS } from './users';
export { seedTemplates, loadTemplateFixture } from './templates';
export type { TemplateFixture, SectionFixture, TemplateItemFixture } from './templates';
export { seedClients } from './clients';
