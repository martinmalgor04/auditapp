import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setSqlForTests } from '../src/lib/server/db/client';
import { setupTestDb, teardownTestDb } from './helpers/db';

const MIGRATION_015 = readFileSync(
  join(process.cwd(), 'migrations', '015_empresa_unificada.sql'),
  'utf8'
);

/** Aplica el cuerpo de la migración 015 en una transacción (como el runner). */
async function applyMigration015(sql: postgres.Sql): Promise<void> {
  await sql.begin(async (tx) => {
    await tx.unsafe(MIGRATION_015);
  });
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * #23 Fase 1 — migración 015 (rename + fold). La migración ya está aplicada en global setup;
 * estos tests insertan datos controlados y re-aplican el cuerpo (idempotente) para ejercitar el
 * fold de crm_lead, la dedup y la preservación de FKs. Cubre R7..R12 (+ R32 carga histórica).
 */
describe('empresa migración 015 (#23 Fase 1 — R7..R12, R32)', () => {
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

  it('R32: carga histórica determinística — origen presupuestos/tango → cliente, prospecto → prospecto', async () => {
    const ids = {
      pres: '00000000-0000-0000-0000-0000000c0001',
      tango: '00000000-0000-0000-0000-0000000c0002',
      prosp: '00000000-0000-0000-0000-0000000c0003'
    };
    await sql`DELETE FROM empresa WHERE id IN (${ids.pres}::uuid, ${ids.tango}::uuid, ${ids.prosp}::uuid)`;
    // Post-015 `empresa.relacion` ya es NOT NULL, así que para simular el estado pre-backfill
    // (filas con relacion NULL, como las que existen cuando la migración corre por 1ª vez sobre
    // datos preexistentes) hay que relajar el NOT NULL transitoriamente. Re-aplicar 015 vuelve a
    // backfillear por origen y re-asienta el NOT NULL, dejando el esquema intacto. Esto ejercita
    // exactamente la carga histórica determinística de la migración (R32).
    await sql`ALTER TABLE empresa ALTER COLUMN relacion DROP NOT NULL`;
    await sql`
      INSERT INTO empresa (id, razon_social, origen, relacion) VALUES
        (${ids.pres}::uuid,  'Hist Presup', 'presupuestos', NULL),
        (${ids.tango}::uuid, 'Hist Tango',  'tango',        NULL),
        (${ids.prosp}::uuid, 'Hist Prosp',  'prospecto',    NULL)
    `;

    await applyMigration015(sql);

    const rows = await sql<{ id: string; relacion: string }[]>`
      SELECT id, relacion FROM empresa
      WHERE id IN (${ids.pres}::uuid, ${ids.tango}::uuid, ${ids.prosp}::uuid)
      ORDER BY id
    `;
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.relacion]));
    expect(byId[ids.pres]).toBe('cliente');
    expect(byId[ids.tango]).toBe('cliente');
    expect(byId[ids.prosp]).toBe('prospecto');

    // La re-aplicación de 015 re-asentó el NOT NULL: no quedan filas con relacion NULL.
    const [{ nulls }] = await sql<{ nulls: number }[]>`
      SELECT count(*)::int nulls FROM empresa WHERE relacion IS NULL
    `;
    expect(nulls).toBe(0);

    await sql`DELETE FROM empresa WHERE id IN (${ids.pres}::uuid, ${ids.tango}::uuid, ${ids.prosp}::uuid)`;
  });

  it('R7/R9: prospecto sin CUIT sin match → fila empresa separada (no se descarta)', async () => {
    const razon = 'Prospecto Solo MIGR ' + Date.now();
    await sql`DELETE FROM crm_lead WHERE empresa = ${razon}`;
    await sql`DELETE FROM empresa WHERE razon_social = ${razon}`;

    const before = await sql<{ n: number }[]>`SELECT count(*)::int n FROM empresa`;

    await sql`
      INSERT INTO crm_lead (email, empresa, source)
      VALUES (${'sep-' + Date.now() + '@x.com'}, ${razon}, 'manual')
    `;

    await applyMigration015(sql);

    const [folded] = await sql<{ id: string; relacion: string; origen: string }[]>`
      SELECT id, relacion, origen FROM empresa WHERE razon_social = ${razon}
    `;
    expect(folded).toBeTruthy();
    expect(folded.relacion).toBe('prospecto');
    expect(folded.origen).toBe('prospecto');

    const after = await sql<{ n: number }[]>`SELECT count(*)::int n FROM empresa`;
    // Exactamente una fila nueva: el prospecto sin match (sin pérdida).
    expect(after[0].n).toBe(before[0].n + 1);

    await sql`DELETE FROM empresa WHERE razon_social = ${razon}`;
    await sql`DELETE FROM crm_lead WHERE empresa = ${razon}`;
  });

  it('R8/R9: prospecto sin CUIT que matchea razón social normalizada → se fusiona (no duplica)', async () => {
    const base = 'Empresa Existente MIGR ' + Date.now();
    await sql`DELETE FROM crm_lead WHERE empresa ILIKE ${base + '%'}`;
    await sql`DELETE FROM empresa WHERE razon_social ILIKE ${base + '%'}`;

    // Empresa existente (cliente) con esa razón social.
    await sql`
      INSERT INTO empresa (razon_social, origen, relacion)
      VALUES (${base}, 'presupuestos', 'cliente')
    `;
    // crm_lead con la MISMA razón social pero con espacios extra y mayúsculas → normaliza igual.
    const variante = '  ' + base.toUpperCase() + '   ';
    expect(norm(variante)).toBe(norm(base));
    await sql`
      INSERT INTO crm_lead (email, empresa, source)
      VALUES (${'match-' + Date.now() + '@x.com'}, ${variante}, 'manual')
    `;

    await applyMigration015(sql);

    // Sigue habiendo UNA sola empresa con esa razón social (el lead se fusionó, no insertó).
    const matches = await sql<{ id: string }[]>`
      SELECT id FROM empresa
      WHERE lower(regexp_replace(trim(razon_social), '\\s+', ' ', 'g')) = ${norm(base)}
    `;
    expect(matches).toHaveLength(1);

    await sql`DELETE FROM empresa WHERE razon_social ILIKE ${base + '%'}`;
    await sql`DELETE FROM crm_lead WHERE empresa ILIKE ${base.toUpperCase() + '%'}`;
  });

  it('R10/R11: la FK de audit se preserva (0 huérfanas) y empresa_id apunta correcto', async () => {
    const razon = 'Empresa con Audit MIGR ' + Date.now();
    await sql`DELETE FROM empresa WHERE razon_social = ${razon}`;

    const [emp] = await sql<{ id: string }[]>`
      INSERT INTO empresa (razon_social, origen, relacion)
      VALUES (${razon}, 'presupuestos', 'cliente') RETURNING id
    `;
    const token = 'tok-migr-' + Date.now();
    const [audit] = await sql<{ id: string }[]>`
      INSERT INTO audit (empresa_id, name, types, template_ids, segment, status, public_token)
      VALUES (${emp.id}::uuid, 'Audit migr', ARRAY['it']::text[], ARRAY[]::uuid[], 'A',
              'en_relevamiento', ${token})
      RETURNING id
    `;

    await applyMigration015(sql);

    // La columna FK se llama empresa_id y sigue apuntando a la misma empresa.
    const [row] = await sql<{ empresa_id: string }[]>`
      SELECT empresa_id FROM audit WHERE id = ${audit.id}
    `;
    expect(row.empresa_id).toBe(emp.id);

    // 0 auditorías huérfanas en toda la tabla (toda audit.empresa_id resuelve a una empresa).
    const [orphans] = await sql<{ n: number }[]>`
      SELECT count(*)::int n FROM audit a
      WHERE NOT EXISTS (SELECT 1 FROM empresa e WHERE e.id = a.empresa_id)
    `;
    expect(orphans.n).toBe(0);

    await sql`DELETE FROM audit WHERE id = ${audit.id}`;
    await sql`DELETE FROM empresa WHERE id = ${emp.id}`;
  });

  it('R12: re-ejecutar la migración es un no-op (0 filas nuevas, FKs estables)', async () => {
    const razon = 'Idempotencia MIGR ' + Date.now();
    await sql`DELETE FROM crm_lead WHERE empresa = ${razon}`;
    await sql`DELETE FROM empresa WHERE razon_social = ${razon}`;

    await sql`
      INSERT INTO crm_lead (email, empresa, source)
      VALUES (${'idem-' + Date.now() + '@x.com'}, ${razon}, 'manual')
    `;

    // 1ª aplicación: foldea el prospecto.
    await applyMigration015(sql);
    const [after1] = await sql<{ n: number }[]>`SELECT count(*)::int n FROM empresa`;
    const folded1 = await sql<{ id: string }[]>`SELECT id FROM empresa WHERE razon_social = ${razon}`;
    expect(folded1).toHaveLength(1);

    // 2ª y 3ª aplicación: no debe crear filas nuevas ni romper.
    await applyMigration015(sql);
    await applyMigration015(sql);
    const [after3] = await sql<{ n: number }[]>`SELECT count(*)::int n FROM empresa`;
    expect(after3.n).toBe(after1.n);

    const folded3 = await sql<{ id: string }[]>`SELECT id FROM empresa WHERE razon_social = ${razon}`;
    expect(folded3).toHaveLength(1);
    expect(folded3[0].id).toBe(folded1[0].id);

    await sql`DELETE FROM empresa WHERE razon_social = ${razon}`;
    await sql`DELETE FROM crm_lead WHERE empresa = ${razon}`;
  });

  it('R8: dos empresas con el mismo CUIT no nulo violan el índice único', async () => {
    const cuit = '30777777770';
    await sql`DELETE FROM empresa WHERE cuit = ${cuit}`;
    await sql`
      INSERT INTO empresa (razon_social, cuit, origen, relacion)
      VALUES ('Cuit A', ${cuit}, 'presupuestos', 'cliente')
    `;
    await expect(
      sql`INSERT INTO empresa (razon_social, cuit, origen, relacion)
          VALUES ('Cuit B', ${cuit}, 'presupuestos', 'cliente')`
    ).rejects.toMatchObject({ code: '23505' });
    await sql`DELETE FROM empresa WHERE cuit = ${cuit}`;
  });

  it('R11: evento de crm_lead foldeado se migra a empresa_evento del empresa conservado', async () => {
    const razon = 'Empresa Evento MIGR ' + Date.now();
    await sql`DELETE FROM crm_lead WHERE empresa = ${razon}`;
    await sql`DELETE FROM empresa WHERE razon_social = ${razon}`;

    const [lead] = await sql<{ id: string }[]>`
      INSERT INTO crm_lead (email, empresa, source, status)
      VALUES (${'evt-' + Date.now() + '@x.com'}, ${razon}, 'manual', 'contactado')
      RETURNING id
    `;
    await sql`
      INSERT INTO crm_lead_event (lead_id, from_status, to_status)
      VALUES (${lead.id}::uuid, 'lead', 'contactado')
    `;

    await applyMigration015(sql);

    const [emp] = await sql<{ id: string }[]>`SELECT id FROM empresa WHERE razon_social = ${razon}`;
    expect(emp).toBeTruthy();
    const eventos = await sql<{ tipo: string; from_status: string; to_status: string }[]>`
      SELECT tipo, from_status, to_status FROM empresa_evento WHERE empresa_id = ${emp.id}
    `;
    expect(eventos).toHaveLength(1);
    expect(eventos[0].tipo).toBe('cambio_estado');
    expect(eventos[0].from_status).toBe('lead');
    expect(eventos[0].to_status).toBe('contactado');

    // Re-aplicar no duplica el evento migrado (idempotencia del paso 7).
    await applyMigration015(sql);
    const [{ n }] = await sql<{ n: number }[]>`
      SELECT count(*)::int n FROM empresa_evento WHERE empresa_id = ${emp.id}
    `;
    expect(n).toBe(1);

    await sql`DELETE FROM empresa WHERE id = ${emp.id}`;
    await sql`DELETE FROM crm_lead WHERE empresa = ${razon}`;
  });
});
