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
