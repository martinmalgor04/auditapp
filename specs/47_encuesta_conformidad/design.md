# Design — #47 47_encuesta_conformidad

## Alcance

Encuesta de conformidad propia, embebida al final del informe público de #15
(`/informe/[token]`). Una respuesta por share (token), inmutable. Persistencia Zod-validada en
Postgres, respuesta visible en backoffice. El render público nunca filtra material interno.

| Incluido (MVP) | Excluido |
|---|---|
| Tabla `survey_response` (1:1 con `audit_report_share`) | Edición de la respuesta tras enviar |
| Bloque de encuesta Svelte interactivo al pie de `informe/[token]/+page.svelte` | Agregación al dashboard de mercado (#18) |
| Form action público `?/responder` (sin auth, token-guarded, Zod, rate limit) | Notificación a SyS / envío automático |
| Set fijo: valoración global 1–5, claridad 1–5, conforme hallazgos Sí/No, comentario opcional | Encuesta sobre informes no aprobados / briefing |
| Confirmación amable en el mismo bloque | Identificación del visitante |
| Vista de la respuesta en backoffice (solo admin) | Múltiples respuestas por share |

## Dependencias (todas `done`)

| Feature | Contrato usado |
|---|---|
| `15_entrega_informe` (#15) | `audit_report_share` (token, revocación, expiración), `resolveShareByToken` / `ShareResolution` y `INFORME_SHARE_UNAVAILABLE_MESSAGE` (`src/lib/server/informe/share.ts`), `isInformeShareRateLimited` (`src/lib/server/informe/rate-limit.ts`), ruta pública `src/routes/informe/[token]/` (`+page.server.ts`, `+page.svelte`, `+error.svelte`), backoffice `src/routes/(app)/auditorias/[id]/informe/[version]/+page.server.ts` + sección «Entrega al cliente», `apiSuccess`/`apiError` (`src/lib/server/api/envelope.ts`), `requireAdminApi` (`src/lib/server/api/guards.ts`) |
| `11_ui_branding_sys` (#11) | Tokens `--sys-*` (`src/lib/styles/brand.css`), Montserrat ya servida |

**Decisión de vínculo:** la respuesta cuelga del **share** (`share_id`), no del `report_id`. El
share es la unidad que el cliente realmente ve y la que congela la versión enviada (#15 §
alternativas). Si se regenera el link, el nuevo share parte sin respuesta — coherente con
«respondés sobre lo que recibiste». La auditoría/informe se alcanza por join
(`audit_report_share.report_id` → `audit_report.audit_id`) para el backoffice.

## Arquitectura

```
cliente abre GET /informe/[token]                         (load #15, sin auth)
   resolveShareByToken → ok                               (R5)
   getSurveyByShareId(share.id) → null | SurveyResponseRow
   load devuelve { ...model, encuesta: { estado, respuesta? } }   (R1, R2)
        ▼
 +page.svelte monta ReportWebRender + <SurveyBlock>       (R1)
   estado 'pendiente' → formulario branded
   estado 'respondida' → agradecimiento + resumen read-only (R6, R7)
        ▼
cliente envía  POST /informe/[token]?/responder           (form action, sin auth)
   isInformeShareRateLimited(ip)?           → fail(429)    (R10)
   resolveShareByToken(token) !ok           → error(404 amable) (R5)
   surveyResponseSchema.safeParse(form)     → fail(400 amable)  (R4)
   insertSurveyResponse(share.id, parsed)                  (R6, R8)
     UNIQUE(share_id) viola → ya respondida → estado 'respondida' (R6)
   éxito → { ok: true } → bloque muestra agradecimiento    (R7)
        ▼
backoffice GET /auditorias/[id]/informe/[version] (admin)
   getSurveyByActiveShare(report.id) → respuesta | null    (R9)
   sección «Entrega al cliente» muestra la respuesta o «sin respuesta aún»
```

Capas: DB (`src/lib/server/db/survey-responses.ts`), dominio/schema
(`src/lib/server/informe/survey.ts`), ruta pública existente de #15 (form action), backoffice
existente de #15 (extensión del load + componente de panel).

## Cambios de schema (migración `0NN_encuesta_conformidad.sql` (0NN = siguiente número disponible al implementar; va después de #45 y #46))

### `survey_response`

| Col | Tipo | Notas |
|---|---|---|
| id | uuid PK default `gen_random_uuid()` | |
| share_id | uuid NOT NULL FK → audit_report_share(id) | la respuesta cuelga del share (R3) |
| valoracion_global | smallint NOT NULL CHECK (between 1 and 5) | escala 1–5 |
| claridad_informe | smallint NOT NULL CHECK (between 1 and 5) | escala 1–5 |
| conforme_hallazgos | boolean NOT NULL | Sí / No |
| comentario | text | NULL = sin comentario; longitud acotada en Zod (≤ 2000) |
| submitted_at | timestamptz NOT NULL DEFAULT now() | cuándo se respondió (R8) |

```sql
CREATE TABLE IF NOT EXISTS survey_response (...);
CREATE UNIQUE INDEX IF NOT EXISTS survey_response_share_uq
  ON survey_response (share_id);            -- a lo sumo una respuesta por share (R6)
```

Idempotente (`IF NOT EXISTS`), re-ejecutable. Sin `archived_at`: la respuesta es inmutable y
nunca se borra; regenerar el link crea un share nuevo sin respuesta.

## Archivos a crear/modificar

### Migración y DB

| Archivo | Propósito |
|---|---|
| `migrations/0NN_encuesta_conformidad.sql` (nuevo) | Tabla `survey_response` + índice único por `share_id` (R3, R6) |
| `src/lib/server/db/survey-responses.ts` (nuevo) | `insertSurveyResponse(input)` (INSERT; el UNIQUE captura el doble envío), `getSurveyByShareId(shareId)`, `getSurveyByActiveShare(reportId)` (join al share activo, R9) |

### Dominio / schema

| Archivo | Propósito |
|---|---|
| `src/lib/server/informe/survey.ts` (nuevo) | `surveyResponseSchema` (Zod `.strict`, R4); `SURVEY_QUESTIONS` (set fijo: ids, labels, tipo — fuente única para form y validación); `submitSurveyResponse({ token, input, clientIp })` → resuelve token (R5), rate limit (R10), inserta (R6) y mapea el conflicto de UNIQUE a estado `respondida`; tipos `SurveyEstado = 'pendiente' \| 'respondida'`, `SurveyResponseView` (solo campos públicos, R2) |

```typescript
// src/lib/server/informe/survey.ts
import { z } from 'zod';

export const surveyResponseSchema = z
  .object({
    valoracion_global: z.coerce.number().int().min(1).max(5),
    claridad_informe: z.coerce.number().int().min(1).max(5),
    conforme_hallazgos: z.coerce.boolean(),
    comentario: z.string().trim().max(2000).optional().transform((v) => v || null)
  })
  .strict();
export type SurveyResponseInput = z.infer<typeof surveyResponseSchema>;

export type SurveyEstado = 'pendiente' | 'respondida';

// Solo campos públicos / mostrables — nunca share_id, report_id ni ids internos (R2).
export type SurveyResponseView = {
  valoracion_global: number;
  claridad_informe: number;
  conforme_hallazgos: boolean;
  comentario: string | null;
  submitted_at: string; // ISO
};

export type SurveyState =
  | { estado: 'pendiente' }
  | { estado: 'respondida'; respuesta: SurveyResponseView };
```

### Ruta pública (extensión de #15, sin auth)

| Archivo | Propósito |
|---|---|
| `src/routes/informe/[token]/+page.server.ts` (extender) | En `load`, tras `resolveShareByToken` ok, consultar `getSurveyByShareId(share.id)` y devolver `encuesta: SurveyState` (solo campos públicos, R1, R2). Añadir `export const actions` con `responder`: rate limit (R10) → `resolveShareByToken` (R5) → `surveyResponseSchema.safeParse` (R4) → `insertSurveyResponse`; conflicto UNIQUE → estado `respondida` (R6); éxito → `{ ok: true }` (R7) |
| `src/routes/informe/[token]/+page.svelte` (extender) | Montar `<SurveyBlock state={data.encuesta} />` al final, debajo de `ReportWebRender` y antes/junto al botón flotante PDF |
| `src/lib/components/informe/survey-block.svelte` (nuevo) | Bloque branded `--sys-*`: si `pendiente`, formulario (`use:enhance`, action `?/responder`): radios 1–5 valoración, radios 1–5 claridad, toggle Sí/No conformidad, textarea opcional, botón enviar; si `respondida` o tras éxito, agradecimiento «¡Gracias por tu respuesta!» + resumen read-only (R7). Sin chrome de app, no intrusivo |

**Decisión:** el envío usa **form action** de la ruta pública (`?/responder`), no un `+server.ts`
nuevo, para reusar tal cual el patrón sin-auth de #15 (mismo `params.token`,
`getClientAddress`, degradación amable con `error(404, ...)` / `fail(...)`). Funciona sin JS
(progressive enhancement) y `use:enhance` evita recargar.

### Backoffice (extensión de #15, solo admin)

| Archivo | Propósito |
|---|---|
| `src/routes/(app)/auditorias/[id]/informe/[version]/+page.server.ts` (extender) | Si admin y hay share, cargar `getSurveyByActiveShare(report.id)` → `encuesta: SurveyState` (R9) |
| `src/lib/components/informe/share-panel.svelte` (extender) o panel nuevo `survey-result.svelte` | Mostrar la respuesta (valoración, claridad, conformidad, comentario, `submitted_at`) o «sin respuesta aún» dentro de la sección «Entrega al cliente» (R9) |

### Tests

| Archivo | Cubre |
|---|---|
| `tests/encuesta-schema.test.ts` | R3 (migración 2x idempotente, índice único `share_id`), R4 (Zod: rango, tipos, `.strict`, comentario ≤ 2000), R6 (segundo insert viola UNIQUE) |
| `tests/api/encuesta-public.test.ts` | R1 (load incluye `encuesta`), R2 (payload sin material interno ni `report_id`/`created_by`, fixture con `upsell_findings`/`internal_draft`), R4 (POST inválido no inserta), R5 (token inválido/revocado/expirado/no aprobado → amable, sin fila), R6 (idempotencia: 2º envío no crea fila, estado `respondida`), R7/R8 (éxito → `submitted_at`), R10 (ráfaga → 429) |
| `tests/api/encuesta-admin.test.ts` | R9 (load admin devuelve la respuesta; sin respuesta → «sin respuesta aún»; rol no admin no la ve) |
| `e2e/encuesta-conformidad.spec.ts` | R12 (ver informe → bloque → completar → enviar → agradecimiento → backoffice muestra la respuesta), R1, R7 |

Fixtures: reutilizar el flujo a `aprobado` + share activo de #14/#15 (`INFORME_FAKE=1`).

## Firmas principales

```typescript
// src/lib/server/db/survey-responses.ts
export type SurveyResponseRow = {
  id: string; shareId: string;
  valoracionGlobal: number; claridadInforme: number;
  conformeHallazgos: boolean; comentario: string | null;
  submittedAt: Date;
};
export async function insertSurveyResponse(input: {
  shareId: string;
  valoracionGlobal: number; claridadInforme: number;
  conformeHallazgos: boolean; comentario: string | null;
}): Promise<SurveyResponseRow>;             // UNIQUE(share_id) → error capturable
export async function getSurveyByShareId(shareId: string): Promise<SurveyResponseRow | null>;
export async function getSurveyByActiveShare(reportId: string): Promise<SurveyResponseRow | null>;

// src/lib/server/informe/survey.ts
export async function submitSurveyResponse(input: {
  token: string; raw: unknown; clientIp: string;
}): Promise<
  | { ok: true; estado: 'respondida' }
  | { ok: false; reason: 'rate_limited' | 'unavailable' | 'invalid' | 'already_answered' }
>;
```

## Errores reutilizados / nuevos

- **Reusados:** `INFORME_SHARE_UNAVAILABLE_MESSAGE` (#15) para el 404 amable; `apiError`/`fail`
  para validación; rate limit `isInformeShareRateLimited` → 429.
- **Nuevos:** ninguna clase de error de dominio. El conflicto de UNIQUE se detecta por código
  Postgres `23505` y se mapea a estado `already_answered` (no es error 500). No se exponen stack
  traces ni la causa real al cliente (logueo server-side, patrón #15).

## Alternativas descartadas

| Alternativa | Motivo descarte |
|---|---|
| Vincular la respuesta a `report_id` en vez de `share_id` | El cliente responde sobre el link que recibió; atar al report mezcla versiones y permitiría arrastrar respuestas entre regeneraciones. `share_id` congela «respondés lo que viste» (coherente con #15) |
| Respuesta editable (upsert / ventana de edición) | Sin caso de uso; complica idempotencia y semántica de «conformidad». Inmutable es más simple y más fiel a una constancia de conformidad. Queda como open question por si la puerta prefiere editable acotado |
| `+server.ts` JSON propio para el submit | El form action de la ruta pública reusa el guard de token, rate limit y degradación amable de #15 sin duplicar; además funciona sin JS |
| Tabla genérica de «respuestas de formulario» reusando `audit_response` | `audit_response` es del modelo de auditoría técnico/cliente con otra semántica (source, scoring); mezclar contaminaría ese contrato. Tabla propia, acotada |
| Set NPS (0–10) en vez de 1–5 | NPS exige volumen y benchmark para ser útil; para conformidad de un informe, 1–5 + Sí/No de conformidad es más legible para el cliente y para el backoffice. Open question por si la puerta prefiere NPS |
| Renderizar el formulario dentro del HTML string del informe (`web-render.ts`) | Ese render es HTML estático sin interactividad; el form necesita estado/enhance Svelte. Se monta como componente hermano en `+page.svelte`, debajo del `{@html}` |
| Bloque de encuesta en la vista `/imprimir` (A4) | La vista print es para PDF; una encuesta interactiva no tiene sentido impresa. El bloque va solo en la vista web (R1) |

## Open questions (puerta humana) — RESUELTAS 2026-06-25 (Martín)

Decisiones de la puerta humana, ya cerradas. El implementer las toma como spec firme:

1. **Set de preguntas — DECIDIDO:** `valoracion_global` 1–5, `claridad_informe` 1–5,
   `conforme_hallazgos` Sí/No, `comentario` libre opcional. Escalas 1–5 (NO NPS). Sin
   preguntas adicionales.
2. **Idempotencia — DECIDIDO:** **una respuesta por token, INMUTABLE** tras enviar (sin
   edición). Reenviar sobre un token ya respondido → estado `already_answered`, no error.
3. **Comentario obligatorio si «no conforme» — DECIDIDO:** **opcional siempre**; el envío
   nunca se bloquea por falta de comentario.
4. **Visibilidad de la respuesta — DECIDIDO:** **solo admin** en la pantalla de revisión del
   informe. El rol `tecnico` no la ve en esta iteración.
