import { getSql } from './client';
import type { ImportPlan, RowError } from '$lib/server/clients/import';
import type { EmpresaImportRelacion } from '$lib/server/crm/schemas';

export type ImportResult = {
  total: number;
  created: number;
  updated: number;
  skipped: RowError[]; // categoría separada de invalid (R13)
  invalid: RowError[];
  ignoredColumns: string[]; // R5.ter — informado en el reporte
};

/**
 * Aplica el plan en una única transacción (R12). Upsert por CUIT (R10): existente se
 * actualiza, nuevo se crea sin pisar origen en update (R11).
 *
 * #23 Fase 2 (T6, R24/R25): escribe sobre la tabla base `empresa` (no la vista `client`). La vista
 * no soporta la columna de sistema `xmax` (RETURNING (xmax = 0)) ni el ON CONFLICT contra el índice
 * único de la tabla base. La `relacion` se recibe como **parámetro** desde el selector de la UI (no
 * se infiere por origen): toda empresa NUEVA toma esa `relacion`; en el UPDATE de una existente NO
 * se pisa su `relacion` (decisión: el upsert actualiza datos maestros, no reclasifica empresas ya
 * registradas). El `origen` físico del importador en vivo sigue siendo 'presupuestos' (etiqueta de
 * carga, distinta de `relacion`, que es la decisión humana del selector — R25/R32).
 */
export async function applyClientImport(
  plan: ImportPlan,
  relacion: EmpresaImportRelacion
): Promise<ImportResult> {
  const sql = getSql();
  let created = 0;
  let updated = 0;

  await sql.begin(async (tx) => {
    for (const row of plan.valid) {
      const result = await tx<{ inserted: boolean }[]>`
        INSERT INTO empresa (
          razon_social, cuit, direccion, cp, provincia, telefono, email, origen, relacion
        )
        VALUES (
          ${row.razon_social},
          ${row.cuit},
          ${row.direccion},
          ${row.cp},
          ${row.provincia},
          ${row.telefono},
          ${row.email},
          'presupuestos',
          ${relacion}
        )
        ON CONFLICT (cuit) WHERE cuit IS NOT NULL DO UPDATE SET
          razon_social = EXCLUDED.razon_social,
          direccion    = EXCLUDED.direccion,
          cp           = EXCLUDED.cp,
          provincia    = EXCLUDED.provincia,
          telefono     = EXCLUDED.telefono,
          email        = EXCLUDED.email,
          updated_at   = now()
        RETURNING (xmax = 0) AS inserted
      `;
      if (result[0]?.inserted) {
        created += 1;
      } else {
        updated += 1;
      }
    }
  });

  return {
    total: plan.total,
    created,
    updated,
    skipped: plan.skipped,
    invalid: plan.invalid,
    ignoredColumns: plan.ignoredColumns
  };
}
