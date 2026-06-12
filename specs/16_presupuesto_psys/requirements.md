# Requirements — #16 16_presupuesto_psys

> Puente auditapp → presupuestossys (`~/presupuestossys`, presupuestos.serviciosysistemas.com.ar):
> desde un informe IA **aprobado** (#14), crear el presupuesto comercial en presupuestossys vía
> endpoint machine-to-machine con API key, y reflejar en auditapp el vínculo (proposal_id,
> number_display, URL) y el ciclo de vida del proposal.
> Fuente: decisión humana 2026-06-11 (Martín): **no duplicar el motor de presupuestos**; plan
> lead magnet etapas 7-8. Depende de: `14_informe_ia` (#14, tabla `audit_report` + `internal_draft`).
> La feature espejo en presupuestossys (endpoint M2M a crear allá) se documenta en
> `design.md` — Anexo A; este spec NO escribe código en ese repo.

## R1 — Permisos: solo admin

CUANDO un usuario solicita crear el presupuesto o sincronizar su estado, el sistema DEBE responder `401` sin sesión válida y `403` si la sesión no tiene rol `admin`.

**Verificación:** `tests/api/psys-proposal.test.ts` — sin sesión 401; rol `tecnico` 403 en POST y en GET de sync; admin 2xx.

## R2 — Precondición: informe aprobado

SI la auditoría no tiene ningún `audit_report` con `status = 'aprobado'`, ENTONCES el POST de creación DEBE responder `409` sin llamar a presupuestossys ni crear filas.

**Verificación:** `tests/api/psys-proposal.test.ts` — auditoría con informe en `borrador` retorna 409; el mock HTTP de presupuestossys no recibe llamadas; conteo de `audit_proposal_link` no cambia.

## R3 — Configuración M2M requerida

SI `PSYS_API_URL` o `PSYS_API_KEY` no están configuradas al disparar la acción, ENTONCES el sistema DEBE responder `503` con mensaje claro («Integración con presupuestossys no configurada») sin efectos en base de datos ni llamadas salientes.

**Verificación:** `tests/api/psys-proposal.test.ts` — env sin key retorna 503; sin filas nuevas; mock sin llamadas.

## R4 — Payload versionado y validado con Zod

CUANDO un admin dispara la creación, el sistema DEBE construir el payload de integración con `contract_version = '1.0'` (constante `PSYS_CONTRACT_VERSION`) a partir de la última versión aprobada de `audit_report` — cliente (`razon_social`, `cuit` del snapshot canónico), `audit_id`, `report_version`, `recomendaciones_presupuesto` de `internal_draft` y `upsell_findings` del snapshot — y validarlo con `psysProposalPayloadSchema` antes de enviarlo.

**Verificación:** `tests/psys-payload.test.ts` — builder produce payload válido contra el schema desde fixtures de #14; payload con recomendación sin `linea` o sin `contract_version` es rechazado con error tipado antes de cualquier llamada HTTP.

## R5 — Autenticación machine-to-machine

CUANDO el sistema llama a presupuestossys, la request DEBE incluir el header `Authorization: Bearer <PSYS_API_KEY>` y el header `Idempotency-Key` con el valor `audit:<audit_id>:report:<report_version>`.

**Verificación:** `tests/psys-client.test.ts` — el mock HTTP registra ambos headers con los valores esperados.

## R6 — Idempotencia local: un proposal por (auditoría, versión de informe)

SI ya existe una fila `audit_proposal_link` con el mismo `audit_id` y `report_id` y `status <> 'error'`, ENTONCES un nuevo POST DEBE responder `200` con el vínculo existente sin llamar a presupuestossys.

**Verificación:** `tests/api/psys-proposal.test.ts` — segundo POST idéntico devuelve el mismo `proposal_id`; el mock registra exactamente una llamada de creación.

## R7 — Persistencia del vínculo

CUANDO presupuestossys responde `201` con el proposal creado, el sistema DEBE persistir en `audit_proposal_link`: `audit_id`, `report_id`, `proposal_id`, `number_display`, `proposal_url`, `psys_status`, `contract_version`, `sent_payload` (snapshot jsonb), `created_by` y timestamps.

**Verificación:** `tests/api/psys-proposal.test.ts` — tras POST exitoso la fila contiene los campos devueltos por el mock (`proposal_id`, `number_display`, `url`) y el snapshot del payload enviado.

## R8 — Errores remotos sin efectos parciales

SI presupuestossys responde un error (4xx/5xx) o la llamada falla por red/timeout, ENTONCES el sistema DEBE responder `502` con mensaje accionable y registrar el intento en `audit_proposal_link` con `status = 'error'` y `error_message` no vacío, sin `proposal_id`.

**Verificación:** `tests/api/psys-proposal.test.ts` — mock con 500 y mock con abort por timeout: respuesta 502, fila en `status='error'` con mensaje; un POST posterior (reintento sobre fila `error`) sí vuelve a llamar al mock (R6 no bloquea reintentos de errores).

## R9 — Idempotencia remota delegada

CUANDO presupuestossys responde `200` con un proposal ya existente para la misma `Idempotency-Key` (en lugar de `201`), el sistema DEBE tratar la respuesta como éxito y persistir/actualizar el vínculo sin crear una segunda fila activa.

**Verificación:** `tests/api/psys-proposal.test.ts` — mock responde 200 con proposal existente; el vínculo queda con ese `proposal_id` y `audit_proposal_link` tiene una sola fila activa para el par (audit, report).

## R10 — Sincronización de estado por polling on-demand

CUANDO un admin consulta el detalle de la auditoría o ejecuta la acción «Actualizar estado», el sistema DEBE consultar `GET /api/m2m/proposals/{id}` en presupuestossys y actualizar `psys_status` y `synced_at` en `audit_proposal_link` (decisión de spec: polling on-demand; webhook descartado — ver design §Alternativas).

**Verificación:** `tests/api/psys-sync.test.ts` — mock devuelve `status: 'enviado'`; la fila pasa de `borrador` a `enviado` con `synced_at` actualizado.

## R11 — Estados de proposal reconocidos

CUANDO el sistema persiste `psys_status`, DEBE aceptar únicamente los valores del enum de presupuestossys (`borrador`, `borrador-importado`, `revision`, `enviado`, `aceptado`, `rechazado`, `archivado`); SI la sync devuelve un valor fuera del enum, ENTONCES DEBE conservar el último estado conocido y registrar warning sin fallar la request.

**Verificación:** `tests/api/psys-sync.test.ts` — mock con `status: 'inventado'`: respuesta 200, `psys_status` sin cambios, warning logueado (spy sobre logger).

## R12 — Fallo de sync no destructivo

SI la consulta de estado a presupuestossys falla (red, 4xx/5xx, key inválida), ENTONCES el sistema DEBE responder el detalle con el último estado persistido y un indicador `sync_error` sin modificar `audit_proposal_link`.

**Verificación:** `tests/api/psys-sync.test.ts` — mock caído: respuesta 200 con `sync_error: true` y datos previos intactos.

## R13 — UI: vínculo visible en el detalle de la auditoría

MIENTRAS exista un `audit_proposal_link` activo para la auditoría, la página de detalle DEBE mostrar `number_display`, el estado traducido y un enlace externo a `proposal_url`; MIENTRAS no exista vínculo y haya informe aprobado, DEBE mostrar la acción «Crear presupuesto» solo a admin.

**Verificación:** `tests/ui/psys-card.test.ts` (componente) — render con vínculo muestra número/estado/link; sin vínculo + informe aprobado + admin muestra el botón; rol técnico no lo muestra.

## R14 — Lo interno no viaja al documento del cliente

El payload enviado a presupuestossys DEBE marcar las recomendaciones y `upsell_findings` como insumo interno (`internal_notes`) fuera de `inputs.componentes`/texto del documento, de modo que presupuestossys no los renderice automáticamente en el HTML del proposal.

**Verificación:** `tests/psys-payload.test.ts` — el payload generado ubica recomendaciones y upsell solo bajo la clave `internal_notes`; snapshot del payload no contiene esas cadenas en `inputs`.

## R15 — Contrato versionado en el repo

El sistema DEBE exportar `PSYS_CONTRACT_VERSION = '1.0'` desde el módulo de schemas y el valor DEBE coincidir con la versión documentada en `specs/16_presupuesto_psys/design.md` §Contrato.

**Verificación:** `tests/psys-payload.test.ts` — la constante existe, vale `'1.0'` y aparece en todo payload generado.

## R16 — Sin doble envío concurrente

SI dos POST de creación llegan concurrentes para el mismo par (auditoría, informe), ENTONCES la base DEBE rechazar el duplicado por restricción UNIQUE parcial y el segundo request DEBE resolverse devolviendo el vínculo ganador con `200`.

**Verificación:** `tests/db/psys-link.test.ts` — doble INSERT activo viola la UNIQUE; test de API simula la colisión (insert previo entre check y persist) y verifica respuesta 200 con el vínculo existente.

---

## Trazabilidad acceptance ↔ requirements

| Acceptance (feature_list.json) | Rs |
|---|---|
| Acción Crear presupuesto (solo admin) sobre informe aprobado, payload versionado con Zod, match/alta por CUIT | R1, R2, R4 (match/alta por CUIT lo ejecuta presupuestossys con los datos de cliente del payload — design Anexo A) |
| Auth M2M por API key; sin key falla claro y sin efectos | R3, R5 |
| Persistencia del vínculo proposal_id / number_display / URL | R7 |
| Estado visible en detalle; sync polling o webhook (decidir en spec) | R10, R11, R12, R13 |
| Contrato documentado y versionado | R15 + design.md §Contrato y Anexo A |
| Idempotencia sin duplicar proposals | R5 (Idempotency-Key), R6, R9, R16 |
| Tests con presupuestossys mockeado | R1–R16 (todas las verificaciones usan mock HTTP) |
