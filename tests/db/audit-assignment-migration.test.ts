import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { setupTestDb, teardownTestDb, columnNames, tableExists, indexNames } from '../helpers/db';
import { findUserIdByEmail } from '../helpers/auth';
import { getTemplateIdByCode } from '../helpers/backoffice';

const MIGRATION_SQL = readFileSync(
  join(process.cwd(), 'migrations/020_audit_assignment.sql'),
  'utf8'
);

// #32 — migración 020: tabla audit_assignment + backfill + columnas CAB.
// Idempotente y aditiva. Cubre R1–R5, R26.
describe('migración 020 — audit_assignment + CAB (#32)', () => {
  let sql: postgres.Sql;
  let techId: string;

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(async () => {
    setSqlForTests(sql);
    techId = await findUserIdByEmail(sql, 'facu@serviciosysistemas.com.ar');
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('(R1) crea la tabla audit_assignment con PK, índice por tech_id y CHECK de audit_type', async () => {
    expect(await tableExists(sql, 'audit_assignment')).toBe(true);

    const cols = await columnNames(sql, 'audit_assignment');
    expect(cols).toEqual(expect.arrayContaining(['audit_id', 'audit_type', 'tech_id', 'created_at']));

    // PK (audit_id, audit_type) → unicidad.
    const [pk] = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'audit_assignment'::regclass AND contype = 'p'
      ) AS exists
    `;
    expect(pk.exists).toBe(true);

    // Índice por tech_id.
    expect(await indexNames(sql, 'audit_assignment')).toEqual(
      expect.arrayContaining(['audit_assignment_tech_id_idx'])
    );

    // CHECK de dominio de audit_type.
    const [chk] = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'audit_assignment'::regclass AND contype = 'c'
      ) AS exists
    `;
    expect(chk.exists).toBe(true);
  });

  it('(R5) agrega audit.cab_confirmed_by/at, nulables por defecto', async () => {
    const cols = await columnNames(sql, 'audit');
    expect(cols).toEqual(expect.arrayContaining(['cab_confirmed_by', 'cab_confirmed_at']));

    const rows = await sql<{ column_name: string; is_nullable: string }[]>`
      SELECT column_name, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'audit'
        AND column_name IN ('cab_confirmed_by', 'cab_confirmed_at')
    `;
    for (const r of rows) {
      expect(r.is_nullable).toBe('YES');
    }
  });

  it('(R2, R4, R26) backfill: auditoría mixta con assigned_tech_id → 2 filas y assigned_tech_id intacto', async () => {
    const itTpl = await getTemplateIdByCode(sql, 'it');
    const erpTpl = await getTemplateIdByCode(sql, 'erp-tango');

    const [client] = await sql<{ id: string }[]>`
      INSERT INTO client (razon_social) VALUES ('Backfill Mixta SA') RETURNING id
    `;
    // Insertamos la auditoría SIN filas de audit_assignment (estado pre-#32).
    const [audit] = await sql<{ id: string }[]>`
      INSERT INTO audit (empresa_id, name, types, template_ids, segment, status, assigned_tech_id)
      VALUES (
        ${client.id}, 'Auditoría Backfill', ${['it', 'erp-tango']},
        ${[itTpl, erpTpl]}::uuid[], 'A', 'borrador', ${techId}
      )
      RETURNING id
    `;
    await sql`DELETE FROM audit_assignment WHERE audit_id = ${audit.id}`;

    // Insertar una respuesta para verificar que el backfill no la toca (R26).
    const [{ id: cabItemId }] = await sql<{ id: string }[]>`
      SELECT ti.id FROM template_item ti
      JOIN section s ON s.id = ti.section_id
      WHERE s.template_id = ${itTpl} AND s.code = 'CAB'
      ORDER BY ti.sort_order LIMIT 1
    `;
    await sql`
      INSERT INTO audit_response (audit_id, item_id, value, source)
      VALUES (${audit.id}, ${cabItemId}, ${sql.json('Pre-existente' as never)}, 'admin')
      ON CONFLICT (audit_id, item_id) DO UPDATE SET value = EXCLUDED.value
    `;

    // Re-aplicar el backfill (idempotente).
    await sql.unsafe(MIGRATION_SQL);

    const rows = await sql<{ audit_type: string; tech_id: string }[]>`
      SELECT audit_type, tech_id FROM audit_assignment WHERE audit_id = ${audit.id} ORDER BY audit_type
    `;
    expect(rows.map((r) => r.audit_type)).toEqual(['erp-tango', 'it']);
    expect(rows.every((r) => r.tech_id === techId)).toBe(true);

    // R4: assigned_tech_id intacto.
    const [a] = await sql<{ assigned_tech_id: string; cab_confirmed_at: Date | null }[]>`
      SELECT assigned_tech_id, cab_confirmed_at FROM audit WHERE id = ${audit.id}
    `;
    expect(a.assigned_tech_id).toBe(techId);
    // R26: CAB no confirmado.
    expect(a.cab_confirmed_at).toBeNull();

    // R26: respuesta pre-existente intacta.
    const [resp] = await sql<{ value: unknown }[]>`
      SELECT value FROM audit_response WHERE audit_id = ${audit.id} AND item_id = ${cabItemId}
    `;
    expect(resp.value).toBe('Pre-existente');
  });

  it('(R3) re-aplicar la migración dos veces no falla ni duplica filas', async () => {
    const itTpl = await getTemplateIdByCode(sql, 'it');
    const [client] = await sql<{ id: string }[]>`
      INSERT INTO client (razon_social) VALUES ('Idempotente SA') RETURNING id
    `;
    const [audit] = await sql<{ id: string }[]>`
      INSERT INTO audit (empresa_id, name, types, template_ids, segment, status, assigned_tech_id)
      VALUES (${client.id}, 'Idempotente', ${['it']}, ${[itTpl]}::uuid[], 'A', 'borrador', ${techId})
      RETURNING id
    `;
    await sql`DELETE FROM audit_assignment WHERE audit_id = ${audit.id}`;

    await expect(sql.unsafe(MIGRATION_SQL)).resolves.toBeTruthy();
    await expect(sql.unsafe(MIGRATION_SQL)).resolves.toBeTruthy();

    const [{ count }] = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count FROM audit_assignment WHERE audit_id = ${audit.id}
    `;
    expect(Number(count)).toBe(1);
  });
});
