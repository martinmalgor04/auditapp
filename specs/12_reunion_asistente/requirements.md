# Requirements — #12 12_reunion_asistente

> Asistente de reunión: grabación/subida de audio, transcripción async, extracción IA de propuestas
> alineadas a la plantilla y revisión humana obligatoria antes de persistir en `audit_response`.
> Fuente: solicitud operativa SyS, SPEC-07a (modelo), SPEC-07g (R2), SPEC-07e (form), SPEC-07i (pipeline IA).
> Depende de: `02_modelo_datos` (#2), `03_auth_roles` (#3), `06_storage_r2` (#6), `07_form_tecnico` (#7).

## R1 — Permisos de acceso

CUANDO un usuario autenticado con rol `tecnico` o `admin` solicita iniciar o consultar una sesión de reunión, el sistema DEBE permitir la operación solo si el técnico es el `assigned_tech_id` de la auditoría o el usuario tiene rol `admin`.

**Verificación:** `tests/api/reunion-session.test.ts` — técnico no asignado recibe 403; admin y técnico asignado reciben 200.

## R2 — Auditoría editable

CUANDO se crea o continúa una sesión de reunión, el sistema DEBE exigir que `audit.status ∈ {briefing_enviado, briefing_completo, en_relevamiento, en_cierre}`.

**Verificación:** `tests/api/reunion-session.test.ts` — auditoría en `borrador` o `cerrada` retorna 400/403 sin crear sesión.

## R3 — Consentimiento obligatorio

CUANDO el técnico confirma el inicio de grabación o subida de audio, el sistema DEBE persistir en `reunion_session` el timestamp `consent_recorded_at` y el identificador del usuario que registró el consentimiento antes de aceptar el binario de audio.

**Verificación:** `tests/api/reunion-upload.test.ts` — POST sin `consent_recorded_at` retorna 400; con consentimiento previo la subida avanza.

## R4 — Grabación in-app

CUANDO el técnico inicia grabación desde la UI de reunión en un navegador compatible, el sistema DEBE capturar audio con `MediaRecorder` y ofrecer finalizar la grabación para enviar el blob resultante al flujo de subida.

**Verificación:** `tests/reunion-recorder.test.ts` — mock de `MediaRecorder` produce blob `audio/webm`; `e2e/reunion.spec.ts` — botón «Grabar» visible y flujo hasta estado «Subiendo».

## R5 — Subida de audio existente

CUANDO el técnico selecciona un archivo de audio, el sistema DEBE aceptar únicamente `content_type` en `{audio/webm, audio/mp4, audio/mpeg, audio/x-m4a}` con extensión `.webm`, `.m4a` o `.mp3` y tamaño máximo configurable (default 100 MB).

**Verificación:** `tests/api/reunion-upload.test.ts` — presign rechaza `application/pdf` y archivos > `REUNION_MAX_AUDIO_BYTES`; acepta `audio/webm`.

## R6 — Convención de key R2 reunión

CUANDO se solicita presigned PUT para audio de reunión, el sistema DEBE generar la key con patrón `audits/{audit_id}/_reunion/{uuid}.{ext}`.

**Verificación:** `tests/reunion-r2-keys.test.ts` — `buildReunionR2Key` produce key que coincide con regex `^audits/[0-9a-f-]+/_reunion/[0-9a-f-]+\.(webm|m4a|mp3)$`.

## R7 — Attachment kind recording

CUANDO se confirma la subida de audio de reunión, el sistema DEBE insertar fila en `attachment` con `kind = 'recording'`, `item_id = null` y `r2_key` según R6.

**Verificación:** `tests/api/reunion-upload.test.ts` — confirm crea attachment con `kind='recording'` vinculado a `audit_id`.

## R8 — Sesión de reunión persistida

CUANDO se confirma la subida de audio, el sistema DEBE crear o actualizar `reunion_session` con `audit_id`, `attachment_id`, `started_by`, `session_type`, `consent_recorded_at` y `status = 'processing'`.

**Verificación:** `tests/api/reunion-upload.test.ts` — tras confirm existe fila `reunion_session` con FK a attachment y estado inicial `processing`.

## R9 — Transcripción asíncrona con estados

CUANDO existe una `reunion_session` con audio confirmado, el sistema DEBE encolar procesamiento que cree `reunion_transcript` y transicione su `status` por `{pending, processing, ready, error}` hasta disponer de `full_text` o `error_message`.

**Verificación:** `tests/reunion-pipeline.test.ts` — mock STT deja transcript en `ready` con texto no vacío; fallo STT deja `error` con mensaje.

## R10 — Estado visible en UI

MIENTRAS una sesión está en pipeline, el sistema DEBE exponer al cliente el estado agregado `{uploading, processing, ready_for_review, error}` derivado de `reunion_session` y `reunion_transcript`.

**Verificación:** `tests/api/reunion-status.test.ts` — GET estado devuelve transiciones esperadas; `e2e/reunion.spec.ts` — indicador visible cambia de «Procesando» a «Listo para revisar».

## R11 — Extracción IA de propuestas

CUANDO `reunion_transcript.status = 'ready'`, el sistema DEBE ejecutar extracción IA que inserte filas en `reunion_proposal` con `item_id`, `proposed_value` (JSON tipado), `quote` (cita textual del transcript) y `confidence` numérico entre 0 y 1.

**Verificación:** `tests/reunion-pipeline.test.ts` — mock LLM genera ≥1 propuesta con campos obligatorios; Zod `reunionProposalSchema` valida payload.

## R12 — Alcance field_type MVP

CUANDO la extracción IA genera propuestas, el sistema DEBE limitar `item_id` a ítems cuyo `field_type ∈ {text, tri, select, number, bool, date}` y `filled_by ∈ {cliente, tecnico}` de la plantilla de la auditoría.

**Verificación:** `tests/reunion-extraction.test.ts` — ítems `table` y `file_ref` quedan excluidos del contexto enviado al LLM y no generan propuestas.

## R13 — Validación Zod de propuestas

CUANDO el pipeline persiste o la API recibe una propuesta, el sistema DEBE validar `proposed_value` con el mismo parser de valor por `field_type` usado en form/briefing antes de guardar en `reunion_proposal`.

**Verificación:** `tests/reunion-proposal-schema.test.ts` — `tri` inválido (`"maybe"`) rechazado; `select` fuera de `options` rechazado; valores válidos persisten.

## R14 — UI de revisión por propuesta

CUANDO `reunion_session.status = 'ready_for_review'`, el sistema DEBE mostrar panel «Sugerencias de la reunión» con cada propuesta: etiqueta del ítem, valor propuesto, cita y confidence, y acciones «Aceptar», «Rechazar» y «Editar».

**Verificación:** `e2e/reunion.spec.ts` — sesión mock `ready_for_review` muestra ≥1 fila con las tres acciones; `tests/reunion-review-ui.test.ts` — componente renderiza campos esperados.

## R15 — Sin auto-aplicación

El sistema NO DEBE escribir en `audit_response` ni modificar valores del formulario técnico automáticamente al completar STT o extracción IA.

**Verificación:** `tests/reunion-pipeline.test.ts` — tras pipeline exitoso `audit_response` sin cambios hasta acción explícita de revisión; conteo de filas `source='reunion_ia'` = 0.

## R16 — Aceptar propuesta

CUANDO el técnico o admin acepta una propuesta en estado `pending`, el sistema DEBE hacer upsert en `audit_response` por `(audit_id, item_id)` con `value` de la propuesta (o `final_value` si fue editada), `source = 'reunion_ia'`, `updated_by` del revisor y marcar la propuesta `review_status = 'accepted'`.

**Verificación:** `tests/api/reunion-review.test.ts` — POST accept crea/actualiza `audit_response` con `source='reunion_ia'`; segunda aceptación del mismo ítem actualiza fila existente.

## R17 — Rechazar propuesta

CUANDO el técnico o admin rechaza una propuesta, el sistema DEBE marcar `review_status = 'rejected'` sin modificar `audit_response` para ese `item_id`.

**Verificación:** `tests/api/reunion-review.test.ts` — POST reject no altera `audit_response`; propuesta queda `rejected`.

## R18 — Editar y aceptar

CUANDO el técnico edita el valor propuesto y confirma, el sistema DEBE guardar `final_value` validado, marcar `review_status = 'edited'` y upsertear `audit_response` con `source = 'reunion_ia'` usando el valor editado.

**Verificación:** `tests/api/reunion-review.test.ts` — POST edit+accept persiste `final_value` distinto de `proposed_value` en `audit_response`.

## R19 — Auditoría sigue editable

CUANDO se aceptan propuestas de reunión, el sistema DEBE mantener `audit.status` sin transición automática y permitir edición manual posterior del mismo ítem vía form técnico (`source` puede pasar a `tecnico` en guardados manuales posteriores).

**Verificación:** `tests/api/reunion-review.test.ts` — tras aceptar, PATCH form técnico sobre el mismo ítem persiste con `source='tecnico'`; `audit.status` inalterado.

## R20 — Registro de consentimiento consultable

CUANDO un admin o técnico asignado abre el detalle de auditoría o la sesión de reunión, el sistema DEBE mostrar que existió grabación con fecha/hora de consentimiento y usuario que la registró.

**Verificación:** `tests/api/reunion-session.test.ts` — GET sesión incluye `consent_recorded_at` y `started_by_name`; detalle auditoría lista sesiones con consentimiento.

## R21 — Pipeline directo o webhook n8n

DONDE `REUNION_PIPELINE_MODE=webhook` y `N8N_REUNION_WEBHOOK_URL` está definida, el sistema DEBE disparar el procesamiento vía POST al webhook con `reunion_session_id` y exponer endpoint de callback firmado para recibir transcript y propuestas; DONDE `REUNION_PIPELINE_MODE=direct` (default), el sistema DEBE ejecutar STT y LLM en proceso server con credenciales de env.

**Verificación:** `tests/reunion-pipeline.test.ts` — modo `direct` invoca mock interno; modo `webhook` invoca fetch al URL configurado y callback actualiza transcript.

## R22 — Retención de audio configurable

El sistema DEBE leer `REUNION_AUDIO_RETENTION_DAYS` (default 365) para documentar la política de retención; un job de limpieza DEBE marcar `reunion_session.archived_at` y encolar borrado R2 de grabaciones vencidas sin borrar `reunion_transcript` ni propuestas ya revisadas.

**Verificación:** `tests/reunion-retention.test.ts` — sesión antigua queda `archived_at` seteado; transcript y propuestas permanecen consultables.

## R23 — Tests de integración API

El sistema DEBE incluir tests vitest en `tests/api/reunion-*.test.ts` y `tests/reunion-*.test.ts` que cubran flujo feliz, permisos y validación Zod.

**Verificación:** `pnpm test` ejecuta suite reunion en verde sin credenciales STT/LLM reales (mocks).

## R24 — E2E flujo feliz

El sistema DEBE incluir `e2e/reunion.spec.ts` que recorra: abrir reunión → registrar consentimiento → subir audio fixture → esperar estado listo (mock pipeline) → aceptar una propuesta → verificar dato en form.

**Verificación:** `pnpm exec playwright test e2e/reunion.spec.ts` pasa en CI con pipeline mockeado.

## Trazabilidad acceptance → R

| Acceptance (feature_list.json #12) | Requirements |
|---|---|
| Grabación in-app o subida audio vinculada a auditoría editable | R1, R2, R4, R5 |
| Audio en R2 + attachment `kind=recording` | R6, R7 |
| Transcripción async con estado visible | R9, R10 |
| Extracción IA: valor, cita, confidence por `item_id` | R11, R12, R13 |
| UI revisión aceptar/rechazar/editar; sin auto-aplicar | R14, R15, R16, R17, R18 |
| Aceptadas → `audit_response` `source=reunion_ia`; auditoría editable | R16, R18, R19 |
| Consentimiento documentado | R3, R20 |
| Tests flujo feliz, permisos y Zod | R23, R24 (+ R1, R13, R15) |

## Fuera de alcance (fase 2)

- Propuestas para `field_type` `table`, `file_ref`, `multiselect`, `list`, `money`, `datetime`.
- Transcripción en tiempo real (streaming STT).
- Diarización hablante cliente vs técnico.
- Auto-aplicar propuestas con confidence > umbral.
- Reprocesar audio ya archivado sin nueva sesión.
- Informe de reunión separado del JSON canónico de cierre.
