# Requirements — #13 13_crm_leads

> Mini-CRM de leads dentro de auditapp: tabla `crm_lead` con máquina de estados del funnel
> comercial (lead → contactado → agendo → auditado → presupuestado → cliente, más descartado),
> vista de pipeline en el backoffice (lista por estado, no kanban drag&drop), notas y próxima
> acción con fecha, y endpoint protegido por token API para carga en lote desde n8n/Firecrawl.
> Fuente: plan lead magnet Fase 1 (`docs/2026-06-03_plan_sys_auditoria-lead-magnet_v1.md`) +
> feature #13 de `feature_list.json`.
> Integra con lo existente: `client` (seed Tango/prospectos, migración 005), `audit`,
> briefing externo (#5). **Scope acotado: mini-CRM, no Salesforce** — sin email tracking,
> sin scoring de leads, sin automatizaciones internas.

## R1 — Migración crea tabla crm_lead

CUANDO se ejecuta la migración `006_crm_leads.sql` sobre una base con schema v5, el sistema DEBE crear la tabla `crm_lead` con columnas: `id` (uuid PK), `email` (text NULL, único case-insensitive cuando no es NULL), `empresa` (text NOT NULL), `contacto` (text), `telefono` (text), `source` (text NOT NULL, CHECK en `firecrawl|referido|manual|otro`), `status` (text NOT NULL DEFAULT `'lead'`, CHECK en los 7 estados de R2), `notas` (text), `proxima_accion` (text), `proxima_accion_fecha` (date), `client_id` (uuid NULL FK → `client`), `audit_id` (uuid NULL FK → `audit`), `presupuesto_ref` (text), `descartado_at` (timestamptz), `created_at` y `updated_at` (timestamptz NOT NULL DEFAULT now()).

**Verificación:** `tests/crm-schema.test.ts` — la tabla existe con esas columnas; INSERT con `source = 'spam'` o `status = 'ganado'` viola CHECK; segundo INSERT con email no-NULL `EMAIL@x.com` vs `email@x.com` viola unicidad.

> **Nota (migración):** `email` fue cambiado a nullable en la migración aplicada para aceptar leads sin email conocido (Firecrawl puede no detectar el email). La unicidad aplica solo entre filas con email no-NULL.

## R2 — Máquina de estados del funnel

CUANDO se solicita una transición de `crm_lead.status`, el sistema DEBE permitir únicamente los avances secuenciales `lead→contactado`, `contactado→agendo`, `agendo→auditado`, `auditado→presupuestado`, `presupuestado→cliente`, la transición `<cualquier estado no descartado>→descartado` y la reactivación `descartado→lead`; toda otra transición DEBE lanzar `CrmInvalidTransitionError`.

**Verificación:** `tests/crm-state-machine.test.ts` — tabla de transiciones válidas pasa; `lead→agendo`, `cliente→lead`, `auditado→contactado`, `descartado→cliente` lanzan `CrmInvalidTransitionError` con `code = 'CRM_INVALID_TRANSITION'`.

## R3 — Vincular auditoría avanza el funnel

CUANDO un admin vincula una auditoría existente a un lead (set de `audit_id`), el sistema DEBE registrar el `audit_id` y, si el `status` actual es anterior a `auditado` en el funnel, avanzar el `status` a `auditado` pasando por la máquina de estados (registrando los eventos intermedios de R8). SI el lead está en `descartado`, ENTONCES el sistema DEBE rechazar la vinculación con error `409`.

**Verificación:** `tests/crm-state-machine.test.ts` — lead en `contactado` vinculado a un audit queda `auditado` con `audit_id` set y eventos `contactado→agendo`, `agendo→auditado` registrados; lead ya `presupuestado` conserva su estado al vincular; `tests/api/crm-leads.test.ts` — PATCH de vínculo sobre lead `descartado` retorna 409.

## R4 — Endpoint batch protegido por token API

CUANDO llega `POST /api/crm/leads/batch` con header `Authorization: Bearer <CRM_API_TOKEN>` válido, el sistema DEBE aceptar la request sin sesión de usuario; SI el header falta o el token no coincide (comparación constant-time) o `CRM_API_TOKEN` no está configurado, ENTONCES el sistema DEBE responder `401` con el envelope `{ success: false, ... }` sin tocar la DB.

**Verificación:** `tests/api/crm-leads-batch.test.ts` — sin header 401; token incorrecto 401; env sin `CRM_API_TOKEN` 401 aunque el header traiga algo; token correcto 2xx; conteo de `crm_lead` no cambia en los casos 401.

## R5 — Validación Zod del lote

CUANDO `POST /api/crm/leads/batch` recibe el body, el sistema DEBE validarlo con un schema Zod (`crmLeadBatchSchema`): array de 1 a 200 ítems, cada uno con `email` (formato email, lowercased), `empresa` (no vacío), `source` (enum de R1) y opcionales `contacto`, `telefono`, `notas`; SI la validación falla, ENTONCES DEBE responder `400` con detalle del error sin insertar ningún ítem del lote.

**Verificación:** `tests/api/crm-leads-batch.test.ts` — lote con un ítem sin `email` retorna 400 y no inserta los ítems válidos del mismo lote; lote de 201 ítems retorna 400; lote válido inserta todos.

## R6 — Dedupe por email en el upsert

CUANDO un ítem del lote tiene un `email` ya existente en `crm_lead` (case-insensitive), el sistema DEBE hacer upsert: completar campos vacíos (`contacto`, `telefono`) y anexar `notas` si vienen, sin modificar `status` ni `source` de la fila existente, y la respuesta DEBE reportar `{ inserted, updated }` con los conteos del lote.

**Verificación:** `tests/api/crm-leads-batch.test.ts` — segundo POST con mismo email no crea fila nueva, conserva `status = 'contactado'` previo, completa `telefono` vacío y la respuesta reporta `inserted: 0, updated: 1`.

## R7 — Permisos del CRM en backoffice

CUANDO un usuario sin sesión accede a la vista o a los endpoints internos del CRM, el sistema DEBE responder `401` (o redirigir a `/login` en la vista); CUANDO el usuario tiene rol `tecnico` o `admin`, el sistema DEBE permitir lectura y cambio de estado; CUANDO la acción es crear lead manual, editar campos o vincular auditoría, el sistema DEBE exigir rol `admin` y responder `403` a `tecnico`.

**Verificación:** `tests/api/crm-leads.test.ts` — sin sesión 401; `tecnico` puede GET lista y POST cambio de estado (2xx) pero recibe 403 en alta manual y en PATCH de edición/vínculo; `admin` 2xx en todo.

## R8 — Auditoría de cambios de estado

CUANDO se ejecuta un cambio de estado de un lead (manual o por R3), el sistema DEBE insertar una fila en `crm_lead_event` con `lead_id`, `from_status`, `to_status`, `changed_by` (uuid FK → `app_user`, NULL si lo originó el endpoint batch) y `created_at`.

**Verificación:** `tests/api/crm-leads.test.ts` — tras POST de cambio de estado existe evento con `changed_by` = usuario de la sesión y el par from/to correcto; `tests/crm-state-machine.test.ts` — transición inválida no inserta evento.

## R9 — Descartado es borrado lógico

CUANDO un lead pasa a `descartado`, el sistema DEBE conservar la fila y sus eventos, setear `descartado_at = now()` y excluirlo de los listados por defecto; el sistema NO DEBE exponer ninguna operación de DELETE físico de leads.

**Verificación:** `tests/api/crm-leads.test.ts` — lead descartado no aparece en GET lista default, aparece con filtro `status=descartado`, su historial de eventos sigue consultable; no existe handler DELETE en la ruta.

## R10 — Vista de pipeline con filtros y búsqueda

CUANDO un usuario staff abre `/crm`, el sistema DEBE mostrar la lista de leads no descartados ordenada por `updated_at` desc con columnas estado, empresa, contacto, email, source, próxima acción y fecha, y DEBE soportar filtro por `status`, filtro por `source` y búsqueda parcial case-insensitive por email o empresa vía query params.

**Verificación:** `tests/api/crm-leads.test.ts` — GET con `?status=contactado&source=firecrawl` retorna solo los que matchean; `?q=playa` matchea empresa `Playadito`; `e2e/crm.spec.ts` — la lista renderiza y los filtros reducen filas.

## R11 — Contadores del funnel por etapa

CUANDO se carga la vista `/crm`, el sistema DEBE mostrar el conteo de leads por cada una de las 6 etapas activas del funnel (excluyendo `descartado`) calculado en una sola query agregada.

**Verificación:** `tests/api/crm-leads.test.ts` — el load/endpoint de contadores retorna los 6 conteos correctos con fixtures conocidos y omite los descartados.

## R12 — Cambio de estado manual desde la vista

CUANDO un usuario staff dispara un cambio de estado desde la vista, el sistema DEBE validar la transición con la máquina de estados de R2 server-side y persistir el cambio con su evento (R8); SI la transición es inválida, ENTONCES DEBE responder `409` sin modificar el lead.

**Verificación:** `tests/api/crm-leads.test.ts` — transición válida 200 y status actualizado; `lead→cliente` directo retorna 409 y el lead no cambia; `e2e/crm.spec.ts` — avanzar un lead desde la UI refleja el nuevo estado.

## R13 — Notas y próxima acción editables

CUANDO un admin edita un lead, el sistema DEBE permitir actualizar `notas`, `proxima_accion`, `proxima_accion_fecha`, `contacto`, `telefono` y `presupuesto_ref` con validación Zod, actualizando `updated_at`; los campos `email` y `source` NO DEBEN ser editables después del alta.

**Verificación:** `tests/api/crm-leads.test.ts` — PATCH con `notas` y `proxima_accion_fecha` persiste; PATCH que intenta cambiar `email` o `source` retorna 400.

## R14 — Vínculo opcional con client existente

CUANDO un admin vincula un lead a una fila de `client` existente (set de `client_id`), el sistema DEBE persistir la referencia validando que el client exista; SI el `client_id` no existe, ENTONCES DEBE responder `404`; el sistema NO DEBE crear ni modificar filas de `client` desde el CRM.

**Verificación:** `tests/api/crm-leads.test.ts` — PATCH con `client_id` válido persiste; uuid inexistente 404; conteo de `client` no cambia en ninguna operación del CRM.

## Cobertura de acceptance

| Acceptance (feature_list) | Requirements |
|---|---|
| Migración crea tabla crm_lead | R1 |
| Máquina de estados del funnel + descartado | R2 |
| FK a audit y referencia a presupuesto; vincular avanza a auditado | R1, R3, R13 |
| Endpoint protegido por token, Zod, dedupe por email | R4, R5, R6 |
| Vista backoffice: filtros, búsqueda, contadores | R10, R11 |
| Cambio de estado manual con registro de quién y cuándo | R8, R12 |
| Descartados conservan historial (borrado lógico) | R9 |
| Tests de máquina de estados, dedupe y guards pasan | R2, R6, R7 |
