import type postgres from 'postgres';
import { resolveUniqueCodigoDb } from '../../src/lib/server/db/seed/clients';

type InsertTestEmpresaOpts = {
  razonSocial: string;
  id?: string;
  cuit?: string | null;
  origen?: string;
  relacion?: 'cliente' | 'prospecto' | 'ex_cliente';
};

/** Inserta empresa de test con codigo obligatorio (#41). */
export async function insertTestEmpresa(
  sql: postgres.Sql,
  opts: InsertTestEmpresaOpts
): Promise<string> {
  const codigo = await resolveUniqueCodigoDb(sql, opts.razonSocial, opts.id);
  const origen = opts.origen ?? 'presupuestos';
  const relacion = opts.relacion ?? 'cliente';

  if (opts.id) {
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO empresa (id, razon_social, cuit, origen, relacion, codigo)
      VALUES (
        ${opts.id}::uuid,
        ${opts.razonSocial},
        ${opts.cuit ?? null},
        ${origen},
        ${relacion},
        ${codigo}
      )
      RETURNING id
    `;
    return row.id;
  }

  const [row] = await sql<{ id: string }[]>`
    INSERT INTO empresa (razon_social, cuit, origen, relacion, codigo)
    VALUES (${opts.razonSocial}, ${opts.cuit ?? null}, ${origen}, ${relacion}, ${codigo})
    RETURNING id
  `;
  return row.id;
}
