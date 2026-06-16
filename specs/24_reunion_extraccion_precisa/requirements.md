# Requirements — #24 24_reunion_extraccion_precisa

> Mejora de precisión del asistente de reunión (#12): elimina propuestas alucinadas, citas mal
> asociadas y reuso de citas, y migra el ANÁLISIS de OpenAI `gpt-4o-mini` a Claude (Anthropic
> Messages API) con salida estructurada por tool use. El STT (OpenAI Whisper) queda intacto. NO
> toca el modelo de datos de `reunion_proposal`, ni el flujo de revisión (aceptar/editar/rechazar).
> Fuente: solicitud operativa SyS (2026-06-16, Martín) tras probar el pipeline con una transcripción
> simulada. Base: #12 (`specs/12_reunion_asistente`), pipeline `src/lib/server/reunion/`.
> Depende de: #12 (`12_reunion_asistente`) implementado.

## Convenciones

- Los `R<n>` de este spec son **independientes** de los de #12 (otra carpeta). Cuando se referencia
  un requisito de #12 se escribe explícitamente `#12 R<n>`.
- "El análisis" / "la extracción" = el paso que mapea transcript → propuestas (`reunion_proposal`),
  hoy en `src/lib/server/reunion/pipeline/extract.ts`. "El STT" = `pipeline/stt.ts` (Whisper).
- "Propuesta" = objeto `{ item_id, proposed_value, quote, confidence }` validado por
  `reunionProposalSchema` (`src/lib/server/reunion/schemas.ts:52`).

---

## R1 — STT sin cambios (OpenAI Whisper)

El sistema DEBE seguir transcribiendo el audio de reunión con OpenAI Whisper mediante el adapter
de `src/lib/server/reunion/pipeline/stt.ts`, sin que esta feature modifique el proveedor, el modelo
ni la firma de transcripción.

**Verificación:** `tests/reunion-stt.test.ts` — el adapter STT sigue usando `provider='openai-whisper'`
y `whisper-1`; el diff de la feature no altera `stt.ts` salvo, a lo sumo, comentarios.

## R2 — Análisis con Claude vía Messages API

CUANDO `reunion_transcript.status = 'ready'` y existen ítems elegibles, el sistema DEBE ejecutar la
extracción de propuestas contra la Anthropic Messages API (`POST https://api.anthropic.com/v1/messages`)
con headers `x-api-key: $ANTHROPIC_API_KEY` y `anthropic-version: 2023-06-01`, en lugar de OpenAI
chat completions.

**Verificación:** `tests/reunion-analyze.test.ts` — con `fetch` mockeado, el pipeline llama a
`api.anthropic.com/v1/messages` con esos headers y NO a `api.openai.com/v1/chat/completions`.

## R3 — Salida estructurada por tool use forzado

CUANDO el sistema invoca a Claude para extraer propuestas, el sistema DEBE forzar la salida mediante
una herramienta `propose_values` (declarada en `tools[]` con `input_schema` JSON Schema) y
`tool_choice: { type: "tool", name: "propose_values" }`, y DEBE leer las propuestas del bloque
`tool_use` de la respuesta, sin parsear texto libre.

**Verificación:** `tests/reunion-analyze.test.ts` — el body enviado incluye `tool_choice` forzado a
`propose_values`; una respuesta mock con `content: [{ type: "tool_use", name: "propose_values",
input: { proposals: [...] } }]` produce propuestas; una respuesta sólo-texto produce 0 propuestas
sin lanzar excepción no controlada.

## R4 — Modelo de análisis configurable por env

El sistema DEBE leer el modelo de análisis de `REUNION_ANALYSIS_MODEL`, con default `claude-sonnet-4-6`
cuando la variable no está definida.

**Verificación:** `tests/reunion-analyze.test.ts` — sin `REUNION_ANALYSIS_MODEL` el body usa
`claude-sonnet-4-6`; con `REUNION_ANALYSIS_MODEL=claude-haiku-4-5` el body usa ese valor.

## R5 — Fallo de credencial explícito

SI `ANTHROPIC_API_KEY` no está definida al ejecutar el análisis ENTONCES el sistema DEBE lanzar un
error explícito (`ANTHROPIC_API_KEY no configurado`) y NO DEBE insertar propuestas.

**Verificación:** `tests/reunion-analyze.test.ts` — sin `ANTHROPIC_API_KEY` la función de análisis
lanza error con ese mensaje; `tests/reunion-pipeline.test.ts` — el pipeline deja la sesión en `error`
sin filas en `reunion_proposal`.

## R6 — Prompt: prohibición de inferir de controles vecinos

El sistema DEBE construir el prompt de análisis de modo que prohíba explícitamente inferir un valor a
partir de controles vecinos o de la postura general de seguridad: si el cliente no habló del control
puntual de un ítem, ese ítem DEBE omitirse (no se propone valor).

**Verificación:** `tests/reunion-prompt.test.ts` — el system/prompt generado contiene la directiva de
no-inferencia y de omisión; cubierto end-to-end por la regresión de R16.

## R7 — Cita verbatim que responde la pregunta puntual

El sistema DEBE exigir en el prompt que cada propuesta incluya una cita textual verbatim del transcript
que responda esa pregunta puntual del ítem (no un fragmento de otra parte de la conversación).

**Verificación:** `tests/reunion-prompt.test.ts` — el prompt exige cita verbatim que responda la
pregunta del ítem; comportamiento verificado por R8 (grounding) y R16 (regresión cita-rubro / cita-backups).

## R8 — Guard de grounding (cita = substring real)

CUANDO el sistema recibe una propuesta de Claude, el sistema DEBE verificar que la `quote`
(normalizada por espacios en blanco colapsados y minúsculas) sea substring del transcript normalizado
con la misma función; SI no aparece ENTONCES el sistema DEBE descartar la propuesta y loguear el
descarte (`reunion_proposal_grounding_fail`).

**Verificación:** `tests/reunion-grounding.test.ts` — propuesta con cita inexistente en el transcript
se descarta y se loguea; propuesta con cita que sólo difiere en espacios/caso sobrevive.

## R9 — Guard de dedup de citas

CUANDO dos o más propuestas comparten la misma `quote` normalizada para ítems distintos, el sistema
DEBE conservar únicamente la de mayor `confidence` y descartar las demás, logueando cada descarte
(`reunion_proposal_dedup_drop`).

**Verificación:** `tests/reunion-dedup.test.ts` — tres propuestas con la misma cita normalizada
quedan en una sola (la de mayor confidence); en empate de confidence sobrevive exactamente una y el
resultado es determinístico.

## R10 — Umbral de confidence configurable

El sistema DEBE leer `REUNION_CONFIDENCE_MIN` (número en `[0,1]`, default `0.5`) y descartar toda
propuesta con `confidence` estrictamente menor al umbral, logueando el descarte
(`reunion_proposal_below_threshold`).

**Verificación:** `tests/reunion-threshold.test.ts` — con default `0.5`, una propuesta de `0.49` se
descarta y una de `0.5` sobrevive; con `REUNION_CONFIDENCE_MIN=0.8` una de `0.7` se descarta.

## R11 — Contexto enriquecido (help_text + section_title)

CUANDO el sistema construye el contexto de ítems para enviar a Claude, el contexto DEBE incluir, por
ítem, además de los campos actuales, el `help_text` del `template_item` y el `title` de la `section`
a la que pertenece.

**Verificación:** `tests/reunion-context.test.ts` — `buildTemplateContextForExtraction` devuelve
ítems con `help_text` y `section_title`; el prompt generado los incluye por ítem.

## R12 — Verificador (Tier 2) activable por env

DONDE `REUNION_VERIFIER_ENABLED=true`, el sistema DEBE ejecutar, por cada propuesta sobreviviente, un
segundo pase "juez" contra la Messages API (modelo `REUNION_VERIFIER_MODEL`, default `claude-haiku-4-5`)
que reciba transcript + (pregunta del ítem, valor propuesto, cita) y responda de forma estructurada si
la cita sustenta ese valor para esa pregunta exacta. La política según el resultado DEBE ser:

- El juez responde y dictamina `supported=false` (la cita NO sustenta el valor) → la propuesta DEBE
  **descartarse** y loguearse (`reunion_proposal_verifier_drop`).
- El juez falla en una propuesta puntual (error de red/API/timeout al juzgarla, sin dictamen) → la
  propuesta DEBE **conservarse** marcada como **no verificada** (ver R19) y loguearse
  (`reunion_proposal_verifier_error`); el fallo NO DEBE bloquear el juicio del resto de las propuestas.
- El juez responde `supported=true` → la propuesta sobrevive (marcada `verified` por R19).

**Verificación:** `tests/reunion-verifier.test.ts` — con verificador activo y Anthropic mockeado, una
propuesta juzgada `supported=false` se descarta; una `supported=true` sobrevive; una cuyo juicio lanza
error se conserva (no se descarta) con marcador no verificado y log `reunion_proposal_verifier_error`,
sin que ese error afecte el juicio de las demás.

## R13 — Verificador desactivado por default sin cambio de comportamiento

MIENTRAS `REUNION_VERIFIER_ENABLED` no es `true`, el sistema DEBE completar el pipeline sin ejecutar
el segundo pase y sin realizar ninguna llamada adicional a la Messages API por el verificador.

**Verificación:** `tests/reunion-verifier.test.ts` — sin la env, `fetch` recibe exactamente una
llamada a `/v1/messages` (la extracción) por sesión; el set de propuestas es el de los guards Tier 1.

## R14 — Orden de los guards

CUANDO el análisis produce propuestas crudas, el sistema DEBE aplicarlas en este orden antes de
persistir: (1) validación de tipo por `field_type` (parser de form de #12), (2) grounding (R8),
(3) umbral (R10), (4) dedup (R9), (5) verificador (R12, si está activo).

**Verificación:** `tests/reunion-pipeline-order.test.ts` — una propuesta inválida por tipo nunca llega
a grounding; una bajo umbral nunca se compara en dedup; el conteo de descartes por etapa coincide con
el orden especificado.

## R15 — Persistencia y revisión sin cambios de comportamiento

El sistema DEBE persistir las propuestas sobrevivientes con `insertReunionProposals`
(`src/lib/server/db/reunion-proposals.ts`) usando la misma forma `{ item_id, proposed_value, quote,
confidence }` para esos cuatro campos, y NO DEBE alterar el comportamiento del flujo de revisión
aceptar/editar/rechazar de #12. El único cambio admitido sobre la tabla `reunion_proposal` es la
**adición de una columna NULLABLE** para el marcador de verificación (R19): es aditiva, opcional y con
default que preserva el comportamiento actual; no se modifican ni eliminan columnas existentes, ni el
contrato de `UNIQUE (reunion_session_id, item_id)`, ni el flujo de revisión.

**Verificación:** `tests/reunion-pipeline.test.ts` — tras el pipeline, las filas de `reunion_proposal`
tienen los 4 campos; `tests/api/reunion-review.test.ts` (de #12) sigue verde sin modificaciones.

## R16 — Regresión con la transcripción de prueba

CUANDO se ejecuta el análisis sobre el fixture `tests/fixtures/reunion-transcripcion-prueba.txt`
(transcripción de prueba de SyS) con el adapter de Anthropic mockeado por un stub determinístico que
reproduce la salida real observada, el sistema DEBE, tras aplicar los guards, producir un set de
propuestas que **NO** contenga: (a) ítems alucinados — capacitación en ciberseguridad, endurecimiento
de servidores, reglas de firewall documentadas, rubro; (b) la cita de contraseñas reusada en más de un
ítem; (c) el ítem de backups marcado con valor "No" / negativo siendo backups automáticos diarios.

**Verificación:** `tests/reunion-regresion.test.ts` — sobre el fixture, los `item_id` alucinados no
aparecen; ninguna cita normalizada se repite entre ítems; el ítem de backups no queda con valor
negativo. (El stub que alimenta el test lo provee el implementer; el requisito es el invariante de
salida, no la salida del LLM real.)

## R17 — Tests con Anthropic mockeado, sin red

El sistema DEBE incluir los tests vitest de R2–R16 ejecutables sin credenciales ni red reales,
mockeando `fetch` / el adapter de análisis; `pnpm test` DEBE pasar en verde.

**Verificación:** `pnpm test` ejecuta la suite reunion (incluida la nueva) en verde sin
`ANTHROPIC_API_KEY` real ni acceso a `api.anthropic.com`.

## R18 — Documentación de variables de entorno

El sistema DEBE documentar las variables nuevas (`ANTHROPIC_API_KEY`, `REUNION_ANALYSIS_MODEL`,
`REUNION_CONFIDENCE_MIN`, `REUNION_VERIFIER_ENABLED`, `REUNION_VERIFIER_MODEL`) en `.env.example` (o el
archivo de ejemplo de entorno del repo) con default y descripción breve.

**Verificación:** revisión de `.env.example` — las 5 variables están listadas con comentario; `init.sh`
(si valida envs documentadas) no reporta variables sin documentar.

## R19 — Marcador de verificación persistido + badge en la UI de revisión

El sistema DEBE persistir, por propuesta, un marcador de estado de verificación en una **columna nueva
NULLABLE** de `reunion_proposal` (`verification_status text`, valores admitidos `verified` |
`unverified` | `NULL`), creada por una **migración nueva e idempotente** que NO altere los datos de #12
(columna nullable, default `NULL` → comportamiento de #12 intacto). La semántica del marcador DEBE ser:

- Verificador **desactivado** (default) → la propuesta se persiste con `verification_status = NULL`
  (sin cambio respecto de #12).
- Verificador **activo**, `supported=true` → `verification_status = 'verified'` (o `NULL` si resulta
  más simple y consistente con la implementación; ambos representan "no requiere atención extra").
- Verificador **activo**, `supported=false` → la propuesta se descarta (no se persiste; ver R12).
- Verificador **activo**, ERROR del juez en esa propuesta → la propuesta se persiste con
  `verification_status = 'unverified'` (conservar + marcar; ver R12).

La UI de revisión `src/lib/components/reunion/proposal-review.svelte` DEBE mostrar un badge/indicador
visible cuando la propuesta está `unverified` (texto del tipo "No verificada — revisar"), y NO DEBE
mostrar ese badge cuando el marcador es `verified` o `NULL`.

**Verificación:** migración — `tests/db/migrate.test.ts` (o equivalente del runner) aplica la migración
dos veces sin error y `reunion_proposal` queda con la columna `verification_status` nullable default
`NULL`; persistencia — `tests/reunion-verifier.test.ts` confirma que una propuesta con ERROR del juez se
inserta con `verification_status = 'unverified'`; UI — `tests/reunion-proposal-review.test.ts` (render
del componente) muestra el badge "No verificada" sólo cuando `verification_status === 'unverified'` y no
cuando es `verified`/`NULL`.

---

## Trazabilidad acceptance (feature_list.json #24) → R

| Acceptance #24 | Requirements |
|---|---|
| STT Whisper intacto; análisis con Claude (ANTHROPIC_API_KEY), modelo configurable (REUNION_ANALYSIS_MODEL), tool use sin texto libre | R1, R2, R3, R4, R5 |
| Prompt prohíbe inferir de controles vecinos / postura general; omite ítem si no se habló del control | R6 |
| Cita verbatim que responde la pregunta; contexto con help_text + section_title | R7, R11 |
| Guard de grounding (cita = substring normalizado; si no, descarta + log) | R8 |
| Guard de dedup (misma cita >1 ítem → sobrevive mayor confidence) | R9 |
| Umbral de confidence configurable por env | R10 |
| Verificador Tier 2 activable por env; con él desactivado el pipeline funciona igual; ERROR del juez → conservar + marcar no verificada (badge en revisión) | R12, R13, R19 |
| Regresión: sin ítems alucinados, sin reuso de cita de contraseñas, backups no "No" | R16 |
| Tests: grounding, dedup, umbral, verificador (Anthropic mock), fixture, revisión/persistencia sin cambios, marcador de verificación + badge | R8, R9, R10, R12, R15, R16, R17, R19 |

## Fuera de alcance

- Cambios en el modelo de datos de `reunion_proposal` o en la UI de revisión de #12.
- Migrar el STT a otro proveedor o a streaming.
- Reescribir el modo webhook/n8n (#12 R21): esta feature endurece sólo el modo `direct`. Decisión de
  la puerta humana (2026-06-16, ver design §Decisiones de la puerta humana): la precisión del modo
  webhook depende del workflow n8n y queda como feature aparte si va a producción.
- Diarización cliente/técnico; auto-aplicar propuestas sin revisión humana.
- Ampliar `field_type` soportados más allá del MVP de #12.
