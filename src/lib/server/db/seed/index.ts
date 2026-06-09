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

export { seedUsers, DEV_USERS } from './users';
export { seedTemplates, loadTemplateFixture } from './templates';
export type { TemplateFixture, SectionFixture, TemplateItemFixture } from './templates';
export { seedClients } from './clients';
