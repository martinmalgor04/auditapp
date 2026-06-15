# Review — feature 21 21_import_clientes

**Veredicto:** APPROVED

Revisión estricta contra `specs/21_import_clientes/{requirements,design,tasks}.md`, `docs/` y
`CHECKPOINTS.md`. Verificación ejecutada por el reviewer (no se confió en el reporte del
implementer): `pnpm run check` (0 errores), `pnpm run build` (OK), `pnpm test` (156 archivos,
715 pass / 2 skip preexistentes), suite específica de #21 (26 tests verdes incl. DB real).

## Trazabilidad R ↔ test (verificada en código, no solo en el mapa)

- R1: [x] `e2e/import-clientes.spec.ts` — acción/botón visible en CRM (admin)
- R2: [x] `tests/api/clients-import.test.ts` — 401 sin sesión, 403 técnico; sin escritura (count igual)
- R3: [x] `tests/clients-import-parse.test.ts` — CSV y xlsx (node-xlsx) → mismas filas normalizadas
- R4: [x] `tests/clients-import-parse.test.ts` (detectFormat) + `tests/api/...` (415 sin escritura)
- R5: [x] `tests/clients-import-parse.test.ts` — solo set canónico; id/categoria_iva/ts descartados
- R5.bis: [x] `tests/clients-import-parse.test.ts` — numero_doc→cuit, `razón social`→razon_social
- R5.ter: [x] `tests/clients-import-parse.test.ts` + `tests/api/...` — ignoredColumns con conteo/nombres
- R6: [x] `tests/clients-import-parse.test.ts` — vacíos → null
- R7: [x] `tests/clients-import-parse.test.ts` — `30-12345678-9` → `30123456789`
- R8: [x] `tests/clients-import-validate.test.ts` — sin razon_social → invalid (fila+motivo), no aborta
- R9: [x] `tests/clients-import-validate.test.ts` — CUIT no-11-dígitos → invalid
- R9.bis: [x] `tests/clients-import-validate.test.ts` — válida sin CUIT → skipped (no invalid/creada)
- R10: [x] `tests/clients-import-upsert.test.ts` — DB real: existente actualiza, nuevo crea
- R11: [x] `tests/clients-import-upsert.test.ts` — insert origen='presupuestos'; update no pisa origen
- R12: [x] `tests/clients-import-upsert.test.ts` — error a mitad → rollback total (count sin cambios)
- R13: [x] `tests/api/clients-import.test.ts` — reporte total/created/updated/skipped/invalid separados
- R14: [x] `e2e/import-clientes.spec.ts` — reporte renderizado (contadores) en CRM
- R15: [x] `tests/clients-import-upsert.test.ts` — reimport mismo set → 0 duplicados (count=1)
- R16: [x] `tests/clients-import-upsert.test.ts` + validate — dos filas mismo CUIT → 1 cliente (última gana)
- R17: [x] `tests/clients-cuit-cleanup.test.ts` — detecta duplicados (HAVING count>1) antes del índice
- R18: [x] `tests/clients-cuit-cleanup.test.ts` — merge conserva id menor; repunta FKs audit/crm_lead; índice UNIQUE rechaza dup (23505)
- R19: [x] `e2e/import-clientes.spec.ts` — enlace de plantilla con href correcto
- R20: [x] `tests/clients-import-template.test.ts` — encabezados canónicos exactos + ≥1 fila ejemplo
- R21: [x] `tests/clients-import-template.test.ts` — importar plantilla → invalid:[] e ignoredColumns:[]

Cobertura R↔test: 21/21 requirements con al menos un test no trivial. Sin huecos.

## Tasks (tasks.md)

- T1..T19: [x] todas. Verificadas contra artefactos reales en el repo. T13/T11 son tests DB reales
  (sin mock del query layer, per docs/verification.md nivel 2). T18 es e2e real (nivel 3).

## Puntos críticos auditados

1. **Set canónico**: OK. `grep categoria_iva` en migrations/src → 0 resultados. No se agregó columna
   a `client`. `normalize.ts` mapea solo los 7 campos canónicos; el resto se descarta y se reporta
   en ignoredColumns. Test R5/R5.ter lo confirma.
2. **Upsert por CUIT + transacción**: OK. `clients-import.ts` usa `sql.begin`, `ON CONFLICT (cuit)
   WHERE cuit IS NOT NULL`, `RETURNING (xmax=0)` para distinguir insert/update, origen solo en
   insert. Idempotencia y rollback probados con DB real.
3. **Fila válida sin CUIT → skipped**: OK. `import.ts` clasifica skipped en categoría separada de
   invalid; tests R9.bis/R13 lo verifican incl. a nivel API.
4. **Aliasing**: OK. HEADER_ALIASES cubre cuit|numero_doc y razon_social|"razón social" (+ tolerancia
   sin acento y dirección/teléfono). headerKey aplica trim+lowercase.
5. **Migración 013**: OK. Repunte de FKs (audit.client_id, crm_lead.client_id) ANTES del DELETE,
   merge por CUIT, índice único parcial. Runner (migrate.ts:38) envuelve en sql.begin → atómico.
   Seed real (1895 filas) tiene 0 CUIT duplicados → el merge es red de seguridad, no altera el seed.
   Test cleanup verifica merge + repunte FK + rechazo de dup. Seguro contra el seed.
6. **Guards**: OK. Endpoint usa `requireAdminApi` (401/403). Botón UI gated por `isAdmin`
   (`data.user?.role==='admin'`); la seguridad real es server-side. Tests confirman 401/403 sin escritura.
7. **Parser**: OK. node-xlsx default export, primera hoja, deriva encabezados de data[0], celdas→string,
   descarta filas vacías. csv-parse/sync con columns:true. Vacíos→null y CUIT→dígitos en normalize.
8. **Tests**: reales, no tautológicos. Verifican resultados concretos (valores, counts, FKs, códigos
   de error PG), cubren camino feliz y de error. DB tests no usan mock del query layer.

## Desvíos reportados por el implementer — evaluados

- (a) Fixtures tocados (`mercado-audit.ts`, `audit-bundle.ts`, `audit-bundle-build.test.ts`,
  `tests/setup.ts`): **legítimos, no esconden regresiones.** Adaptan a la nueva restricción UNIQUE
  parcial de cuit. `audit-bundle.ts` borra fila previa solo si NO tiene audit dependiente
  (`NOT EXISTS`), preservando FKs. `audit-bundle-build.test.ts` asigna CUITs distintos a 3 fixtures
  que antes compartían default — la aserción (preservación de status por audit) sigue intacta.
  `setup.ts` agrega 3 tests de dominio PURO a SKIP_DB_RESET (no tocan DB); los tests DB (upsert,
  cleanup, api) NO están en el skip y conservan su reset. Suite completa verde (715 pass).
- (b) `min(id::text)::uuid` como "id menor": **aceptable.** Es determinístico (orden lexicográfico
  total y estable de uuid) y cumple literalmente R18 ("id menor"). PG no provee min() sobre uuid.
- (c) CUIT viejo con guiones no se normaliza retroactivamente: **fuera de alcance del spec.** La
  normalización aplica al import en vivo; el spec no pide migración de datos históricos de cuit.

## Checkpoints (C1–C6)

- C1: [x] arnés completo; init.sh corre (ver nota gate abajo)
- C2: [~] **una sola feature in_progress** falla por #12 preexistente (ver gate). Todo done con tests.
- C3: [x] db/ solo SQL parametrizado (postgres.js, tagged templates); sin ORM; sin console.log debug;
       sin secretos en código.
- C4: [x] tests/ cubre funciones públicas de src/lib/server/clients/; vitest >0 verdes; e2e presente.
- C5: [x] sin archivos sospechosos (.tmp/.env sin trackear); progress/impl_21 presente.
- C6: [x] specs/ completo (requirements EARS, design, tasks); todas tasks [x]; cada R con ≥1 test.

## Nota sobre `./init.sh` (gate)

`./init.sh` reporta un único `[FAIL]` en la sección 3: "Hay 2 features en in_progress (máximo 1)".
**No es un defecto de #21.** Verificado con `git show HEAD:feature_list.json`: #12
`12_reunion_asistente` ya estaba `in_progress` antes de esta sesión; el diff de esta sesión solo
**agrega** #21. Tests/build/check/specs: todo verde. #21 se evalúa por sus propios méritos: cumple.

## Deuda / observaciones para el leader

1. **(Bloquea el gate, NO #21)** Resolver el estado de #12 `12_reunion_asistente`: está
   `in_progress` desde antes de esta sesión. Hasta que #12 cierre (done/blocked) o se marque #21
   done, `./init.sh` seguirá rojo por C2 (máx. 1 in_progress). Decisión del leader.
2. **(Menor)** La nota del design.md racionaliza "id menor" como "más antiguo"; con uuid v4 random
   no hay correlación id↔tiempo. El criterio implementado (id lexicográfico menor) es el que pide
   R18 literalmente y es determinístico — OK, pero la racionalización del texto es imprecisa.
3. **(Menor)** `detectFormat` acepta xlsx por extensión aunque content-type esté vacío; un `.csv`
   renombrado a `.xlsx` haría fallar node-xlsx con error genérico (no UnsupportedFormatError). Fuera
   de los R; aceptable. Posible endurecimiento futuro (magic bytes) si se desea.
4. **(Menor)** 3 warnings nuevos `state_referenced_locally` en crm/+page.svelte (data.user) — mismo
   patrón cosmético preexistente en toda la app; no bloquea check (0 errores).
