# Tasks — #23 23_crm_empresa_unificada

> Rollout **faseado**. Feature grande y de alto riesgo (toca FK de `audit`, import, form de
> auditorías, mercado y CRM). Cada fase es **verificable de forma independiente** y deja el repo
> verde (`./init.sh`). La **vista de compatibilidad `client`** (Fase 1) permite reconectar módulos
> de a uno sin romper a los que aún no migraron. Cada tarea referencia `R<n>`.

---

## Fase 1 — Entidad `empresa` + migración con compatibilidad hacia atrás

> Objetivo: que `empresa` exista, contenga todo, preserve las FK de `audit`, y que **nada se
> rompa** porque la vista `client` sigue sirviendo a los lectores viejos.

- [x] T1 — Crear `migrations/015_empresa_unificada.sql` con los pasos 1–8 del design (rename
  client→empresa, columnas nuevas, backfill `relacion` de **carga histórica** determinístico por
  origen —presupuestos/tango→`cliente`, prospectos→`prospecto`—, fold de `crm_lead`, dedup por CUIT
  y por razón social normalizada, rename `audit.client_id`→`empresa_id`, `empresa_evento` + migrar
  historial, vista `client` de compatibilidad). Idempotente. Cubre: R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12, R30, R32.
  [VALIDADO — migración aplicada sobre datos reales; counts en progress/impl]
- [x] T2 — Añadir índices `empresa (relacion)` y `empresa (lower(razon_social))` en la misma
  migración. Cubre: R6, R17. [VALIDADO — `empresa_relacion_idx`, `empresa_razon_social_lower_idx` presentes]
- [x] T3 — `tests/empresa-schema.test.ts` — columnas, tipos, CHECK `relacion`, CHECK estado,
  `estado_override` nullable. Cubre: R1, R2, R3, R4, R5. [VERDE — 7/7]
- [x] T4 — `tests/empresa-migration.test.ts` — sin pérdida de filas, dedup por CUIT, dedup
  prospecto sin CUIT (match vs fila separada), 0 audits huérfanas, FK re-puntada, re-ejecución
  no-op (idempotencia). Cubre: R7, R8, R9, R10, R11, R12. [VERDE — 7/7, tras arreglar 2 bugs de test]
- [x] T5 — `tests/empresa-compat.test.ts` — la vista `client` devuelve las mismas filas que
  `empresa`; los lectores legacy (mercado, audits) siguen funcionando contra la vista. Cubre: R30.
  [VERDE — 4/4]
- [x] **Gate Fase 1:** migración aplicada, suite completa verde (787 passed / 2 skipped, 0 fail),
  `pnpm run check` 0 errores, `pnpm run build` OK. Los lectores viejos quedan intactos vía la vista
  `client` + reconexión puntual de 2 queries que la vista no soporta (xmax/ON CONFLICT en el import;
  dependencia funcional de PK en el GROUP BY del tablero) → reapuntadas a `empresa`. El riesgo de
  `clients-cuit-cleanup.test.ts` quedó RESUELTO (ver progress/impl). NOTA: `./init.sh` aún marca
  `[FAIL]` por dos causas **ajenas a #23**: (a) hay 3 features en `in_progress` (#12, #23, #24) y el
  gate exige máx. 1 — decisión humana/leader, no se toca `feature_list.json`; (b) flakiness
  pre-existente del harness de tests (DB compartida + archivos en paralelo) que ~1 de cada 3 corridas
  rompe un snapshot/estado distinto (visto en `canonical-contract`); en corridas aisladas y en ~2/3
  de las corridas full la suite es 100% verde.

## Fase 2 — Reconectar el importador #21 a `empresa` (con selector de relacion)

- [x] T6 — `src/lib/server/db/clients-import.ts`: `INSERT INTO empresa` (no `client`), upsert por
  CUIT, `relacion` **recibida como parámetro** (no inferida por origen). Ajustar `getSql` import si
  hace falta. Cubre: R24, R25. [VERDE — `applyClientImport(plan, relacion)`; INSERT incluye columna
  `relacion`; UPDATE no la pisa. Test: `clients-import-upsert` 7/7.]
- [x] T7 — Confirmar `src/lib/server/clients/{schema,import,normalize,parse}.ts` y el endpoint
  `src/routes/api/crm/clients/import/+server.ts` apuntan a la capa empresa; guard `requireAdminApi`
  intacto. El endpoint valida `relacion` (`cliente|prospecto`) con Zod (`empresaImportSchema`) y la
  pasa al lote. Cubre: R24, R29, R31. [VERDE — `empresaImportSchema` en `crm/schemas.ts`; endpoint
  400 si falta/inválida; guard intacto. Test: `api/clients-import` 6/6.]
- [x] T7b — UI de import masivo (`src/routes/(app)/crm/import` o el modal de import en CRM): agregar
  **selector explícito `relacion` (`cliente | prospecto`)** que aplica a todo el lote y se envía al
  endpoint. Cubre: R31. [VERDE — `<select data-testid="crm-import-relacion">` en el panel del CRM;
  `submitImport` envía `relacion`. Default `cliente`.]
- [x] T8 — `tests/clients-import-upsert.test.ts` — import escribe `empresa`, upsert por CUIT sin
  duplicados, empresa nueva toma la `relacion` del selector (no nula, no inferida por origen), no
  toca `client` físico. Cubre: R24, R25, R31. [VERDE — 7/7; asserts sobre tabla base `empresa`,
  `relkind` empresa='r'/client='v', relacion cliente y prospecto del selector.]
- [x] T8b — `e2e/crm-import.spec.ts` — el selector de relacion está en la UI; importar con
  `prospecto` deja las empresas nuevas como `prospecto`; con `cliente` las deja como `cliente`.
  Cubre: R31. [VERDE — 3/3 en chromium; verifica `empresa.relacion` en DB tras cada import.]
- [x] **Gate Fase 2:** import en vivo crea/actualiza en `empresa` con la relacion elegida en el
  selector; aparece en el CRM (tras Fase 4). [VERDE — `check` 0 errores, `build` OK, suite import+
  empresa 48/48, e2e import 5/5. Wart de Fase 1 (seed todo `prospecto`) resuelto en el import en vivo
  vía selector. Detalle en `progress/impl_23_crm_empresa_unificada.md`.]

## Fase 3 — Reconectar form de nueva auditoría y mercado a `empresa`

> Reemplaza las lecturas de la **vista** `client` por `empresa` directo en los caminos calientes.

- [x] T9 — `src/lib/server/backoffice/audits.ts`: `createAudit`, `searchClientsForPicker`,
  `getClientCabFields`, `syncClientFromCab`, `getAuditById` → `FROM empresa` / `INSERT INTO
  empresa`; `audit.empresa_id` en lugar de `client_id`. `createAudit` setea `relacion` al crear
  empresa nueva. Cubre: R27. [VERDE — 5 sitios reapuntados a `empresa`; empresa nueva del form
  clásico toma `relacion='prospecto'` (default conservador documentado). `audit.empresa_id` ya venía
  de Fase 1.]
- [x] T10 — `src/lib/server/mercado/queries.ts`: los ~10 `JOIN client c` → `JOIN empresa c`.
  Cubre: R28. [VERDE — 10/10 JOIN reapuntados a `empresa`; `mercado-aggregations` 10/10 sigue verde.]
- [x] T11 — Verificar `src/routes/(app)/auditorias/new/{+page.server.ts,+page.svelte}` y
  `cab-client-map.ts` (tipos `ClientCabFields` se alimentan de empresa, sin cambio de forma).
  Cubre: R21, R27. [VERDE — sin cambios necesarios: la ruta solo llama a `audits.ts`;
  `cab-client-map.ts` es lógica pura sobre `ClientCabFields` (sin SQL). Verificado por
  `audits-create` + e2e.]
- [x] T12 — `tests/audits-create.test.ts` + `e2e/auditorias-new.spec.ts` — picker/createAudit sobre
  empresa, FK válida, CAB precargado, sin regresión. Cubre: R27. [VERDE — `audits-create` 4/4 (picker
  relkind 'r', FK empresa, relacion='prospecto', sync); `e2e/auditorias-new` 1/1 chromium (crea
  empresa+FK verificada en DB, CAB precargado).]
- [x] T13 — `tests/mercado-queries.test.ts` — dashboard de mercado resuelve joins contra empresa.
  Cubre: R28. [VERDE — 2/2: universo cuenta empresa de la tabla base; el JOIN recupera datos maestros
  (erp_actual/rubro) desde `empresa`.]
- [x] **Gate Fase 3:** crear auditoría desde el form clásico funciona end-to-end contra `empresa`.
  [VERDE — `check` 0 errores, `build` OK, suite completa **797 passed / 2 skipped / 0 failed**,
  e2e `auditorias-new` 1/1. NOTA: `e2e/mercado.spec.ts` "admin ve dashboard" falla por un selector
  brittle PRE-EXISTENTE (`nav a[href="/mercado"]` → strict-mode 2 elementos por nav responsive
  duplicado), ajeno a Fase 3: el dashboard renderiza y las queries `empresa` ejecutan sin error
  (empty-state correcto en DB dev sin audits cerradas). No toqué layout/nav ni ese spec.]

## Fase 4 — Cockpit `/crm` (listado, ficha, edición)

- [x] T14 — `src/lib/server/db/empresa.ts`: `listEmpresas`, `countEmpresas`, `getEmpresaById`,
  `updateEmpresa`, `searchEmpresasForPicker`, `getEmpresaCabFields`. Cubre: R16, R17, R19.
  [VERDE — paginación server-side (LIMIT/OFFSET + COUNT); estado efectivo derivado en UNA query
  agregada (CTE `est` + LATERAL, sin N+1) replicando `deriveEmpresaEstado` (design §3) en SQL para
  filtrar/ordenar; ventana 18 meses. `updateEmpresa` usa `sql(obj, ...cols)` solo de claves
  presentes/definidas. Smoke real contra DB: 2322 empresas, filtros/picker OK.]
- [x] T15 — `src/lib/server/crm/schemas.ts`: `empresaListFiltersSchema`, `empresaUpdateSchema`;
  `EmpresaNotFoundError` en `errors.ts`. Cubre: R19, R29. [VERDE — `empresaListFiltersSchema`
  (relacion/estado/q/page/perPage coerce), `empresaUpdateSchema` `.strict()` (rechaza campos no
  editables; `estado_override` es Fase 5); `EmpresaNotFoundError` (code `EMPRESA_NOT_FOUND`).]
- [x] T16 — Reescribir `src/routes/(app)/crm/+page.server.ts` + `+page.svelte` como cockpit:
  filtros por relacion/estado, búsqueda, badges, paginación o virtualización para ~2000 filas.
  Guard `requireStaff`. Cubre: R16, R17, R18, R29. [VERDE — **paginación server-side** (50/pág,
  prev/next por URL); filtros relacion/estado/búsqueda; badges relacion+estado; **import masivo de
  Fase 2 integrado** (panel + selector `crm-import-relacion` intactos). Heading → "CRM — Empresas".]
- [x] T17 — `src/routes/(app)/crm/[id]/+page.{server.ts,svelte}`: ficha ver/editar datos maestros y
  `relacion`. `POST /api/crm/empresas/[id]` para update. Cubre: R19, R20. [VERDE — ficha con guard
  `requireStaff`, form ver/editar datos maestros + `relacion`, banner estado efectivo + origen
  (override/derivado, anticipa R20); endpoint `POST /api/crm/empresas/[id]` guard staff + Zod + 404.]
- [x] T18 — `tests/api/empresas-list.test.ts`, `tests/api/empresa-update.test.ts`,
  `tests/api/empresas-guards.test.ts`. Cubre: R17, R19, R29. [VERDE — 26/26 (list 10, update 11,
  guards 7 — incluye 1 bug real encontrado: postgres.js rechaza `undefined` en `sql(obj,...)`).]
- [x] T19 — `e2e/crm-cockpit.spec.ts` — filtros + paginación con dataset grande. Cubre: R16, R18.
  [VERDE — 6/6 chromium: pagina el dataset grande (>1 página, ≤50/pág), búsqueda, filtro relacion,
  filtro estado efectivo (ex_cliente→inactiva), abrir ficha, editar+persistir verificado en DB.]
- [x] **Gate Fase 4:** las empresas importadas (Fase 2) son visibles y editables en `/crm`.
  [VERDE — `check` 0 errores, `build` OK, suite completa **823 passed / 2 skipped / 0 failed**
  (177 files), e2e cockpit 6/6 + e2e import Fase 2 3/3 (regresión intacta, heading actualizado).
  `init.sh` paso de tests `[OK]`; el `[FAIL]` final es la condición conocida ">1 in_progress".
  Obsoleto `e2e/crm.spec.ts` (UI del cockpit de leads, ya inexistente) eliminado; la cobertura de
  leads API permanece en `tests/api/crm-leads.test.ts`.]

## Fase 5 — Estado híbrido, eventos/timeline, crear auditoría desde ficha, export

- [x] T20 — `src/lib/server/crm/empresa-estado.ts`: `deriveEmpresaEstado`, `effectiveEstado`,
  `withinActivityWindow`. Query agregada de inputs en `empresa.ts` (sin N+1). Cubre: R13, R14, R15.
  [VERDE — `ACTIVITY_WINDOW_MONTHS=18` **constante única** en `empresa-estado.ts`, importada por
  `empresa.ts` (SQL) y por el test; `getEstadoInputs`/`deriveEstadoForEmpresa` agregados sin N+1.]
- [x] T21 — `addEvento`, `listEventos`, `setEstadoOverride` en `empresa.ts` + `empresaEventoSchema`.
  Override genera evento `cambio_estado`. Cubre: R22, R23. [VERDE — `setEstadoOverride` atómico (tx):
  fija/limpia `estado_override` y registra `cambio_estado` con from/to; endpoints `[id]/eventos`
  (GET/POST) y `[id]/override` (POST) con Zod + 404 + guard staff.]
- [x] T22 — Ficha: mostrar estado efectivo + origen (override/derivado) y timeline; UI para
  registrar evento/nota y setear/limpiar override. Cubre: R20, R22, R23. [VERDE — banner estado
  efectivo + `ficha-estado-source`; timeline `ficha-timeline-list`; form evento + select/clear
  override; el override refresca el badge client-side desde la respuesta del endpoint.]
- [x] T23 — Acción "crear auditoría" desde la ficha: precarga CAB con `getEmpresaCabFields` +
  `cab-client-map`, vincula la auditoría a la empresa. Cubre: R21. [VERDE — link `ficha-crear-auditoria`
  → `/auditorias/new?empresaId=<id>`; el `load` precarga el `ClientPicker` con la empresa (modo
  existente) y la auditoría queda con `audit.empresa_id` = la empresa (no crea una nueva).]
- [x] T24 — `GET /api/crm/empresas/export`: CSV del listado filtrado. Cubre: R26. [VERDE —
  `listEmpresasForExport` (mismos predicados que `listEmpresas`, sin LIMIT/OFFSET) + `empresa-csv.ts`
  (RFC 4180, `\r\n`); BOM UTF-8; `Content-Disposition: attachment; filename="empresas-AAAA-MM-DD.csv"`;
  guard staff.]
- [x] T25 — `tests/empresa-estado.test.ts` (7 estados, reglas, override gana),
  `tests/api/empresa-eventos.test.ts`, `tests/api/empresas-export.test.ts`,
  `e2e/crm-ficha.spec.ts` (estado+timeline+crear auditoría). Cubre: R13, R14, R15, R20, R21, R22, R23, R26.
  [VERDE — `empresa-estado` **23/23** (7 estados + reglas §3 + override gana + **paridad SQL↔TS** vía
  `getEmpresaById` (CASE SQL) == `deriveEmpresaEstado(getEstadoInputs)`); `empresa-eventos` **17/17**
  (capa de datos + endpoints eventos/override + guards); `empresas-export` **7/7** (CSV filtrado +
  headers + BOM + guard); `e2e/crm-ficha` **4/4** chromium (estado+origen, evento→timeline,
  set/clear override, crear auditoría con FK a la empresa). Bug real arreglado en el test de paridad:
  el INSERT a `audit_report` usaba columnas inexistentes (`content`/`created_by`) → corregido a
  `canonical_json`/`schema_version`/`requested_by` + `approved_by/approved_at` (constraint
  `audit_report_approved_coherence`). Era la causa de los 17 "failed de #23" que veía #24.]
- [x] **Gate Fase 5:** ficha completa: estado híbrido, timeline, crear auditoría, export. [VERDE —
  `pnpm run check` **0 errores**, `pnpm run build` OK, suite Fase 5 (estado+eventos+export) **47/47**,
  e2e ficha **4/4**, `pnpm test` **870 passed / 2 skipped / 0 failed** (180 files) en corrida limpia.
  Flakiness pre-existente (DB compartida + archivos en paralelo): `canonical-contract` y
  ocasionalmente `audits-create`/`syncClientFromCab` rompen ~1 de cada 3 corridas full; ambos pasan
  100% en aislamiento y son **ajenos a Fase 5**. `init.sh` `[FAIL]` por (a) ">1 in_progress"
  (#12/#23/#24, condición conocida/aceptada) y (b) esa flakiness transitoria. NO toqué
  feature_list.json. NO commit/push.]

## Fase 6 — Deprecación documentada (SIN drop)

> Decisión humana (2026-06-16, decisión 8): `crm_lead`/`crm_lead_event` y la vista `client` **se
> mantienen como red de rollback/backup**. NO se dropean en #23. La limpieza física es una tarea
> manual futura, fuera del alcance de esta feature.

- [x] T26 — `migrations/017_empresa_deprecacion.sql` (la 016 ya existe — #24; se usó 017): marca
  `crm_lead`, `crm_lead_event` y la vista `client` como **legacy/solo lectura** vía `COMMENT ON`
  ("DEPRECADO #23, conservar para rollback, no escribir"). **CERO `DROP`, CERO `REVOKE`** —
  evaluado: el rol de la app (`auditapp`) es DUEÑO de los objetos y en Postgres el owner conserva
  acceso pese a REVOKE → revocar sería un no-op engañoso y la vista `client` aún recibe escrituras
  del seed legacy; por eso solo COMMENT (justificado en el encabezado de la migración). Idempotente
  (COMMENT reescribe sin error; body re-corrido 2× = no-op). Aplicada con el runner del repo
  (`pnpm db:migrate`), registrada en `schema_migration`. Cubre: R30 (cierre, sin drop). [VERDE]
- [x] T27 — Procedimiento de limpieza manual posterior documentado en
  `specs/23_crm_empresa_unificada/cleanup-manual.md` (qué dropear, **orden por FK**:
  `crm_lead_event` → `crm_lead` → vista `client`; precondición = ningún lector legacy en uso +
  backup + confirmación de rollback innecesario; código a borrar a futuro). NO se borró
  `src/lib/server/db/crm-leads.ts` ni `state-machine.ts`: quedan como referencia. Cubre:
  trazabilidad/limpieza (documentación). [VERDE]
- [x] T28 — Suite completa verde: migración, dedup, FK, auto-derivación, override, guards, import
  reconectado (con selector de relacion), e2e del cockpit. Mapa R↔test completo (R13–R32)
  actualizado en `progress/impl_23_crm_empresa_unificada.md`. `pnpm test` **870 passed / 2 skipped /
  0 failed** (180 files) en corrida limpia; e2e cockpit+ficha+import 13/13 + auditorias-new 1/1
  chromium. Cubre: R-all (cierre de trazabilidad, acceptance #11). [VERDE]
- [x] **Gate Fase 6:** `pnpm run check` **0 errores** (31 warnings pre-existentes), `pnpm run build`
  **OK**, `pnpm test` **870/2/0** verde (corrida dedicada). **Ningún `DROP` de tablas/vista legacy en
  ninguna migración** (verificado por grep sobre `migrations/`). `./init.sh` → `[FAIL]` SOLO por (a)
  ">1 in_progress" (#12/#23/#24, condición conocida/aceptada por Martín — no se toca
  `feature_list.json`) y (b) la flakiness pre-existente de DB compartida + paralelo (truncate race;
  `pnpm test` aislado pasa 870/0; documentada desde el Gate Fase 1/3/5). Migración 017 aplicada e
  **idempotente** (body re-ejecutado 2× = no-op; runner la registra/saltea en re-corridas).

---

## Riesgos

- **FK de `audit`:** mitigado por la estrategia rename (Fase 1); las FK no se tocan, solo se
  renombra la columna. T4 lo verifica explícitamente.
- **Lectores no migrados:** mitigado por la vista `client` (R30), que se **conserva** (decisión 8,
  sin drop) como respaldo además de servir durante el rollout.
- **Dataset grande (~2000):** virtualización/paginación (R18) y query de estado agregada (no N+1).
- **Prospectos sin CUIT:** dedup por razón social normalizada (decisión 9 confirmada; sin match →
  fila separada, nunca se descarta).
- **Relacion del import en vivo:** la define el selector de la UI (R31), no el origen; tests
  T8/T8b lo verifican. La carga histórica (R32) sí es por origen, solo en la migración inicial.
