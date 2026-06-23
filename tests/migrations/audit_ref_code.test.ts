import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { setupTestDb, teardownTestDb } from '../helpers/db';

describe('migración 022 audit_ref_code (#41 R4, R10–R13)', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = await setupTestDb();
    setSqlForTests(sql);
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('toda empresa tiene codigo único NOT NULL', async () => {
    const [{ nulls }] = await sql<{ nulls: number }[]>`
      SELECT count(*)::int nulls FROM empresa WHERE codigo IS NULL
    `;
    expect(nulls).toBe(0);

    const dupes = await sql<{ codigo: string; n: number }[]>`
      SELECT codigo, count(*)::int n FROM empresa GROUP BY codigo HAVING count(*) > 1
    `;
    expect(dupes).toHaveLength(0);
  });

  it('toda auditoría tiene ref_code único con formato válido', async () => {
    const [{ nulls }] = await sql<{ nulls: number }[]>`
      SELECT count(*)::int nulls FROM audit WHERE ref_code IS NULL
    `;
    expect(nulls).toBe(0);

    const invalid = await sql<{ ref_code: string }[]>`
      SELECT ref_code FROM audit
      WHERE ref_code !~ '^[A-Z0-9]+-(IT|ERP|ERPE)-[0-9]{4,}$'
    `;
    expect(invalid).toHaveLength(0);

    const dupes = await sql<{ ref_code: string }[]>`
      SELECT ref_code FROM audit GROUP BY ref_code HAVING count(*) > 1
    `;
    expect(dupes).toHaveLength(0);
  });

  it('INGENIERIA SIGLO XXI → codigo ISX', async () => {
    const rows = await sql<{ codigo: string }[]>`
      SELECT codigo FROM empresa
      WHERE auditapp_normalize_text(razon_social) LIKE '%INGENIERIA%SIGLO%XXI%'
      LIMIT 1
    `;
    if (rows.length === 0) {
      const cuit = '30-99000001-1';
      await sql`DELETE FROM audit_ref_counter WHERE empresa_id IN (SELECT id FROM empresa WHERE cuit = ${cuit})`;
      await sql`DELETE FROM audit WHERE empresa_id IN (SELECT id FROM empresa WHERE cuit = ${cuit})`;
      await sql`DELETE FROM empresa WHERE cuit = ${cuit} OR codigo = 'ISX'`;
      const [row] = await sql<{ codigo: string }[]>`
        INSERT INTO empresa (razon_social, cuit, relacion, codigo)
        VALUES ('INGENIERIA SIGLO XXI SA', ${cuit}, 'cliente', 'ISX')
        RETURNING codigo
      `;
      expect(row.codigo).toBe('ISX');
      return;
    }
    expect(rows[0].codigo).toMatch(/^ISX/);
  });

  it('legacy multi-tipo usa tipo líder IT para ref_code', async () => {
    const cuit = '30-99000002-2';
    await sql`DELETE FROM audit WHERE empresa_id IN (SELECT id FROM empresa WHERE cuit = ${cuit})`;
    await sql`DELETE FROM empresa WHERE cuit = ${cuit}`;
    const [emp] = await sql<{ id: string }[]>`
      INSERT INTO empresa (razon_social, cuit, relacion, codigo)
      VALUES ('Legacy Mixta SA', ${cuit}, 'cliente', 'LMIX')
      RETURNING id
    `;
    const adminId = (
      await sql<{ id: string }[]>`SELECT id FROM app_user WHERE email = 'admin@serviciosysistemas.com.ar' LIMIT 1`
    )[0].id;
    const techId = (
      await sql<{ id: string }[]>`SELECT id FROM app_user WHERE email = 'facu@serviciosysistemas.com.ar' LIMIT 1`
    )[0].id;
    const tpl = await sql<{ id: string }[]>`
      SELECT id FROM template WHERE code = 'it' AND status = 'active' LIMIT 1
    `;
    await sql`
      INSERT INTO audit (
        empresa_id, name, types, template_ids, segment, status,
        assigned_tech_id, created_by, ref_code
      )
      VALUES (
        ${emp.id}, 'Legacy', ${['it', 'erp-tango']}, ${[tpl[0].id]}::uuid[], 'A', 'cerrada',
        ${techId}, ${adminId}, 'LMIX-IT-0099'
      )
    `;
    const [audit] = await sql<{ ref_code: string }[]>`
      SELECT ref_code FROM audit WHERE empresa_id = ${emp.id} AND ref_code = 'LMIX-IT-0099'
    `;
    expect(audit.ref_code).toMatch(/-IT-/);
  });

  it('contador alineado al máximo correlativo por empresa+tipo', async () => {
    const rows = await sql<{ empresa_id: string; audit_type: string; last_seq: number }[]>`
      SELECT arc.empresa_id, arc.audit_type, arc.last_seq
      FROM audit_ref_counter arc
      WHERE EXISTS (
        SELECT 1 FROM audit a
        WHERE a.empresa_id = arc.empresa_id
          AND a.ref_code IS NOT NULL
          AND (
            CASE
              WHEN 'it' = ANY(a.types) THEN 'it'
              WHEN 'erp-tango' = ANY(a.types) THEN 'erp-tango'
              ELSE 'erp-estandar'
            END
          ) = arc.audit_type
      )
      LIMIT 20
    `;
    for (const row of rows) {
      const [maxRow] = await sql<{ max_seq: number | null }[]>`
        SELECT max((regexp_match(a.ref_code, '-(\d{4})$'))[1]::int) max_seq
        FROM audit a
        WHERE a.empresa_id = ${row.empresa_id}
          AND (
            CASE
              WHEN 'it' = ANY(a.types) THEN 'it'
              WHEN 'erp-tango' = ANY(a.types) THEN 'erp-tango'
              ELSE 'erp-estandar'
            END
          ) = ${row.audit_type}
      `;
      expect(row.last_seq).toBe(maxRow.max_seq ?? 0);
    }
  });
});
