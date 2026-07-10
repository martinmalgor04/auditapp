# Design — #58 58_manual_informe_encuesta_csp

## Alcance

Tres fixes acotados sobre #55 / #47, sin reabrir la puerta de «documento
directo sin sanitización».

| Incluido | Excluido |
|---|---|
| Alinear `buildSurveyBlock` a schema 1–5 | Dual-support de enums en Zod |
| `insertManualReport` atómico + 409 | CSP `script-src 'self'` |
| `nosniff` + comentario threat model | Sanitizar HTML del informe |

## Dependencias

| Feature | Contrato |
|---|---|
| #55 informe HTML manual | `manual-serve`, `insertManualReport`, source=manual |
| #47 encuesta | `surveyResponseSchema`, `submitSurveyResponse` |
| #14 versionado | `UNIQUE (audit_id, version)` |

## Arquitectura

### Encuesta

```
buildSurveyBlock(token)  →  markup alineado a survey-block.svelte
  valoracion_global: 1..5
  claridad_informe: 1..5
  conforme_hallazgos: true|false
  action=/informe/{token}/encuesta  POST
       → submitSurveyResponse (sin cambio de schema)
```

### Versionado

Preferencia A (si pool `max:1` no deadlockea en tests):

```sql
BEGIN;
WITH latest AS (
  SELECT ... FROM audit_report WHERE audit_id = $1
  ORDER BY version DESC LIMIT 1 FOR UPDATE
)
INSERT INTO audit_report (...)
SELECT $1, latest.version + 1, ... FROM latest
RETURNING ...;
COMMIT;
```

Preferencia B (si A deadlockea con `max:1`): single-statement
`INSERT…SELECT COALESCE(MAX(version),0)+1` + catch `23505` → 409.

### Headers

```
Content-Type: text/html; charset=utf-8
X-Robots-Tag: noindex, nofollow
X-Content-Type-Options: nosniff   // NEW
// sin Content-Security-Policy restrictivo
```

**Alternativa descartada:** aceptar enums en Zod — rompe fuente única #47 y
el componente Svelte.

**Alternativa descartada:** CSP estricto ahora — rompe gold de animaciones
(#55 puerta 4).

## Archivos

| Archivo | Cambio |
|---|---|
| `src/lib/server/informe/manual-serve.ts` | survey markup + headers + comentario |
| `src/lib/server/db/informe-reports.ts` | `insertManualReport` atómico |
| `src/routes/api/audits/[id]/report/manual/+server.ts` | mapear 23505 → 409 |
| `tests/informe-manual.test.ts` | inyección, headers, race |

## Tests

- `injectSurveyBeforeBodyClose` contiene `value="5"` y `value="true"`; no
  `muy_satisfecho`.
- Ideal: `surveyResponseSchema.safeParse` sobre FormData simulado del HTML.
- Dos `insertManualReport` concurrentes → versions únicas o un conflicto limpio.
- Headers: `nosniff` presente; `Content-Security-Policy` ausente.

## Gates

`pnpm test -- tests/informe-manual.test.ts tests/encuesta-schema.test.ts`
`pnpm run check` · `pnpm test`

## Referencia

`plans/03_manual_informe_encuesta_csp.md`
