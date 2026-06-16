# Design — #24 24_reunion_extraccion_precisa

> Cómo se implementa la migración del análisis a Claude + guards de precisión, sin tocar STT,
> modelo de datos ni UI de revisión. Citas de archivo:línea sobre el código real al 2026-06-16.

## Contexto del pipeline actual (#12)

`processReunionJobDirect` (`src/lib/server/reunion/pipeline/direct.ts:18`) orquesta:

1. STT → `getSttAdapter().transcribe(...)` (`stt.ts:94`) — **se conserva** (R1).
2. Contexto → `buildTemplateContextForExtraction(audit_id)` (`context.ts:25`).
3. Extracción → `extractProposals(transcript, context)` (`extract.ts:57`) — **se reemplaza** (R2).
4. Persistencia → `insertReunionProposals(...)` (`direct.ts:76`, db en `reunion-proposals.ts:26`) —
   **se conserva** (R15).

Hoy `extract.ts` arma un prompt de texto (`buildExtractionPrompt`, `extract.ts:16`), llama a
`api.openai.com/v1/chat/completions` con `gpt-4o-mini` (`extract.ts:73`), parsea un array JSON de texto
libre (`extract.ts:100`) y valida cada item con `reunionProposalSchema` (`schemas.ts:52`) + el parser
de form `parseFormValue` (`extract.ts:136`). Los 4 patrones de error observados (alucinación, cita
errónea, cita reusada, valor mal) nacen de: prompt permisivo, contexto pobre (sólo
item_id/label/field_type/options/current_value, `context.ts:18`), parseo frágil y cero verificación de
grounding.

El modo **webhook/n8n** (`pipeline/webhook.ts`) NO llama a OpenAI: recibe propuestas ya armadas en el
callback (`webhook.ts:102`). Por eso esta feature endurece sólo el modo `direct`. Ver §Decisiones de la
puerta humana (decisión 1: webhook fuera de alcance).

## Archivos a crear / modificar

| Archivo | Acción | Cubre |
|---|---|---|
| `src/lib/server/reunion/pipeline/analyze.ts` | **Crear**. Adapter Anthropic + tool schema + guards orquestados. Reemplaza la responsabilidad de `extract.ts`. | R2–R10, R12–R14 |
| `src/lib/server/reunion/pipeline/grounding.ts` | **Crear**. `normalizeQuote`, `groundQuote`, dedup, umbral. Funciones puras testeables. | R8, R9, R10 |
| `src/lib/server/reunion/pipeline/verify.ts` | **Crear**. Segundo pase juez (Anthropic, tool use). | R12, R13 |
| `src/lib/server/reunion/pipeline/context.ts` | **Modificar**. Añadir `help_text` y `section_title` a la query y al tipo. | R11 |
| `src/lib/server/reunion/pipeline/direct.ts` | **Modificar**. Cambiar `extractProposals` por el nuevo `analyzeProposals`. | R2, R14, R15 |
| `src/lib/server/reunion/pipeline/extract.ts` | **Deprecar/eliminar** una vez `analyze.ts` cubre el flujo (o dejar sólo el mock reusable). | R2 |
| `src/lib/server/reunion/schemas.ts` | **Modificar (opcional)**. Añadir `analysisProposalsSchema` (envoltura `{ proposals: [...] }`) para validar el `tool_use.input`. | R3 |
| `migrations/016_reunion_verification_status.sql` | **Crear**. Migración idempotente: `ALTER TABLE reunion_proposal ADD COLUMN IF NOT EXISTS verification_status text` (nullable, default `NULL`) + CHECK del dominio de valores. | R19 |
| `src/lib/server/db/reunion-proposals.ts` | **Modificar**. `insertReunionProposals` acepta `verificationStatus?` por propuesta y lo persiste; `ReunionProposalRow`/`ReunionProposalWithItem` exponen `verification_status`; los SELECT lo incluyen. | R19 |
| `src/lib/components/reunion/proposal-review.svelte` | **Modificar**. Badge "No verificada — revisar" cuando `verification_status === 'unverified'`. | R19 |
| `tests/fixtures/reunion-transcripcion-prueba.txt` | **Crear**. Fixture con la transcripción de prueba. | R16 |
| `tests/reunion-*.test.ts` (varios) | **Crear**. Ver tasks. | R1–R17 |
| `.env.example` | **Modificar**. Documentar las 5 envs. | R18 |

## Firma del adapter de análisis (`analyze.ts`)

```ts
// Reutiliza el tipo de salida de #12 para no tocar direct.ts/persistencia.
// `verification_status` es aditivo (R19): undefined/null cuando el verificador está off o no aplica;
// 'unverified' cuando el juez falló en esa propuesta (conservar + marcar); 'verified' si pasó.
export type VerificationStatus = 'verified' | 'unverified' | null;

export type AnalyzedProposal = {
  item_id: string;
  proposed_value: unknown;
  quote: string;
  confidence: number;
  verification_status?: VerificationStatus; // R19
};

export type AnalyzeConfig = {
  model: string;          // REUNION_ANALYSIS_MODEL ?? 'claude-sonnet-4-6'   (R4)
  confidenceMin: number;  // REUNION_CONFIDENCE_MIN ?? 0.5                    (R10)
  verifierEnabled: boolean; // REUNION_VERIFIER_ENABLED === 'true'           (R12/R13)
  verifierModel: string;  // REUNION_VERIFIER_MODEL ?? 'claude-haiku-4-5'    (R12)
};

export function readAnalyzeConfig(): AnalyzeConfig; // lee env con defaults

export async function analyzeProposals(
  transcript: string,
  context: TemplateContext,
  config?: AnalyzeConfig
): Promise<AnalyzedProposal[]>;

// Inyectable para tests: un transport que envuelve fetch a /v1/messages.
export type AnthropicTransport = (body: unknown) => Promise<AnthropicMessage>;
export async function analyzeProposalsWith(
  transcript: string,
  context: TemplateContext,
  config: AnalyzeConfig,
  transport: AnthropicTransport
): Promise<AnalyzedProposal[]>;
```

`analyzeProposals` es el entrypoint que `direct.ts` llama; arma el `transport` real (fetch a
`https://api.anthropic.com/v1/messages`, headers `x-api-key` + `anthropic-version: 2023-06-01`) y
delega en `analyzeProposalsWith`. Los tests usan `analyzeProposalsWith` con un transport stub (R17).

### Llamada a la Messages API (R2, R3)

El repo usa `fetch` crudo (no el SDK `@anthropic-ai/sdk`) — se mantiene el patrón de `extract.ts`/`stt.ts`.

```ts
const res = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'x-api-key': apiKey,                 // process.env.ANTHROPIC_API_KEY (R5)
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json'
  },
  body: JSON.stringify({
    model: config.model,                 // R4
    max_tokens: 4000,
    tools: [PROPOSE_VALUES_TOOL],        // ver tool schema abajo (R3)
    tool_choice: { type: 'tool', name: 'propose_values' },  // forzado (R3)
    messages: [{ role: 'user', content: prompt }]
  })
});
```

> Adaptive thinking / effort NO se usan: `tool_choice` forzado a una tool específica es incompatible
> con thinking; se omite el parámetro `thinking`. El implementer DEBE consultar el skill `claude-api`
> para confirmar endpoint, headers, forma exacta de `tool_use` en la respuesta y la lista de modelos
> vigentes antes de codificar.

La respuesta se lee así (sin parsear texto libre):

```ts
const block = data.content.find((b) => b.type === 'tool_use' && b.name === 'propose_values');
const raw = analysisProposalsSchema.safeParse(block?.input); // { proposals: [...] }
const proposals = raw.success ? raw.data.proposals : [];     // respuesta sólo-texto → [] (R3)
```

### Tool schema `propose_values` (R3, R7)

JSON Schema declarado en `tools[].input_schema`:

```jsonc
{
  "name": "propose_values",
  "description": "Devuelve sólo las propuestas con evidencia textual explícita para el control puntual del ítem.",
  "input_schema": {
    "type": "object",
    "properties": {
      "proposals": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "item_id":        { "type": "string", "description": "UUID exacto de un ítem del contexto" },
            "proposed_value": { "description": "Valor del tipo correcto según field_type" },
            "quote":          { "type": "string", "description": "Cita textual verbatim del transcript que responde ESTA pregunta" },
            "confidence":     { "type": "number", "minimum": 0, "maximum": 1 }
          },
          "required": ["item_id", "proposed_value", "quote", "confidence"]
        }
      }
    },
    "required": ["proposals"]
  }
}
```

`proposed_value` se deja sin `type` (heterogéneo por `field_type`); la validación de tipo real la hace
`parseFormValue` (paso 1 de R14), como en #12.

## Prompt endurecido (R6, R7)

`buildAnalysisPrompt(transcript, context)` produce un prompt con, como mínimo, estas directivas
verificables (R6/R7 chequean su presencia textual):

- Sólo proponer para los `item_id` listados (igual que #12).
- **PROHIBIDO inferir** un valor a partir de controles vecinos o de la postura general de seguridad
  del cliente. Ejemplo negativo embebido: "mala postura de seguridad" NO habilita proponer
  capacitación, endurecimiento, reglas de firewall ni rubro.
- Si el cliente **no habló del control puntual** de un ítem → **OMITIR** el ítem.
- Cada propuesta lleva **cita verbatim** del transcript que responde **esa** pregunta puntual; no citar
  saludos, ni respuestas a otra pregunta.
- Calibrar `confidence`: alto sólo con evidencia explícita y directa; bajo o omitir ante ambigüedad.

El contexto por ítem se serializa con los campos nuevos (R11): `item_id, label, section_title,
help_text, field_type, options, current_value`.

## Contexto enriquecido (`context.ts`, R11)

`TemplateContextItem` (`context.ts:8`) suma `help_text: string | null` y `section_title: string`. La
query (`context.ts:38`) añade `ti.help_text` y un join a `section s` para `s.title AS section_title`
(la tabla y columnas existen: `section.title`, `migrations/001_schema.sql:38`; `template_item.help_text`,
`migrations/001_schema.sql:51`). El resto del filtro (`field_type` MVP, `filled_by ∈ {cliente,tecnico}`)
queda igual.

## Guards (`grounding.ts`)

Funciones puras, sin I/O, fáciles de testear:

```ts
export function normalizeQuote(s: string): string;       // trim + colapsar espacios + toLowerCase
export function isGrounded(quote: string, transcript: string): boolean;  // substring normalizado (R8)
export function dropUngrounded(props, transcript): { kept; dropped };    // R8 + log
export function dropBelowThreshold(props, min): { kept; dropped };       // R10 + log
export function dedupeByQuote(props): { kept; dropped };                 // R9: mayor confidence gana, determinístico
```

`dedupeByQuote`: agrupa por `normalizeQuote(quote)`; por grupo conserva la de mayor `confidence`; en
empate, orden estable por `item_id` (determinístico, R9). El logueo usa `logger` de
`$lib/server/logger` con los eventos nombrados en R8/R9/R10.

## Orden de guards (R14) en `analyzeProposalsWith`

```
crudas (tool_use.input.proposals)
  → 1. validateByFieldType  (parseFormValue por field_type, como extract.ts:136)
  → 2. dropUngrounded       (R8)
  → 3. dropBelowThreshold   (R10)
  → 4. dedupeByQuote        (R9)
  → 5. verify (si verifierEnabled) (R12)
  → AnalyzedProposal[]  → direct.ts → insertReunionProposals
```

Validación de tipo primero (descarta basura antes de gastar comparaciones), grounding y umbral antes
de dedup (para no dejar que una propuesta inválida/baja gane un grupo de dedup), verificador al final
(es el más caro: 1 llamada LLM por propuesta sobreviviente).

## Verificador Tier 2 (`verify.ts`, R12, R13)

```ts
export async function verifyProposals(
  transcript: string,
  context: TemplateContext,
  props: AnalyzedProposal[],
  config: AnalyzeConfig,
  transport: AnthropicTransport
): Promise<AnalyzedProposal[]>;
```

Por propuesta, una llamada a Messages API con `REUNION_VERIFIER_MODEL` (default `claude-haiku-4-5`) y
tool use forzado a una tool `judge` con `input_schema { supported: boolean, reason: string }`. El
prompt da: transcript, la pregunta del ítem (label + help_text), el valor propuesto y la cita; pide
juzgar si la cita sustenta ese valor para esa pregunta exacta. Política por resultado (R12/R19):

- `supported=false` (juez dictamina que NO sustenta) → **descartar** + log `reunion_proposal_verifier_drop`.
- `supported=true` → conservar con `verification_status = 'verified'`.
- **ERROR** al juzgar esa propuesta (red/API/timeout, sin dictamen) → **conservar** la propuesta con
  `verification_status = 'unverified'` + log `reunion_proposal_verifier_error`. El error se captura por
  propuesta y NO interrumpe el juicio de las restantes.

`verifyProposals` devuelve el set conservado con su `verification_status` poblado, listo para
`insertReunionProposals` (R19). Las propuestas `supported=false` no aparecen en el set devuelto.

Cuando `verifierEnabled` es `false` (default), `analyzeProposalsWith` NO invoca `verifyProposals` ni
hace llamadas extra (R13). Para acotar costo/latencia, el verificador puede correr en serie; el
paralelismo es decisión del implementer (no afecta el invariante de salida).

## Marcador de verificación: migración + persistencia + UI (R19)

Decisión de la puerta humana (2026-06-16): ante ERROR del verificador en una propuesta puntual se
**conserva y marca** "no verificada" en vez de descartar. Esto requiere persistir un marcador y
mostrarlo en revisión. Es **aditivo** sobre #12 (no viola R15: columna nullable, default `NULL`).

### Migración (`migrations/016_reunion_verification_status.sql`)

Migración nueva e idempotente (el runner `src/lib/server/db/migrate.ts` envuelve cada archivo en
`sql.begin`; el patrón `IF NOT EXISTS` la hace re-ejecutable):

```sql
-- #24 — marcador de verificación Tier 2. Aditivo y nullable: no cambia el comportamiento de #12.
ALTER TABLE reunion_proposal
  ADD COLUMN IF NOT EXISTS verification_status text;

ALTER TABLE reunion_proposal DROP CONSTRAINT IF EXISTS reunion_proposal_verification_status_check;
ALTER TABLE reunion_proposal
  ADD CONSTRAINT reunion_proposal_verification_status_check
  CHECK (verification_status IS NULL OR verification_status IN ('verified', 'unverified'));
```

Default implícito `NULL` → las filas de #12 y las creadas con el verificador off quedan en `NULL`
(comportamiento intacto). No se toca `UNIQUE (reunion_session_id, item_id)` ni columnas existentes.

### Persistencia (`reunion-proposals.ts`, R19)

`insertReunionProposals` suma un campo opcional por propuesta:

```ts
proposals: Array<{
  reunionSessionId: string;
  itemId: string;
  proposedValue: unknown;
  quote: string;
  confidence: number;
  verificationStatus?: 'verified' | 'unverified' | null; // R19; omitido → NULL
}>
```

El INSERT añade `verification_status` a la lista de columnas/valores (`${p.verificationStatus ?? null}`)
y al bloque `DO UPDATE SET` (para que un re-run del pipeline refresque el marcador junto al resto). Los
tipos `ReunionProposalRow` y `ReunionProposalWithItem` agregan `verification_status: 'verified' |
'unverified' | null` y los `SELECT` de `listReunionProposalsBySession` / `getReunionProposalById`
incluyen `rp.verification_status`. `direct.ts` mapea `AnalyzedProposal.verification_status` al nuevo
campo al persistir (sin cambiar el resto del contrato de R15).

### Badge en la UI (`proposal-review.svelte`, R19)

El componente muestra un indicador discreto cuando `proposal.verification_status === 'unverified'`
(p.ej. junto al badge de confidence): texto "No verificada — revisar", con estilo de alerta (paleta
SyS, p.ej. `sys-naranja`/`sys-rojo`). Cuando el marcador es `verified` o `NULL` no se renderiza ningún
badge de verificación (comportamiento visual de #12 intacto para el caso default). El render se valida
con un test de componente (R19).

## Manejo de errores y fallback

- `ANTHROPIC_API_KEY` ausente → throw `ANTHROPIC_API_KEY no configurado` (R5). `direct.ts` ya envuelve
  el bloque de extracción en try/catch (`direct.ts:69-94`) y deja la sesión en `error` sin insertar
  propuestas — se conserva.
- HTTP no-OK de Anthropic → throw `Analysis API error <status>: <body recortado>` (espejo de
  `extract.ts:88`). El pipeline lo captura y marca `error`.
- Respuesta sin bloque `tool_use` o `input` que no valida → 0 propuestas, sin throw (R3). Se loguea
  `reunion_analysis_no_tool_use`.
- Fallo del verificador en una propuesta puntual (error de red/API/timeout, sin dictamen del juez) →
  **conservar** la propuesta marcándola `verification_status = 'unverified'` (R19) y loguear
  `reunion_proposal_verifier_error`; no bloquea el juicio del resto. Decisión de la puerta humana
  (2026-06-16): el auditor revisa esa propuesta con más cuidado en vez de perderla. Importante: esto
  aplica SÓLO al caso de ERROR; el caso `supported=false` (el juez respondió y dictaminó que la cita NO
  sustenta el valor) sigue siendo **descarte** (`reunion_proposal_verifier_drop`).

## Variables de entorno (R18)

| Env | Default | Uso |
|---|---|---|
| `ANTHROPIC_API_KEY` | — (obligatoria para `direct`) | Auth Messages API |
| `REUNION_ANALYSIS_MODEL` | `claude-sonnet-4-6` | Modelo de extracción |
| `REUNION_CONFIDENCE_MIN` | `0.5` | Umbral de descarte |
| `REUNION_VERIFIER_ENABLED` | `false` | Activa Tier 2 |
| `REUNION_VERIFIER_MODEL` | `claude-haiku-4-5` | Modelo juez |

`OPENAI_API_KEY` sigue siendo necesaria para el STT (Whisper) — no se elimina.

## Alternativas descartadas

1. **Seguir con OpenAI + JSON mode (`response_format: json_schema`).** Descartada: decisión humana de
   migrar el análisis a Claude (feature_list #24 acceptance 1). El tool use forzado de Anthropic da la
   misma garantía estructural y es lo acordado.
2. **Usar el SDK `@anthropic-ai/sdk` (`messages.create` + `messages.parse`).** Descartada para esta
   feature: el repo ya hace `fetch` crudo en STT y extracción (`stt.ts`, `extract.ts`); añadir una
   dependencia y un cliente nuevo amplía el diff sin beneficio inmediato y complica el mock en tests
   (que hoy mockean `fetch`). Reevaluable más adelante.
3. **Verificador siempre activo.** Descartada: duplica costo/latencia (1 llamada por propuesta).
   Acordado activable por env, default off (R12/R13).
4. **Validar grounding pidiéndoselo al LLM (sin guard de código).** Descartada: el LLM es justamente la
   fuente de las citas alucinadas; el grounding DEBE ser determinístico en código (R8).
5. **Auto-aplicar propuestas de alta confidence a `audit_response`.** Fuera de alcance y contra #12 R15
   (revisión humana obligatoria).

## Decisiones de la puerta humana (2026-06-16)

Las cuatro open questions quedaron resueltas en la puerta de aprobación (Martín, 2026-06-16). No quedan
preguntas abiertas.

1. **Modo webhook/n8n → RESUELTA: fuera de alcance (decisión cerrada).** Esta feature endurece sólo el
   modo `direct`. La precisión del modo webhook depende del workflow n8n; si va a producción se trata
   como feature aparte. Ya no es una pregunta abierta. (Ver requirements §Fuera de alcance.)
2. **Defaults de modelo → RESUELTA: confirmados.** Extracción `claude-sonnet-4-6`
   (`REUNION_ANALYSIS_MODEL`, R4); verificador `claude-haiku-4-5` (`REUNION_VERIFIER_MODEL`, R12).
3. **`REUNION_CONFIDENCE_MIN` → RESUELTA: default `0.5` confirmado** (R10). No se cambia.
4. **Política ante ERROR del verificador en una propuesta → RESUELTA: CONSERVAR + marcar.** En vez de
   descartar, la propuesta se conserva marcada `unverified` para que el auditor la revise con cuidado
   (R12, R19). Aplica SÓLO al caso de ERROR del juez (fallo de red/API/timeout). El caso
   `supported=false` (juez respondió y dictaminó que la cita NO sustenta el valor) SIGUE siendo
   descarte. Implementación: columna nullable + badge en revisión (ver §Marcador de verificación).
