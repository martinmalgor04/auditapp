# Requirements — #18 18_dashboard_mercado

> Dashboard solo-admin de estudio de mercado NEA en el backoffice: métricas agregadas y
> anonimizadas sobre auditorías `cerradas` (ERP en uso, módulos Tango, índices IT/ERP por
> segmento/rubro, semáforos, evolución temporal, upsell agregado interno). Solo lectura.
> Fuente: SPEC-07i (`docs/source-specs/specs-07/09-contrato-datos-ia/spec.md`) §6 (dashboard v2)
> + plan lead magnet Fase 5 (base de datos de mercado regional).
> La data ya se captura desde #2/#9: `client` (erp_actual, rubro, provincia, empleados…),
> `audit` (segment, closed_at), `audit_closure` (indice_it, indice_erp, upsell_findings),
> respuesta `modulos_tango` (briefing → `extractMarketData`).
> Depende de: `09_contrato_datos` (#9), `03_auth_roles` (#3), `11_ui_branding_sys` (#11 / id 10).

## R1 — Acceso solo admin

CUANDO un usuario solicita la ruta del dashboard de mercado o su endpoint de datos, el sistema DEBE responder `401` (o redirect a `/login` en la página) sin sesión válida y `403` si la sesión no tiene rol `admin` (incluye rol `tecnico`).

**Verificación:** `tests/api/mercado.test.ts` — sin sesión 401; `tecnico` 403; `admin` 200. `e2e/mercado.spec.ts` — técnico no ve el link ni accede.

## R2 — Universo: solo auditorías cerradas

CUANDO el sistema calcula cualquier métrica del dashboard, DEBE incluir únicamente auditorías con `audit.status = 'cerrada'`.

**Verificación:** `tests/mercado-aggregations.test.ts` — seed con auditorías en `en_cierre`/`borrador` no altera los agregados.

## R3 — Distribución de ERP actual

CUANDO un admin consulta el dashboard, el sistema DEBE devolver la distribución de `client.erp_actual` (conteo y porcentaje por valor normalizado, con bucket `Sin dato` para `NULL`/vacío) sobre el universo filtrado.

**Verificación:** `tests/mercado-aggregations.test.ts` — conteos exactos contra seed conocido, incl. bucket `Sin dato`.

## R4 — Módulos Tango más usados

CUANDO un admin consulta el dashboard, el sistema DEBE devolver el conteo de cada módulo Tango (desagregando el array `modulos_tango` de la respuesta de briefing por auditoría cerrada) ordenado descendente.

**Verificación:** `tests/mercado-aggregations.test.ts` — array con módulos repetidos entre auditorías produce conteos correctos; respuesta ausente/no-array no rompe el agregado.

## R5 — Índices promedio globales y por segmento

CUANDO un admin consulta el dashboard, el sistema DEBE devolver el promedio (redondeado a entero) de `indice_it` e `indice_erp` global y por segmento `A`/`B`/`C`, excluyendo valores `NULL` del promedio y reportando `n` (cantidad de auditorías que aportan) por celda.

**Verificación:** `tests/mercado-aggregations.test.ts` — promedios por segmento con NULLs mezclados; `n` correcto.

## R6 — Índices promedio por rubro

CUANDO un admin consulta el dashboard, el sistema DEBE devolver el promedio de `indice_it` e `indice_erp` agrupado por `client.rubro` (bucket `Sin rubro` para `NULL`) con su `n`.

**Verificación:** `tests/mercado-aggregations.test.ts` — agrupación por rubro con `n` y bucket `Sin rubro`.

## R7 — Distribución de semáforos

CUANDO un admin consulta el dashboard, el sistema DEBE devolver la distribución de semáforos (verde/amarillo/rojo, según `indexToSemaphore` de #8) para `indice_it` e `indice_erp`, excluyendo auditorías con índice `NULL` y reportando cuántas quedaron excluidas.

**Verificación:** `tests/mercado-aggregations.test.ts` — umbrales de `indexToSemaphore` respetados (mismos cortes que el cierre); conteo de excluidas correcto.

## R8 — Evolución temporal

CUANDO un admin consulta el dashboard, el sistema DEBE devolver la serie mensual (por `audit.closed_at`, mes calendario, zona horaria del servidor) de cantidad de auditorías cerradas y promedio de `indice_it`/`indice_erp` del mes.

**Verificación:** `tests/mercado-aggregations.test.ts` — auditorías en 3 meses distintos generan 3 puntos con conteo y promedios correctos; meses sin datos no aparecen como cero implícito erróneo.

## R9 — Upsell agregado (solo interno)

CUANDO un admin consulta el dashboard, el sistema DEBE devolver el agregado de `upsell_findings`: total de hallazgos, promedio por auditoría y conteo de auditorías con al menos un hallazgo, marcado en la respuesta como sección interna.

**Verificación:** `tests/mercado-aggregations.test.ts` — totales y promedio contra seed; `[]` no rompe.

## R10 — Anonimización en vistas comparativas

El sistema NO DEBE incluir en la respuesta del endpoint de dashboard identificadores de cliente individual (`razon_social`, `cuit`, `client_id`, `audit_id`, nombres de referentes) en ninguna métrica agregada.

**Verificación:** `tests/api/mercado.test.ts` — el JSON de respuesta no contiene ninguno de esos campos ni los valores del seed (assert sobre el payload serializado).

## R11 — Filtros: segmento, rubro y rango de fechas

CUANDO el request incluye query params `segment` (`A`|`B`|`C`), `rubro` y/o `from`/`to` (ISO date, sobre `closed_at`), el sistema DEBE recalcular todas las métricas restringiendo el universo a las auditorías cerradas que cumplen todos los filtros combinados.

**Verificación:** `tests/api/mercado.test.ts` — cada filtro solo y combinados reducen el universo correctamente.

## R12 — Filtros inválidos

SI un query param de filtro tiene un valor inválido (segmento fuera de `A`/`B`/`C`, fecha no parseable, `from > to`), ENTONCES el sistema DEBE responder `400` con envelope `apiError` sin ejecutar agregaciones.

**Verificación:** `tests/api/mercado.test.ts` — `segment=Z`, `from=ayer`, `from>to` → 400 con `success: false`.

## R13 — Degradación con pocos datos

MIENTRAS el universo filtrado tiene cero auditorías cerradas, el sistema DEBE responder `200` con métricas vacías explícitas (`n: 0`, listas vacías, promedios `null`) sin divisiones por cero, y la UI DEBE mostrar un estado vacío con mensaje claro en lugar de gráficos rotos.

**Verificación:** `tests/mercado-aggregations.test.ts` — DB sin cerradas → estructura completa con `n: 0` y `null`. `e2e/mercado.spec.ts` — filtro sin resultados muestra mensaje de estado vacío.

## R14 — Umbral de anonimato en cortes comparativos

SI un corte agrupado (por rubro o por segmento) queda con `n < 3` auditorías bajo los filtros activos, ENTONCES el sistema DEBE devolver ese corte con `suppressed: true` y sin promedios (la UI muestra «muestra insuficiente»), para no permitir inferir datos de un cliente individual.

**Verificación:** `tests/mercado-aggregations.test.ts` — grupo con n=2 llega `suppressed: true` sin promedios; grupo con n=3 llega completo.

## R15 — Página backoffice con branding SyS

CUANDO un admin navega a la página del dashboard, el sistema DEBE renderizar todas las visualizaciones (barras, distribución, serie temporal, semáforos) con SVG/CSS propios usando tokens `--sys-*` de #11, sin agregar dependencias de gráficos.

**Verificación:** `e2e/mercado.spec.ts` — página renderiza secciones clave con data del seed. `tests/mercado-aggregations.test.ts` + revisión de `package.json` en review (sin libs nuevas de charts).

## R16 — Solo lectura

El sistema NO DEBE exponer mutaciones desde el dashboard de mercado (el endpoint acepta únicamente `GET`).

**Verificación:** `tests/api/mercado.test.ts` — `POST`/`PATCH`/`DELETE` al endpoint responden `405` (o 404 por ausencia de handler).

## Cobertura de acceptance

| Acceptance (`feature_list.json` #18) | Requirements |
|---|---|
| Vista backoffice solo admin con métricas agregadas | R1, R2, R15, R16 |
| Distribución ERP y módulos Tango, índices promedio y por segmento A/B/C | R3, R4, R5, R6, R7, R8 |
| Upsell agregado por tipo (solo interno) | R9 (ver open question OQ1) |
| Filtros por segmento, rubro y rango de fechas | R11, R12 |
| Degradación con cero o pocas auditorías | R13, R14 |
| Tests de agregaciones SQL y de la ruta | Verificación de R2–R14 |

## Open questions (no bloqueantes; decisión por defecto indicada)

- **OQ1 — «conteo por tipo» de upsell:** `upsell_findings` es `{ text, internal: true }` sin campo
  `tipo` (schema canónico #9). Default adoptado: agregado por volumen (R9), sin clasificación por
  tipo. Si se quiere tipología real, requiere extender el cierre (#8) con un campo `tipo` — fuera
  de alcance de #18.
- **OQ2 — «zona»:** no existe campo zona; el más cercano es `client.provincia` (texto libre,
  frecuentemente NULL). Default adoptado: no se incluye corte por zona en MVP; el corte
  comparativo es segmento + rubro. Se puede sumar `provincia` como filtro en una iteración.
- **OQ3 — índices por circuito/sección:** el acceptance pide índices IT/ERP; los scores por
  sección (`audit_section_score`) quedan fuera del MVP para mantener el dashboard acotado.
