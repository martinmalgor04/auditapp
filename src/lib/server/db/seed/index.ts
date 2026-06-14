import type postgres from 'postgres';
import { seedClients } from './clients';
import { seedClientesTango } from './tango';
import { seedTemplates } from './templates';
import { seedUsers } from './users';

export type SeedOptions = {
  users?: boolean;
  templates?: boolean;
  clients?: boolean;
  tango?: boolean;
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
  // Después de clients: enriquecen por id filas ya cargadas desde presupuestos.
  if (opts.tango !== false) {
    await seedClientesTango(sql);
  }
  // Nota: los prospectos del relevamiento van a crm_lead (tabla volátil en
  // tests), no acá. Se cargan con scripts/db-seed-crm-leads.ts (seedCrmLeads).
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
export { seedClientesTango } from './tango';
export { seedCrmLeads } from './crm-leads';
