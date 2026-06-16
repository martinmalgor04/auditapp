import type { EmpresaEstado, EmpresaRelacion } from './schemas';

/**
 * #23 Fase 5 (R13, R14, R15) — Derivación del estado híbrido de una empresa.
 *
 * Esta es la **única fuente de verdad en TypeScript** de las reglas de auto-derivación del estado de
 * seguimiento (design §3). El listado del cockpit deriva el mismo estado en SQL (CTE `est` en
 * `src/lib/server/db/empresa.ts`) por razones de performance (filtrado/orden server-side sin N+1);
 * ambos caminos DEBEN coincidir exactamente.
 *
 * POLÍTICA DE RECONCILIACIÓN (mandato del reviewer de Fase 4):
 *   - Todo cambio en estas reglas se aplica acá (TS) **y** en el `CASE` SQL de `estadoSelectSql`
 *     en el mismo cambio.
 *   - `ACTIVITY_WINDOW_MONTHS` se define UNA sola vez (acá) y se importa desde `empresa.ts` para que
 *     el intervalo SQL use la misma constante.
 *   - `tests/empresa-estado.test.ts` incluye un test de **paridad SQL↔TS**: para un set de inputs,
 *     `deriveEmpresaEstado` (TS) y el `CASE` SQL devuelven el mismo `EmpresaEstado`.
 */

/**
 * Ventana de actividad para clientes: un cliente con actividad en los últimos N meses se considera
 * `activa`; si no, `inactiva`. N = 18 meses (decisión humana 2026-06-16 #9; alinea con
 * `tango_venc_escala`). Constante ÚNICA, importada también por el SQL builder de `empresa.ts`.
 */
export const ACTIVITY_WINDOW_MONTHS = 18;

export type { EmpresaEstado } from './schemas';

export type EstadoInputs = {
  relacion: EmpresaRelacion;
  /** empresa_evento de tipo llamada/reunion/nota. */
  hasContactEvent: boolean;
  /** audit no cerrada (status <> 'cerrada') y no archivada. */
  hasOpenAudit: boolean;
  /** audit con status 'cerrada' y no archivada. */
  hasClosedAudit: boolean;
  /** audit_proposal_link 'activo' de alguna audit de la empresa (#16). */
  hasPresupuesto: boolean;
  /** máx(audit.created_at, evento.created_at) de la empresa. */
  lastActivityAt: Date | null;
};

/**
 * R14: cliente con actividad dentro de la ventana → `activa`; si no → `inactiva`.
 * `now` es inyectable para tests deterministas (default = ahora).
 */
export function withinActivityWindow(lastActivityAt: Date | null, now: Date = new Date()): boolean {
  if (!lastActivityAt) {
    return false;
  }
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - ACTIVITY_WINDOW_MONTHS);
  return lastActivityAt.getTime() > cutoff.getTime();
}

/**
 * R13/R14: reglas determinísticas de auto-derivación. Prioridad de mayor avance hacia atrás.
 * Debe coincidir EXACTAMENTE con el `CASE` de `estadoSelectSql` (sin el ramo del override, que se
 * resuelve en `effectiveEstado` / antes del CASE en SQL).
 */
export function deriveEmpresaEstado(i: EstadoInputs, now: Date = new Date()): EmpresaEstado {
  if (i.relacion === 'ex_cliente') {
    return 'inactiva';
  }
  if (i.hasPresupuesto) {
    return 'presupuestada';
  }
  if (i.hasClosedAudit) {
    return 'auditada';
  }
  if (i.hasOpenAudit) {
    return 'auditoria_en_curso';
  }
  if (i.relacion === 'cliente') {
    return withinActivityWindow(i.lastActivityAt, now) ? 'activa' : 'inactiva';
  }
  if (i.hasContactEvent) {
    return 'contactada';
  }
  return 'sin_contactar';
}

/**
 * R15: el override manual gana cuando está seteado; si es `null`, se expone el estado auto-derivado.
 */
export function effectiveEstado(
  override: EmpresaEstado | null,
  inputs: EstadoInputs,
  now: Date = new Date()
): { value: EmpresaEstado; source: 'override' | 'derived' } {
  return override
    ? { value: override, source: 'override' }
    : { value: deriveEmpresaEstado(inputs, now), source: 'derived' };
}
