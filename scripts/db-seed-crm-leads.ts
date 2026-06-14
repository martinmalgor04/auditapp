#!/usr/bin/env tsx
/**
 * Carga los prospectos del relevamiento comercial en el CRM (crm_lead).
 * Idempotente: re-correrlo actualiza por id sin duplicar.
 *
 * Uso: DATABASE_URL=... pnpm exec tsx scripts/db-seed-crm-leads.ts
 */
import { createSql } from '../src/lib/server/db/client';
import { seedCrmLeads } from '../src/lib/server/db/seed';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const sql = createSql(connectionString);

try {
  const count = await seedCrmLeads(sql);
  console.log(`CRM leads seed completed: ${count} prospectos`);
} finally {
  await sql.end();
}
