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

const TEST_CUITS = ['30700000001', '30700000002', '30700000003'];

describe('clients import upsert → empresa (R10, R11, R12, R15, R16, R24, R25, R31)', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(async () => {
    setSqlForTests(sql);
    // CUITs de prueba aislados del seed. #23 Fase 2: la escritura va a la tabla base `empresa`.
    await sql`DELETE FROM empresa WHERE cuit IN ${sql(TEST_CUITS)}`;
  });

  afterAll(async () => {
    await sql`DELETE FROM empresa WHERE cuit IN ${sql(TEST_CUITS)}`;
    await teardownTestDb();
  });

  // Lee de la tabla base `empresa` directamente (no de la vista de compat `client`): así se verifica
  // que el import escribe físicamente en `empresa` (R24) y qué `relacion` quedó (R25).
  async function getEmpresa(cuit: string) {
    const [row] = await sql<
      {
        razon_social: string;
        cuit: string;
        origen: string;
        email: string | null;
        relacion: string;
      }[]
    >`SELECT razon_social, cuit, origen, email, relacion FROM empresa WHERE cuit = ${cuit}`;
    return row ?? null;
  }

  it('escribe en la tabla base empresa, no deja huérfanos en `client` físico (R24)', async () => {
    // `client` es una VISTA sobre `empresa` (Fase 1). Confirmamos que la fila aparece por ambos
    // caminos porque la vista refleja la tabla base — no existe un `client` físico que el import
    // pueda tocar por separado.
    const plan = planFromCsv('razon_social,cuit\nEmpresa Base SA,30-70000000-1\n');
    await applyClientImport(plan, 'cliente');

    const [tabla] = await sql<{ relkind: string }[]>`
      SELECT relkind::text FROM pg_class WHERE relname = 'empresa'
    `;
    expect(tabla.relkind).toBe('r'); // empresa es tabla real
    const [vista] = await sql<{ relkind: string }[]>`
      SELECT relkind::text FROM pg_class WHERE relname = 'client'
    `;
    expect(vista.relkind).toBe('v'); // client es vista de compat (no se escribe físico aparte)

    const fromEmpresa = await getEmpresa('30700000001');
    expect(fromEmpresa?.razon_social).toBe('Empresa Base SA');
    const [fromView] = await sql<{ razon_social: string }[]>`
      SELECT razon_social FROM client WHERE cuit = '30700000001'
    `;
    expect(fromView.razon_social).toBe('Empresa Base SA');
  });

  it('empresa nueva toma la relacion del selector (cliente), no nula, no inferida por origen (R25, R31)', async () => {
    const plan = planFromCsv('razon_social,cuit\nCliente del Selector SA,30-70000000-1\n');
    await applyClientImport(plan, 'cliente');

    const row = await getEmpresa('30700000001');
    expect(row?.relacion).toBe('cliente'); // del selector, no inferido
    expect(row?.relacion).not.toBeNull();
    // El `origen` físico del importador en vivo sigue siendo 'presupuestos' (etiqueta de carga),
    // pero la `relacion` la decide el selector, independiente del origen.
    expect(row?.origen).toBe('presupuestos');
  });

  it('empresa nueva toma la relacion del selector (prospecto) (R25, R31)', async () => {
    const plan = planFromCsv('razon_social,cuit\nProspecto del Selector SA,30-70000000-2\n');
    await applyClientImport(plan, 'prospecto');

    const row = await getEmpresa('30700000002');
    expect(row?.relacion).toBe('prospecto'); // del selector
    expect(row?.origen).toBe('presupuestos'); // origen no determina relacion
  });

  it('CUIT nuevo crea; existente actualiza sin pisar origen (R10, R11)', async () => {
    // Pre-existe una empresa con ese CUIT y origen='tango', relacion='cliente'.
    await sql`
      INSERT INTO empresa (razon_social, cuit, origen, email, relacion)
      VALUES ('Viejo Nombre', '30700000001', 'tango', 'viejo@x.com', 'cliente')
    `;

    const plan = planFromCsv(
      'razon_social,cuit,email\n' +
        'Nuevo Nombre,30-70000000-1,nuevo@x.com\n' + // existe -> update
        'Recién SA,30-70000000-2,recien@x.com\n' // nuevo -> insert
    );
    const result = await applyClientImport(plan, 'cliente');

    expect(result.created).toBe(1);
    expect(result.updated).toBe(1);

    const updated = await getEmpresa('30700000001');
    expect(updated?.razon_social).toBe('Nuevo Nombre');
    expect(updated?.email).toBe('nuevo@x.com');
    expect(updated?.origen).toBe('tango'); // NO se pisa (R11)

    const inserted = await getEmpresa('30700000002');
    expect(inserted?.razon_social).toBe('Recién SA');
    expect(inserted?.origen).toBe('presupuestos'); // R11
    expect(inserted?.relacion).toBe('cliente'); // R25
  });

  it('reimport del mismo set no crea duplicados por CUIT (R12, R24)', async () => {
    const csv = 'razon_social,cuit\nIdem SA,30-70000000-1\n';
    const r1 = await applyClientImport(planFromCsv(csv), 'prospecto');
    expect(r1.created).toBe(1);
    expect(r1.updated).toBe(0);

    const r2 = await applyClientImport(planFromCsv(csv), 'prospecto');
    expect(r2.created).toBe(0);
    expect(r2.updated).toBe(1);

    const [count] = await sql<{ c: string }[]>`
      SELECT count(*)::text AS c FROM empresa WHERE cuit = '30700000001'
    `;
    expect(Number(count.c)).toBe(1);
  });

  it('dos filas con el mismo CUIT en el archivo -> 1 empresa, última gana (R16)', async () => {
    const plan = planFromCsv(
      'razon_social,cuit\n' + 'Primera SA,30-70000000-1\n' + 'Segunda SA,30-70000000-1\n'
    );
    expect(plan.valid).toHaveLength(1);
    const result = await applyClientImport(plan, 'cliente');
    expect(result.created).toBe(1);

    const row = await getEmpresa('30700000001');
    expect(row?.razon_social).toBe('Segunda SA');

    const [count] = await sql<{ c: string }[]>`
      SELECT count(*)::text AS c FROM empresa WHERE cuit = '30700000001'
    `;
    expect(Number(count.c)).toBe(1);
  });

  it('error a mitad de la transacción revierte todo (R12)', async () => {
    const [before] = await sql<{ c: string }[]>`SELECT count(*)::text AS c FROM empresa`;

    // Plan con una fila válida y una con razon_social null que viola NOT NULL -> rollback total.
    const badPlan = {
      total: 2,
      valid: [
        {
          razon_social: 'OK SA',
          cuit: '30700000002',
          direccion: null,
          cp: null,
          provincia: null,
          telefono: null,
          email: null
        },
        {
          razon_social: null as unknown as string,
          cuit: '30700000003',
          direccion: null,
          cp: null,
          provincia: null,
          telefono: null,
          email: null
        }
      ],
      skipped: [],
      invalid: [],
      ignoredColumns: []
    };

    await expect(applyClientImport(badPlan, 'cliente')).rejects.toBeTruthy();

    const [after] = await sql<{ c: string }[]>`SELECT count(*)::text AS c FROM empresa`;
    expect(Number(after.c)).toBe(Number(before.c)); // sin cambios: rollback total
    expect(await getEmpresa('30700000002')).toBeNull();
    expect(await getEmpresa('30700000003')).toBeNull();
  });
});
