import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setSqlForTests } from '../src/lib/server/db/client';
import { indexNames, setupTestDb, teardownTestDb } from './helpers/db';
import { findUserIdByEmail } from './helpers/auth';
import { insertTestEmpresa } from './helpers/empresa';

const MIGRATION_013_RAW = readFileSync(
  join(process.cwd(), 'migrations', '013_client_cuit_index.sql'),
  'utf8'
);

// #23 Fase 1: la migración 015 renombró la tabla `client` → `empresa` (y `client` quedó como VISTA),
// la columna `audit.client_id` → `audit.empresa_id`, y el índice `client_cuit_unique` →
// `empresa_cuit_unique`. El cuerpo LITERAL de 013 referencia los nombres VIEJOS y crea el índice
// `ON client`; replayarlo verbatim sobre el esquema post-015 rompe (no se puede indexar una VISTA,
// "column client_id does not exist", choque con el índice único vigente). 013 debe permanecer
// históricamente correcto (corre ANTES de 015 en la cadena real), por eso NO se toca el archivo:
// adaptamos el cuerpo replayado a los nombres post-015 para ejercitar la MISMA lógica (dedup por
// CUIT conservando el id menor + repunte de FKs + índice único parcial) contra el esquema actual.
// La dedup de 013 opera sobre `client`; post-015 se hace sobre la tabla base `empresa` (idéntico).
// `crm_lead.client_id` NO se renombró (es otra columna), por eso se preserva.
const MIGRATION_013 = MIGRATION_013_RAW
  // audit: columna FK renombrada.
  .replace(/UPDATE audit a\s*\nSET client_id = k\.keep_id/, 'UPDATE audit a\nSET empresa_id = k.keep_id')
  .replace(/WHERE a\.client_id = c\.id/, 'WHERE a.empresa_id = c.id')
  // índice único: nombre + tabla base (no se puede crear sobre la vista `client`).
  .replace(/\bclient_cuit_unique\b/g, 'empresa_cuit_unique')
  .replace(/\bON client\b/g, 'ON empresa')
  // dedup sobre la tabla base `empresa` (FROM/DELETE de `client`); crm_lead.client_id intacto.
  .replace(/\bFROM client\b/g, 'FROM empresa')
  .replace(/\bDELETE FROM client c\b/g, 'DELETE FROM empresa c')
  .replace(/JOIN client c ON/g, 'JOIN empresa c ON');

/** Aplica el cuerpo (adaptado a nombres post-015) de la migración 013 en una transacción. */
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
    // Post-015 el índice se llama `empresa_cuit_unique` (renombrado desde `client_cuit_unique`).
    // Hay que dropear el nombre VIGENTE para poder insertar duplicados de CUIT en el setup; dropear
    // el nombre viejo sería un no-op y el INSERT chocaría con el índice único activo.
    await sql`DROP INDEX IF EXISTS empresa_cuit_unique`;
  }

  it('detecta duplicados antes del índice y los mergea conservando el id menor (R17, R18)', async () => {
    const cuit = '30999999991';
    await dropCuitIndex();
    await sql`DELETE FROM client WHERE cuit = ${cuit}`;

    // Tres filas con el mismo CUIT; ids forzados crecientes para fijar el "menor".
    const idLow = '00000000-0000-0000-0000-000000000001';
    const idMid = '00000000-0000-0000-0000-000000000002';
    const idHigh = '00000000-0000-0000-0000-000000000003';
    await insertTestEmpresa(sql, { id: idLow, razonSocial: 'Dup Low', cuit, origen: 'presupuestos' });
    await insertTestEmpresa(sql, { id: idMid, razonSocial: 'Dup Mid', cuit, origen: 'presupuestos' });
    await insertTestEmpresa(sql, { id: idHigh, razonSocial: 'Dup High', cuit, origen: 'presupuestos' });

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

    // El índice único existe (R18). Post-015 vive sobre la tabla base `empresa` con el nombre
    // renombrado `empresa_cuit_unique` (la vista `client` no tiene índices propios).
    expect(await indexNames(sql, 'empresa')).toContain('empresa_cuit_unique');

    // Y rechaza un insert duplicado.
    await expect(
      insertTestEmpresa(sql, { razonSocial: 'Otro', cuit, origen: 'presupuestos' })
    ).rejects.toMatchObject({ code: '23505' });

    await sql`DELETE FROM client WHERE cuit = ${cuit}`;
  });

  it('repunta FKs de audit/crm_lead al id conservado antes de borrar (R18)', async () => {
    const cuit = '30888888880';
    await dropCuitIndex();
    await sql`DELETE FROM client WHERE cuit = ${cuit}`;

    const idLow = '00000000-0000-0000-0000-0000000000a1';
    const idHigh = '00000000-0000-0000-0000-0000000000a2';
    await insertTestEmpresa(sql, { id: idLow, razonSocial: 'Keep', cuit, origen: 'presupuestos' });
    await insertTestEmpresa(sql, { id: idHigh, razonSocial: 'Drop', cuit, origen: 'presupuestos' });

    const adminId = await findUserIdByEmail(sql, 'admin@serviciosysistemas.com.ar');

    // audit.empresa_id (ex client_id, renombrado por 015) apunta a la fila que se va a borrar (idHigh).
    const [audit] = await sql<{ id: string }[]>`
      INSERT INTO audit (empresa_id, name, types, template_ids, segment, status, public_token)
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
    // Post-015 la columna FK de audit se llama `empresa_id` (antes `client_id`).
    const [auditRow] = await sql<{ empresa_id: string }[]>`
      SELECT empresa_id FROM audit WHERE id = ${audit.id}
    `;
    expect(auditRow.empresa_id).toBe(idLow);
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
