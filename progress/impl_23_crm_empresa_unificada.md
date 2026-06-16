# Implementación — #23 23_crm_empresa_unificada · Fase 1

> Entidad `empresa` unificada + migración 015 con compatibilidad hacia atrás (vista `client`).
> Estrategia A (rename + fold), decidida en puerta humana (2026-06-16).

## Estado: FASE 1 VALIDADA Y VERDE (2026-06-16, sesión de validación)

- **Migración 015 aplicada y validada empíricamente** sobre datos reales (reconstrucción del estado
  pre-015 como en producción: client+crm_lead poblados, luego 015). Counts reales abajo.
- **Suite completa:** `787 passed | 2 skipped | 0 failed` (172 files). `pnpm run check` → **0 errores**
  (25 warnings pre-existentes de Svelte `state_referenced_locally`). `pnpm run build` → **OK**.
- **3 tests nuevos:** `empresa-schema` 7/7, `empresa-migration` 7/7, `empresa-compat` 4/4 = 18/18.
- **Riesgo `clients-cuit-cleanup` RESUELTO** (ver sección dedicada abajo).
- **2 bugs de test propios encontrados y arreglados** (ver "Bugs corregidos").
- **2 regresiones reales del rename encontradas y arregladas** en `src/` (la vista `client` NO da
  compatibilidad total: `xmax`/`ON CONFLICT` y dependencia funcional de PK en GROUP BY fallan sobre
  una vista). Ver "Regresiones del rename".
- **`./init.sh` NO termina en `[OK]`** por dos causas **ajenas a #23**: (a) 3 features en `in_progress`
  (#12/#23/#24; el gate exige máx 1 → decisión humana, no se toca `feature_list.json`); (b) flakiness
  pre-existente del harness (DB compartida + paralelo) que rompe ~1 de cada 3 corridas full un
  snapshot/estado distinto (p.ej. `canonical-contract`); el paso de tests de `init.sh` sí dio
  `[OK] Todos los tests pasan` en corrida limpia.

## Archivos creados

| Archivo | Qué |
|---|---|
| `migrations/015_empresa_unificada.sql` | T1+T2. Rename + fold + columnas + CHECKs + `empresa_evento` + índices + vista `client`. Idempotente. |
| `tests/empresa-schema.test.ts` | T3 — R1..R5 (+ R6/R17 índices). |
| `tests/empresa-migration.test.ts` | T4 — R7..R12, R32. |
| `tests/empresa-compat.test.ts` | T5 — R30. |

## Archivos modificados (reconexión de la columna renombrada + compat de truncate)

> El rename `audit.client_id → empresa_id` (mandato de T1) obliga a actualizar **todo** lector/
> escritor SQL de esa columna, porque la vista `client` da compat de **nombre de tabla** pero
> Postgres no ofrece compat de **nombre de columna**. Se preservó la forma de las filas TS con
> `empresa_id AS client_id` donde la query alimentaba un tipo con campo `client_id`, para minimizar
> el diff. `JOIN client c` se mantuvo (compat vía vista; su reconexión a `empresa` es Fase 3 T10).
> `crm_lead.client_id` NO se tocó (columna distinta).

- `src/lib/server/mercado/queries.ts` (10 JOIN), `backoffice/dashboard.ts` (JOIN + filtros),
  `backoffice/audits.ts` (INSERT/SELECT/UPDATE de audit), `bundle/import.ts` (INSERT audit),
  `closure/load-closure.ts`, `canonical/build.ts`, `scoring/load-context.ts`, `scoring/preview.ts`,
  `db/audit-bundle.ts`, `db/audit-form.ts` (alias), `db/audits.ts` (alias), `db/briefing.ts` (alias).
- Tests/fixtures que escriben/leen `audit.empresa_id`: `tests/helpers/auth.ts`,
  `tests/helpers/backoffice.ts`, `tests/fixtures/audit-bundle.ts`, `tests/fixtures/mercado-audit.ts`,
  `tests/audit-bundle-import.test.ts` (alias), `tests/crm-state-machine.test.ts`,
  `tests/api/crm-leads.test.ts`, `e2e/audit-bundle.spec.ts`, `tests/schema.test.ts` (índice
  `audit_empresa_id_idx`).
- `tests/helpers/db.ts` — `truncateSeedTablesUnsafe` / `resetVolatileTablesUnsafe`: `client` (ahora
  vista) → `empresa` (tabla base) + `empresa_evento`. Sin esto el `TRUNCATE` de la suite fallaría.

## Desviaciones vs. el design (justificadas)

1. **`relacion text NOT NULL DEFAULT 'prospecto'`** (el design lo dejaba solo NOT NULL).
   Motivo: en Fase 1 los escritores legacy siguen haciendo `INSERT` por la **vista `client`** sin
   informar `relacion`. Un INSERT por vista auto-actualizable usa el DEFAULT de la tabla base para
   columnas omitidas; sin default, el NOT NULL rompería a esos escritores y violaría el objetivo de
   Fase 1 ("nada se rompe"). Fases 2/3 setean `relacion` explícita al reconectar.
2. **Guard de idempotencia del Paso 1** con `pg_class.relkind` (`client` tabla 'r' y `empresa`
   inexistente) en vez de `ALTER TABLE IF EXISTS client RENAME`. Motivo: tras la 1ª corrida `client`
   es VISTA; re-aplicar el rename plano fallaría con "relation empresa already exists". El guard hace
   la re-ejecución un no-op real (R12).
3. **Reconexión de `audit.client_id` en lectores/escritores adelantada a Fase 1** (Fase 3 T9/T10 solo
   nombra `audits.ts` y `mercado/queries.ts`). Motivo: no hay compat de nombre de columna; sin esto
   la suite quedaría roja, incumpliendo el gate "CERO regresiones". Fase 3 se reduce a `JOIN client`→
   `JOIN empresa`.

## Riesgo `clients-cuit-cleanup.test.ts` — RESUELTO

El síntoma real al validar fue doble (no solo el "column client_id"): el test (a) hacía
`DROP INDEX IF EXISTS client_cuit_unique` (no-op post-015 → el índice vigente `empresa_cuit_unique`
seguía activo y el INSERT de duplicados chocaba 23505); y (b) re-aplicaba el cuerpo LITERAL de 013,
que referencia `audit.client_id` (renombrado), crea el índice `ON client` (¡no se puede indexar una
VISTA!) y el índice viejo.

**Resolución (sin tocar `migrations/013`, que debe seguir histórica y literalmente correcto):** el
test ahora **transforma en memoria** el cuerpo de 013 a los nombres post-015 antes de replayarlo,
ejercitando la MISMA lógica (dedup por CUIT conservando id menor + repunte de FKs + índice único
parcial) contra el esquema actual:

- `UPDATE audit a SET client_id` → `SET empresa_id`; `WHERE a.client_id = c.id` → `a.empresa_id`.
- `client_cuit_unique` → `empresa_cuit_unique`; `ON client` → `ON empresa`; `FROM client`/`DELETE
  FROM client c` → sobre la tabla base `empresa` (la DML de dedup es idéntica sobre la base).
- `crm_lead.client_id` se **preserva** (esa columna no la renombró 015).
- `dropCuitIndex()` ahora dropea `empresa_cuit_unique` (el nombre vigente); las aserciones leen
  `audit.empresa_id` y el índice en `indexNames(sql, 'empresa')`.

Por qué es correcto: 013 sigue intacto en disco (corre antes de 015 en la cadena real, cuando la
columna aún se llama `client_id`). El test, que vive en un mundo post-015, sólo adapta lo que la
migración 015 renombró, manteniendo intacta la intención (R17/R18). **VERDE: 2/2.**

## Bugs corregidos en los tests nuevos (encontrados al validar)

1. **`empresa-migration.test.ts > R32`**: insertaba filas con `relacion = NULL` para simular el
   estado pre-backfill, pero post-015 `empresa.relacion` ya es `NOT NULL` → el INSERT fallaba antes
   de poder probar el backfill. **Fix:** el test ahora `ALTER TABLE empresa ALTER COLUMN relacion
   DROP NOT NULL`, inserta los NULL, re-aplica 015 (que backfillea por origen y re-asienta el NOT
   NULL) y verifica que no quedan NULL — ejercita exactamente la carga histórica determinística.
2. **`empresa-migration.test.ts > R8/R9`**: el literal SQL `'\s+'` dentro del tagged-template de
   postgres-js es interpretado por JS como `"s+"` (backslash perdido: `\s` no es escape válido), así
   que `regexp_replace(..., 's+', ' ')` reemplazaba la letra **s** y la igualdad por razón social
   normalizada nunca matcheaba (0 filas). **Fix:** `'\\s+'` → llega a Postgres como `\s+`. (El
   `.sql` de la migración se lee con `readFileSync`, así que ahí el backslash se preserva y estaba
   bien; sólo el literal inline del test estaba roto.)

## Regresiones del rename encontradas al correr la suite — arregladas

La vista `client` NO ofrece compatibilidad total; dos lectores/escritores legacy rompieron y se
reapuntaron a la tabla base `empresa` (mínimo necesario; alineado con lo que harían Fase 2/3):

1. **`src/lib/server/db/clients-import.ts`** (`INSERT INTO client … ON CONFLICT (cuit) … RETURNING
   (xmax = 0)`): `xmax` es columna de sistema que **no existe en vistas**, y `ON CONFLICT` necesita
   el índice único de la tabla base. → `INSERT INTO empresa`. `relacion` sigue tomando el DEFAULT
   `'prospecto'` igual que antes vía la vista (la firma/selector son trabajo de Fase 2 T6).
   Rompía: `clients-import-upsert` (3) + `api/clients-import` (1).
2. **`src/lib/server/backoffice/dashboard.ts`** (`listDashboardAudits`, query del tablero): `SELECT
   c.razon_social … JOIN client c … GROUP BY a.id, c.id, u.id`. Sobre una **vista** Postgres no
   reconoce `c.id` como PK, así que no infiere la dependencia funcional de `c.razon_social` → error
   "must appear in the GROUP BY clause". → `JOIN empresa c` (PK real). Rompía:
   `api/backoffice-dashboard` (varios) + `api/backoffice-routes` + `api/audit-crud` (todos pasan por
   el tablero).

Los demás `JOIN client`/`INSERT INTO client` de `src/` (mercado, closure, briefing, audits picker,
bundle import) son SELECTs/INSERTs simples que la vista auto-actualizable sí soporta → se dejan como
están (su reconexión a `empresa` es Fase 3, no necesaria para el gate).

## Hallazgos reales de la DB (counts del fold) — captura empírica

Reconstrucción del estado **pre-015** como en producción (migraciones 001–014 + seed real:
`seedClients`=1895 filas CSV, `seedClientesTango`=112, `seedCrmLeads`=52), luego se aplicó 015.

**PRE-015:** `client` = **1933** filas (tras dedup de CUIT de 013), `crm_lead` = **52** (todas con
`client_id` NULL), `crm_lead_event` = 0.

**POST-015 (fold):**
- `empresa` = **1983**; vista `client` = **1983** (idénticas; 0 filas de diferencia en ambos sentidos).
- `audit` huérfanas (empresa_id que no resuelve) = **0**.
- **Fold de los 52 leads sin CUIT:** 2 matchearon por razón social normalizada a una empresa
  existente y se **fusionaron** sin insertar (`gualok srl`, `EL CROATA S.R.L.`); 50 sin match →
  **fila separada** nueva (relacion/origen `prospecto`). 52 = 2 + 50 → **sin pérdida** (Δempresa = +50).
- **`relacion` por origen (R32, carga histórica):** `cliente` = 1933 (presupuestos 1821 + tango 112),
  `prospecto` = 50. Cero filas mal clasificadas.
- `empresa_evento` = 0 (no había `crm_lead_event` que migrar en el dataset de seed).

**Idempotencia (R12):** re-aplicar 015 2× más → `empresa` se mantiene en 1983, `empresa_evento` 0,
huérfanas 0. No-op confirmado.

> NOTA sobre el flujo dev `reset→migrate→seed` (sin reconstrucción pre-015): el seed inserta clientes
> por la **vista `client`** sin informar `relacion`, así que toman el DEFAULT `'prospecto'`. En ese
> flujo la migración corre con `empresa` vacía y el backfill no tiene nada que clasificar → todas las
> empresas quedan `prospecto`. Esto NO es un bug de la migración (R32 aplica a la migración inicial
> sobre datos preexistentes, probada arriba), sino una limitación del seed dev. Setear `relacion` por
> origen en el seed es trabajo de Fase 2 (reconexión de escritores con selector), fuera del alcance
> de Fase 1; queda documentado como wart conocido para el reviewer.

## Trazabilidad R ↔ test (Fase 1)

| R | Test |
|---|---|
| R1 | `empresa-schema.test.ts > R1 …` (tabla base + datos maestros; razon_social NOT NULL) |
| R2 | `empresa-schema.test.ts > R2 …` (relacion NOT NULL + CHECK cliente/prospecto/ex_cliente) |
| R3 | `empresa-schema.test.ts > R3 …` (referente_*) |
| R4 | `empresa-schema.test.ts > R4 …` (nivel_interes/tiene_software/observaciones/fuente/pagina/relevado_at) |
| R5 | `empresa-schema.test.ts > R5 …` (estado_override nullable + CHECK estados) |
| R6 | `empresa-schema.test.ts > R6/R17 …` (índice `empresa_cuit_unique`) + `empresa-migration.test.ts > R8 …` (23505) |
| R7 | `empresa-migration.test.ts > R7/R9 …` (prospecto sin match → fila separada, +1 sin pérdida) |
| R8 | `empresa-migration.test.ts > R8/R9 …` (match razón social fusiona; mismo CUIT → 23505) |
| R9 | `empresa-migration.test.ts > R7/R9` y `> R8/R9` (separada vs. fusión por razón social normalizada) |
| R10 | `empresa-migration.test.ts > R10/R11 …` (audit.empresa_id intacto; 0 huérfanas) |
| R11 | `empresa-migration.test.ts > R10/R11` y `> R11 …` (evento migrado al empresa conservado) |
| R12 | `empresa-migration.test.ts > R12 …` (re-aplicar 3× → 0 filas nuevas, FK estable) |
| R30 | `empresa-compat.test.ts` (client es VISTA; mismas filas; INSERT/UPDATE/DELETE por la vista; JOIN audit⨝client) |
| R32 | `empresa-migration.test.ts > R32 …` (presupuestos/tango→cliente, prospecto→prospecto) |
| R6/R17 (índices) | `empresa-schema.test.ts > R6/R17 …` (`empresa_relacion_idx`, `empresa_razon_social_lower_idx`) |

## Checklist de validación — COMPLETADA

1. [x] Docker arriba; DB dev responde (`db-db-1` healthy, 5432).
2. [x] Migración 015 aplicada (vía `pnpm db:reset`, que corre 001–016) y validada también con
   reconstrucción pre-015 sobre datos reales.
3. [x] Counts reales capturados (sección "Hallazgos reales de la DB"): empresa 1983, client view
   1983, 0 huérfanas, fold 2 fusionados + 50 separados (sin pérdida), relacion cliente=1933/
   prospecto=50, idempotente.
4. [x] 3 tests nuevos: 18/18 verde.
5. [x] Suite completa: 787 passed / 2 skipped / 0 failed. Riesgo `clients-cuit-cleanup` resuelto
   (2/2 verde).
6. [x] `pnpm run check` 0 errores; `pnpm run build` OK; `./init.sh` → paso de tests `[OK]` (el
   `[FAIL]` final del gate es por causas ajenas a #23: 3 features in_progress + flakiness del harness).
7. [x] `tasks.md` T1–T5 + Gate Fase 1 marcados.

## Archivos tocados en esta sesión de validación

- `migrations/015_empresa_unificada.sql` — **sin cambios** (la migración estaba correcta; se validó).
- `tests/empresa-migration.test.ts` — fix R32 (drop NOT NULL transitorio) + fix `'\\s+'` (R8/R9).
- `tests/clients-cuit-cleanup.test.ts` — replay de 013 adaptado a nombres post-015.
- `src/lib/server/backoffice/dashboard.ts` — `JOIN client` → `JOIN empresa` (GROUP BY/PK).
- `src/lib/server/db/clients-import.ts` — `INSERT INTO client` → `INSERT INTO empresa` (xmax/ON CONFLICT).

---

# Implementación — #23 · Fase 2 (reconexión del importador #21 a `empresa` con selector de relación)

> Reconectar el importador masivo a la tabla base `empresa` con un **selector explícito de
> `relacion`** (`cliente | prospecto`) que aplica a todo el lote y NO se infiere por origen.
> Tasks T6–T8b. Spec aprobado por puerta humana (2026-06-16). Decisiones humanas 5 y 7: la relación
> del import en vivo la define el selector de la UI, distinto de la carga histórica (R32).

## Estado: FASE 2 VERDE (2026-06-16, sesión implementer)

- `pnpm run check` → **0 errores** (25 warnings pre-existentes de Svelte `state_referenced_locally`).
- `pnpm run build` → **OK**.
- Suite import + empresa: **48/48 verde** (`clients-import-upsert` 7, `api/clients-import` 6,
  `clients-import-parse` 8, `clients-import-validate` 5, `clients-import-template` 2,
  `empresa-schema` 7, `empresa-migration` 7, `empresa-compat` 4, `clients-cuit-cleanup` 2).
- e2e import: **5/5 verde** en chromium (`crm-import` 3 nuevos + `import-clientes` 2 — este último
  tenía un bug de CUIT de 12 dígitos, corregido; ver abajo).
- Gate del arnés `init.sh`: sigue `[FAIL]` en §3 por ">1 in_progress" (#12/#23) — condición conocida
  y aceptada, NO bloquea Fase 2. Verificada con check/build + suite de import (instrucción del leader).

## Wart de Fase 1 resuelto

El seed dev dejaba todas las empresas en `prospecto` porque insertaba por la **vista `client`** sin
informar `relacion` (tomaba el DEFAULT). Fase 2 introduce el **selector explícito**: el import en
vivo ahora pasa `relacion` como parámetro al lote, así una empresa nueva toma `cliente` o
`prospecto` según lo que elige el usuario, sin depender del origen del archivo. (El `origen` físico
del importador en vivo sigue siendo `'presupuestos'` como etiqueta de carga — es independiente de
`relacion`, que es la decisión humana del selector.)

## Archivos creados

| Archivo | Qué |
|---|---|
| `e2e/crm-import.spec.ts` | T8b — R31. Selector visible; import `prospecto`→`prospecto`, `cliente`→`cliente`; verifica `empresa.relacion` en DB. |

## Archivos modificados

| Archivo | Cambio | Task |
|---|---|---|
| `src/lib/server/crm/schemas.ts` | + `empresaImportRelacionSchema` (`z.enum(['cliente','prospecto'])`), `empresaImportSchema`, tipo `EmpresaImportRelacion`. | T7 |
| `src/lib/server/db/clients-import.ts` | `applyClientImport(plan, relacion)`: el INSERT agrega la columna `relacion` (del parámetro); el UPDATE del upsert NO la pisa. Comentario Fase 1 actualizado a Fase 2. | T6 |
| `src/routes/api/crm/clients/import/+server.ts` | Valida `form.get('relacion')` con `empresaImportSchema` (400 si falta/inválida) y la pasa a `applyClientImport`. Guard `requireAdminApi` intacto. | T7 |
| `src/routes/(app)/crm/+page.svelte` | `<select data-testid="crm-import-relacion">` (cliente/prospecto, default cliente) en el panel de import; `submitImport` envía `relacion` en el FormData. | T7b |
| `tests/clients-import-upsert.test.ts` | Reescrito: `applyClientImport(plan, relacion)`; asserts sobre la tabla base `empresa`; verifica `relkind` (empresa='r', client='v'), `relacion` del selector (cliente y prospecto), upsert por CUIT, rollback. | T8 |
| `tests/api/clients-import.test.ts` | Forms agregan `relacion`; nuevo test "relacion ausente o inválida → 400 sin escribir" (incluye rechazo de `ex_cliente`, que es solo manual). | T7 |
| `e2e/import-clientes.spec.ts` | Fix de bug pre-existente: el CUIT generado era de 12 dígitos (`slice(-7)`) → siempre inválido → la fila válida caía en "omitidos" (skipped=2). Corregido a `slice(-6)` → 11 dígitos. No relacionado con la lógica de Fase 2; el endpoint reconectado usa el default `cliente` del selector. | T8b (colateral) |

## Decisiones de diseño tomadas (dentro del spec)

1. **UPDATE no pisa `relacion`.** En el upsert por CUIT, una empresa **existente** conserva su
   `relacion` actual; solo las empresas **nuevas** toman la del selector. Razón: el import actualiza
   datos maestros (razón social, dirección, contacto), no reclasifica empresas ya registradas. El
   spec (R24/R25) pide que la empresa **nueva** tome la relación del selector; no manda reclasificar
   las existentes, y reclasificar en masa por un import sería destructivo. El reviewer debería
   confirmar esta lectura; si se quisiera que el lote también reclasifique existentes, sería un
   `relacion = ${relacion}` extra en el SET del UPDATE (cambio de una línea).
2. **`origen` físico del import en vivo = `'presupuestos'`** (sin cambio): es la etiqueta de carga,
   distinta de `relacion`. El selector decide `relacion`, el archivo no. Tests lo verifican
   explícitamente (`origen='presupuestos'` con `relacion='cliente'` o `'prospecto'`).
3. **El selector excluye `ex_cliente`** (decisión humana 6: `ex_cliente` es solo manual desde la
   ficha). El Zod del endpoint rechaza `ex_cliente` con 400 (test cubre el caso).
4. **Verificación del "no toca `client` físico" (R24):** `client` es una VISTA sobre `empresa`
   (Fase 1, sin drop por decisión 8). No existe un `client` físico separado que el import pueda
   tocar; el test confirma `relkind` (empresa='r', client='v') y que la fila escrita en `empresa`
   se refleja por ambos caminos.

## Trazabilidad R ↔ test (Fase 2)

| R | Test |
|---|---|
| R24 | `clients-import-upsert.test.ts > escribe en la tabla base empresa…` (relkind r/v; sin `client` físico) + `> reimport del mismo set no crea duplicados por CUIT` + `> CUIT nuevo crea; existente actualiza` |
| R25 | `clients-import-upsert.test.ts > empresa nueva toma la relacion del selector (cliente…)` y `(prospecto)` (no nula, no inferida por origen) |
| R29 | `api/clients-import.test.ts > sin sesión 401` / `> rol tecnico 403` (guard `requireAdminApi` intacto) |
| R31 | `clients-import-upsert.test.ts` (relacion del selector aplicada) + `api/clients-import.test.ts > relacion ausente o inválida 400` (Zod `cliente\|prospecto`) + `e2e/crm-import.spec.ts` (selector en UI; prospecto→prospecto, cliente→cliente verificado en DB) |

## Checklist de verificación — COMPLETADA

1. [x] Docker arriba; `db-db-1` healthy; migraciones aplicadas.
2. [x] `pnpm run check` → 0 errores; `pnpm run build` → OK.
3. [x] Suite import + empresa: 48/48 verde.
4. [x] e2e import (chromium): 5/5 verde (3 nuevos `crm-import` + 2 `import-clientes` con fix de CUIT).
5. [x] `tasks.md` T6–T8b + Gate Fase 2 marcados `[x]`.
6. [x] NO se tocó `status` en `feature_list.json`. NO commit/push.

---

# Implementación — #23 · Fase 3 (reconectar form de nueva auditoría + dashboard de mercado a `empresa`)

> Reemplazar las lecturas de la **vista** `client` por la tabla base `empresa` en los caminos
> calientes: form clásico de nueva auditoría (`backoffice/audits.ts`) y dashboard de mercado
> (`mercado/queries.ts`). La vista `client` se conserva (decisión humana 8, sin drop). Tasks T9–T13.
> Spec aprobado por puerta humana (2026-06-16).

## Estado: FASE 3 VERDE (2026-06-16, sesión implementer)

- `pnpm run check` → **0 errores** (25 warnings pre-existentes de Svelte `state_referenced_locally`).
- `pnpm run build` → **OK**.
- Suite completa: **797 passed | 2 skipped | 0 failed** (174 files). Sin flakiness en esta corrida.
- Tests nuevos Fase 3: `audits-create` 4/4, `mercado-queries` 2/2. Regresión dirigida
  (audit-create-flow 2, audit-crud 5, mercado-aggregations 10, api suite + empresa/import 211) verde.
- e2e: `auditorias-new` 1/1 chromium (crea empresa + FK verificada en DB, CAB precargado).
- Gate del arnés `init.sh`: sigue `[FAIL]` en §3 por ">1 in_progress" (#12/#23/#24) — condición
  conocida/aceptada, no bloquea Fase 3.

## Decisión: `relacion` de la empresa nueva en `createAudit` = `'prospecto'`

El form clásico de nueva auditoría con "Cliente nuevo" crea una empresa que no existía. Le asigno
`relacion='prospecto'` (no `'cliente'`). Razón:

- **No-destructivo / conservador:** iniciar una auditoría NO implica que la empresa ya sea cliente
  (puede ser un relevamiento de un prospecto). Nunca eleva a `cliente` por error; ascender a
  `cliente` es una decisión manual desde la ficha del CRM (Fase 4+).
- **Coherente con el resto de #23:** mismo criterio que el default del selector de import en vivo
  (Fase 2). `relacion` (clasificación maestra) es distinta del `estado` de seguimiento
  auto-derivado (Fase 5), que sí pasará a `auditoria_en_curso` por tener una auditoría abierta.
- El design no fijaba un valor para este caso (solo menciona `INSERT INTO empresa`); el task me pidió
  definir un default sensato y documentarlo → `prospecto`.

## Archivos creados

| Archivo | Qué |
|---|---|
| `tests/audits-create.test.ts` | T12 — R27. Picker sobre `empresa` (relkind 'r'); FK válida; CAB precargado; empresa nueva `relacion='prospecto'`; sync a tabla base. 4/4. |
| `tests/mercado-queries.test.ts` | T13 — R28. Universo cuenta empresa de la tabla base; JOIN recupera datos maestros (erp_actual/rubro) desde `empresa`. 2/2. |
| `e2e/auditorias-new.spec.ts` | T12 — R27. Form clásico crea empresa (`relacion='prospecto'`) + FK `audit.empresa_id` verificada en DB; CAB precargado. 1/1 chromium. |

## Archivos modificados

| Archivo | Cambio | Task |
|---|---|---|
| `src/lib/server/backoffice/audits.ts` | 5 sitios `FROM/INSERT INTO/UPDATE client` → `empresa`: `getClientCabFields` (FROM), `syncClientFromCab` (UPDATE), `createAudit` (INSERT INTO empresa con `relacion='prospecto'` + 2 SELECT de datos maestros), `getAuditById` (JOIN empresa + SELECT), `searchClientsForPicker` (FROM). `audit.empresa_id` ya venía renombrado de Fase 1. | T9 |
| `src/lib/server/mercado/queries.ts` | 10/10 `JOIN client c ON c.id = a.empresa_id` → `JOIN empresa c ON c.id = a.empresa_id`. | T10 |

## T11 — sin cambios de código (verificación)

- `src/routes/(app)/auditorias/new/+page.server.ts` y `+page.svelte`: solo invocan
  `createAudit`/`searchClientsForPicker`/`getCabItemsForTypes` de `audits.ts` (ya reconectados en T9).
  No referencian `client`/`empresa` directamente. Sin cambio.
- `src/lib/backoffice/cab-client-map.ts`: lógica pura sobre el tipo `ClientCabFields` (sin SQL); el
  tipo no cambia de forma (se alimenta de `empresa` vía `audits.ts`). Sin cambio.
- Verificado funcionalmente por `audits-create.test.ts` (CAB precargado) y el e2e.

## Desvíos del spec

1. **`relacion='prospecto'` en `createAudit`** (el design no fijaba el valor): documentado arriba.
2. **e2e `mercado.spec.ts` "admin ve dashboard" falla por selector brittle PRE-EXISTENTE**, ajeno a
   Fase 3: `nav a[href="/mercado"]` resuelve a 2 elementos (nav responsive duplicado en
   `+layout.svelte`) → strict-mode violation en una aserción que NO es de datos. El dashboard
   renderiza y las queries `empresa` ejecutan sin error (empty-state correcto en la DB dev, que no
   tiene auditorías cerradas). NO toqué `+layout.svelte`, la nav ni ese spec. La cobertura funcional
   de R28 vive en `mercado-queries.test.ts` (verde). Queda flagueado como follow-up fuera de #23.
3. **Wart de logging en la acción `create`** (`auditorias/new/+page.server.ts`): el `redirect(303)`
   está DENTRO del `try`, así el redirect (que SvelteKit lanza como throw) cae en el `catch` →
   `failFromError`, que NO chequea `isRedirect` y loguea `action_unhandled_error` antes de re-lanzar
   (el redirect igual propaga y la navegación funciona). Pre-existente (predata #23), no introducido
   por Fase 3; no lo toqué para no salir de alcance. Flagueado como follow-up.

## Trazabilidad R ↔ test (Fase 3)

| R | Test |
|---|---|
| R27 | `audits-create.test.ts` (picker relkind 'r' sobre `empresa`; FK `audit.empresa_id` a empresa; CAB precargado; empresa nueva `relacion='prospecto'`; sync a tabla base) + `e2e/auditorias-new.spec.ts` (form clásico crea empresa + FK verificada en DB, CAB precargado) |
| R28 | `mercado-queries.test.ts` (universo cuenta empresa de la tabla base; el JOIN recupera erp_actual/rubro desde `empresa`) + `mercado-aggregations.test.ts` (10/10, sigue verde tras reapuntar los joins) |
| R21 | cubierto por R27: CAB precargado vía `cab-client-map` reutilizado por `createAudit`/`getAuditById` (sin cambio de forma del tipo) |

## Checklist de verificación — COMPLETADA

1. [x] Docker arriba; `db-db-1` healthy; migraciones aplicadas.
2. [x] `pnpm run check` → 0 errores; `pnpm run build` → OK.
3. [x] Tests Fase 3: `audits-create` 4/4, `mercado-queries` 2/2. Regresión dirigida verde.
4. [x] Suite completa: 797 passed / 2 skipped / 0 failed.
5. [x] e2e `auditorias-new`: 1/1 chromium (crea empresa + FK en DB + CAB precargado).
6. [x] `tasks.md` T9–T13 + Gate Fase 3 marcados `[x]`.
7. [x] NO se tocó `status` en `feature_list.json`. NO commit/push.

---

# Implementación — #23 · Fase 4 (cockpit `/crm`: listado, ficha, edición)

> Construir el cockpit `/crm`: listado con filtros + paginación server-side para ~2000 empresas, y
> ficha de empresa para ver/editar datos maestros y `relacion`. Tasks T14–T19. Spec aprobado por
> puerta humana (2026-06-16). El import masivo de Fase 2 queda **integrado** en el nuevo cockpit.

## Estado: FASE 4 VERDE (2026-06-16, sesión implementer, a espera de reviewer)

- `pnpm run check` → **0 errores** (26 warnings pre-existentes de Svelte `state_referenced_locally`).
- `pnpm run build` → **OK**.
- Suite completa: **823 passed | 2 skipped | 0 failed** (177 files). Sin flakiness en esta corrida.
- Tests nuevos Fase 4 (T18): `api/empresas-list` 10/10, `api/empresa-update` 11/11,
  `api/empresas-guards` 7/7 = **26/26**.
- e2e (T19): `crm-cockpit` **6/6** chromium. Regresión Fase 2: `crm-import` **3/3** (heading
  actualizado a "CRM — Empresas"; los testids del panel de import siguen intactos).
- Gate del arnés `init.sh`: paso de tests `[OK] Todos los tests pasan`; el `[FAIL]` final es la
  condición conocida/aceptada ">1 in_progress" (#12/#23). No bloquea Fase 4.

## Estrategia de paginación/virtualización (decisión)

**Paginación server-side (LIMIT/OFFSET + COUNT).** Elegida sobre virtualización del lado cliente:

- No carga las ~2000 fichas a la vez (R18): el listado trae solo campos de fila + un **estado
  efectivo derivado de forma agregada en UNA query** (sin N+1). Por defecto 50 filas/página.
- El **estado efectivo se deriva en SQL** (CTE `est` con `LEFT JOIN LATERAL` agregado por empresa:
  flags `has_open_audit`/`has_closed_audit`/`has_presupuesto`/`has_contact_event` +
  `last_activity_at`), replicando las reglas de `deriveEmpresaEstado` (design §3) y honrando
  `estado_override` (R15). Hacerlo en SQL permite **filtrar y ordenar por estado server-side** sin
  traer todo a memoria. La formalización del módulo `empresa-estado.ts` + eventos/timeline es Fase 5;
  acá se computa lo necesario para el listado/ficha (el `empresa_evento` ya existe desde Fase 1,
  vacío hasta Fase 5, así que `has_contact_event` es hoy `false` salvo carga manual).
- `countEmpresas` evita la CTE pesada cuando NO hay filtro de estado (COUNT barato apoyado en los
  índices `empresa_relacion_idx` / `empresa_razon_social_lower_idx`); solo deriva el estado cuando
  el filtro de estado lo exige.
- Ventana activa/inactiva = **18 meses** (decisión humana 9).
- Smoke real contra la DB dev (2322 empresas): `listEmpresas`/`countEmpresas`/filtros/picker OK
  antes de construir la UI.

## Cómo se integró el import de Fase 2 en el nuevo cockpit

El panel de import masivo de Fase 2 (R31) se **conserva idéntico** dentro del cockpit reescrito:
mismo toggle (`crm-import-clients-toggle`), panel (`crm-import-clients-panel`), **selector de
relación** (`crm-import-relacion`, cliente|prospecto), file input, submit y reporte
(`crm-import-*`). El `submitImport` sigue POSTeando a `/api/crm/clients/import` con el `relacion` del
selector. Solo cambiaron textos de UI ("Importar clientes"→"Importar empresas") y el heading de la
página ("CRM — Leads"→"CRM — Empresas"). El e2e de Fase 2 (`crm-import.spec.ts`) se actualizó en su
única aserción de heading; sus testids no cambiaron y pasa 3/3.

## Archivos creados

| Archivo | Qué | Task |
|---|---|---|
| `src/lib/server/db/empresa.ts` | Capa de datos: `listEmpresas`, `countEmpresas`, `getEmpresaById`, `updateEmpresa`, `searchEmpresasForPicker`, `getEmpresaCabFields` + derivación de estado en SQL. | T14 |
| `src/lib/crm/empresa-view.ts` | Labels/badges de relacion y estado (compartido cockpit/ficha/tests). | T16/T17 |
| `src/routes/(app)/crm/[id]/+page.server.ts` | Load de la ficha (guard `requireStaff`, 404 si no existe). | T17 |
| `src/routes/(app)/crm/[id]/+page.svelte` | Ficha ver/editar datos maestros + `relacion`; banner estado efectivo + origen. | T17 |
| `src/routes/api/crm/empresas/[id]/+server.ts` | `POST` update (guard staff, Zod, 404). | T17 |
| `tests/api/empresas-list.test.ts` | 10 tests — R16/R17/R18 (búsqueda, filtros, paginación, estado derivado). | T18 |
| `tests/api/empresa-update.test.ts` | 11 tests — R19 (persistencia, null-clear, no pisa ausentes, 404, Zod). | T18 |
| `tests/api/empresas-guards.test.ts` | 7 tests — R29 (401/403 update e import; load del cockpit). | T18 |
| `e2e/crm-cockpit.spec.ts` | 6 tests — R16/R18/R19 (paginación grande, filtros, ficha, editar+persistir). | T19 |

## Archivos modificados

| Archivo | Cambio | Task |
|---|---|---|
| `src/lib/server/crm/schemas.ts` | + `empresaRelacionSchema`, `empresaEstadoSchema`, `empresaListFiltersSchema`, `empresaUpdateSchema` (`.strict()`) + tipos. | T15 |
| `src/lib/server/crm/errors.ts` | + `EmpresaNotFoundError` (code `EMPRESA_NOT_FOUND`). | T15 |
| `src/routes/(app)/crm/+page.server.ts` | Reescrito: `listEmpresas`/`countEmpresas` con `empresaListFiltersSchema` desde la URL; guard `requireStaff`. | T16 |
| `src/routes/(app)/crm/+page.svelte` | Reescrito como cockpit de empresas (tabla, filtros, badges, paginación). Import Fase 2 integrado. | T16 |
| `e2e/crm-import.spec.ts` | Aserción de heading actualizada ("CRM — Leads"→"CRM — Empresas"). Testids intactos. | T16 (colateral) |

## Archivos eliminados

| Archivo | Razón |
|---|---|
| `e2e/crm.spec.ts` | E2E del **cockpit de leads viejo** (`crm-funnel-counts`, `crm-leads-table`, `crm-lead-row`, `crm-status-select`): esa UI ya no existe tras reescribir `/crm` como cockpit de empresas. Su reemplazo funcional es `e2e/crm-cockpit.spec.ts` (T19). La cobertura de la **API de leads** permanece en `tests/api/crm-leads.test.ts` (el endpoint y `crm-leads.ts` se conservan, decisión humana 8 / Fase 6). |

## Bug real encontrado y corregido (T18/T19)

`updateEmpresa` usaba `sql(obj, ...present)` con `present = cols.filter(c => c in patch)`. El form de
la ficha envía todas las columnas; el preprocess de `optionalInt` (`empleados/puestos/sedes`) mapea
`null → undefined`, y **postgres.js rechaza valores `undefined`** (`UNDEFINED_VALUE`). El e2e de
edición lo destapó (500 en el endpoint). Fix: `present` ahora filtra también `valor !== undefined`,
así las claves con `undefined` se omiten (conservan el valor actual) y solo `null` explícito limpia
campos *de texto* nullable. Consecuencia documentada: limpiar un campo **entero** a `null` desde la
ficha no se soporta por este camino (mantiene el valor); aceptable para Fase 4.

## Decisiones de diseño (dentro del spec)

1. **Guard del endpoint de update = staff** (admin o técnico), no admin-only. R29 dice "el cockpit y
   la lectura DEBEN requerir staff … y el import DEBE requerir admin". El update es una mutación del
   cockpit (no el import masivo), así que `requireStaff` es lo correcto; el import sigue
   `requireAdminApi`. Helper local `requireStaffApi` (mismo patrón envelope que `requireAdminApi`).
2. **Estado efectivo en el listado/ficha ya en Fase 4.** R16 pide "filtros por estado efectivo", lo
   que obliga a derivar el estado ya en Fase 4. Se hace con una query agregada en SQL (sin N+1),
   replicando las reglas del design §3. El módulo dedicado `empresa-estado.ts`, los eventos/timeline
   y el override manual son Fase 5; acá solo se **lee** el estado derivado + `estado_override`.
3. **`empresaUpdateSchema` excluye `estado_override`** (`.strict()` lo rechaza con 400): setear el
   override es Fase 5 (R23 genera evento), no este endpoint.
4. **`relacion` admite `ex_cliente` en filtro y ficha** (aunque el import en vivo no lo ofrezca):
   `ex_cliente` es manual desde la ficha (decisión humana 6), y el cockpit debe poder filtrarlo/verlo.

## Trazabilidad R ↔ test (Fase 4)

| R | Test |
|---|---|
| R16 | `api/empresas-list.test.ts` (filtra por relacion; estado efectivo derivado; filtra por estado) + `e2e/crm-cockpit.spec.ts` (filtro relacion; filtro estado ex_cliente→inactiva) |
| R17 | `api/empresas-list.test.ts` (búsqueda ILIKE por razón social y CUIT; `searchEmpresasForPicker`) + `e2e/crm-cockpit.spec.ts` (búsqueda por razón social) |
| R18 | `api/empresas-list.test.ts` (paginación: perPage limita, total cuenta todas, sin solapamiento) + `e2e/crm-cockpit.spec.ts` (pagina el dataset grande, >1 página, ≤50/pág, avanza a pág 2) |
| R19 | `api/empresa-update.test.ts` (persiste datos maestros + relacion; null-clear; no pisa ausentes; 404; Zod) + `api/empresas-list.test.ts` (`getEmpresaById`) + `e2e/crm-cockpit.spec.ts` (abrir ficha; editar+persistir verificado en DB) |
| R20 | Parcial en Fase 4: la ficha muestra estado efectivo + origen (override/derivado) vía `ficha-estado-source`. El **timeline** de eventos es Fase 5 (T22). |
| R29 | `api/empresas-guards.test.ts` (update 401 sin sesión / 403 rol no staff; import admin-only 401/403; load del cockpit redirect sin sesión / 403 rol no staff) |

## Checklist de verificación — COMPLETADA

1. [x] Docker arriba; `db-db-1` healthy; migraciones aplicadas.
2. [x] `pnpm run check` → 0 errores; `pnpm run build` → OK.
3. [x] Tests Fase 4 (T18): 26/26 verde. Suite completa: 823 passed / 2 skipped / 0 failed.
4. [x] e2e `crm-cockpit` 6/6 chromium; e2e `crm-import` (Fase 2) 3/3 (regresión intacta).
5. [x] Empresas importadas (Fase 2) visibles y editables en `/crm` end-to-end (listado + ficha).
6. [x] `tasks.md` T14–T19 + Gate Fase 4 marcados `[x]`.
7. [x] NO se tocó `status` en `feature_list.json`. NO commit/push.

---

# Fase 5 — Estado híbrido, eventos/timeline, crear auditoría desde ficha, export

**Estado:** IMPLEMENTADA Y VERDE (implementer, 2026-06-16, a espera de reviewer).
T20–T25 + Gate Fase 5 marcados `[x]`. Esta fase **retoma** un intento previo que cayó por un error de
servidor (500): casi todo el código ya estaba escrito y verificado parcialmente por el leader
(`empresa-estado.ts`, las funciones de `empresa.ts`, schemas, CSV, endpoints, ficha). Lo que faltaba
era cerrar los tests (T25), la reconciliación SQL↔TS y la verificación/marcado — más arreglar el bug
que causaba el 500.

## Causa raíz del 500 / "17 failed de #23"

El test de paridad `tests/empresa-estado.test.ts` (`mkPresupuesto`) insertaba en `audit_report` con
columnas que **no existen** en el schema real: `content` y `created_by`. El schema usa
`canonical_json` (jsonb NOT NULL), `schema_version` (text NOT NULL) y `requested_by` (uuid NOT NULL),
más el CHECK `audit_report_approved_coherence` (status='aprobado' ⇒ `approved_by`/`approved_at` no
nulos). Ese INSERT roto era la `PostgresError` que rompía el caso "presupuestada" y aparecía como los
"17 failed de #23" que reportó #24. **Arreglado**: INSERT corregido a las columnas reales +
`approved_by`/`approved_at`. La señal de "presupuestada" que verifica el test sigue siendo la correcta
(un `audit_proposal_link` con status `activo` sobre una audit no archivada de la empresa, exactamente
lo que consulta `estadoSelectSql`).

## Reconciliación SQL ↔ TS (mandato del reviewer de Fase 4)

- **Constante única.** `ACTIVITY_WINDOW_MONTHS = 18` se define **una sola vez** en
  `src/lib/server/crm/empresa-estado.ts` y se **importa** desde `src/lib/server/db/empresa.ts`
  (el `CASE`/intervalo SQL la interpola: `now() - (${ACTIVITY_WINDOW_MONTHS} || ' months')::interval`).
  No queda hardcodeada en dos lados. El test la importa del mismo módulo.
- **Paridad verificada por test.** `tests/empresa-estado.test.ts` (suite "paridad SQL↔TS") inserta
  empresas reales con sus audits/presupuesto/eventos y compara, para cada una, el estado derivado por
  el `CASE` SQL (`getEmpresaById`) contra `deriveEmpresaEstado(getEstadoInputs(...))` (TS). Cubre los
  7 estados, las ramas activa/inactiva (ventana 18m), ex_cliente y el override (source=override). 23/23.
- **Política documentada (en `empresa-estado.ts`, encabezado del módulo):** *toda* modificación de las
  reglas de estado se aplica en el TS (`deriveEmpresaEstado`) **y** en el `CASE` SQL de
  `estadoSelectSql` (en `empresa.ts`) **en el mismo cambio**; el test de paridad es la red que detecta
  divergencias. La ventana de actividad se cambia en un solo lugar (la constante).

## Archivos creados (Fase 5, tests)

- `tests/api/empresa-eventos.test.ts` — capa de datos (`addEvento`/`listEventos`/`setEstadoOverride`:
  registrar evento/nota, orden más-reciente-primero, override genera `cambio_estado` con from/to,
  limpiar override vuelve al derivado, `EmpresaNotFoundError`) + endpoints `[id]/eventos` (GET/POST) y
  `[id]/override` (POST): 201/200, Zod 400 (texto vacío, tipo inválido, estado inválido), 404, guards
  (401 sin sesión, técnico=staff OK). **17/17.** Cubre R22, R23, R29.
- `tests/api/empresas-export.test.ts` — `GET /api/crm/empresas/export`: CSV con headers correctos
  (`text/csv`, `Content-Disposition` attachment, BOM EF BB BF verificado sobre el ArrayBuffer),
  exporta sin paginar, respeta filtros relacion/estado/búsqueda, guard staff (401 sin sesión, técnico
  OK). **7/7.** Cubre R26, R29.
- `e2e/crm-ficha.spec.ts` — flujo de la ficha en chromium: estado efectivo + origen (derivado);
  registrar evento → aparece en el timeline (y al recargar el estado derivado pasa a "contactada");
  setear override (gana, source=Fijado manualmente, persistido en DB) y limpiarlo (vuelve al
  derivado); crear auditoría desde la ficha (CAB precargado en el picker, `audit.empresa_id` = la
  empresa, sin crear una empresa nueva). **4/4.** Cubre R20, R21, R22, R23.

## Archivos modificados (Fase 5)

- `tests/empresa-estado.test.ts` — **fix del bug del 500**: INSERT a `audit_report` corregido a las
  columnas reales del schema (`canonical_json`, `schema_version`, `requested_by`, `approved_by`,
  `approved_at`). El resto del test (7 estados + reglas + override + paridad) ya estaba completo y
  correcto; ahora 23/23.

> Nota: no hizo falta tocar `empresa-estado.ts`, `empresa.ts`, schemas, `empresa-csv.ts`, los
> endpoints ni la ficha — ya estaban implementados y la constante ya estaba unificada. El único cambio
> de producto/lógica pendiente era de tests.

## Trazabilidad R ↔ test (Fase 5)

| R | Test |
|---|---|
| R13 | `empresa-estado.test.ts` (reglas determinísticas de `deriveEmpresaEstado`: sin_contactar/contactada/en_curso/auditada/presupuestada; prioridad presupuestada>auditada>en_curso) + paridad SQL↔TS |
| R14 | `empresa-estado.test.ts` (cliente activa/inactiva según ventana; `withinActivityWindow` borde de 18m; ex_cliente→inactiva) + paridad SQL↔TS (rama activa/inactiva) |
| R15 | `empresa-estado.test.ts` (`effectiveEstado`: override gana, source=override; null→derived) + `api/empresa-eventos.test.ts` (override endpoint source=override) + paridad SQL↔TS (override) |
| R20 | `e2e/crm-ficha.spec.ts` (estado efectivo + origen; timeline visible) |
| R21 | `e2e/crm-ficha.spec.ts` (crear auditoría desde la ficha: CAB precargado, `audit.empresa_id`=empresa, no crea empresa nueva) |
| R22 | `api/empresa-eventos.test.ts` (addEvento/listEventos, orden, 404, endpoint GET/POST + Zod + guards) + `e2e/crm-ficha.spec.ts` (registrar evento → timeline) |
| R23 | `api/empresa-eventos.test.ts` (setEstadoOverride genera `cambio_estado` from/to; limpiar→derivado; endpoint override Zod/404/guards) + `e2e/crm-ficha.spec.ts` (set/clear override, persistencia en DB) |
| R26 | `api/empresas-export.test.ts` (CSV filtrado, headers, BOM, respeta relacion/estado/búsqueda, guard) |

## Checklist de verificación (Fase 5) — COMPLETADA

1. [x] Docker arriba; `db-db-1` healthy.
2. [x] `pnpm run check` → **0 errores** (31 warnings pre-existentes); `pnpm run build` → OK.
3. [x] Suite Fase 5 junta (estado + eventos + export): **47/47** (23 + 17 + 7).
4. [x] e2e `crm-ficha` **4/4** chromium.
5. [x] `pnpm test` completo: **870 passed / 2 skipped / 0 failed** (180 files) en corrida limpia.
6. [x] Paridad SQL↔TS verificada por test; `ACTIVITY_WINDOW_MONTHS` constante única importada;
   política de reconciliación documentada en `empresa-estado.ts`.
7. [x] `tasks.md` T20–T25 + Gate Fase 5 marcados `[x]`.
8. [x] NO se tocó `status` en `feature_list.json`. NO commit/push.

## Desvíos / notas

- **Flakiness pre-existente (no Fase 5).** En corridas full en paralelo, ~1 de cada 3 rompe un test
  por colisión de DB compartida: `canonical-contract` (snapshot) y ocasionalmente
  `audits-create`/`syncClientFromCab` (otra suite muta la misma fila de empresa). Ambos pasan 100%
  en aislamiento (`audits-create` 4/4 verificado) y son ajenos a Fase 5. Ya estaba documentado en el
  Gate de Fase 1.
- **`init.sh` `[FAIL]`** por (a) ">1 in_progress" (#12/#23/#24 — condición conocida/aceptada por
  Martín) y (b) la flakiness transitoria de (1). No es bloqueo de Fase 5.
- **Refresh del badge tras registrar un evento (UI):** la ficha agrega el evento al timeline
  client-side pero **no** recomputa el badge de estado en el acto (sí lo hace para el override, que
  viene en la respuesta del endpoint). El estado derivado correcto se ve al recargar (el `load` lo
  deriva en SQL). El e2e lo refleja con un `page.reload()`. Mejora cosmética opcional, no bloqueante:
  el `POST /eventos` podría devolver el estado efectivo recalculado para refrescar el badge sin reload.

---

# Fase 6 — Deprecación documentada (SIN drop)

**Estado:** IMPLEMENTADA Y VERDE (implementer, 2026-06-16, a espera de reviewer final).
T26–T28 + Gate Fase 6 marcados `[x]`. **Última fase de #23: las 6 fases quedan completas.**

> Decisión humana (2026-06-16, decisión 8): `crm_lead`, `crm_lead_event` y la vista de
> compatibilidad `client` se **conservan como red de rollback/backup**. NO se dropean en #23. La
> limpieza física es tarea manual futura, fuera de alcance. **CERO `DROP`.**

## T26 — Migración 017 (deprecación por `COMMENT ON`)

- **Archivo:** `migrations/017_empresa_deprecacion.sql`. (El slot 016 ya está ocupado por
  `016_reunion_verification_status.sql` de #24 → se usó **017**, el siguiente número libre.)
- **Qué hace:** tres `COMMENT ON` que marcan los objetos legacy:
  - `COMMENT ON TABLE crm_lead` → "DEPRECADO #23 (2026-06-16): foldeada en `empresa` por migr. 015.
    Conservar como red de rollback/backup. SOLO LECTURA: no escribir. …".
  - `COMMENT ON TABLE crm_lead_event` → "DEPRECADO #23: historial migrado a `empresa_evento` (015).
    … SOLO LECTURA: no escribir. …".
  - `COMMENT ON VIEW client` → "DEPRECADO #23: vista de compatibilidad sobre `empresa` (015). El
    código reconectado de #23 lee/escribe `empresa` directo. Conservar como red de rollback/backup.
    … Eliminación física = tarea manual futura …".
  Cada comentario apunta a `specs/23_crm_empresa_unificada/cleanup-manual.md`.
- **CERO `DROP` · CERO `REVOKE` (decisión justificada en el encabezado del .sql):** el rol de
  conexión de la app (`auditapp`) es **DUEÑO** de `crm_lead`/`crm_lead_event`/`empresa` y de la vista
  `client` (verificado en `pg_class.relowner`). En Postgres el **dueño conserva acceso pleno**
  independientemente de los `GRANT/REVOKE`, así que un `REVOKE INSERT/UPDATE/DELETE` desde `auditapp`
  sería un **no-op para `auditapp`** y NO impediría escrituras → sería "deprecación de fachada",
  engañosa. Tampoco hay un rol de solo-lectura separado al cual revocar, y la vista `client` SIGUE
  recibiendo INSERT/UPDATE del seed dev y de lectores legacy aún no migrados (revocar ahí podría
  romperlos). Por eso **solo `COMMENT`**; la prohibición real de escritura se sostiene por convención
  + `cleanup-manual.md`. (El task permitía REVOKE "solo si es seguro sin romper nada" → no lo era.)
- **Idempotencia (probada):**
  - `COMMENT ON` es idempotente por naturaleza (reescribe el comentario en cada corrida, sin error,
    sin duplicar). El **body** de 017 se ejecutó **2× directo** contra la DB (`psql … < 017…sql`):
    3 `COMMENT` cada vez, **sin errores** la segunda corrida.
  - Aplicada con el **runner del repo** (`pnpm db:migrate` → `runMigrations`, que envuelve el archivo
    en `sql.begin` y la registra en `schema_migration`). Re-correr el runner la **saltea** (versión
    ya registrada). Comentarios verificados vivos en el catálogo (`obj_description`).
- **Confirmación CERO DROP:** `grep -rniE "DROP (TABLE|VIEW|…) (crm_lead|crm_lead_event|client)"
  migrations/` → **ninguna coincidencia ejecutable** en NINGUNA migración. En `017` los únicos
  matches de "DROP"/"REVOKE" están en **comentarios/prosa** que explican su ausencia. Cubre R30
  (cierre, sin drop).

## T27 — Procedimiento de limpieza manual posterior

- **Archivo creado:** `specs/23_crm_empresa_unificada/cleanup-manual.md`. Documenta:
  - **Qué se conserva** hoy y por qué (tablas + vista + `crm-leads.ts` + state-machine + sus tests).
  - **Precondición OBLIGATORIA** antes de cualquier `DROP`: ningún lector/escritor en uso (greps
    concretos sobre `src/`), tests legacy retirados/reescritos primero, rollback confirmado
    innecesario, `pg_dump` de respaldo externo.
  - **Orden de `DROP` respetando FK** (verificado en el catálogo en Fase 6:
    `crm_lead_event.lead_id → crm_lead`; `crm_lead.client_id → empresa`): **(1)** `DROP TABLE
    crm_lead_event` → **(2)** `DROP TABLE crm_lead` → **(3)** `DROP VIEW client`. Dropear las
    legacy NO afecta a `empresa` ni a sus FK vivas (`audit.empresa_id`, `empresa_evento.empresa_id`).
  - **Código a borrar** en esa limpieza futura: `src/lib/server/db/crm-leads.ts`,
    `src/lib/server/crm/state-machine.ts` (y `src/lib/crm/view.ts` si queda huérfano), tests
    `crm-leads`/`crm-state-machine`/`empresa-compat`, residuos en `tests/helpers/db.ts`.
  - **Verificación posterior** (futura): check/build/test/init verdes + ausencia de los objetos.
- **NO se borró** `src/lib/server/db/crm-leads.ts` ni `src/lib/server/crm/state-machine.ts` en #23:
  quedan como referencia (y los siguen usando `tests/api/crm-leads.test.ts` /
  `tests/crm-state-machine.test.ts`, que pasan).

## T28 — Suite completa verde + cierre de trazabilidad

- `pnpm run check` → **0 errores** (31 warnings pre-existentes de Svelte `state_referenced_locally`).
- `pnpm run build` → **OK** (adapter-node, built en ~3s).
- `pnpm test` → **870 passed | 2 skipped | 0 failed** (180 files) en corrida **dedicada/limpia**
  (reproducida 2 veces tras reiniciar el contenedor). Cubre migración, dedup, FK, auto-derivación,
  override, guards, import reconectado (con selector de relacion).
- e2e (chromium): `crm-cockpit` 6/6 + `crm-ficha` 4/4 + `crm-import` 3/3 = **13/13**, y
  `auditorias-new` 1/1.
- **Incidente de entorno (no es regresión):** durante una corrida con **dos** `pnpm test` full
  concurrentes (la mía + la de `init.sh`), el contenedor `db-db-1` fue **OOM-killed (exit 137)** →
  `ECONNREFUSED` en cascada (25 fails en una corrida, `connect 5432` en otra). Tras reiniciar
  Postgres (`docker compose up -d db`), re-aplicar migraciones (017 seguía registrada, comentarios
  vivos) y correr `pnpm test` **aislado**, la suite volvió a **870/2/0**. Causa: presión de memoria
  por concurrencia, **ajena a Fase 6** (que no agrega TS/SQL de comportamiento, solo COMMENTs + docs).

## Gate Fase 6

| Check | Resultado |
|---|---|
| `pnpm run check` | 0 errores (31 warnings pre-existentes) |
| `pnpm run build` | OK |
| `pnpm test` (dedicado) | 870 passed / 2 skipped / 0 failed (180 files) |
| e2e cockpit/ficha/import + auditorias-new | 13/13 + 1/1 chromium |
| Migración 017 aplicada con el runner | sí; registrada en `schema_migration` |
| Migración 017 idempotente | sí (body 2× = no-op; runner saltea en re-corrida) |
| **CERO `DROP` de tablas/vista legacy** | **confirmado por grep en `migrations/`** |
| `./init.sh` | `[FAIL]` SOLO por (a) ">1 in_progress" (#12/#23/#24, conocido/aceptado) y (b) flakiness DB-compartida-paralelo (truncate race; `pnpm test` aislado pasa 870/0) |

## Trazabilidad R ↔ test — CIERRE COMPLETO (#23, R13–R32)

> Acceptance #11: mapa completo de los requirements que cierran en Fases 3–6 (R1–R12, R30, R32 ya
> mapeados en la tabla de Fase 1 arriba). Esta tabla recoge R13–R32 con su test concreto.

| R | Test (vitest/playwright) | Fase |
|---|---|---|
| R13 | `tests/empresa-estado.test.ts` (7 estados + prioridad presupuestada>auditada>en_curso) + paridad SQL↔TS | 5 |
| R14 | `tests/empresa-estado.test.ts` (reglas determinísticas; activa/inactiva ventana 18m; `withinActivityWindow` borde; ex_cliente→inactiva) + paridad SQL↔TS | 5 |
| R15 | `tests/empresa-estado.test.ts` (`effectiveEstado`: override gana source=override; null→derived) + `tests/api/empresa-eventos.test.ts` + paridad SQL↔TS | 5 |
| R16 | `tests/api/empresas-list.test.ts` (filtra por relacion + por estado efectivo) + `e2e/crm-cockpit.spec.ts` (filtro relacion; filtro estado ex_cliente→inactiva) | 4 |
| R17 | `tests/api/empresas-list.test.ts` (búsqueda ILIKE razón social + CUIT; `searchEmpresasForPicker`) + `e2e/crm-cockpit.spec.ts` (búsqueda) + índice `empresa_razon_social_lower_idx` (`empresa-schema.test.ts`) | 4 / 1 |
| R18 | `tests/api/empresas-list.test.ts` (paginación: perPage limita, total cuenta todas, sin solapamiento) + `e2e/crm-cockpit.spec.ts` (dataset grande, >1 página, ≤50/pág) | 4 |
| R19 | `tests/api/empresa-update.test.ts` (persiste datos maestros + relacion; null-clear; no pisa ausentes; 404; Zod) + `tests/api/empresas-list.test.ts` (`getEmpresaById`) + `e2e/crm-cockpit.spec.ts` (editar+persistir en DB) | 4 |
| R20 | `e2e/crm-ficha.spec.ts` (estado efectivo + origen override/derivado; timeline visible) | 5 |
| R21 | `e2e/crm-ficha.spec.ts` (crear auditoría desde ficha: CAB precargado, `audit.empresa_id`=empresa, no crea empresa nueva) — y vía R27 el CAB se alimenta de `empresa` | 5 |
| R22 | `tests/api/empresa-eventos.test.ts` (addEvento/listEventos tipo/texto/fecha/autor, orden, 404, endpoint Zod+guards) + `e2e/crm-ficha.spec.ts` (evento→timeline) | 5 |
| R23 | `tests/api/empresa-eventos.test.ts` (setEstadoOverride genera `cambio_estado` from/to; limpiar→derivado; endpoint Zod/404/guards) + `e2e/crm-ficha.spec.ts` (set/clear override persistido) | 5 |
| R24 | `tests/clients-import-upsert.test.ts` (escribe tabla base `empresa`, relkind r/v, upsert por CUIT sin dup, no `client` físico) + `tests/api/clients-import.test.ts` | 2 |
| R25 | `tests/clients-import-upsert.test.ts` (empresa nueva toma la relacion del selector — cliente y prospecto — no nula, no inferida por origen) | 2 |
| R26 | `tests/api/empresas-export.test.ts` (CSV con solo filas del filtro activo relacion/estado/búsqueda; headers; BOM; guard) | 5 |
| R27 | `tests/audits-create.test.ts` (picker relkind 'r' sobre `empresa`; FK `audit.empresa_id`; CAB precargado; empresa nueva `relacion='prospecto'`; sync) + `e2e/auditorias-new.spec.ts` | 3 |
| R28 | `tests/mercado-queries.test.ts` (universo cuenta `empresa` base; JOIN recupera erp_actual/rubro desde `empresa`) + `tests/mercado-aggregations.test.ts` (10/10) | 3 |
| R29 | `tests/api/empresas-guards.test.ts` (401 sin sesión / 403 rol no staff en cockpit+update) + `tests/api/clients-import.test.ts` (import `requireAdminApi` 401/403) + `tests/api/empresa-eventos.test.ts` (guards eventos/override) | 4 / 2 / 5 |
| R30 | `tests/empresa-compat.test.ts` (vista `client` legible = `empresa`; lectores legacy OK) — **conservada sin drop**; Fase 6 la deja DEPRECADA por `COMMENT` (migr. 017) sin tocar su legibilidad | 1 / 6 |
| R31 | `tests/clients-import-upsert.test.ts` + `tests/api/clients-import.test.ts` (Zod `cliente\|prospecto`, 400 si falta/inválida, rechaza `ex_cliente`) + `e2e/crm-import.spec.ts` (selector en UI; prospecto→prospecto, cliente→cliente en DB) | 2 |
| R32 | `tests/empresa-migration.test.ts` (carga histórica: presupuestos/tango→`cliente`, prospectos→`prospecto`) | 1 |

> R1–R12 (esquema + migración/dedup/FK/idempotencia) están mapeados en la tabla de **Fase 1**
> (arriba en este mismo archivo). Con R13–R32 cerrados aquí, los **20 requirements R13–R32 +
> R1–R12** quedan trazados a un test concreto verde → **trazabilidad #23 COMPLETA**.

## Checklist de verificación (Fase 6) — COMPLETADA

1. [x] Docker arriba; `db-db-1` healthy (reiniciado tras el OOM; volumen persistió 017 + comentarios).
2. [x] `migrations/017_empresa_deprecacion.sql` creada; aplicada con el runner; registrada en
   `schema_migration`; idempotente (body 2× = no-op).
3. [x] **CERO `DROP`/`REVOKE` ejecutable** en 017 ni en ninguna migración (grep) — solo `COMMENT ON`.
4. [x] `specs/23_crm_empresa_unificada/cleanup-manual.md` creado (qué/orden/precondición + código).
5. [x] `pnpm run check` 0 errores; `pnpm run build` OK; `pnpm test` 870/2/0 (dedicado).
6. [x] e2e cockpit/ficha/import 13/13 + auditorias-new 1/1 chromium.
7. [x] Mapa R↔test R13–R32 cerrado en este archivo (acceptance #11).
8. [x] `tasks.md` T26–T28 + Gate Fase 6 marcados `[x]`.
9. [x] NO se borró `crm-leads.ts` ni `state-machine.ts`. NO se tocó `feature_list.json`. NO commit/push.
