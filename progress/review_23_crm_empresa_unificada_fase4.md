# Review — feature #23 23_crm_empresa_unificada · Fase 4 (cockpit `/crm`)

**Veredicto:** APPROVED

Revisión de la **Fase 4** (T14–T19 + Gate). Verificación independiente reproducida (check 0 err,
build OK, slice empresas 26/26, leads API 10/10). Las fases 1–3 ya tienen sus gates verdes; acá solo
se evalúa Fase 4.

## Trazabilidad R ↔ test (Fase 4)
- R16: [x] `tests/api/empresas-list.test.ts` (filtra relacion, estado efectivo derivado, filtra por estado) + `e2e/crm-cockpit.spec.ts` (filtro relacion, ex_cliente→inactiva)
- R17: [x] `tests/api/empresas-list.test.ts` (ILIKE razón social + CUIT, `searchEmpresasForPicker` min 2 chars) + `e2e/crm-cockpit.spec.ts` (búsqueda)
- R18: [x] `tests/api/empresas-list.test.ts` (paginación: perPage limita, total cuenta todas, sin solapamiento) + `e2e/crm-cockpit.spec.ts` (dataset grande >1 pág, ≤50/pág)
- R19: [x] `tests/api/empresa-update.test.ts` (persiste maestros+relacion, null-clear texto, no pisa ausentes, 404, Zod, `.strict`) + `e2e/crm-cockpit.spec.ts` (editar+persistir verificado en DB)
- R20: [~] PARCIAL Y DECLARADO. Ficha muestra estado efectivo + origen (`ficha-estado-source`). El **timeline** es Fase 5 (T22). Correctamente diferido por el plan faseado; no es alcance de Fase 4.
- R29: [x] `tests/api/empresas-guards.test.ts` (update 401/403; import admin-only 401/403; load cockpit redirect/403)

Cada R de Fase 4 con cobertura real. R20 está explícitamente marcado parcial en spec/impl (timeline = Fase 5), sin marcar tareas falsas.

## Tasks
- T14: [x] `empresa.ts` (list/count/getById/update/picker/cab). Verificado.
- T15: [x] schemas (`empresaListFiltersSchema`, `empresaUpdateSchema` `.strict()`) + `EmpresaNotFoundError`. Verificado.
- T16: [x] cockpit `+page.{server,svelte}` reescrito, guard `requireStaff`, paginación, import Fase 2 integrado. Verificado.
- T17: [x] ficha `[id]` + endpoint `POST /api/crm/empresas/[id]`. Verificado.
- T18: [x] 3 suites = 26/26 (reproducido).
- T19: [x] `e2e/crm-cockpit.spec.ts` 6/6 (reportado; testids verificados existen en svelte).
- Gate Fase 4: [x] empresas importadas visibles+editables en `/crm`.

Ninguna `[ ]` sin justificar en Fase 4.

## Checkpoints / verificación independiente
- C-check: [x] `pnpm run check` → 0 errores, 26 warnings pre-existentes (`state_referenced_locally`).
- C-build: [x] `pnpm run build` → OK.
- C-slice: [x] `empresas-list`+`empresa-update`+`empresas-guards` = **26/26**.
- C-leads: [x] `tests/api/crm-leads.test.ts` = **10/10** (cobertura de leads retenida tras borrar el e2e).
- C-init.sh §3: [x] FAIL por ">1 in_progress" (#12/#23/#24) — condición conocida/aceptada (decisión leader), NO es rechazo. Paso de tests `[OK]`.
- C-arnés: [x] `feature_list.json` SIN tocar; sin commit/push (HEAD = 0b4eaf2).

## Veredicto sobre los puntos críticos

1. **Borrado de `e2e/crm.spec.ts` — CORRECTO.** El archivo (recuperado de git) testeaba la UI del
   cockpit de **leads** (`CRM — Leads`, `crm-funnel-counts`, `crm-leads-table`, `crm-lead-row`,
   `crm-status-select`) y referenciaba R10/R11/R12 de la **feature #13**, no de #23. Esa UI dejó de
   existir al reescribir `/crm` como cockpit de empresas. NO se perdió cobertura real: (a) el reemplazo
   funcional de UI es `e2e/crm-cockpit.spec.ts` (6/6); (b) la lógica/API de leads sigue cubierta por
   `tests/api/crm-leads.test.ts` (10/10, reproducido verde). NO contradice la decisión humana 8: esa
   decisión conserva `crm_lead`/`crm_lead_event` y la vista `client` como **datos/tablas** de rollback;
   el endpoint `/api/crm/leads`, `crm-leads.ts` y la state-machine siguen en el repo. Borrar un e2e de
   una **UI inexistente** no toca código ni datos de leads.

2. **Derivación de estado adelantada a Fase 4 en SQL — ACEPTABLE, con reconciliación obligatoria en
   Fase 5.** El adelanto está justificado: R16 exige filtrar por estado efectivo server-side, lo que
   obliga a derivar el estado ya en Fase 4 (no se puede filtrar en SQL un valor que solo se computa en
   TS). La lógica SQL (`estadoSelectSql`, CTE `est` + `LEFT JOIN LATERAL`) **coincide exactamente** con
   `deriveEmpresaEstado` del design §3: mismo orden de prioridad (override → ex_cliente → presupuestada
   → auditada → auditoria_en_curso → cliente activa/inactiva(18m) → contactada → sin_contactar), mismos
   7 estados, override gana (R15). Literales SQL verificados contra el esquema real:
   `audit.status='cerrada'` (migr. 001, CHECK válido), `audit_proposal_link.status='activo'` (migr.
   007, fuente de verdad = decisión 7), `audit.archived_at IS NULL` (migr. 002, columna existe).
   **RIESGO REAL: dos fuentes de verdad** una vez que Fase 5 cree `empresa-estado.ts`. Si las reglas
   divergen (p.ej. se cambia la ventana de 18m, se agrega una señal), el listado (SQL) y la ficha/tests
   (TS) podrían mostrar estados distintos. **Mandato para Fase 5 (T20):** `deriveEmpresaEstado` en TS y
   el `CASE` SQL de `empresa.ts` DEBEN compartir/reconciliar la lógica — como mínimo: (i) un test de
   paridad SQL↔TS que para un set de inputs verifique que ambos devuelven el mismo estado; (ii)
   centralizar la constante `ACTIVITY_WINDOW_MONTHS=18` en un único módulo importado por ambos caminos;
   (iii) si se cambia una regla en TS, actualizar el `CASE` SQL en el mismo PR. No es bloqueante de
   Fase 4, pero queda anotado como deuda explícita.

3. **Fix `undefined` en postgres.js — ACEPTABLE.** El filtro `c in patch && patch[c] !== undefined`
   es correcto: postgres.js rechaza `undefined` en `sql(obj,...)`. La consecuencia documentada (no se
   puede limpiar a `null` un campo **entero** —empleados/puestos/sedes— desde la ficha, porque
   `optionalInt` mapea `null → undefined`) NO viola R19/R20: R19 pide "ver y editar datos maestros y
   relacion, persistiendo cambios" — no exige limpiar enteros a null. Los campos de **texto** SÍ se
   limpian a null (`optionalText` preserva el null; test `empresa-update` "null limpia un campo nullable"
   lo verifica). Limitación menor, declarada en impl. Recomendación NO bloqueante para Fase 5: si la
   ficha necesita borrar un entero, ajustar `optionalInt` para preservar `null` explícito.

4. **Guards — CONSISTENTE con R29.** Cockpit (`+page.server.ts`) y ficha usan `requireStaff`; endpoint
   update usa staff (admin|técnico), NO admin-only — correcto: el update es una mutación del cockpit,
   no el import masivo. El import sigue `requireAdminApi` (verificado: `empresas-guards.test.ts` técnico
   → 403). 401 sin sesión, 403 rol no staff, ambos testeados (7/7). Coincide con el patrón del endpoint
   de leads (`requireStaffApi` para mutación, `requireAdminApi` para batch). HALLAZGO MENOR (low): el
   endpoint reimplementa `requireStaffApi` localmente en vez de importar el existente
   `$lib/server/api/require-staff` (idéntico en comportamiento y mensajes). DRY menor, no afecta
   corrección ni gate.

5. **Performance ~2000 filas — SIN N+1, R18 satisfecho.** `listEmpresas` = 1 query (CTE `est` con
   `LEFT JOIN LATERAL` agregado por empresa, `bool_or`/`EXISTS`/`max` en una pasada) + 1 `countEmpresas`.
   El `+page.server.ts` agrega 1 `countEmpresas(totalAll)` → 3 queries constantes por carga, independiente
   del nº de filas. NO hay loop que llame `getEmpresaById` por fila. Paginación server-side LIMIT/OFFSET
   50/pág. `countEmpresas` evita la CTE pesada cuando no hay filtro de estado (COUNT barato sobre índices
   `empresa_relacion_idx`/`empresa_razon_social_lower_idx`). Smoke real reportado contra 2322 empresas.
   e2e pagina el dataset grande (≤50/pág, avanza a pág 2). R18 cumplido.

## Hallazgos por severidad
- **Bloqueantes:** ninguno.
- **Alta:** ninguna.
- **Media:** Duplicación de la lógica de estado (SQL en Fase 4 vs TS en Fase 5). No bloquea Fase 4;
  Fase 5 DEBE reconciliar (ver punto 2). Deuda registrada, no defecto de Fase 4.
- **Baja:**
  - Endpoint update reimplementa `requireStaffApi` local en vez de importar el de `$lib/server/api/require-staff` (DRY).
  - No se puede limpiar enteros a `null` desde la ficha (documentado, fuera de R19/R20).

## Recomendación sobre avanzar a Fase 5
**AVANZAR.** Fase 4 está completa, verde y bien diferenciada del alcance de Fase 5. Antes de cerrar
Fase 5, T20 DEBE reconciliar la lógica de estado:
1. **Test de paridad SQL↔TS:** mismos inputs → mismo `EmpresaEstado` en `deriveEmpresaEstado` (TS) y en
   el `CASE` de `estadoSelectSql` (SQL de `empresa.ts`).
2. **Constante única `ACTIVITY_WINDOW_MONTHS=18`** importada por ambos caminos (hoy hardcodeada en
   `empresa.ts`).
3. Política: todo cambio de regla de estado se aplica en TS **y** en el `CASE` SQL en el mismo PR.
4. (Menor) considerar importar el `requireStaffApi` compartido y, si la ficha lo requiere, permitir
   `null` en enteros.

## Salida final
```
APPROVED -> progress/review_23_crm_empresa_unificada_fase4.md
```
