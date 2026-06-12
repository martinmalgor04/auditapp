# Requirements — #14 14_informe_ia

> Pipeline en-app que procesa el JSON canónico de una auditoría cerrada: genera borrador de informe
> con la API de Claude (job asíncrono), exige revisión/edición humana, renderiza HTML branded SyS
> apto PDF y mantiene una salida interna separada con recomendaciones de presupuesto.
> Fuente: SPEC-07i (`docs/source-specs/specs-07/09-contrato-datos-ia/spec.md`) §2, §3, §5, §9 +
> plan lead magnet §7.5 Etapa 6 (`sysaudit/docs/2026-06-03_plan_sys_auditoria-lead-magnet_v1.md`).
> **Contrato visual del render imprimible:** `docs/plantillas/informe/template_informe_pdf_a4_v1.html`
> (informe PDF A4, 7 páginas). El template web (`template_informe_web_v2.html`) es contrato de #15
> (entrega), no de esta feature.
> Depende de: `08_cierre_scoring` (#8), `09_contrato_datos` (#9), `11_ui_branding_sys` (#11 / id 10).

## R1 — Permisos: admin opera, técnico asignado lee lo aprobado

CUANDO un usuario solicita generar, editar, regenerar o aprobar un informe IA, el sistema DEBE responder `401` sin sesión válida y `403` si la sesión no tiene rol `admin`. CUANDO un usuario con rol `tecnico` asignado a la auditoría consulta un informe en estado `aprobado` (listado, detalle sin `internal_draft` y render imprimible), el sistema DEBE permitir el acceso de solo lectura; SI el informe no está `aprobado` o el técnico no está asignado a la auditoría, ENTONCES DEBE responder `403` (decisión puerta 2026-06-12).

**Verificación:** `tests/api/informe-create.test.ts` — sin sesión 401; rol `tecnico` 403 en POST/PATCH/approve; admin 2xx. `tests/api/informe-review.test.ts` — técnico asignado GET sobre `aprobado` 200 sin `internal_draft`; sobre `borrador` 403; técnico no asignado 403.

## R2 — Solo auditorías cerradas

SI la auditoría existe pero `audit.status != 'cerrada'`, ENTONCES el POST de generación DEBE responder `409` sin crear fila en `audit_report`.

**Verificación:** `tests/api/informe-create.test.ts` — auditoría `en_cierre` retorna 409 y conteo de `audit_report` no cambia.

## R3 — Configuración IA requerida

SI `ANTHROPIC_API_KEY` no está configurada al disparar la generación, ENTONCES el sistema DEBE responder `503` con mensaje claro sin crear fila en `audit_report`.

**Verificación:** `tests/api/informe-create.test.ts` — env sin key retorna 503; tabla sin filas nuevas.

## R4 — Persistencia versionada en audit_report

CUANDO un admin dispara la generación, el sistema DEBE insertar una fila en `audit_report` con `audit_id`, `version = max(version)+1` por auditoría (1 si no hay previas), `status = 'pendiente'`, `requested_by`, y el snapshot del JSON canónico consumido (`canonical_json` + `schema_version`).

**Verificación:** `tests/api/informe-create.test.ts` — primer POST crea version 1; segundo POST crea version 2; snapshot presente con `schema_version = '1.0'`.

## R5 — Insumo: JSON canónico sin transformaciones manuales

CUANDO el job procesa un informe, el sistema DEBE obtener el insumo invocando `buildCanonicalAuditJson(auditId, { allowOpen: false })` (la misma función que sirve `GET /api/audits/[id]/export`) y validar que `schema_version` coincide con `CANONICAL_SCHEMA_VERSION` antes de armar el prompt.

**Verificación:** `tests/informe-pipeline.test.ts` — pipeline usa el builder canónico (spy/mock) y rechaza payload con `schema_version` distinto.

## R6 — Generación asíncrona no bloqueante

CUANDO se crea la fila `audit_report`, el sistema DEBE responder de inmediato con `{ report_id, version, status: 'pendiente' }` y ejecutar el pipeline en background sin bloquear la respuesta HTTP.

**Verificación:** `tests/api/informe-create.test.ts` — respuesta llega con status `pendiente` mientras el mock de Claude sigue colgado (promesa no resuelta).

## R7 — Máquina de estados restringida

CUANDO se transiciona `audit_report.status`, el sistema DEBE permitir únicamente `pendiente→generando`, `generando→borrador`, `generando→error`, `error→generando` (reintento) y `borrador→aprobado`; toda otra transición DEBE lanzar `InformeInvalidTransitionError`.

**Verificación:** `tests/informe-state-machine.test.ts` — tabla de transiciones válidas pasa; `aprobado→borrador`, `pendiente→aprobado`, etc. lanzan error tipado.

## R8 — Modelo Claude configurable con salida estructurada

CUANDO el pipeline llama a la API de Claude, el sistema DEBE usar el modelo de `INFORME_CLAUDE_MODEL` (default `claude-opus-4-8`) vía `@anthropic-ai/sdk` con salida estructurada (`output_config.format` JSON schema derivado de los schemas Zod del borrador).

**Verificación:** `tests/informe-pipeline.test.ts` — el adapter recibe el modelo de env (override en test) y un `output_config.format`; default aplicado si la var falta.

## R9 — Prompt versionado en el repo

El sistema DEBE cargar el prompt de generación desde un módulo versionado en `src/lib/server/informe/prompts/` que exporte `INFORME_PROMPT_VERSION`, y DEBE persistir en la fila `audit_report` el `prompt_version` y el `model` usados.

**Verificación:** `tests/informe-prompt.test.ts` — el prompt no está inline en el pipeline (importado del módulo); `tests/informe-pipeline.test.ts` — fila resultante guarda `prompt_version` y `model`.

## R10 — Validación Zod del borrador cliente (campos del template A4)

CUANDO la IA responde, el sistema DEBE validar la salida cliente con `reportClientDraftSchema`, que cubre todos los campos editables (`✏️`/placeholders) del template A4: resumen ejecutivo (diagnóstico central en una línea, lead, stat «circuitos con controles N de T» nullable — null cuando la IA no tiene evidencia y el render muestra placeholder «a editar» (decisión puerta 8), interpretación del índice, recomendación central, fortalezas opcional), índices con semáforo por tipo, hallazgos por circuito (dimensiones Doc./Controles/Madurez por sección + lectura transversal de 3 a 4 observaciones con evidencia), riesgos priorizados (intro + 3 a 5 riesgos con título, descripción y evidencia del relevamiento), plan (título, descripción callout, 2 a 6 etapas semana/título/descripción, «qué necesitamos del cliente» y «qué no incluye»), día a día (intro, 2 a 4 circuitos débiles con 3 funcionalidades Tango c/u, callout transversal opcional) y próximos pasos (3 a 5 ítems), antes de persistir en `client_draft`.

**Verificación:** `tests/informe-schemas.test.ts` — payload completo válido pasa; sin `resumen.diagnostico`, con 6 riesgos, con 2 observaciones transversales, con etapa sin `semana` o con circuito día a día de 2 funcionalidades es rechazado.

## R11 — Validación Zod de la salida interna

CUANDO la IA responde, el sistema DEBE validar la salida interna con `reportInternalDraftSchema` (recomendaciones de presupuesto con línea, rango estimado, urgencia, probabilidad de cierre, candidato a financiación y candidato a abono recurrente) antes de persistir en `internal_draft`.

**Verificación:** `tests/informe-schemas.test.ts` — recomendación sin `rango_estimado` o con `urgencia` fuera de enum es rechazada; payload válido pasa.

## R12 — Índices, scores por circuito y semáforos del cálculo determinístico

CUANDO se persiste `client_draft`, el sistema DEBE sobrescribir los valores numéricos de los índices IT/ERP y sus semáforos con los del JSON canónico (vía `indexToSemaphore`), descartando cualquier valor numérico que haya devuelto la IA; además, los scores por circuito (tabla de hallazgos, «hoy N/100» del día a día) y sus puntos de semáforo NO DEBEN existir en el draft: el render los DEBE tomar siempre del snapshot canónico vía `seccion_code`, y el pipeline DEBE rechazar drafts con `seccion_code` inexistente en el snapshot.

**Verificación:** `tests/informe-pipeline.test.ts` — mock de Claude devuelve índices inventados; el draft persistido contiene los índices del canónico y semáforo coherente; draft con `seccion_code` desconocido termina en `error`. `tests/informe-render.test.ts` — los scores de la tabla del snapshot renderizado provienen del fixture canónico.

## R13 — Fallo de pipeline a estado error

SI la llamada a Claude falla o la validación Zod de la respuesta falla, ENTONCES el sistema DEBE marcar `status = 'error'` con `error_message` no vacío y NO DEBE persistir borrador parcial en `client_draft` ni `internal_draft`.

**Verificación:** `tests/informe-pipeline.test.ts` — mock que lanza y mock que devuelve JSON inválido dejan fila en `error` con mensaje y drafts `NULL`.

## R14 — Guard de generación colgada

SI una fila permanece en `generando` más de `INFORME_GENERATION_TIMEOUT_MS` (default 300000), ENTONCES el endpoint de estado DEBE reportarla y persistirla como `error` con mensaje de timeout.

**Verificación:** `tests/api/informe-status.test.ts` — fila `generando` con `updated_at` viejo se reporta `error`; fila reciente sigue `generando`.

## R15 — Estados visibles en UI

MIENTRAS existe un informe para la auditoría, la UI DEBE mostrar su estado `{pendiente, generando, borrador, aprobado, error}` actualizado por polling a `GET /api/audits/[id]/report/[version]/status`.

**Verificación:** `tests/api/informe-status.test.ts` — endpoint devuelve el estado por versión; `e2e/informe.spec.ts` — indicador pasa de «Generando» a «Borrador» con pipeline mockeado.

## R16 — Informe cliente sin material interno

El sistema NO DEBE incluir `upsell_findings` ni recomendaciones internas de presupuesto en `client_draft`, en `reportClientDraftSchema` ni en el render HTML cliente (el render lee exclusivamente `client_draft` + datos públicos del canónico).

**Verificación:** `tests/informe-render.test.ts` — render de fixture con `upsell_findings` poblados no contiene ninguno de sus textos; `tests/informe-schemas.test.ts` — `reportClientDraftSchema` rechaza claves `upsell`/`recomendaciones` por `strict()`.

## R17 — Vista interna separada solo SyS

CUANDO un admin abre la vista interna de un informe en estado `borrador` o `aprobado`, el sistema DEBE mostrar `upsell_findings` del canónico y las recomendaciones de `internal_draft` (qué presupuestar, rangos, urgencia, probabilidad, financiación, abono) en una vista separada del informe cliente.

**Verificación:** `tests/api/informe-review.test.ts` — GET detalle incluye `internal_draft` solo para admin; `e2e/informe.spec.ts` — tab «Vista interna» lista recomendaciones.

## R18 — Regla de líneas y rangos (sin producto cerrado)

El prompt de generación DEBE instruir que las recomendaciones internas sugieran líneas de solución y rangos de precio, y que NUNCA fijen marca/modelo/producto específico cerrado (regla plan §7.5).

**Verificación:** `tests/informe-prompt.test.ts` — el texto del prompt contiene la instrucción de líneas/rangos y la prohibición de producto cerrado.

## R19 — Copy sin jerga prohibida

El prompt de generación DEBE incluir la lista de jerga prohibida SyS («solución 360°», «disruptivo», «excelencia», «de la mano de», «transformación digital», «world class») con la instrucción de no usarla en ningún texto del informe.

**Verificación:** `tests/informe-prompt.test.ts` — el prompt contiene los seis términos prohibidos dentro del bloque de prohibición.

## R20 — Edición humana por sección

CUANDO un admin edita el texto de una sección de un informe en estado `borrador`, el sistema DEBE validar el draft resultante con `reportClientDraftSchema`, persistirlo en `client_draft` y registrar `edited_by` y `edited_at`; SI el informe no está en `borrador`, ENTONCES el PATCH DEBE responder `409`.

**Verificación:** `tests/api/informe-review.test.ts` — PATCH válido persiste texto editado con auditoría de edición; PATCH sobre `aprobado` retorna 409; PATCH con draft inválido retorna 400.

## R21 — Regenerar crea nueva versión

CUANDO un admin solicita regenerar el informe de una auditoría, el sistema DEBE crear una nueva fila `audit_report` con `version + 1` y correr el pipeline de nuevo, sin modificar ni borrar las versiones anteriores.

**Verificación:** `tests/api/informe-create.test.ts` — regenerar con v1 en `borrador` crea v2; v1 conserva su `client_draft` original.

## R22 — Reintento tras error

CUANDO un admin reintenta un informe en estado `error`, el sistema DEBE transicionar esa misma fila a `generando` y reejecutar el pipeline conservando `audit_id` y `version`.

**Verificación:** `tests/api/informe-review.test.ts` — POST retry sobre `error` vuelve a correr el mock y termina en `borrador` con la misma version; retry sobre `borrador` retorna 409.

## R23 — Aprobación explícita e inmutable

CUANDO un admin aprueba un informe en estado `borrador`, el sistema DEBE marcar `status = 'aprobado'` con `approved_by` y `approved_at`; a partir de ahí la fila DEBE quedar inmutable (sin PATCH ni re-aprobación).

**Verificación:** `tests/api/informe-review.test.ts` — approve persiste quién y cuándo; segundo approve y PATCH posterior retornan 409.

## R24 — Sin auto-aprobación

El sistema NO DEBE transicionar un informe a `aprobado` ni exponer render cliente como «aprobado» sin la acción explícita de aprobación de un admin (el pipeline termina siempre en `borrador` o `error`).

**Verificación:** `tests/informe-pipeline.test.ts` — pipeline exitoso deja `borrador`, nunca `aprobado`; `tests/informe-state-machine.test.ts` — no existe transición `generando→aprobado`.

## R25 — URL de Loom opcional

DONDE el informe tiene `loom_url` cargada (URL `https` de `loom.com` validada con Zod, editable solo en estado `borrador`), el render HTML DEBE embeber el video en la vista de pantalla y ocultarlo en `@media print` (el template A4 no incluye bloque de video; la entrega web #15 lo aprovecha); sin `loom_url` el bloque NO DEBE renderizarse.

**Verificación:** `tests/informe-schemas.test.ts` — URL no-Loom rechazada; `tests/informe-render.test.ts` — snapshot con y sin `loom_url` (iframe presente/ausente, oculto en print).

## R26 — Render HTML según template A4 oficial

CUANDO se abre la vista de impresión de un informe `borrador` o `aprobado`, el sistema DEBE renderizar el HTML del template A4 oficial (`docs/plantillas/informe/template_informe_pdf_a4_v1.html`) como componente Svelte con datos del draft y del snapshot canónico: (1) portada dark con período, cliente, CUIT, módulos relevados, fecha y sistema, (2) resumen ejecutivo con gauge del índice general y 3 stat-cards, (3) hallazgos por circuito (tabla score + Doc./Controles/Madurez + lectura transversal), (4) riesgos priorizados en cards, (5) recomendación + plan con timeline de etapas y dos columnas necesitamos/no incluye, (6) qué cambia en el día a día (cards por circuito + callout transversal), (7) cierre dark con próximos pasos numerados y contacto fijo SyS; con colores expresados con los tokens `--sys-*` de `src/lib/styles/brand.css` (paleta idéntica al template), logos directo desde el CDN R2 (`__LOGO_VERT__` → `https://pub-9195f8a94602486395419c2bb7beab6b.r2.dev/LOGOS/sys_vertical_w.png` en portada/cierre dark; `__LOGO_COLOR__` → `https://pub-9195f8a94602486395419c2bb7beab6b.r2.dev/LOGOS/sys_horizontal_b.png` en footers claros) y CSS `@media print` para impresión a PDF desde el navegador.

**Verificación:** `tests/informe-render.test.ts` — snapshot del componente con fixture estable contiene las siete páginas/secciones del template, el gauge con `stroke-dasharray` derivado del índice canónico, los dots de semáforo coherentes con `indexToSemaphore`, variables `--sys-*`, las dos URLs de logo del CDN R2 (`sys_vertical_w.png` en portada/cierre, `sys_horizontal_b.png` en footers) y regla `@media print`.

## R27 — Versiones consultables desde la auditoría

CUANDO un admin abre el detalle de una auditoría cerrada, el sistema DEBE listar los informes existentes (versión, estado, fechas, quién aprobó) con acceso a revisión y render, y ofrecer la acción «Generar informe» solo si la auditoría está `cerrada`.

**Verificación:** `tests/api/informe-create.test.ts` — GET listado devuelve versiones ordenadas; `e2e/informe.spec.ts` — detalle muestra listado y CTA.

## R28 — Tests unitarios e integración

El sistema DEBE incluir tests vitest en `tests/informe-*.test.ts` y `tests/api/informe-*.test.ts` que cubran máquina de estados, permisos, validación Zod del borrador y snapshot del render, ejecutables sin credenciales reales de Anthropic (mocks).

**Verificación:** `pnpm test` ejecuta la suite informe en verde sin `ANTHROPIC_API_KEY` real.

## R29 — E2E flujo feliz

El sistema DEBE incluir `e2e/informe.spec.ts` que recorra: auditoría cerrada → generar informe → esperar `borrador` (pipeline mockeado) → editar una sección → aprobar → abrir render imprimible.

**Verificación:** `pnpm exec playwright test e2e/informe.spec.ts` pasa en CI con Claude mockeado.

## R30 — Edición inline por bloque sobre el render

MIENTRAS un informe está en estado `borrador` y el admin activa el modo edición, los bloques de texto del render que mapean a campos de `client_draft` DEBEN ser editables in-place (`contenteditable` por bloque, mapeo 1:1 bloque→campo vía `data-field`); el contenido editado se serializa como texto plano al campo correspondiente del draft (nunca HTML arbitrario) y se valida con `reportClientDraftSchema` antes de persistir; los bloques derivados del snapshot canónico (scores por circuito, índices, gauge, semáforos, datos de portada) NO DEBEN ser editables.

**Verificación:** `tests/informe-render.test.ts` — en modo edición los bloques de campos del draft exponen `contenteditable` + `data-field`, y los bloques canónicos (score, gauge) no; `tests/api/informe-review.test.ts` — PATCH resultante de una edición inline con HTML embebido persiste solo texto plano.

## R31 — Autosave con debounce e historial append-only

CUANDO el admin deja de tipear en un bloque editable durante 1 segundo (debounce), el sistema DEBE persistir el draft resultante vía el PATCH de R20 y registrar una entrada append-only en `audit_report_edit` (`report_id`, `seq` incremental, snapshot del `client_draft`, `change_summary = 'Edición inline'`, `edited_by`, `edited_at`), mostrando el feedback «Guardado (edición N)»; el modo edición se cierra con el botón «Listo» (no existe botón guardar) y las entradas del historial NUNCA se borran ni modifican.

**Verificación:** `tests/api/informe-review.test.ts` — dos PATCH de origen inline crean entradas `seq` 1 y 2 con snapshot y summary; el historial es consultable por versión; `e2e/informe.spec.ts` — editar un bloque, esperar el autosave, ver «Guardado (edición 1)» y salir con «Listo».

## Trazabilidad acceptance → R

| Acceptance (feature_list.json #14) | Requirements |
|---|---|
| Acción Generar informe solo auditorías cerradas, solo admin | R1, R2, R27 |
| Generación async consume JSON canónico v1.0 sin transformaciones; estados visibles | R4, R5, R6, R7, R14, R15 |
| Borrador estructurado validado con Zod (resumen, índices semáforo, top 5, quick wins, roadmap, próximo paso) | R10, R12, R13 |
| upsell_findings y presupuesto nunca en informe cliente; vista interna separada | R11, R16, R17, R18 |
| UI revisión: editar por sección y regenerar; aprobar humano explícito | R20, R21, R22, R23, R24, R30, R31 |
| Render HTML branded SyS imprimible a PDF + Loom opcional | R19, R25, R26 |
| Informe aprobado persistido versionado (tabla audit_report) | R4, R9, R21, R23 |
| Tests máquina de estados, permisos, Zod y snapshot render | R28, R29 (+ R3, R8) |

Mapeo acceptance → campos del template A4 (los nombres del acceptance preceden al template):
«top 5 riesgos» → `riesgos.items` (3–5, default 4 cards como el template); «quick wins» →
sección «Qué cambia en el día a día» (la IA usa `quick_wins` del canónico como insumo);
«roadmap por fases» → `plan.etapas` (timeline semana/título/descripción del template);
«próximo paso» → `proximos_pasos` (lista numerada del cierre, insumo `next_step` del canónico).

## Fuera de alcance (fase 2 — no implementar)

- RAG Tango como contexto del prompt (insumo plan §7.5).
- Publicación en CDN con token público para el cliente.
- Generación de PDF server-side (MVP: imprimir desde el navegador).
- Envío automático del informe al cliente (mail/WhatsApp).
- Comparación contra benchmark del rubro (depende del estudio de mercado acumulado).
- Few-shot con informes previos bien calificados y catálogo de precios de proveedores como contexto.
- Edición del borrador por chat con IA (estilo presupuestossys): modal de lenguaje natural que modifica `client_draft` y crea entrada de historial «Edición con IA». Segunda iteración — la edición inline (R30/R31) cubre la necesidad de la puerta sin duplicar pipeline de prompts ni UI de preview en vivo.
- Template de informe IT propio: feature `19_template_informe_it` (backlog). En #14 el template ERP parametriza títulos según `types` (decisión puerta 2026-06-12, open question 5).
