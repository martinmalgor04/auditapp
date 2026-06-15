import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setSqlForTests } from '../src/lib/server/db/client';
import { indexNames, setupTestDb, teardownTestDb } from './helpers/db';
import { findUserIdByEmail } from './helpers/auth';

const MIGRATION_013 = readFileSync(
  join(process.cwd(), 'migrations', '013_client_cuit_index.sql'),
  'utf8'
);

/** Aplica el cuerpo de la migración 013 dentro de una transacción (como el runner). */
async function applyMigration013(sql: postgres.Sql): Promise<void> {
  await sql.begin(async (tx) => {
    await tx.unsafe(MIGRATION_013);
  });
}

describe('client cuit cleanup + índice único (R17, R18)', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(() => {
    setSqlForTests(sql);
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  async function dropCuitIndex(): Promise<void> {
    await sql`DROP INDEX IF EXISTS client_cuit_unique`;
  }

  it('detecta duplicados antes del índice y los mergea conservando el id menor (R17, R18)', async () => {
    const cuit = '30999999991';
    await dropCuitIndex();
    await sql`DELETE FROM client WHERE cuit = ${cuit}`;

    // Tres filas con el mismo CUIT; ids forzados crecientes para fijar el "menor".
    const idLow = '00000000-0000-0000-0000-000000000001';
    const idMid = '00000000-0000-0000-0000-000000000002';
    const idHigh = '00000000-0000-0000-0000-000000000003';
    await sql`
      INSERT INTO client (id, razon_social, cuit, origen) VALUES
        (${idLow}::uuid,  'Dup Low',  ${cuit}, 'presupuestos'),
        (${idMid}::uuid,  'Dup Mid',  ${cuit}, 'presupuestos'),
        (${idHigh}::uuid, 'Dup High', ${cuit}, 'presupuestos')
    `;

    // Detección previa (R17): hay duplicados antes de limpiar.
    const before = await sql<{ cuit: string; count: string }[]>`
      SELECT cuit, count(*)::text AS count
      FROM client WHERE cuit = ${cuit}
      GROUP BY cuit HAVING count(*) > 1
    `;
    expect(before).toHaveLength(1);
    expect(Number(before[0].count)).toBe(3);

    await applyMigration013(sql);

    // Tras el merge: una sola fila, la de id menor (R18).
    const after = await sql<{ id: string }[]>`
      SELECT id FROM client WHERE cuit = ${cuit}
    `;
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(idLow);

    // El índice único existe (R18).
    expect(await indexNames(sql, 'client')).toContain('client_cuit_unique');

    // Y rechaza un insert duplicado.
    await expect(
      sql`INSERT INTO client (razon_social, cuit, origen) VALUES ('Otro', ${cuit}, 'presupuestos')`
    ).rejects.toMatchObject({ code: '23505' });

    await sql`DELETE FROM client WHERE cuit = ${cuit}`;
  });

  it('repunta FKs de audit/crm_lead al id conservado antes de borrar (R18)', async () => {
    const cuit = '30888888880';
    await dropCuitIndex();
    await sql`DELETE FROM client WHERE cuit = ${cuit}`;

    const idLow = '00000000-0000-0000-0000-0000000000a1';
    const idHigh = '00000000-0000-0000-0000-0000000000a2';
    await sql`
      INSERT INTO client (id, razon_social, cuit, origen) VALUES
        (${idLow}::uuid,  'Keep',  ${cuit}, 'presupuestos'),
        (${idHigh}::uuid, 'Drop',  ${cuit}, 'presupuestos')
    `;

    const adminId = await findUserIdByEmail(sql, 'admin@serviciosysistemas.com.ar');

    // audit.client_id apunta a la fila que se va a borrar (idHigh).
    const [audit] = await sql<{ id: string }[]>`
      INSERT INTO audit (client_id, name, types, template_ids, segment, status, public_token)
      VALUES (${idHigh}::uuid, 'Audit dup', ARRAY['it']::text[], ARRAY[]::uuid[], 'A',
              'en_relevamiento', ${'tok-' + cuit})
      RETURNING id
    `;
    // crm_lead.client_id también apunta a idHigh.
    const [lead] = await sql<{ id: string }[]>`
      INSERT INTO crm_lead (email, empresa, source, client_id)
      VALUES (${'dup-' + cuit + '@x.com'}, 'Drop', 'manual', ${idHigh}::uuid)
      RETURNING id
    `;
    expect(adminId).toBeTruthy();

    await applyMigration013(sql);

    // La fila conservada es idLow.
    const after = await sql<{ id: string }[]>`SELECT id FROM client WHERE cuit = ${cuit}`;
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(idLow);

    // Las FKs se repuntaron al id conservado (no quedaron colgadas).
    const [auditRow] = await sql<{ client_id: string }[]>`
      SELECT client_id FROM audit WHERE id = ${audit.id}
    `;
    expect(auditRow.client_id).toBe(idLow);
    const [leadRow] = await sql<{ client_id: string }[]>`
      SELECT client_id FROM crm_lead WHERE id = ${lead.id}
    `;
    expect(leadRow.client_id).toBe(idLow);

    // Limpieza.
    await sql`DELETE FROM audit WHERE id = ${audit.id}`;
    await sql`DELETE FROM crm_lead WHERE id = ${lead.id}`;
    await sql`DELETE FROM client WHERE cuit = ${cuit}`;
  });
});
