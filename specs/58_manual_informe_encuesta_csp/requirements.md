# Requirements — 58_manual_informe_encuesta_csp

> Cerrar defectos del flujo informe HTML manual (#55) detectados en la
> auditoría 2026-07-10 (A7 encuesta rota, A3 race de versión, S3 residual
> documentado). Plan: `plans/03_manual_informe_encuesta_csp.md`.

## Contexto verificado

- `buildSurveyBlock` en `manual-serve.ts` emite enums (`muy_satisfecho`, …)
  incompatibles con `surveyResponseSchema` (#47: enteros 1–5 + boolean).
- `survey-block.svelte` (IA) sí usa escala 1–5 — fuente de verdad de UI.
- Spec #55 R22: el bloque inyectado DEBE usar la misma validación
  `submitSurveyResponse`.
- `insertManualReport`: SELECT MAX + INSERT no atómico → race UNIQUE.
- Serving manual: `text/html` sin CSP (decisión de puerta #55: no romper
  animaciones). Se documenta threat model + header mínimo `nosniff`.

## Fuera de alcance

- Cambiar `surveyResponseSchema` para aceptar enums viejos.
- Sanitizar/reescribir HTML del informe o CSP `script-src` restrictivo.
- Storage IDOR (#56) / backoffice (#57).
- Pool DB / jobs (plan 04 diferido).

## Requerimientos

**R1** — El bloque de encuesta inyectado en HTML manual (`buildSurveyBlock` /
`injectSurveyBeforeBodyClose`) DEBE emitir controles compatibles con
`surveyResponseSchema`: `valoracion_global` y `claridad_informe` enteros 1–5;
`conforme_hallazgos` con valores `true`/`false`; `comentario` opcional.

**R2** — El markup inyectado NO DEBE contener los valores legacy
`muy_satisfecho`, `muy_clara`, `totalmente_conforme` ni equivalentes enum.

**R3** — CUANDO el cliente envía el form de encuesta del HTML manual con
valores válidos 1–5 / true|false, el sistema DEBE aceptar la respuesta vía el
mismo `submitSurveyResponse` / endpoint de #47 (sin cambiar el schema Zod).

**R4** — `insertManualReport` DEBE asignar `version` de forma atómica (una
sola statement `INSERT…SELECT MAX+1` o transacción con `FOR UPDATE`) de modo
que dos uploads concurrentes no produzcan dos filas con la misma versión.

**R5** — SI dos uploads concurrentes colisionan en
`UNIQUE (audit_id, version)` ENTONCES el endpoint
`POST /api/audits/[id]/report/manual` DEBE responder HTTP 409 (no 500
genérico) cuando el error sea unique violation (`23505`).

**R6** — CUANDO se sirve un informe manual público, la Response DEBE incluir
`X-Content-Type-Options: nosniff` y conservar `X-Robots-Tag: noindex, nofollow`.

**R7** — El sistema NO DEBE agregar un `Content-Security-Policy` restrictivo
que rompa scripts/animaciones del HTML pulido (decisión #55 vigente).

**R8** — El código de serving manual DEBE documentar en comentario el threat
model: HTML trusted-uploader; XSS residual si cuenta staff comprometida; CSP
estricto diferido.

**R9** — El sistema DEBE cubrir R1–R2 y R4–R6 con tests (inyección de form,
headers, race/unique o versions distintas).

## Acceptance

- Encuesta en `/informe/[token]` manual valida contra Zod #47.
- Uploads concurrentes no corrompen versionado; conflicto → 409.
- `nosniff` presente; sin CSP restrictivo accidental.
- Tests `informe-manual` + `encuesta-schema` verdes.
