# Review — feature #23 23_crm_empresa_unificada · Fase 5

**Veredicto:** APPROVED

Revisión de la **Fase 5** (T20–T25 + Gate). Estado híbrido, eventos/timeline, crear auditoría desde
ficha, export CSV. Verificación independiente reproducida en esta sesión (check 0 err, build OK, slice
Fase 5 47/47, suite completa 870/0). Foco en los dos mandatos críticos: reconciliación SQL↔TS y el fix
de los 17 tests rojos de #23.

## Trazabilidad R ↔ test (Fase 5)
- R13: [x] `tests/empresa-estado.test.ts` (reglas determinísticas `deriveEmpresaEstado`) + paridad SQL↔TS
- R14: [x] `tests/empresa-estado.test.ts` (activa/inactiva ventana 18m, `withinActivityWindow` borde, ex_cliente) + paridad
- R15: [x] `tests/empresa-estado.test.ts` (`effectiveEstado` override gana) + `api/empresa-eventos.test.ts` + paridad
- R20: [x] `e2e/crm-ficha.spec.ts` (estado efectivo + origen `ficha-estado-source`; timeline `ficha-timeline-list`)
- R21: [x] `e2e/crm-ficha.spec.ts` (crear auditoría desde ficha; FK a empresa existente, no duplica)
- R22: [x] `api/empresa-eventos.test.ts` (addEvento/listEventos tipo/texto/autor/orden, 404, endpoint GET/POST + Zod + guards) + e2e
- R23: [x] `api/empresa-eventos.test.ts` (setEstadoOverride genera `cambio_estado` from/to; clear→derivado; endpoint Zod/404/guards) + e2e
- R26: [x] `api/empresas-export.test.ts` (CSV filtrado relacion/estado/búsqueda, headers, BOM, sin paginar, guard)

Cada R de Fase 5 con cobertura real (vitest + e2e). El timeline diferido de R20 en Fase 4 queda cerrado acá.

## Tasks
- T20: [x] `empresa-estado.ts` (`deriveEmpresaEstado`/`effectiveEstado`/`withinActivityWindow`, `ACTIVITY_WINDOW_MONTHS=18` única) + `getEstadoInputs`/`deriveEstadoForEmpresa` sin N+1. Verificado.
- T21: [x] `addEvento`/`listEventos`/`setEstadoOverride` (tx atómico, from/to correctos) + `empresaEventoSchema`/`empresaOverrideSchema` + endpoints `[id]/eventos` y `[id]/override`. Verificado.
- T22: [x] Ficha: banner estado+origen, timeline, form evento, set/clear override. Testids presentes. Verificado.
- T23: [x] "Crear auditoría" desde ficha → `/auditorias/new?empresaId=<id>`; precarga CAB, vincula empresa EXISTENTE. Verificado en código (createAudit no entra a la rama `newClient`). 
- T24: [x] `GET /api/crm/empresas/export` + `listEmpresasForExport` (mismos predicados que `listEmpresas`, sin LIMIT/OFFSET) + `empresa-csv.ts` (RFC 4180, `\r\n`, BOM). Verificado.
- T25: [x] `empresa-estado` 23/23, `empresa-eventos` 17/17, `empresas-export` 7/7, `e2e/crm-ficha` 4/4. Reproducido 47/47 en la slice no-e2e.
- Gate Fase 5: [x] check 0 err, build OK, suite 870/2/0. Reproducido.

Ninguna `[ ]` sin justificar en Fase 5. T26–T28 son Fase 6 (fuera de alcance de esta review).

## Checkpoints / verificación independiente (reproducida esta sesión)
- C-check: [x] `pnpm run check` → **0 errores**, 31 warnings pre-existentes (`state_referenced_locally`).
- C-build: [x] `pnpm run build` → **OK** (adapter-node).
- C-slice: [x] `empresa-estado` + `empresa-eventos` + `empresas-export` = **47/47** (3 files passed).
- C-full: [x] `pnpm exec vitest run` → **180 files, 870 passed / 2 skipped / 0 failed**. Sin flakiness
  en esta corrida (canonical-contract/audits-create pasaron). Las líneas `informe pipeline failed` del
  log son error-paths ASERTADOS por los tests de informe, NO failures.
- C-init.sh §3: [x] **FAIL por ">1 in_progress"** (2: #12, #23) — condición conocida/aceptada (decisión
  leader), NO es rechazo.
- C-arnés: [x] `feature_list.json` SIN tocar (no aparece en `git status`); sin commit/push (HEAD = 0b4eaf2).

## Veredicto sobre los puntos críticos

1. **Reconciliación SQL↔TS (mandato del reviewer de Fase 4) — RESUELTO.**
   - (a) **Test de paridad real:** `tests/empresa-estado.test.ts` suite "paridad SQL↔TS" inserta empresas
     reales con audits/presupuesto/eventos y compara `getEmpresaById` (CASE SQL) contra
     `deriveEmpresaEstado(getEstadoInputs)` (TS) para los 7 estados + ramas activa/inactiva (18m) +
     ex_cliente + override (source=override). `assertParity` compara estado y source. **Pasa (23/23).**
   - (b) **Constante única:** `ACTIVITY_WINDOW_MONTHS=18` se define UNA sola vez en `empresa-estado.ts:25`
     y la importa `empresa.ts` (`import { ACTIVITY_WINDOW_MONTHS } from '...empresa-estado'`),
     interpolada en el intervalo SQL (`empresa.ts:151`: `now() - (${ACTIVITY_WINDOW_MONTHS} || ' months')::interval`).
     El test la importa del mismo módulo. **NO hay hardcode duplicado.**
   - (c) **Política de cambio dual documentada** en el encabezado de `empresa-estado.ts` (líneas 11-17):
     todo cambio de regla se aplica en TS y en el CASE SQL en el mismo cambio; el test de paridad es la red.
   - Inspección directa: el `CASE` de `estadoSelectSql` (empresa.ts:142-158) y el orden de `deriveEmpresaEstado`
     (empresa-estado.ts:62-80) coinciden rama por rama (override → ex_cliente → presupuestada → auditada →
     en_curso → cliente activa/inactiva → contactada → sin_contactar). `getEstadoInputs` (empresa.ts:573)
     reproduce los MISMOS agregados que `estadoSelectSql` (mismas subqueries `audit_proposal_link 'activo'`,
     `empresa_evento IN (llamada,reunion,nota)`, `archived_at IS NULL`, `max(audit.created_at)`).
     **NO quedan dos fuentes de verdad divergentes.** Deuda de Fase 4 saldada.

2. **Estado híbrido / override gana (R13/R14/R15/R22/R23) — CORRECTO.** `effectiveEstado` y el CASE SQL
   priorizan el override. `setEstadoOverride` (empresa.ts:721) es atómico (tx): fija/limpia
   `estado_override` y registra `cambio_estado` con `from_status` = estado efectivo previo y `to_status`
   = nuevo override (o el derivado recomputado al limpiar). El test `empresa-eventos` verifica from/to:
   fijar `presupuestada` → evento from=`sin_contactar`/to=`presupuestada`; limpiar `auditada` → evento
   from=`auditada`/to=`sin_contactar` (re-derivado). Limpiar vuelve a `source='derived'`. Verificado.

3. **Crear auditoría desde la ficha (R21) — CORRECTO, no duplica empresa.** El link
   `ficha-crear-auditoria` apunta a `/auditorias/new?empresaId=<id>`. El `load` precarga la empresa como
   `preselectedEmpresa` (modo existente del ClientPicker) vía `getEmpresaCabFields`. En `createAudit`, al
   no haber `data.newClient`, NO se ejecuta el `INSERT INTO empresa` (audits.ts:248); `clientId` queda en
   la empresa existente y `audit.empresa_id = ${clientId}` (audits.ts:302). FK a la empresa existente, sin
   crear una nueva. Verificado en código + e2e (`audit.empresa_id` = la empresa, sin empresa nueva).

4. **Export CSV (R26) — CORRECTO.** `listEmpresasForExport` usa los MISMOS predicados de filtro que
   `listEmpresas` (relacion/estado efectivo/búsqueda ILIKE razón social+CUIT) sin LIMIT/OFFSET, ordenado
   por razón social. Endpoint guard `requireStaffApi` (staff). Headers: `text/csv; charset=utf-8`,
   `Content-Disposition: attachment; filename="empresas-AAAA-MM-DD.csv"`. BOM UTF-8 antepuesto (`﻿`,
   EF BB BF) para Excel. Tests verifican headers, BOM sobre el texto, respeto de cada filtro y guard 401/staff.

5. **Fix de los 17 tests rojos de #23 — CORRECTO, NO enmascara nada.** El INSERT a `audit_report` en
   `mkPresupuesto` usaba columnas inexistentes (`content`, `created_by`). Verifiqué el schema real
   (migr. 004): las columnas son `canonical_json jsonb NOT NULL`, `schema_version text NOT NULL`,
   `requested_by uuid NOT NULL`, y el CHECK `audit_report_approved_coherence` exige `approved_by`/
   `approved_at` cuando `status='aprobado'`. El INSERT corregido (test líneas 167-174) usa EXACTAMENTE
   esas columnas reales y satisface el CHECK. **No se "ablandó" el test:** sigue creando un
   `audit_proposal_link` con `status='activo'` sobre una audit no archivada de la empresa — la señal
   exacta de "presupuestada" que consulta `estadoSelectSql`/`getEstadoInputs`. El caso "presupuestada"
   sigue probando la lógica de estado correcta; el fix solo corrige el setup roto que lanzaba la
   `PostgresError` (los "17 failed" que veía #24). Era un bug del **test**, no del producto.

## Hallazgos por severidad
- **Bloqueantes:** ninguno.
- **Alta:** ninguna.
- **Media:** ninguna. (La deuda Media de Fase 4 —doble fuente de verdad SQL/TS— queda RESUELTA por T20.)
- **Baja:**
  - El badge de estado en la ficha no se recomputa client-side tras registrar un evento (sí tras override,
    que viene en la respuesta); se ve correcto al recargar (el `load` lo deriva en SQL). Declarado en impl,
    cosmético, fuera de R20-R23. El e2e lo cubre con `page.reload()`. No bloqueante.
  - `init.sh §3` FAIL por ">1 in_progress" — condición del harness, ajena a #23.

## Recomendación sobre avanzar a Fase 6
**AVANZAR.** Fase 5 está completa, verde y reconciliada. Los dos mandatos críticos (paridad SQL↔TS con
constante única + política documentada; fix legítimo de los 17 rojos) están satisfechos y verificados de
forma independiente. Para Fase 6 (deprecación documentada SIN drop):
1. `migrations/016_empresa_deprecacion.sql` debe usar solo `COMMENT ON` (y opcional REVOKE de escritura)
   sobre `crm_lead`/`crm_lead_event`/vista `client`; **CERO `DROP`** (decisión humana 8). Idempotente.
2. Documentar el procedimiento de limpieza manual posterior; NO borrar `crm-leads.ts` ni la state-machine
   de leads (quedan como referencia/rollback).
3. Cerrar el mapa R↔test completo (acceptance #11) y dejar la suite verde.

## Salida final
```
APPROVED -> progress/review_23_crm_empresa_unificada_fase5.md
```
