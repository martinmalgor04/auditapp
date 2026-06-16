import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { setSqlForTests } from '../src/lib/server/db/client';
import { columnNames, indexNames, setupTestDb, teardownTestDb } from './helpers/db';

/**
 * #23 Fase 1 — esquema de `empresa` tras la migración 015 (ya aplicada en global setup).
 * Cubre R1 (datos maestros), R2 (CHECK relacion), R3 (referente), R4 (prospecto),
 * R5 (estado_override nullable + CHECK estado).
 */
describe('empresa schema (#23 Fase 1 — R1..R5)', () => {
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

  it('R1: empresa existe como tabla base con los datos maestros unificados', async () => {
    const [row] = await sql<{ relkind: string }[]>`
      SELECT relkind FROM pg_class WHERE relname = 'empresa'
    `;
    expect(row?.relkind).toBe('r');

    const cols = await columnNames(sql, 'empresa');
    const maestros = [
      'id', 'razon_social', 'cuit', 'rubro', 'empleados', 'puestos', 'sedes',
      'direccion', 'cp', 'provincia', 'telefono', 'email',
      'erp_actual', 'proveedor_correo', 'soporte_it_actual',
      'created_at', 'updated_at'
    ];
    for (const c of maestros) {
      expect(cols, `falta columna maestra ${c}`).toContain(c);
    }
  });

  it('R1: razon_social es NOT NULL', async () => {
    const [row] = await sql<{ is_nullable: string }[]>`
      SELECT is_nullable FROM information_schema.columns
      WHERE table_name = 'empresa' AND column_name = 'razon_social'
    `;
    expect(row.is_nullable).toBe('NO');
  });

  it('R2: relacion existe, NOT NULL y con CHECK cliente|prospecto|ex_cliente', async () => {
    const [col] = await sql<{ data_type: string; is_nullable: string }[]>`
      SELECT data_type, is_nullable FROM information_schema.columns
      WHERE table_name = 'empresa' AND column_name = 'relacion'
    `;
    expect(col.data_type).toBe('text');
    expect(col.is_nullable).toBe('NO');

    // El CHECK acepta los tres valores válidos.
    for (const value of ['cliente', 'prospecto', 'ex_cliente']) {
      const [r] = await sql<{ id: string }[]>`
        INSERT INTO empresa (razon_social, relacion)
        VALUES (${'Rel ' + value}, ${value}) RETURNING id
      `;
      await sql`DELETE FROM empresa WHERE id = ${r.id}`;
    }

    // Y rechaza un valor fuera del enum (violación de CHECK → 23514).
    await expect(
      sql`INSERT INTO empresa (razon_social, relacion) VALUES ('Rel mala', 'socio')`
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('R3: campos de referente preservados', async () => {
    const cols = await columnNames(sql, 'empresa');
    for (const c of ['referente_nombre', 'referente_cargo', 'referente_contacto']) {
      expect(cols).toContain(c);
    }
  });

  it('R4: campos de prospecto preservados', async () => {
    const cols = await columnNames(sql, 'empresa');
    for (const c of ['nivel_interes', 'tiene_software', 'observaciones', 'fuente', 'pagina', 'relevado_at']) {
      expect(cols).toContain(c);
    }
  });

  it('R5: estado_override es nullable con CHECK contra el enum de estados', async () => {
    const [col] = await sql<{ is_nullable: string }[]>`
      SELECT is_nullable FROM information_schema.columns
      WHERE table_name = 'empresa' AND column_name = 'estado_override'
    `;
    expect(col.is_nullable).toBe('YES');

    // NULL permitido.
    const [a] = await sql<{ id: string }[]>`
      INSERT INTO empresa (razon_social, relacion, estado_override)
      VALUES ('Ovr null', 'prospecto', NULL) RETURNING id
    `;
    await sql`DELETE FROM empresa WHERE id = ${a.id}`;

    // Un estado válido permitido.
    const [b] = await sql<{ id: string }[]>`
      INSERT INTO empresa (razon_social, relacion, estado_override)
      VALUES ('Ovr valido', 'cliente', 'inactiva') RETURNING id
    `;
    await sql`DELETE FROM empresa WHERE id = ${b.id}`;

    // Un estado inválido rechazado (CHECK → 23514).
    await expect(
      sql`INSERT INTO empresa (razon_social, relacion, estado_override)
          VALUES ('Ovr malo', 'cliente', 'congelada')`
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('R6/R17: índices de relacion, razón social y CUIT único presentes', async () => {
    const idx = await indexNames(sql, 'empresa');
    expect(idx).toContain('empresa_cuit_unique');
    expect(idx).toContain('empresa_relacion_idx');
    expect(idx).toContain('empresa_razon_social_lower_idx');
  });
});
