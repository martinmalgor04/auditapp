import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { setSqlForTests } from '../src/lib/server/db/client';
import { applyClientImport } from '../src/lib/server/db/clients-import';
import { planClientImport } from '../src/lib/server/clients/import';
import { parseCsv } from '../src/lib/server/clients/parse';
import { setupTestDb, teardownTestDb } from './helpers/db';

function planFromCsv(csv: string) {
  const rows = parseCsv(csv);
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  return planClientImport(rows, headers);
}

describe('clients import upsert (R10, R11, R12, R15, R16)', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(async () => {
    setSqlForTests(sql);
    // CUITs de prueba aislados del seed.
    await sql`DELETE FROM client WHERE cuit IN ('30700000001', '30700000002', '30700000003')`;
  });

  afterAll(async () => {
    await sql`DELETE FROM client WHERE cuit IN ('30700000001', '30700000002', '30700000003')`;
    await teardownTestDb();
  });

  async function getClient(cuit: string) {
    const [row] = await sql<
      { razon_social: string; cuit: string; origen: string; email: string | null }[]
    >`SELECT razon_social, cuit, origen, email FROM client WHERE cuit = ${cuit}`;
    return row ?? null;
  }

  it('CUIT nuevo crea con origen=presupuestos; existente actualiza sin pisar origen (R10, R11)', async () => {
    // Pre-existe un cliente con ese CUIT y origen='tango'.
    await sql`
      INSERT INTO client (razon_social, cuit, origen, email)
      VALUES ('Viejo Nombre', '30700000001', 'tango', 'viejo@x.com')
    `;

    const plan = planFromCsv(
      'razon_social,cuit,email\n' +
        'Nuevo Nombre,30-70000000-1,nuevo@x.com\n' + // existe -> update
        'Recién SA,30-70000000-2,recien@x.com\n' // nuevo -> insert
    );
    const result = await applyClientImport(plan);

    expect(result.created).toBe(1);
    expect(result.updated).toBe(1);

    const updated = await getClient('30700000001');
    expect(updated?.razon_social).toBe('Nuevo Nombre');
    expect(updated?.email).toBe('nuevo@x.com');
    expect(updated?.origen).toBe('tango'); // NO se pisa (R11)

    const inserted = await getClient('30700000002');
    expect(inserted?.razon_social).toBe('Recién SA');
    expect(inserted?.origen).toBe('presupuestos'); // R11
  });

  it('reimport del mismo set no crea duplicados (R15)', async () => {
    const csv = 'razon_social,cuit\nIdem SA,30-70000000-1\n';
    const r1 = await applyClientImport(planFromCsv(csv));
    expect(r1.created).toBe(1);
    expect(r1.updated).toBe(0);

    const r2 = await applyClientImport(planFromCsv(csv));
    expect(r2.created).toBe(0);
    expect(r2.updated).toBe(1);

    const [count] = await sql<{ c: string }[]>`
      SELECT count(*)::text AS c FROM client WHERE cuit = '30700000001'
    `;
    expect(Number(count.c)).toBe(1);
  });

  it('dos filas con el mismo CUIT en el archivo -> 1 cliente, última gana (R16)', async () => {
    const plan = planFromCsv(
      'razon_social,cuit\n' +
        'Primera SA,30-70000000-1\n' +
        'Segunda SA,30-70000000-1\n'
    );
    expect(plan.valid).toHaveLength(1);
    const result = await applyClientImport(plan);
    expect(result.created).toBe(1);

    const row = await getClient('30700000001');
    expect(row?.razon_social).toBe('Segunda SA');

    const [count] = await sql<{ c: string }[]>`
      SELECT count(*)::text AS c FROM client WHERE cuit = '30700000001'
    `;
    expect(Number(count.c)).toBe(1);
  });

  it('error a mitad de la transacción revierte todo (R12)', async () => {
    const [before] = await sql<{ c: string }[]>`SELECT count(*)::text AS c FROM client`;

    // Plan con una fila válida y luego una razon_social que excede ningún límite — forzamos
    // el fallo inyectando un plan con cuit demasiado largo para la columna no hay; en su lugar
    // simulamos un valor que viole el índice único en mitad de la transacción.
    // Estrategia: insertamos primero una fila con CUIT que luego repetimos vía SQL crudo dentro
    // del mismo lote NO es posible (dedupe). Forzamos el error con un cuit que ya existe pero
    // bajo un nombre que viole NOT NULL razon_social no aplica. Usamos un override del plan.
    const badPlan = {
      total: 2,
      valid: [
        { razon_social: 'OK SA', cuit: '30700000002', direccion: null, cp: null, provincia: null, telefono: null, email: null },
        // segunda fila con razon_social null fuerza violación NOT NULL -> rollback
        { razon_social: null as unknown as string, cuit: '30700000003', direccion: null, cp: null, provincia: null, telefono: null, email: null }
      ],
      skipped: [],
      invalid: [],
      ignoredColumns: []
    };

    await expect(applyClientImport(badPlan)).rejects.toBeTruthy();

    const [after] = await sql<{ c: string }[]>`SELECT count(*)::text AS c FROM client`;
    expect(Number(after.c)).toBe(Number(before.c)); // sin cambios: rollback total
    expect(await getClient('30700000002')).toBeNull();
    expect(await getClient('30700000003')).toBeNull();
  });
});
