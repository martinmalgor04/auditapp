# Requirements — briefing_externo

> Formulario público `/briefing/[token]` para que el cliente complete ítems `filled_by=cliente`.
> Fuente: `docs/source-specs/specs-07/07d-briefing-externo/spec.md`, PRD 07d.
> Depende de: `modelo_datos` (#2), `auth_roles` (#3), `backoffice` (#4).

## R1 — Ruta pública sin autenticación

CUANDO un visitante abre `GET /briefing/{public_token}` con un token válido, el sistema DEBE renderizar el formulario de briefing sin exigir cookie de sesión ni login.

**Verificación:** `tests/api/briefing-load.test.ts` — request sin cookie devuelve 200 y payload del form; `e2e/briefing.spec.ts` — carga la URL sin autenticación previa.

## R2 — Solo ítems del cliente

CUANDO el formulario de briefing se renderiza, el sistema DEBE incluir únicamente los `template_item` con `filled_by = 'cliente'` de la plantilla vinculada a esa auditoría.

**Verificación:** `tests/briefing-form.test.ts` — fixture con ítems `cliente` y `tecnico`; la lista expuesta contiene solo los del cliente (sin scores, secciones técnicas ni ítems `tecnico`/`admin`).

## R3 — Autosave con source cliente

CUANDO el cliente modifica un ítem permitido, el sistema DEBE hacer upsert en `audit_response` por `(audit_id, item_id)` con `source = 'cliente'`, `updated_by = null` y `value` validado según `field_type`.

**Verificación:** `tests/api/briefing-save.test.ts` — PATCH persiste valor; segunda escritura del mismo ítem actualiza fila existente (no duplica); `source` y `updated_by` correctos.

## R4 — Envío cambia estado

CUANDO el cliente confirma el envío del briefing, el sistema DEBE transicionar `audit.status` a `briefing_completo`.

**Verificación:** `tests/api/briefing-submit.test.ts` — auditoría en `briefing_enviado` pasa a `briefing_completo` tras acción de envío; reenvío desde `briefing_completo` mantiene el estado sin error.

## R5 — Pantalla amable si enlace no disponible

SI el token no existe, está vencido (`token_expires_at` pasado) o `audit.status ∉ {briefing_enviado, briefing_completo}`, ENTONCES el sistema DEBE responder con una pantalla amable (HTTP 200) cuyo mensaje principal indique que el enlace ya no está disponible y sugiera contactar a Servicios y Sistemas, sin exponer datos de la auditoría.

**Verificación:** `tests/api/briefing-load.test.ts` — casos token inexistente, expirado, `en_relevamiento`, `cerrada`; `e2e/briefing.spec.ts` — token inválido muestra el copy acordado.

## R6 — Branding SyS mobile-first

El sistema DEBE presentar el briefing con layout mobile-first (targets táctiles ≥ 44px, tipografía legible, una acción principal «Enviar») y branding Servicios y Sistemas (logo, paleta y tono definidos en skill `sys-brand`).

**Verificación:** `e2e/briefing.spec.ts` — viewport móvil 375×667; presencia de logo SyS y botón «Enviar»; inspección de clases Tailwind / tokens de marca en `+layout.svelte`.

## R7 — Rechazo server-side de ítems no permitidos

SI una petición de guardado incluye un `item_id` cuyo `filled_by ≠ 'cliente'` o que no pertenece a la auditoría del token, ENTONCES el sistema DEBE rechazar la operación con error 403 y envelope `{ success: false, error: ... }` sin modificar `audit_response`.

**Verificación:** `tests/api/briefing-save.test.ts` — PATCH con `item_id` de ítem `tecnico` o de otra auditoría retorna 403.

## R8 — Vigencia del token

MIENTRAS `audit.status ∈ {briefing_enviado, briefing_completo}` y `token_expires_at > now()`, el sistema DEBE permitir lectura y escritura del briefing con ese `public_token`.

**Verificación:** `tests/briefing-token.test.ts` — matriz de estados y expiración; solo combinaciones válidas habilitan formulario.

## R9 — Confirmación post-envío

CUANDO el envío del briefing es exitoso, el sistema DEBE mostrar una pantalla de confirmación con mensaje tipo «¡Listo! Nos vemos en la visita.» sin revelar scores, hallazgos ni datos internos.

**Verificación:** `e2e/briefing.spec.ts` — flujo completo hasta confirmación; `tests/api/briefing-submit.test.ts` — respuesta incluye flag de éxito.

## R10 — Saludo personalizado

CUANDO el token es válido, el sistema DEBE mostrar en el encabezado del formulario el texto «Hola, {razon_social}» usando la razón social del `client` de la auditoría.

**Verificación:** `tests/briefing-form.test.ts` — load incluye `client.razon_social` en datos de página; `e2e/briefing.spec.ts` — texto visible en header.

## R11 — Rate limit en guardado

CUANDO se reciben peticiones de autosave en el endpoint de briefing, el sistema DEBE aplicar rate limit por IP y por token (mínimo 60 req/min por token).

**Verificación:** `tests/api/briefing-rate-limit.test.ts` — ráfaga supera umbral y recibe 429.

## R12 — Validación permisiva en frontera

CUANDO el cliente envía un valor parcial o con formato imperfecto (p. ej. CUIT sin guiones), el sistema DEBE aceptar el guardado si pasa validación Zod mínima del `field_type`, sin bloquear el autosave por reglas estrictas de negocio.

**Verificación:** `tests/briefing-validation.test.ts` — CUIT parcial y números ≥ 0 se persisten; formatos inválidos extremos (tipo incorrecto) retornan 400.

## R13 — Layout adaptativo

DONDE la auditoría tiene más de 8 ítems `filled_by='cliente'`, el sistema DEBE organizar el formulario en un wizard de 2–3 pasos; en caso contrario DEBE usar una sola página.

**Verificación:** `tests/briefing-form.test.ts` — fixtures con 5 y 10 ítems; conteo de pasos esperado.

## R14 — Tests de integración API

El sistema DEBE incluir tests vitest de integración en `tests/api/` que cubran carga, autosave, envío, rechazo de ítems y token inválido.

**Verificación:** `pnpm test` incluye `tests/api/briefing-*.test.ts` y `tests/briefing-*.test.ts` en verde.

## R15 — E2E básico Playwright

El sistema DEBE incluir un test Playwright en `e2e/briefing.spec.ts` que recorra el flujo feliz: abrir link válido → completar al menos un campo → enviar → ver confirmación.

**Verificación:** `pnpm exec playwright test e2e/briefing.spec.ts` pasa contra servidor de test con fixture de auditoría en `briefing_enviado`.

## Trazabilidad acceptance → R

| Acceptance (feature_list.json #5) | Requirements |
|---|---|
| Ruta `/briefing/[token]` sin auth | R1 |
| Render solo ítems `filled_by=cliente` | R2 |
| Autosave upsert `source=cliente` | R3 |
| Enviar → `briefing_completo` | R4 |
| Token inválido / auditoría avanzada → pantalla amable | R5, R8 |
| Branding SyS, mobile-first | R6, R10 |
| Tests y e2e básico pasan | R14, R15 |

## Fuera de alcance (v2+)

- Recordatorio automático al cliente (n8n).
- Pre-llenado WHOIS/DNS (`prefill_source` automático).
- Subida de archivos (`field_type = file_ref`) en briefing.
- Cola offline IndexedDB completa (compartida con form técnico en #7).
