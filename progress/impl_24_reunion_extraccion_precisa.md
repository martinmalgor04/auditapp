# Implementación #24 — 24_reunion_extraccion_precisa

Implementer, 2026-06-16. Migra el ANÁLISIS de reunión de OpenAI `gpt-4o-mini` a Claude (Anthropic
Messages API, `fetch` crudo, tool use forzado `propose_values`). STT (Whisper) intacto. Guards Tier 1
(grounding/umbral/dedup) + verificador Tier 2 opcional. Columna nullable `verification_status`
(migración 016) + badge en la UI de revisión.

## Archivos creados
- `src/lib/server/reunion/pipeline/analyze.ts` — adapter Claude (transport fetch), `readAnalyzeConfig`,
  `buildAnalysisPrompt`, tool `propose_values`, `analyzeProposals`/`analyzeProposalsWith`, orquestación
  de guards (R14).
- `src/lib/server/reunion/pipeline/grounding.ts` — `normalizeQuote`, `isGrounded`, `dropUngrounded`,
  `dropBelowThreshold`, `dedupeByQuote` (puras).
- `src/lib/server/reunion/pipeline/verify.ts` — `verifyProposals` (juez Tier 2, tool `judge`).
- `migrations/016_reunion_verification_status.sql` — columna nullable + CHECK, idempotente.
- `tests/fixtures/reunion-transcripcion-prueba.txt` — transcripción de prueba (regresión).
- Tests: `reunion-context`, `reunion-analyze`, `reunion-prompt`, `reunion-grounding`, `reunion-dedup`,
  `reunion-threshold`, `reunion-verifier`, `reunion-pipeline-order`, `reunion-regresion`, `reunion-stt`,
  `reunion-proposal-review`, `tests/db/reunion-verification-status-migration`.

## Archivos modificados
- `src/lib/server/reunion/pipeline/context.ts` — añade `help_text` + `section_title` (tipo y query).
- `src/lib/server/reunion/pipeline/direct.ts` — usa `analyzeProposals`; mapea `verification_status`;
  log `reunion_analysis_error`.
- `src/lib/server/reunion/schemas.ts` — `analysisProposalsSchema`.
- `src/lib/server/db/reunion-proposals.ts` — `insertReunionProposals` acepta `verificationStatus`;
  tipos + SELECTs exponen `verification_status`.
- `src/lib/components/reunion/proposal-review.svelte` — badge "No verificada — revisar" si `unverified`.
- `.env.example` — documenta `REUNION_ANALYSIS_MODEL`, `REUNION_CONFIDENCE_MIN`,
  `REUNION_VERIFIER_ENABLED`, `REUNION_VERIFIER_MODEL` (+ nota de `ANTHROPIC_API_KEY` ya presente #14).
- `tests/reunion-pipeline.test.ts` — mock de `analyze` en vez de `extract`; tests R5/R15.
- `tests/fixtures/reunion-pipeline-mock.ts` — tipos al día (AnalyzedProposal), STT con transcribeBuffer.

## Archivos eliminados
- `src/lib/server/reunion/pipeline/extract.ts` — adapter OpenAI deprecado (reemplazado por analyze.ts).

## Trazabilidad R → test
- R1  → `reunion-stt.test.ts > STT intacto — OpenAI Whisper (whisper-1, provider openai-whisper)`
- R2  → `reunion-analyze.test.ts > transport real llama a Anthropic, no a OpenAI` (api.anthropic.com,
        headers x-api-key + anthropic-version)
- R3  → `reunion-analyze.test.ts > tool use forzado y lectura del bloque` (tool_choice forzado;
        sólo-texto → []; input inválido → [])
- R4  → `reunion-analyze.test.ts > modelo configurable` (default claude-sonnet-4-6; override env)
- R5  → `reunion-analyze.test.ts > sin ANTHROPIC_API_KEY lanza error`;
        `reunion-pipeline.test.ts > fallo de análisis ... deja la sesión en error sin propuestas`
- R6  → `reunion-prompt.test.ts > prohíbe inferir de controles vecinos / postura general; omite ítem`
- R7  → `reunion-prompt.test.ts > exige cita verbatim que responde esa pregunta`
- R8  → `reunion-grounding.test.ts > isGrounded / dropUngrounded` (substring normalizado; descarte+log)
- R9  → `reunion-dedup.test.ts > dedupeByQuote` (mayor confidence; empate determinístico por item_id)
- R10 → `reunion-threshold.test.ts > dropBelowThreshold / readAnalyzeConfig` (0.5 default; env 0.8)
- R11 → `reunion-context.test.ts > contexto enriquecido` (section_title + help_text surfaceados);
        `reunion-prompt.test.ts > incluye help_text y section_title por ítem`
- R12 → `reunion-verifier.test.ts > supported=false descarta; true verified; error → unverified`
- R13 → `reunion-verifier.test.ts > desactivado por default` (exactamente 1 llamada; status undefined)
- R14 → `reunion-pipeline-order.test.ts > orden de guards` (inválida por tipo no llega a grounding;
        bajo umbral no entra a dedup; grounding antes de umbral)
- R15 → `reunion-pipeline.test.ts > persiste propuestas con los 4 campos`; `tests/api/reunion-review.test.ts`
        (flujo de revisión #12 sin cambios, verde)
- R16 → `reunion-regresion.test.ts` (sin ítems alucinados; cita de contraseñas no reusada; backups no "No")
- R17 → suite reunion completa verde sin red ni ANTHROPIC_API_KEY real (fetch/transport mockeados)
- R18 → `.env.example` documenta las 5 envs con default y comentario
- R19 → `tests/db/reunion-verification-status-migration.test.ts` (columna nullable default NULL, idempotente);
        `reunion-verifier.test.ts` (error → unverified persistible);
        `reunion-proposal-review.test.ts` (badge sólo si unverified, no para verified/NULL)

## Verificación (resultados reales, 2026-06-16)
- `pnpm run check` → **0 ERRORS** (25 warnings preexistentes `state_referenced_locally` en todo el repo).
- `pnpm run build` → **✓ built** (adapter-node, done).
- Suite reunion + migración (21 archivos) → **103 passed**, 0 fallos.
- `pnpm test` (suite completa) → 770 passed, **17 failed**, 2 skipped.
  - Los 17 fallos son TODOS de la feature #23 (`empresa-schema`, `empresa-migration`, `clients-cuit-cleanup`,
    `clients-import*`, `api/backoffice-dashboard`, `api/backoffice-routes`, `api/audit-crud`,
    `canonical-contract`). Ninguno importa módulos de reunión/#24. Causa: #23 Fase 1 "BLOQUEADA
    (validación)" (ver progress/current.md) — migración 015 / vista `client` / `dashboard.ts` a medio
    rehacer (`column "c.razon_social" must appear in GROUP BY`, falta índice `empresa_cuit_unique`).
    No tocados por #24.
- `./init.sh` → EXIT 1 por dos condiciones **preexistentes ajenas a #24**:
  1. §3: "3 features en in_progress (máximo 1)" (#12, #23, #24) — condición de arnés aceptada por Martín.
  2. §4: los mismos 17 tests de #23.

## Notas / desvíos
- El fixture de regresión (R16): el texto literal de la transcripción NO estaba en los .md del spec
  (sólo se describían los 4 patrones de error). Se autoró una transcripción representativa que contiene
  exactamente las citas necesarias para los invariantes (uso de Tango, backups automáticos nocturnos,
  restore nunca probado, "misma contraseña hace ocho años", 50 empleados) y NO contiene texto para los
  ítems alucinados. El stub determinístico del test reproduce la salida cruda con los 4 patrones.
- R11: los ítems del seed elegibles (field_type MVP) no traen `help_text` (sólo 3 ítems globales lo
  tienen, ninguno elegible). El test verifica que la columna se surfacea end-to-end sembrando un
  `help_text` en un ítem elegible (no asume datos de seed). `section_title` siempre presente.
- R19 (test de UI): el repo no tiene `@testing-library/svelte` ni jsdom (entorno de test `node`); el
  test de componente sigue el patrón existente (`reunion-review-ui.test.ts`): predicado de visibilidad
  + aserción sobre el markup del .svelte (texto del badge presente exactamente una vez y bajo
  `verification_status === 'unverified'`; sin rama para 'verified').
- NO se cambió el estado de #24 en `feature_list.json` (lo deja el leader/reviewer). NO se hizo commit/push.

## Swap del fixture de regresión (2026-06-16, post-aprobación)
- Se reemplazó el contenido de `tests/fixtures/reunion-transcripcion-prueba.txt` por la transcripción
  LITERAL real que probó Martín (relevamiento de infra: 2 servidores HPE/Dell, 45 personas / 30 usan
  Tango, backup diario a las 23h en disco externo, restore nunca probado, Windows Defender, sólo router
  de Claro sin firewall dedicado, "cada uno pone la que quiere... misma contraseña hace ocho años",
  300 megas Claro, UPS APC, equipos en Win10/Win7, sin monitoreo). Reemplaza la transcripción autorada
  previa (50 empleados, backup 2am, sin línea de firewall).
- Se reajustó SOLO el stub y las aserciones de `tests/reunion-regresion.test.ts` (no se tocó lógica de
  producción analyze/grounding/verify/context/direct). Diff conceptual del stub crudo:
  - ERP: cita ahora "el principal donde corre el Tango"; valor "Tango". (verbatim del fixture)
  - BACKUPS "si": cita "Hacemos backup todos los días a las once de la noche". (verbatim; el cliente SÍ
    describe backup automático → backups NO se marca "no"). Sobrevive como "si".
  - RESTORE "no": cita "La verdad que no, nunca lo probamos. Asumimos que funciona." (verbatim).
  - EMPLEADOS: valor ahora 45 (no 50); cita "Somos 45 personas en total". (verbatim)
  - PASSWORD_POLICY "no": cita "No, cada uno pone la que quiere. Hay gente que tiene la misma contraseña
    desde que arrancó la empresa hace ocho años." (verbatim). Es el ganador del dedup.
  - Patrones de error preservados: la cita de contraseñas se reusa en CAPACITACION/ENDURECIMIENTO
    (caen por dedup R9, gana política con mayor confidence); FIREWALL_DOC con cita inventada "no tienen
    reglas de firewall documentadas" (cae por grounding R8 — el texto menciona firewall pero NO "reglas
    documentadas"); RUBRO con cita del saludo "gracias por recibirnos" + confidence 0.4 (cae por
    threshold R10); BACKUPS-negativo citando la respuesta de restore (cae por dedup vs RESTORE).
  - Los descartes los hace la lógica real de guards (verificado en los logs de la corrida), no se
    aflojó ninguna aserción.
- Verificación real: suite de reunión verde — 13 archivos / 68 tests (regresión+analyze+grounding+dedup+
  threshold+verifier+context+prompt+extraction+review+schema+review-ui+pipeline-order) y los 6 restantes
  (callback-auth, pipeline, r2-keys, recorder, retention, stt) → 26 tests. Total 94/94 PASS.
  `pnpm run check` → 0 ERRORS (25 warnings preexistentes de Svelte `state_referenced_locally`, ajenos a #24).
