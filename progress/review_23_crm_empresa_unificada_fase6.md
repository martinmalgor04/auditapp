# Review — #23 `23_crm_empresa_unificada` — Fase 6 + cierre de feature (2026-06-16)

## Veredictos
- **Fase 6: APROBADO** (deprecación documentada SIN drop).
- **Cierre #23 (6 fases): APROBADO — feature lista para `done`.**

## Verificación independiente reproducida
- `pnpm run check` → **0 errores** (31 warnings pre-existentes `state_referenced_locally`).
- `pnpm run build` → **OK** (adapter-node).
- `pnpm test` (suite sola, sin init.sh concurrente) → **870 passed / 2 skipped / 0 failed** (180 files).
- Docker `db-db-1` healthy. El OOM/exit 137 reportado fue por correr suite + init.sh concurrentes, NO regresión.

## Puntos críticos Fase 6
1. **CERO DROP — confirmado.** `grep DROP (TABLE|VIEW|MATERIALIZED)` sobre las 17 migraciones → 0 hits. Los 5 objetos vivos en DB: `client` (v), `crm_lead` (r), `crm_lead_event` (r), `empresa` (r), `empresa_evento` (r).
2. **Migración 017 — correcta.** Solo 3 `COMMENT ON` (2 tablas + 1 vista), registrada en `schema_migration`, idempotente. NO REVOKE: el rol `auditapp` es owner (REVOKE sería no-op) y la vista `client` aún recibe escrituras del seed legacy. Decisión razonable y justificada en el .sql.
3. **`crm-leads.ts` + state-machine de leads conservados** — confirmado, sin reescribir.
4. **`cleanup-manual.md` accionable** — qué dropear, orden por FK (`crm_lead_event`→`crm_lead`→vista `client`), precondición (cero lectores legacy + backup), verificación post-drop.

## Trazabilidad R1–R32 — completa
Mapa R↔test en `progress/impl_23_crm_empresa_unificada.md`. Spot-checks abiertos y confirmados: R13 (paridad SQL↔TS), R24 (import a `empresa`), R28 (mercado joins a `empresa`), R30 (vista `client` legible). Los 32 requirements trazados a un test concreto verde. Acceptance #23 (11 criterios) cumplido. Tareas T1–T28 todas `[x]` y reales.

## Hallazgos
- Bloqueantes / Alta / Media: **ninguno**.
- Menor (cosmético): nota en doc dice "schema_migration.name" — la columna real es `version`; el registro existe y es correcto.

## Follow-ups abiertos al cerrar (PRE-EXISTENTES, ajenos a #23, NO bloquean)
1. Flakiness de entorno: DB compartida + tests en paralelo (truncate race en `canonical-contract`/`audits-create`) y OOM (exit 137) si se corren suite + init.sh concurrentes. Recomendación: serializar o aislar la DB del gate.
2. Selector brittle `nav a[href="/mercado"]` (strict-mode, 2 elementos por nav duplicado) en `e2e/mercado.spec.ts` — el dashboard renderiza, solo el selector del spec falla.
3. `isRedirect` en `failFromError` (alta de auditoría loguea `action_unhandled_error` espurio; la navegación funciona).
4. Badge de estado en la ficha no recomputa en el acto tras registrar un evento (sí tras override); correcto al recargar. Mejora UI menor.
5. Limpieza física futura de `crm_lead`/`crm_lead_event`/vista `client` — feature dedicada según `cleanup-manual.md`, tras confirmar cero lectores legacy.

## Cierre
Leader marcó #23 → `done` en `feature_list.json` tras este APROBADO. Sin commit/push (decisión de Martín). Queda solo #12 `reunion_asistente` en `in_progress` (parqueado a propósito).
