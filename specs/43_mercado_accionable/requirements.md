# Requirements — #43 43_mercado_accionable

> Evolución de **#18 `18_dashboard_mercado`**: reimagina `/mercado` para que deje de ser un
> dashboard descriptivo (promedios de índices) y pase a ser **accionable** para SyS (reseller de
> Tango ERP + infraestructura en el NEA). Decisión de puerta humana 2026-06-24:
> - El universo se **mantiene** en auditorías `cerradas` (`audit.status = 'cerrada'`), igual que #18.
>   No se abre a toda la base `empresa`.
> - **Sin cambios** en modelo de datos (cero migraciones de schema), sin cambios en scoring. Solo
>   lectura, idéntica postura que #18.
> - Las queries de #18 ya hacen `JOIN audit → empresa → audit_closure`. Se **enriquece** leyendo
>   columnas de la fila `empresa` ya unida (`provincia`, `relacion`, estado derivado) y
>   desagregando `audit_closure` (`top_risks`, `quick_wins`, `upsell_findings`) **sin tocar el
>   denominador** (sigue siendo `cerradas`).
> - Se conservan los filtros (segmento/rubro/fechas), la anonimización por umbral **n < 3**
>   (`suppressed`) en cortes comparativos y la regla de **no exponer** razón social/cuit/ids/textos
>   individuales. Se suma `provincia` como filtro nuevo.
>
> Contratos base reutilizados (#18): `MercadoDashboard`, `GroupStat`, `MIN_GROUP_N = 3`,
> `buildMercadoDashboard`, anonimización (#18 R10), supresión (#18 R14), degradación (#18 R13),
> `indexToSemaphore` (#8), `parseMercadoFilters`/`MercadoInvalidFilterError` (#18).
> Estado derivado: `src/lib/server/crm/empresa-estado.ts` (`deriveEmpresaEstado`) y su espejo SQL
> `estadoSelectSql` en `src/lib/server/db/empresa.ts` (paridad SQL↔TS ya testeada en
> `tests/empresa-estado.test.ts`).
>
> Depende de: `18_dashboard_mercado` (#18), `23_crm_empresa_unificada` (#23, entidad `empresa` con
> `provincia`/`relacion`/estado), `08_cierre_scoring` (#8, `audit_closure`), `03_auth_roles` (#3).

## R1 — Acceso solo admin

CUANDO un usuario solicita la página `/mercado` o el endpoint `GET /api/mercado`, el sistema DEBE responder `401` (o redirect a `/login` en la página) sin sesión válida y `403` si la sesión no tiene rol `admin` (incluye rol `tecnico`), y `200` solo para `admin`.

**Verificación:** `tests/api/mercado.test.ts` — sin sesión 401; `tecnico` 403; `admin` 200. `e2e/mercado.spec.ts` — técnico no ve el link ni accede.

## R2 — Universo: solo auditorías cerradas filtradas

CUANDO el sistema calcula cualquier métrica de cualquier bloque, DEBE incluir únicamente auditorías con `audit.status = 'cerrada'` (y sus empresas unidas) que cumplan todos los filtros activos (`segment`, `rubro`, `provincia`, `from`/`to` sobre `closed_at`).

**Verificación:** `tests/mercado-aggregations.test.ts` — auditorías en `en_cierre`/`borrador` no alteran ningún bloque; cada filtro y sus combinaciones reducen el universo en todos los bloques nuevos.

## R3 — Solo lectura, sin migraciones ni cambios de scoring

El sistema NO DEBE exponer mutaciones desde `/mercado` (el endpoint solo expone `GET`) ni requerir migraciones de schema ni alterar el motor de scoring.

**Verificación:** `tests/api/mercado.test.ts` — `POST`/`PATCH`/`DELETE` responden `405`/`404`. Revisión: el cambio no agrega archivos en `migrations/` ni toca `src/lib/server/scoring/`.

## R4 — Filtro nuevo: provincia

CUANDO el request incluye el query param `provincia` (texto), el sistema DEBE restringir el universo a las auditorías cerradas cuya `empresa.provincia` normalizada (trim + colapso de espacios + comparación case-insensitive) coincide con el valor normalizado del filtro, recalculando todos los bloques.

**Verificación:** `tests/api/mercado.test.ts` — `provincia=Chaco` y `provincia=  chaco ` reducen el universo al mismo conjunto; provincia inexistente → universo vacío (R18).

## R5 — Filtros inválidos

SI un query param de filtro tiene un valor inválido (segmento fuera de `A`/`B`/`C`, fecha no parseable, `from > to`), ENTONCES el sistema DEBE responder `400` con envelope `apiError` sin ejecutar agregaciones.

**Verificación:** `tests/api/mercado.test.ts` — `segment=Z`, `from=ayer`, `from>to` → 400 con `success: false`.

## R6 — Bloque migración a Tango: distribución agrupada de ERP

CUANDO un admin consulta el dashboard, el sistema DEBE devolver la distribución de `empresa.erp_actual` sobre el universo agrupada en exactamente tres grupos —`tango`, `competidor` (SAP/Bejerman/Odoo/otros reconocidos), `sin_erp` (NULL/vacío/"sin erp")— con conteo y porcentaje por grupo (porcentaje sobre el universo, sin división por cero).

**Verificación:** `tests/mercado-aggregations.test.ts` — seed con valores `Tango`, `tango gestión`, `SAP`, `Bejerman`, `Odoo`, `Otro X`, `NULL`/`''` produce los 3 grupos con conteos y % exactos.

## R7 — Bloque migración a Tango: cruce por rubro y por segmento con supresión

CUANDO un admin consulta el dashboard, el sistema DEBE devolver el cruce de los grupos de ERP (`tango`/`competidor`/`sin_erp`) por `rubro` y por `segmento`, y SI un grupo de rubro o segmento tiene `n < 3` (`MIN_GROUP_N`) ENTONCES DEBE marcar ese corte `suppressed: true` sin el desglose por grupo de ERP (solo `n`).

**Verificación:** `tests/mercado-aggregations.test.ts` — rubro con n=3 trae el desglose completo; rubro con n=2 trae `suppressed: true` sin desglose; mismos cortes por segmento.

## R8 — Bloque mapa NEA: cortes por provincia normalizada

CUANDO un admin consulta el dashboard, el sistema DEBE devolver la distribución del universo por `empresa.provincia` normalizada (bucket `Sin dato` para `NULL`/vacío), con conteo por provincia y un indicador `is_nea` verdadero para Chaco/Corrientes/Formosa/Misiones.

**Verificación:** `tests/mercado-aggregations.test.ts` — variantes `corrientes`/`Corrientes `/`CORRIENTES` colapsan a una sola provincia con `is_nea: true`; `NULL`/`''` caen en `Sin dato` con `is_nea: false`; conteos exactos.

## R9 — Bloque mapa NEA: cortes por rubro y por segmento

CUANDO un admin consulta el dashboard, el sistema DEBE devolver la distribución del universo por `rubro` (bucket `Sin rubro`) y por `segmento`, cada uno con su conteo.

**Verificación:** `tests/mercado-aggregations.test.ts` — conteos por rubro (incl. `Sin rubro`) y por segmento contra seed conocido.

## R10 — Bloque salud base instalada: índice ERP promedio de usuarios Tango

CUANDO un admin consulta el dashboard, el sistema DEBE devolver el promedio (redondeado a entero) de `audit_closure.indice_erp` de las auditorías cerradas cuya `empresa.erp_actual` es del grupo `tango`, reportando `n` (auditorías que aportan), y SI ese `n < 3` ENTONCES DEBE devolver el promedio como `null` con `suppressed: true`.

**Verificación:** `tests/mercado-aggregations.test.ts` — promedio correcto con n≥3 (NULLs de índice excluidos del promedio); con n=2 llega `suppressed: true` y `avg_erp: null`.

## R11 — Bloque salud base instalada: ranking de módulos Tango menos adoptados

CUANDO un admin consulta el dashboard, el sistema DEBE devolver, para los usuarios Tango del universo, cada módulo del catálogo `cab_modulos_tango` (catálogo tomado de `template_item.options->'choices'`, selector `ti.options->>'item_code' = 'cab_modulos_tango'`) con su conteo de adopción (`adopted`), faltantes (`missing = n_tango − adopted`) y porcentaje de adopción, ordenado por adopción ascendente (menos adoptados primero = mayor oportunidad de cross-sell); SI el conjunto de usuarios Tango tiene `n < 3` ENTONCES DEBE suprimir el ranking (lista vacía + `suppressed: true`).

**Verificación:** `tests/mercado-aggregations.test.ts` — un módulo del catálogo nunca elegido aparece con `adopted: 0` y `missing = n_tango` al tope del ranking; un módulo elegido por todos aparece al final; con n_tango=2 el ranking llega suprimido.

## R12 — Bloque hallazgos recurrentes: agregación por categoría de top_risks y quick_wins

CUANDO un admin consulta el dashboard, el sistema DEBE agregar los elementos de `audit_closure.top_risks` (array de `{ text, severity }`) y de `audit_closure.quick_wins` (array de strings) del universo en categorías por palabras clave (`backups`, `seguridad`, `licencias`, `hardware_eol`, `redes`, `otros`) y devolver, por cada lista, el ranking de categorías por frecuencia descendente más el total de hallazgos, marcado como sección interna.

**Verificación:** `tests/mercado-aggregations.test.ts` — textos con palabras clave conocidas caen en su categoría; textos sin coincidencia caen en `otros`; arrays vacíos o ausentes no rompen; totales correctos; la respuesta marca el bloque `internal: true`.

## R13 — Bloque hallazgos recurrentes: nunca exponer textos individuales

El sistema NO DEBE incluir en la respuesta los textos crudos de `top_risks`, `quick_wins` ni `upsell_findings`; solo conteos por categoría y totales agregados.

**Verificación:** `tests/api/mercado.test.ts` — el payload serializado no contiene ningún texto de hallazgo del seed; solo claves de categoría y números.

## R14 — Bloque riesgo / retención: empresas en riesgo dentro del universo

CUANDO un admin consulta el dashboard, el sistema DEBE devolver, sobre las **empresas** con al menos una auditoría cerrada en el universo filtrado, el conteo de las que tienen `relacion = 'ex_cliente'`, el conteo de las que tienen estado efectivo `inactiva`, y el conteo de empresas en riesgo (unión distinta de ambas), junto al total de empresas del universo.

**Verificación:** `tests/mercado-aggregations.test.ts` — seed con empresas `ex_cliente`, empresas con estado derivado `inactiva` y empresas activas produce los tres conteos y el total correctos sobre empresas distintas (no por auditoría).

## R15 — Bloque riesgo / retención: fuente única de derivación de estado

El sistema DEBE derivar el estado efectivo del bloque riesgo/retención reutilizando el espejo SQL existente `estadoSelectSql` (`src/lib/server/db/empresa.ts`), sin introducir una tercera derivación de estado.

**Verificación:** `tests/mercado-aggregations.test.ts` — un caso con `estado_override` seteado a `inactiva` y otro con `inactiva` solo por auto-derivación cuentan ambos como inactivos, coherente con `estadoSelectSql`; revisión: la query del bloque compone `estadoSelectSql`, no un `CASE` nuevo.

## R16 — Anonimización: endpoint sin identificadores individuales

El sistema NO DEBE incluir en la respuesta del endpoint identificadores de empresa individual (`razon_social`, `cuit`, `empresa_id`/`client_id`, `audit_id`, nombres de referentes) en ninguna métrica de ningún bloque.

**Verificación:** `tests/api/mercado.test.ts` — el JSON de respuesta no contiene esos campos ni los valores del seed (assert sobre el payload serializado).

## R17 — Supresión n < 3 en cortes comparativos

SI un corte comparativo que expone promedios o desgloses por grupo (cruce ERP×rubro/segmento de R7, promedio ERP de usuarios Tango de R10, ranking de módulos de R11, conteos del bloque riesgo/retención de R14) queda con `n < MIN_GROUP_N` (3) bajo los filtros activos, ENTONCES el sistema DEBE devolver ese corte con `suppressed: true` y sin el dato sensible (promedio/desglose/conteo según el bloque).

**Verificación:** `tests/mercado-aggregations.test.ts` — para cada bloque comparativo, un universo/grupo con n=2 llega `suppressed: true` sin el dato; con n=3 llega completo.

## R18 — Degradación con cero o pocos datos

MIENTRAS el universo filtrado tiene cero auditorías cerradas, el sistema DEBE responder `200` con la estructura completa de todos los bloques en estado vacío explícito (`n: 0`, listas vacías, promedios `null`, conteos `0`) sin divisiones por cero, y la UI DEBE mostrar un estado vacío con mensaje claro en lugar de gráficos rotos.

**Verificación:** `tests/mercado-aggregations.test.ts` — DB sin cerradas → estructura completa con `n: 0`/`null`/`[]`. `e2e/mercado.spec.ts` — filtro sin resultados muestra el estado vacío.

## R19 — Visualizaciones SVG/CSS con tokens SyS, sin libs nuevas

CUANDO un admin navega a `/mercado`, el sistema DEBE renderizar los cinco bloques con SVG/CSS propios usando tokens `--sys-*`, reutilizando los componentes de `src/lib/components/mercado/*` donde aplique, sin agregar dependencias de gráficos al `package.json`.

**Verificación:** `e2e/mercado.spec.ts` — los cinco bloques renderizan con data del seed. Revisión de `package.json` (sin libs nuevas de charts) en review.

## R20 — No regresión del dashboard #18

El sistema NO DEBE romper las métricas y contratos existentes de #18 (distribución ERP, módulos, índices global/segmento/rubro, semáforos, evolución mensual, upsell interno): la evolución es aditiva sobre `MercadoDashboard`.

**Verificación:** `tests/mercado-aggregations.test.ts` y `tests/api/mercado.test.ts` existentes de #18 siguen verdes; los campos previos del dashboard se mantienen.

## Cobertura de acceptance

| Acceptance (`feature_list.json` #43) | Requirements |
|---|---|
| Vista `/mercado` solo admin, solo lectura, universo cerradas filtrado, sin migraciones/scoring | R1, R2, R3 |
| Bloque migración a Tango (erp agrupado + cruce rubro/segmento) | R6, R7 |
| Bloque mapa NEA (provincia/rubro/segmento, conteos) | R8, R9 |
| Bloque salud base instalada (avg ERP Tango + módulos menos adoptados) | R10, R11 |
| Bloque hallazgos recurrentes (top_risks + quick_wins por categoría, interno) | R12, R13 |
| Bloque riesgo/retención (ex_cliente / inactiva sobre cerradas) | R14, R15 |
| Anonimización n<3 + endpoint sin ids/textos | R13, R16, R17 |
| Degradación con cero/pocos datos | R18 |
| SVG/CSS tokens, sin libs, reutiliza #18 | R19, R20 |
| Filtro provincia / filtros inválidos | R4, R5 |
| Tests SQL por bloque, ruta/endpoint, e2e + init.sh | Verificación de R1–R20 |

## Decisiones de la puerta (resueltas, no abiertas)

- **Estado efectivo vs. derivado (R14/R15):** el bloque riesgo/retención usa el **estado efectivo**
  (override-aware) vía `estadoSelectSql`, que es lo que muestra el cockpit `/crm` y ya tiene
  paridad SQL↔TS testeada. Se evita una tercera derivación. `relacion = 'ex_cliente'` se reporta
  además como sub-conteo propio porque es un dato maestro explícito.
- **Catálogo de módulos (R11):** se toma de `template_item.options->'choices'` para que los módulos
  nunca adoptados (faltantes = cross-sell) aparezcan en el ranking, no solo los presentes en
  respuestas.
- **Categorización de hallazgos (R12):** keyword-based en TS, una sola función testeable; solo se
  emiten conteos por categoría, nunca el texto (R13).
- **Supresión en distribuciones de conteo puro (R8/R9):** las distribuciones por provincia/rubro/
  segmento que solo exponen conteos NO se suprimen (igual criterio que la `erp_distribution` de
  #18); la supresión n<3 aplica a cortes que exponen promedios o desgloses sensibles (R17).

## Open questions

- Ninguna bloqueante. Todos los acceptance del backlog #43 quedaron cubiertos por R1–R20 con
  verificación concreta.
