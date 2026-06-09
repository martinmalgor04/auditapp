import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  columnNames,
  indexNames,
  setupTestDb,
  tableExists,
  teardownTestDb
} from './helpers/db';
import type postgres from 'postgres';

describe('database schema', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = await setupTestDb();
  }, 30_000);

  afterAll(async () => {
    await teardownTestDb();
  });

  it('creates template definition tables with expected columns', async () => {
    expect(await tableExists(sql, 'template')).toBe(true);
    expect(await tableExists(sql, 'section')).toBe(true);
    expect(await tableExists(sql, 'template_item')).toBe(true);

    const templateCols = await columnNames(sql, 'template');
    expect(templateCols).toEqual(
      expect.arrayContaining(['id', 'code', 'name', 'version', 'status', 'created_at'])
    );

    const sectionCols = await columnNames(sql, 'section');
    expect(sectionCols).toEqual(
      expect.arrayContaining([
        'id',
        'template_id',
        'code',
        'title',
        'weight',
        'has_score',
        'sort_order'
      ])
    );

    const itemCols = await columnNames(sql, 'template_item');
    expect(itemCols).toEqual(
      expect.arrayContaining([
        'id',
        'section_id',
        'label',
        'field_type',
        'options',
        'filled_by',
        'scores',
        'item_weight',
        'sort_order'
      ])
    );
  });

  it('client table has extended market columns', async () => {
    const cols = await columnNames(sql, 'client');
    expect(cols).toEqual(
      expect.arrayContaining([
        'id',
        'razon_social',
        'cuit',
        'rubro',
        'empleados',
        'puestos',
        'sedes',
        'referente_nombre',
        'referente_cargo',
        'referente_contacto',
        'erp_actual',
        'proveedor_correo',
        'soporte_it_actual',
        'direccion',
        'cp',
        'provincia',
        'telefono',
        'email',
        'created_at',
        'updated_at'
      ])
    );
  });

  it('creates audit instance tables with uniqueness constraints', async () => {
    for (const table of [
      'audit',
      'audit_response',
      'audit_section_score',
      'audit_closure',
      'attachment'
    ]) {
      expect(await tableExists(sql, table)).toBe(true);
    }

    const responseIndexes = await indexNames(sql, 'audit_response');
    expect(responseIndexes.some((i) => i.includes('audit_id_item_id'))).toBe(true);

    const sectionScoreIndexes = await indexNames(sql, 'audit_section_score');
    expect(sectionScoreIndexes.some((i) => i.includes('audit_id_section_id'))).toBe(true);

    const closureCols = await columnNames(sql, 'audit_closure');
    expect(closureCols[0]).toBe('audit_id');
  });

  it('creates auth tables app_user and session', async () => {
    expect(await tableExists(sql, 'app_user')).toBe(true);
    expect(await tableExists(sql, 'session')).toBe(true);

    const userCols = await columnNames(sql, 'app_user');
    expect(userCols).toEqual(
      expect.arrayContaining(['email', 'role', 'password_hash', 'active'])
    );

    const sessionCols = await columnNames(sql, 'session');
    expect(sessionCols).toEqual(
      expect.arrayContaining(['id', 'user_id', 'expires_at'])
    );
  });

  it('rejects invalid field_type', async () => {
    const [template] = await sql<{ id: string }[]>`
      INSERT INTO template (code, name, version, status)
      VALUES ('test-invalid', 'Test', 'v0', 'draft')
      RETURNING id
    `;
    const [section] = await sql<{ id: string }[]>`
      INSERT INTO section (template_id, code, title, weight, sort_order)
      VALUES (${template.id}, 'T1', 'Test', 'bajo', 1)
      RETURNING id
    `;

    await expect(
      sql`
        INSERT INTO template_item (section_id, label, field_type, filled_by, sort_order)
        VALUES (${section.id}, 'Bad', 'invalid_type', 'tecnico', 1)
      `
    ).rejects.toThrow();
  });

  it('accepts all 12 field_types', async () => {
    const types = [
      'text',
      'number',
      'bool',
      'tri',
      'select',
      'multiselect',
      'date',
      'datetime',
      'list',
      'table',
      'file_ref',
      'money'
    ];

    const [template] = await sql<{ id: string }[]>`
      INSERT INTO template (code, name, version, status)
      VALUES ('test-types', 'Types', 'v0', 'draft')
      RETURNING id
    `;
    const [section] = await sql<{ id: string }[]>`
      INSERT INTO section (template_id, code, title, weight, sort_order)
      VALUES (${template.id}, 'T2', 'Types', 'bajo', 1)
      RETURNING id
    `;

    for (const [idx, fieldType] of types.entries()) {
      await sql`
        INSERT INTO template_item (
          section_id, label, field_type, filled_by, sort_order, options
        )
        VALUES (
          ${section.id},
          ${`Item ${fieldType}`},
          ${fieldType},
          'tecnico',
          ${idx + 1},
          ${sql.json({})}
        )
      `;
    }

    const count = await sql<{ count: string }[]>`
      SELECT COUNT(*)::text AS count
      FROM template_item
      WHERE section_id = ${section.id}
    `;
    expect(Number(count[0].count)).toBe(12);
  });

  it('enforces template domain check constraints', async () => {
    await expect(
      sql`
        INSERT INTO template (code, name, version, status)
        VALUES ('bad-status', 'Bad', 'v0', 'published')
      `
    ).rejects.toThrow();

    const [template] = await sql<{ id: string }[]>`
      INSERT INTO template (code, name, version, status)
      VALUES ('bad-domain', 'Bad', 'v0', 'draft')
      RETURNING id
    `;

    await expect(
      sql`
        INSERT INTO section (template_id, code, title, weight, sort_order)
        VALUES (${template.id}, 'X1', 'Bad weight', 'critico', 1)
      `
    ).rejects.toThrow();

    const [section] = await sql<{ id: string }[]>`
      INSERT INTO section (template_id, code, title, weight, sort_order)
      VALUES (${template.id}, 'X2', 'Ok', 'bajo', 1)
      RETURNING id
    `;

    await expect(
      sql`
        INSERT INTO template_item (
          section_id, label, field_type, filled_by, sort_order, method
        )
        VALUES (${section.id}, 'Bad method', 'text', 'tecnico', 1, ARRAY['Z'])
      `
    ).rejects.toThrow();

    await expect(
      sql`
        INSERT INTO template_item (
          section_id, label, field_type, filled_by, sort_order, item_weight
        )
        VALUES (${section.id}, 'Bad weight', 'text', 'tecnico', 2, -1)
      `
    ).rejects.toThrow();
  });

  it('options jsonb shapes per field_type', async () => {
    const [template] = await sql<{ id: string }[]>`
      INSERT INTO template (code, name, version, status)
      VALUES ('json-shapes', 'JSON', 'v0', 'draft')
      RETURNING id
    `;
    const [section] = await sql<{ id: string }[]>`
      INSERT INTO section (template_id, code, title, weight, sort_order)
      VALUES (${template.id}, 'J1', 'JSON', 'bajo', 1)
      RETURNING id
    `;

    await sql`
      INSERT INTO template_item (
        section_id, label, field_type, filled_by, sort_order, options
      )
      VALUES (
        ${section.id},
        'Select item',
        'select',
        'tecnico',
        1,
        ${sql.json({
          choices: ['A', 'B'],
          score_map: { A: 100, B: 0 }
        })}
      )
    `;

    const [row] = await sql<{ options: Record<string, unknown> }[]>`
      SELECT options FROM template_item WHERE section_id = ${section.id} LIMIT 1
    `;
    expect(row.options.choices).toEqual(['A', 'B']);
    expect(row.options.score_map).toEqual({ A: 100, B: 0 });
  });

  it('audit table has combo fields and unique public_token', async () => {
    const cols = await columnNames(sql, 'audit');
    expect(cols).toEqual(
      expect.arrayContaining([
        'types',
        'template_ids',
        'segment',
        'public_token',
        'assigned_tech_id',
        'created_by',
        'scheduled_at',
        'closed_at'
      ])
    );
    expect(cols).not.toContain('token_expires_at');

    const auditIndexes = await indexNames(sql, 'audit');
    expect(auditIndexes.some((i) => i.includes('public_token'))).toBe(true);
  });

  it('closure and section score columns match spec', async () => {
    const closureCols = await columnNames(sql, 'audit_closure');
    expect(closureCols).toEqual(
      expect.arrayContaining([
        'audit_id',
        'indice_it',
        'indice_erp',
        'top_risks',
        'quick_wins',
        'upsell_findings',
        'next_step',
        'closed_by',
        'closed_at'
      ])
    );
    expect(closureCols).not.toContain('indice_global');

    const scoreCols = await columnNames(sql, 'audit_section_score');
    expect(scoreCols).toEqual(
      expect.arrayContaining(['score', 'score_breakdown', 'observations'])
    );
  });

  it('creates required performance indexes', async () => {
    const auditIndexes = await indexNames(sql, 'audit');
    expect(auditIndexes).toContain('audit_status_idx');
    expect(auditIndexes).toContain('audit_client_id_idx');

    const responseIndexes = await indexNames(sql, 'audit_response');
    expect(responseIndexes).toContain('audit_response_audit_id_idx');
  });

  it('attachment r2_key is unique', async () => {
    const indexes = await indexNames(sql, 'attachment');
    expect(indexes.some((i) => i.includes('r2_key'))).toBe(true);
  });
});
