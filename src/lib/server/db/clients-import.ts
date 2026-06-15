import { getSql } from './client';
import type { ImportPlan, RowError } from '$lib/server/clients/import';

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
 * actualiza, nuevo se crea con origen='presupuestos' sin pisar origen en update (R11).
 */
export async function applyClientImport(plan: ImportPlan): Promise<ImportResult> {
  const sql = getSql();
  let created = 0;
  let updated = 0;

  await sql.begin(async (tx) => {
    for (const row of plan.valid) {
      const result = await tx<{ inserted: boolean }[]>`
        INSERT INTO client (
          razon_social, cuit, direccion, cp, provincia, telefono, email, origen
        )
        VALUES (
          ${row.razon_social},
          ${row.cuit},
          ${row.direccion},
          ${row.cp},
          ${row.provincia},
          ${row.telefono},
          ${row.email},
          'presupuestos'
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
