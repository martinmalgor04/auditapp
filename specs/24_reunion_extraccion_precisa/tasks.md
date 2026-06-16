# Tasks — #24 24_reunion_extraccion_precisa

Implementación en orden. Marcar `[x]` al completar. Documentar trazabilidad R→test en
`progress/impl_24_reunion_extraccion_precisa.md`.

> Prerrequisito: #12 `12_reunion_asistente` implementado (pipeline `src/lib/server/reunion/` presente).
> Regla dura: NO tocar el modelo de datos `reunion_proposal` ni la UI/flujo de revisión de #12.
> Antes de codificar la llamada a Anthropic, consultar el skill `claude-api` para endpoint, headers,
> forma del `tool_use` en la respuesta y modelos vigentes.

## Contexto enriquecido

- [x] **T1** — Extender `src/lib/server/reunion/pipeline/context.ts`: añadir `help_text` y
  `section_title` a `TemplateContextItem` y a la query (`ti.help_text`, join `section s` →
  `s.title AS section_title`). Cubre: **R11**.
- [x] **T2** — `tests/reunion-context.test.ts`: el contexto incluye `help_text` y `section_title` por
  ítem; el filtro `field_type` MVP / `filled_by` no cambia. Cubre: **R11**.

## Adapter de análisis Claude + tool use

- [x] **T3** — Crear `src/lib/server/reunion/schemas.ts` → `analysisProposalsSchema`
  (`{ proposals: Array<reunionProposalSchema-shape> }`) para validar `tool_use.input`. Cubre: **R3**.
- [x] **T4** — Crear `src/lib/server/reunion/pipeline/analyze.ts`: `readAnalyzeConfig()` (lee
  `REUNION_ANALYSIS_MODEL`, `REUNION_CONFIDENCE_MIN`, `REUNION_VERIFIER_ENABLED`,
  `REUNION_VERIFIER_MODEL` con defaults), `buildAnalysisPrompt()` (prompt endurecido), el tool schema
  `propose_values`, el transport real (fetch a `https://api.anthropic.com/v1/messages`, headers
  `x-api-key` + `anthropic-version: 2023-06-01`), `analyzeProposals` y `analyzeProposalsWith`. Forzar
  `tool_choice` a `propose_values`. Cubre: **R2, R3, R4, R5, R6, R7**.
- [x] **T5** — `tests/reunion-analyze.test.ts` (fetch/transport mock): llama a `api.anthropic.com`
  con headers correctos y NO a OpenAI (**R2**); body con `tool_choice` forzado y lectura de `tool_use`
  (**R3**); respuesta sólo-texto → `[]` (**R3**); default `claude-sonnet-4-6` y override por env (**R4**);
  sin `ANTHROPIC_API_KEY` lanza error (**R5**). Cubre: **R2, R3, R4, R5**.
- [x] **T6** — `tests/reunion-prompt.test.ts`: el prompt contiene la directiva de no-inferencia +
  omisión (**R6**) y la exigencia de cita verbatim que responde la pregunta (**R7**). Cubre: **R6, R7**.

## Guards Tier 1 (grounding / umbral / dedup)

- [x] **T7** — Crear `src/lib/server/reunion/pipeline/grounding.ts`: `normalizeQuote`, `isGrounded`,
  `dropUngrounded`, `dropBelowThreshold`, `dedupeByQuote` (mayor confidence; empate determinístico por
  `item_id`); logs `reunion_proposal_grounding_fail` / `_below_threshold` / `_dedup_drop`. Cubre:
  **R8, R9, R10**.
- [x] **T8** — `tests/reunion-grounding.test.ts`: cita inexistente se descarta + log; cita que sólo
  difiere en espacios/caso sobrevive. Cubre: **R8**.
- [x] **T9** — `tests/reunion-dedup.test.ts`: 3 propuestas misma cita → 1 (mayor confidence); empate →
  exactamente 1, determinístico. Cubre: **R9**.
- [x] **T10** — `tests/reunion-threshold.test.ts`: default 0.5 (0.49 fuera, 0.5 dentro); env 0.8 (0.7
  fuera). Cubre: **R10**.

## Verificador Tier 2

- [x] **T11** — Crear `src/lib/server/reunion/pipeline/verify.ts`: `verifyProposals` (tool use forzado
  a `judge` con `{ supported, reason }`, modelo `REUNION_VERIFIER_MODEL`). Política por resultado:
  `supported=false` → descartar + log `reunion_proposal_verifier_drop`; `supported=true` → conservar con
  `verification_status='verified'`; **ERROR del juez en esa propuesta → conservar** con
  `verification_status='unverified'` + log `reunion_proposal_verifier_error` (el error se captura por
  propuesta y NO interrumpe el juicio del resto). Devolver el set conservado con `verification_status`
  poblado. Cubre: **R12, R19**.
- [x] **T12** — `tests/reunion-verifier.test.ts`: con verificador activo (Anthropic mock),
  `supported=false` se descarta y `supported=true` sobrevive (**R12**); una propuesta cuyo juicio lanza
  error se conserva con `verification_status='unverified'` y log `reunion_proposal_verifier_error`, sin
  afectar el juicio de las demás (**R12, R19**); sin la env, exactamente 1 llamada a `/v1/messages` por
  sesión y set = guards Tier 1 con `verification_status` nulo (**R13**). Cubre: **R12, R13, R19**.

## Marcador de verificación: migración + persistencia + badge (R19)

- [x] **T12a** — Crear `migrations/016_reunion_verification_status.sql`: migración idempotente
  `ALTER TABLE reunion_proposal ADD COLUMN IF NOT EXISTS verification_status text` (nullable, default
  `NULL`) + CHECK `verification_status IS NULL OR verification_status IN ('verified','unverified')`
  (con `DROP CONSTRAINT IF EXISTS` previo). NO toca columnas existentes ni el `UNIQUE`. Cubre: **R19**.
- [x] **T12b** — `tests/db/migrate.test.ts` (o equivalente del runner): aplicar la migración dos veces
  sin error; `reunion_proposal` queda con `verification_status` nullable default `NULL`. Cubre: **R19**.
- [x] **T12c** — Modificar `src/lib/server/db/reunion-proposals.ts`: `insertReunionProposals` acepta
  `verificationStatus?: 'verified'|'unverified'|null` por propuesta y lo persiste (lista de columnas +
  `DO UPDATE SET`); `ReunionProposalRow`/`ReunionProposalWithItem` exponen `verification_status`; los
  `SELECT` de `listReunionProposalsBySession`/`getReunionProposalById` incluyen `rp.verification_status`.
  Sin cambiar el resto del contrato de #12. Cubre: **R19**.
- [x] **T12d** — `tests/reunion-proposal-review.test.ts` (render del componente): el badge
  "No verificada — revisar" aparece sólo cuando `verification_status === 'unverified'` y NO cuando es
  `verified` o `NULL`. Cubre: **R19**.
- [x] **T12e** — Modificar `src/lib/components/reunion/proposal-review.svelte`: badge/indicador
  "No verificada — revisar" cuando `proposal.verification_status === 'unverified'` (estilo de alerta,
  paleta SyS); sin badge de verificación para `verified`/`NULL` (UI default de #12 intacta).
  Cubre: **R19**.

## Orquestación + integración en el pipeline

- [x] **T13** — En `analyze.ts`, encadenar guards en el orden R14:
  validateByFieldType → dropUngrounded → dropBelowThreshold → dedupeByQuote → verify(si activo).
  Cubre: **R14**.
- [x] **T14** — `tests/reunion-pipeline-order.test.ts`: propuesta inválida por tipo no llega a
  grounding; bajo umbral no se compara en dedup; conteos por etapa coinciden con el orden. Cubre: **R14**.
- [x] **T15** — Modificar `src/lib/server/reunion/pipeline/direct.ts`: reemplazar
  `extractProposals(...)` por `analyzeProposals(...)`; mantener `insertReunionProposals` y el manejo de
  error (sesión → `error`); mapear `AnalyzedProposal.verification_status` al campo `verificationStatus`
  al persistir (R19). Deprecar/eliminar `extract.ts` (o conservar sólo el mock reusable). Cubre:
  **R1, R2, R15, R19**.
- [x] **T16** — `tests/reunion-stt.test.ts`: confirmar que el STT sigue en `openai-whisper`/`whisper-1`
  y que el diff no altera `stt.ts`. Cubre: **R1**.
- [x] **T17** — `tests/reunion-pipeline.test.ts`: tras el pipeline, filas `reunion_proposal` con los 4
  campos; sin `ANTHROPIC_API_KEY` la sesión queda `error` sin propuestas. Verificar que
  `tests/api/reunion-review.test.ts` (de #12) sigue verde sin cambios. Cubre: **R5, R15**.

## Regresión + docs

- [x] **T18** — Crear `tests/fixtures/reunion-transcripcion-prueba.txt` con la transcripción de prueba
  (provista en el spec). Cubre: **R16**.
- [x] **T19** — `tests/reunion-regresion.test.ts`: stub determinístico que reproduce la salida cruda
  observada (con los 4 patrones de error); tras los guards, asserts: (a) `item_id` alucinados ausentes
  (capacitación, endurecimiento, firewall documentado, rubro); (b) ninguna cita normalizada repetida
  entre ítems; (c) backups sin valor negativo. Cubre: **R16**.
- [x] **T20** — Documentar en `.env.example` las 5 envs nuevas con default y comentario. Cubre: **R18**.
- [x] **T21** — Mapa de trazabilidad R→test en `progress/impl_24_reunion_extraccion_precisa.md` y
  correr `pnpm run check`, `pnpm test`, `./init.sh` en verde (Anthropic mockeado, sin red). Cubre:
  **R17** (+ cierre de trazabilidad de todos los R).

## Trazabilidad task → R (resumen)

| Task | R |
|---|---|
| T1, T2 | R11 |
| T3, T4, T5, T6 | R2, R3, R4, R5, R6, R7 |
| T7–T10 | R8, R9, R10 |
| T11, T12 | R12, R13, R19 |
| T12a–T12e | R19 |
| T13, T14 | R14 |
| T15, T16, T17 | R1, R2, R5, R15, R19 |
| T18, T19 | R16 |
| T20 | R18 |
| T21 | R17 (+ verificación global) |
