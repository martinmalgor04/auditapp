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

- [ ] T6 — `src/lib/server/db/clients-import.ts`: `INSERT INTO empresa` (no `client`), upsert por
  CUIT, `relacion` **recibida como parámetro** (no inferida por origen). Ajustar `getSql` import si
  hace falta. Cubre: R24, R25.
- [ ] T7 — Confirmar `src/lib/server/clients/{schema,import,normalize,parse}.ts` y el endpoint
  `src/routes/api/crm/clients/import/+server.ts` apuntan a la capa empresa; guard `requireAdminApi`
  intacto. El endpoint valida `relacion` (`cliente|prospecto`) con Zod (`empresaImportSchema`) y la
  pasa al lote. Cubre: R24, R29, R31.
- [ ] T7b — UI de import masivo (`src/routes/(app)/crm/import` o el modal de import en CRM): agregar
  **selector explícito `relacion` (`cliente | prospecto`)** que aplica a todo el lote y se envía al
  endpoint. Cubre: R31.
- [ ] T8 — `tests/clients-import-upsert.test.ts` — import escribe `empresa`, upsert por CUIT sin
  duplicados, empresa nueva toma la `relacion` del selector (no nula, no inferida por origen), no
  toca `client` físico. Cubre: R24, R25, R31.
- [ ] T8b — `e2e/crm-import.spec.ts` — el selector de relacion está en la UI; importar con
  `prospecto` deja las empresas nuevas como `prospecto`; con `cliente` las deja como `cliente`.
  Cubre: R31.
- [ ] **Gate Fase 2:** import en vivo crea/actualiza en `empresa` con la relacion elegida en el
  selector; aparece en el CRM (tras Fase 4).

## Fase 3 — Reconectar form de nueva auditoría y mercado a `empresa`

> Reemplaza las lecturas de la **vista** `client` por `empresa` directo en los caminos calientes.

- [ ] T9 — `src/lib/server/backoffice/audits.ts`: `createAudit`, `searchClientsForPicker`,
  `getClientCabFields`, `syncClientFromCab`, `getAuditById` → `FROM empresa` / `INSERT INTO
  empresa`; `audit.empresa_id` en lugar de `client_id`. `createAudit` setea `relacion` al crear
  empresa nueva. Cubre: R27.
- [ ] T10 — `src/lib/server/mercado/queries.ts`: los ~10 `JOIN client c` → `JOIN empresa c`.
  Cubre: R28.
- [ ] T11 — Verificar `src/routes/(app)/auditorias/new/{+page.server.ts,+page.svelte}` y
  `cab-client-map.ts` (tipos `ClientCabFields` se alimentan de empresa, sin cambio de forma).
  Cubre: R21, R27.
- [ ] T12 — `tests/audits-create.test.ts` + `e2e/auditorias-new.spec.ts` — picker/createAudit sobre
  empresa, FK válida, CAB precargado, sin regresión. Cubre: R27.
- [ ] T13 — `tests/mercado-queries.test.ts` — dashboard de mercado resuelve joins contra empresa.
  Cubre: R28.
- [ ] **Gate Fase 3:** crear auditoría desde el form clásico funciona end-to-end contra `empresa`.

## Fase 4 — Cockpit `/crm` (listado, ficha, edición)

- [ ] T14 — `src/lib/server/db/empresa.ts`: `listEmpresas`, `countEmpresas`, `getEmpresaById`,
  `updateEmpresa`, `searchEmpresasForPicker`, `getEmpresaCabFields`. Cubre: R16, R17, R19.
- [ ] T15 — `src/lib/server/crm/schemas.ts`: `empresaListFiltersSchema`, `empresaUpdateSchema`;
  `EmpresaNotFoundError` en `errors.ts`. Cubre: R19, R29.
- [ ] T16 — Reescribir `src/routes/(app)/crm/+page.server.ts` + `+page.svelte` como cockpit:
  filtros por relacion/estado, búsqueda, badges, paginación o virtualización para ~2000 filas.
  Guard `requireStaff`. Cubre: R16, R17, R18, R29.
- [ ] T17 — `src/routes/(app)/crm/[id]/+page.{server.ts,svelte}`: ficha ver/editar datos maestros y
  `relacion`. `POST /api/crm/empresas/[id]` para update. Cubre: R19, R20.
- [ ] T18 — `tests/api/empresas-list.test.ts`, `tests/api/empresa-update.test.ts`,
  `tests/api/empresas-guards.test.ts`. Cubre: R17, R19, R29.
- [ ] T19 — `e2e/crm-cockpit.spec.ts` — filtros + paginación con dataset grande. Cubre: R16, R18.
- [ ] **Gate Fase 4:** las empresas importadas (Fase 2) son visibles y editables en `/crm`.

## Fase 5 — Estado híbrido, eventos/timeline, crear auditoría desde ficha, export

- [ ] T20 — `src/lib/server/crm/empresa-estado.ts`: `deriveEmpresaEstado`, `effectiveEstado`,
  `withinActivityWindow`. Query agregada de inputs en `empresa.ts` (sin N+1). Cubre: R13, R14, R15.
- [ ] T21 — `addEvento`, `listEventos`, `setEstadoOverride` en `empresa.ts` + `empresaEventoSchema`.
  Override genera evento `cambio_estado`. Cubre: R22, R23.
- [ ] T22 — Ficha: mostrar estado efectivo + origen (override/derivado) y timeline; UI para
  registrar evento/nota y setear/limpiar override. Cubre: R20, R22, R23.
- [ ] T23 — Acción "crear auditoría" desde la ficha: precarga CAB con `getEmpresaCabFields` +
  `cab-client-map`, vincula la auditoría a la empresa. Cubre: R21.
- [ ] T24 — `GET /api/crm/empresas/export`: CSV del listado filtrado. Cubre: R26.
- [ ] T25 — `tests/empresa-estado.test.ts` (7 estados, reglas, override gana),
  `tests/api/empresa-eventos.test.ts`, `tests/api/empresas-export.test.ts`,
  `e2e/crm-ficha.spec.ts` (estado+timeline+crear auditoría). Cubre: R13, R14, R15, R20, R21, R22, R23, R26.
- [ ] **Gate Fase 5:** ficha completa: estado híbrido, timeline, crear auditoría, export.

## Fase 6 — Deprecación documentada (SIN drop)

> Decisión humana (2026-06-16, decisión 8): `crm_lead`/`crm_lead_event` y la vista `client` **se
> mantienen como red de rollback/backup**. NO se dropean en #23. La limpieza física es una tarea
> manual futura, fuera del alcance de esta feature.

- [ ] T26 — `migrations/016_empresa_deprecacion.sql`: marcar `crm_lead`, `crm_lead_event` y la vista
  `client` como **legacy/solo lectura** (p.ej. `COMMENT ON` indicando "DEPRECADO #23, conservar para
  rollback, no escribir"; opcional: revocar privilegios de escritura). **NO** ejecuta ningún `DROP`.
  Idempotente. Cubre: R30 (cierre, sin drop).
- [ ] T27 — Documentar el **procedimiento de limpieza manual posterior** (qué dropear, en qué orden,
  precondición = ningún lector legacy en uso) en `specs/23_crm_empresa_unificada/` y/o
  `progress/impl_23_crm_empresa_unificada.md`. NO borrar `src/lib/server/db/crm-leads.ts` ni la
  state-machine de leads en esta feature: quedan como referencia hasta la limpieza manual. Cubre:
  trazabilidad/limpieza (documentación).
- [ ] T28 — Suite completa verde: migración, dedup, FK, auto-derivación, override, guards, import
  reconectado (con selector de relacion), e2e del cockpit. Actualizar mapa R↔test en
  `progress/impl_23_crm_empresa_unificada.md`. Cubre: R-all (cierre de trazabilidad, acceptance #11).
- [ ] **Gate Fase 6:** `./init.sh`, `pnpm run check`, `pnpm run build`, `pnpm test` verdes; ningún
  `DROP` de tablas/vista legacy.

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
