# Requirements — #47 47_encuesta_conformidad

> Encuesta de conformidad/satisfacción **propia** (in-app, no externa) embebida al final del
> informe público que ve el cliente en `/informe/[token]` (#15). El cliente, tras leer el
> informe aprobado, responde una encuesta breve sin salir de la página ni autenticarse, vía el
> mismo token público de solo lectura. Persistencia propia en Postgres con validación Zod,
> respuesta visible en backoffice. Nunca expone material interno (upsell/recomendaciones).
>
> **Decisiones de puerta (Martín, 2026-06-24):** encuesta EMBEBIDA en el informe (no link
> aparte ni herramienta externa); PROPIA en auditapp (no Google Forms/Typeform).
>
> Depende de: `15_entrega_informe` (#15, done) — tabla `audit_report_share`, token público,
> `resolveShareByToken`, `registerShareView`, rate limit por IP, ruta `src/routes/informe/[token]/`,
> pantalla amable `+error.svelte`; `11_ui_branding_sys` (#11) — tokens `--sys-*`, Montserrat.
> NO toca el motor de scoring, la generación del informe (#14) ni el render del informe (#15).

## Decisión de set de preguntas (propuesta, marcada como decisión de puerta — ver design §Open questions)

| Campo | Tipo | Obligatorio | Validación |
|---|---|---|---|
| `valoracion_global` | escala entera 1–5 | Sí | `z.number().int().min(1).max(5)` |
| `claridad_informe` | escala entera 1–5 | Sí | `z.number().int().min(1).max(5)` |
| `conforme_hallazgos` | booleano (Sí / No) | Sí | `z.boolean()` |
| `comentario` | texto libre | No | `z.string().trim().max(2000)`, opcional |

## Decisión de idempotencia (propuesta, marcada como decisión de puerta — ver design §Open questions)

**Única respuesta por share (token), inmutable tras enviar.** Una vez que el cliente envía, el
bloque muestra el agradecimiento y un resumen de lo respondido en solo lectura; no se permite
re-enviar ni editar. Justificación en design §Alternativas descartadas.

## R1 — Bloque de encuesta embebido en el render público del informe aprobado

CUANDO un visitante sin sesión abre `GET /informe/[token]` con un token vigente cuyo informe
está en estado `aprobado` (caso R1 de #15), el sistema DEBE renderizar, al final del informe y
después del render web del informe, un bloque de encuesta de conformidad branded SyS (tokens
`--sys-*`, Montserrat) no intrusivo, sin requerir autenticación.

**Verificación:** `e2e/encuesta-conformidad.spec.ts` — el link público abre y el bloque de
encuesta es visible al pie del informe sin login; `tests/api/encuesta-public.test.ts` — el GET
público con token vigente incluye en `data` el estado de encuesta (`pendiente`/`respondida`).

## R2 — El bloque de encuesta NUNCA expone material interno

El bloque de encuesta y todo dato que la ruta pública entregue junto a él (props, payload del
load) DEBE construirse exclusivamente con datos públicos (estado de encuesta + set de preguntas
fijo) y NO DEBE contener `upsell_findings`, recomendaciones internas, `internal_draft`,
identificadores internos (ids de usuario, `report_id`, `prompt_version`) ni el texto de
respuestas de otras auditorías.

**Verificación:** `tests/api/encuesta-public.test.ts` — el payload del load público con un
informe que tiene `upsell_findings` e `internal_draft` poblados no contiene ninguno de sus
textos ni `report_id`/`created_by` (test explícito del acceptance).

## R3 — Migración SQL idempotente crea la tabla de respuestas

El sistema DEBE incluir la migración `0NN_encuesta_conformidad.sql` (0NN = siguiente número disponible al implementar; va después de #45 y #46) que crea la tabla
`survey_response` vinculada al share del informe (`share_id` FK → `audit_report_share`), con las
columnas del set de preguntas, `submitted_at` y un índice único que garantiza **a lo sumo una
respuesta por `share_id`**; la migración DEBE ser idempotente (`CREATE TABLE IF NOT EXISTS`,
`CREATE ... INDEX IF NOT EXISTS`) y re-ejecutable sin error.

**Verificación:** `tests/encuesta-schema.test.ts` — aplicar la migración dos veces no falla; la
tabla existe con las columnas y el índice único por `share_id`.

## R4 — Validación Zod de la respuesta enviada por token público

CUANDO el cliente envía la encuesta vía el token público (form action / endpoint público sin
auth), el sistema DEBE validar el payload con un schema Zod estricto (`surveyResponseSchema`:
`valoracion_global` 1–5 entero, `claridad_informe` 1–5 entero, `conforme_hallazgos` booleano,
`comentario` opcional ≤ 2000 chars); SI el payload es inválido ENTONCES el sistema DEBE
responder con error de validación amable sin persistir fila.

**Verificación:** `tests/encuesta-schema.test.ts` — `surveyResponseSchema` acepta el payload
válido y rechaza valores fuera de rango, tipos erróneos, campos extra (`.strict`) y comentario
> 2000; `tests/api/encuesta-public.test.ts` — POST con payload inválido no inserta fila y
devuelve error sin stack trace.

## R5 — Guard de token público: solo informes aprobados y vigentes aceptan respuesta

CUANDO el cliente envía la encuesta, el sistema DEBE resolver el token con la misma regla de
#15 (`resolveShareByToken`: existe + no revocado + no expirado + informe `aprobado`); SI el
token no resuelve ENTONCES el sistema DEBE rechazar el envío con la pantalla amable de #15
(404, «Este enlace ya no está disponible») sin persistir fila y sin distinguir la causa.

**Verificación:** `tests/api/encuesta-public.test.ts` — POST con token inexistente, revocado,
expirado o de informe `borrador` no inserta fila y degrada a la respuesta amable; no se filtra
la causa.

## R6 — Una respuesta por token, idempotente e inmutable

CUANDO el cliente envía la encuesta para un share que aún no tiene respuesta, el sistema DEBE
insertar una fila en `survey_response` con `submitted_at = now()`; SI ya existe una respuesta
para ese `share_id` ENTONCES el sistema DEBE rechazar el segundo envío (no crea ni modifica
fila) y el bloque público DEBE mostrar el estado «ya respondida» con el resumen de lo enviado
en solo lectura.

**Verificación:** `tests/api/encuesta-public.test.ts` — primer POST inserta y deja
`submitted_at`; segundo POST para el mismo token no crea segunda fila (índice único) y devuelve
estado «respondida»; `tests/encuesta-schema.test.ts` — el índice único por `share_id` rechaza
el segundo insert.

## R7 — Confirmación amable al enviar

CUANDO el envío de la encuesta es exitoso (R6), el sistema DEBE responder al cliente con una
confirmación amable branded SyS («¡Gracias por tu respuesta!») que reemplaza el formulario en el
mismo bloque sin recargar a otra página ni exponer datos internos.

**Verificación:** `e2e/encuesta-conformidad.spec.ts` — completar y enviar el formulario muestra
el mensaje de agradecimiento en el mismo bloque; `tests/api/encuesta-public.test.ts` — la
respuesta del POST exitoso indica estado `respondida`.

## R8 — Registro de cuándo se respondió

CUANDO se persiste una respuesta (R6), el sistema DEBE registrar `submitted_at` (timestamptz)
con la fecha/hora del envío.

**Verificación:** `tests/api/encuesta-public.test.ts` — la fila insertada tiene `submitted_at`
no nulo y posterior al inicio del test.

## R9 — Respuesta visible en el backoffice (solo SyS)

MIENTRAS un informe tiene un share con respuesta de encuesta, la pantalla de revisión del
informe en el backoffice (`/auditorias/[id]/informe/[version]`, solo admin) DEBE mostrar la
respuesta de la encuesta (valoración global, claridad, conformidad con hallazgos, comentario y
`submitted_at`); SI no hay respuesta ENTONCES DEBE indicar «sin respuesta aún».

**Verificación:** `e2e/encuesta-conformidad.spec.ts` — tras responder, la sección «Entrega al
cliente» del backoffice muestra la respuesta; `tests/api/encuesta-admin.test.ts` — el load
admin del informe devuelve la respuesta con sus campos y `submitted_at`.

## R10 — Rate limit en el envío público

CUANDO el cliente envía la encuesta por la ruta pública, el sistema DEBE aplicar el rate limit
por IP del patrón de #15 (`isInformeShareRateLimited`) y responder `429` al exceder el límite,
para mitigar abuso del endpoint público sin auth.

**Verificación:** `tests/api/encuesta-public.test.ts` — una ráfaga de POST desde la misma IP
termina en 429.

## R11 — Tests unitarios e integración

El sistema DEBE incluir tests vitest en `tests/encuesta-schema.test.ts`,
`tests/api/encuesta-public.test.ts` y `tests/api/encuesta-admin.test.ts` que cubran validación
Zod, idempotencia de persistencia, guard de token público, exclusión de material interno y
visibilidad en backoffice, ejecutables sin servicios externos.

**Verificación:** `pnpm test` ejecuta la suite de encuesta en verde.

## R12 — E2E del flujo ver informe → responder → confirmación

El sistema DEBE incluir `e2e/encuesta-conformidad.spec.ts` que recorra: abrir el informe público
(fixture de informe `aprobado` con share activo, flujo #14/#15) → ver el bloque de encuesta →
completar y enviar → ver el agradecimiento → verificar la respuesta en el backoffice.

**Verificación:** `pnpm exec playwright test e2e/encuesta-conformidad.spec.ts` pasa en CI.

## Trazabilidad acceptance → R

| Acceptance (feature_list.json #47) | Requirements |
|---|---|
| Render público incluye al final bloque de encuesta branded, no intrusivo, sin material interno | R1, R2 |
| Migración SQL idempotente crea la tabla vinculada al informe/auditoría | R3 |
| Cliente responde (set definido) validado con Zod vía token público sin auth | R1, R4, R5 |
| Una respuesta por token con idempotencia definida; registra fecha de respuesta | R6, R8 |
| Confirmación amable al enviar; token inválido/no aprobado degrada a pantalla amable de #15 | R5, R7 |
| Respuesta visible en backoffice (solo SyS); público nunca muestra material interno (test explícito) | R2, R9 |
| Tests: Zod, idempotencia, guard token público, no filtra material interno, e2e ver→responder→confirmación | R2, R4, R5, R6, R10, R11, R12 |

## Fuera de alcance (no implementar)

- Edición de la respuesta tras enviar (decisión: única vez, inmutable — ver design §Open questions).
- Agregación de respuestas al estudio de mercado (#18) — la tabla queda lista para ello, pero el
  dashboard es feature aparte.
- Notificación automática a SyS al recibir una respuesta (mail/WhatsApp).
- Encuesta sobre informes no aprobados o sobre el briefing.
- Identificación del visitante / múltiples respuestas por destinatario.
