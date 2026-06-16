# Review — feature #24 24_reunion_extraccion_precisa

**Veredicto:** APPROVED

Revisor, 2026-06-16. Migración del ANÁLISIS de reunión a Claude (Messages API, `fetch` crudo,
tool use forzado `propose_values`) + guards Tier 1 + verificador Tier 2 + columna nullable
`verification_status` (migración 016) + badge en la UI de revisión. STT (Whisper) intacto.

## Trazabilidad (R ↔ código ↔ test)
- R1 (STT intacto): `stt.ts` sin cambios — `git diff HEAD` vacío; provider `openai-whisper`/`whisper-1`.
  `tests/reunion-stt.test.ts` [x]
- R2 (Claude Messages API): `analyze.ts:264-285` fetch a `api.anthropic.com/v1/messages`, headers
  `x-api-key` + `anthropic-version: 2023-06-01`. `tests/reunion-analyze.test.ts` [x]
- R3 (tool use forzado): `analyze.ts:251-257` `tool_choice: {type:'tool', name:'propose_values'}`;
  lectura de `tool_use` en `readToolUseProposals` (`analyze.ts:142-166`), sólo-texto → []. [x]
- R4 (modelo configurable): `analyze.ts:92` default `claude-sonnet-4-6`. IDs confirmados vigentes
  contra skill claude-api. `tests/reunion-analyze.test.ts` [x]
- R5 (fallo de credencial): `analyze.ts:265-268` throw `ANTHROPIC_API_KEY no configurado`.
  `tests/reunion-analyze.test.ts` + `tests/reunion-pipeline.test.ts` [x]
- R6 (prohíbe inferir): `analyze.ts:122-123`. `tests/reunion-prompt.test.ts` [x]
- R7 (cita verbatim): `analyze.ts:124`. `tests/reunion-prompt.test.ts` [x]
- R8 (grounding substring): `grounding.ts:25-50` + log `reunion_proposal_grounding_fail`.
  `tests/reunion-grounding.test.ts` [x]
- R9 (dedup): `grounding.ts:79-116`, mayor confidence; empate determinístico por item_id.
  `tests/reunion-dedup.test.ts` [x]
- R10 (umbral): `grounding.ts:53-72`, default 0.5. `tests/reunion-threshold.test.ts` [x]
- R11 (contexto enriquecido): `context.ts:8-17,42-58` help_text + section_title.
  `tests/reunion-context.test.ts` + `tests/reunion-prompt.test.ts` [x]
- R12 (verificador): `verify.ts:68-122`. supported=false→drop; true→verified;
  ERROR/sin dictamen→conservar unverified, no bloquea al resto. `tests/reunion-verifier.test.ts` [x]
- R13 (off por default sin llamadas extra): `analyze.ts:233-236`. 1 sola llamada. [x]
- R14 (orden de guards): `analyze.ts:214-237` validateByFieldType → grounding → umbral → dedup →
  verify. `tests/reunion-pipeline-order.test.ts` [x]
- R15 (persistencia/revisión sin cambios): `reunion-proposals.ts` 4 campos núcleo intactos + columna
  aditiva. `tests/reunion-pipeline.test.ts` + `tests/api/reunion-review.test.ts` (#12) verde. [x]
- R16 (regresión): fixture con citas textuales reales; los 4 patrones de error caen por los guards
  (firewall→grounding, rubro→umbral, backups-neg y capacitación/endurecimiento→dedup).
  `tests/reunion-regresion.test.ts` [x]
- R17 (mock sin red): toda la suite verde sin ANTHROPIC_API_KEY ni red. [x]
- R18 (.env.example): 5 envs documentadas (`.env.example:107-117`). [x]
- R19 (marcador + badge): migración 016 idempotente/nullable/CHECK; persistencia en
  `insertReunionProposals` + SELECTs; badge `proposal-review.svelte:79-86` sólo si `unverified`.
  `tests/db/reunion-verification-status-migration.test.ts` + `tests/reunion-proposal-review.test.ts` [x]

## Tasks
- T1–T21 (incl. T12a–T12e): todas [x] en tasks.md, cada una con test asociado verificado.

## Checkpoints
- C1: [parcial — init.sh rojo por ruido preexistente de #23, ver nota]
- C2: [parcial — 3 features in_progress es condición de arnés aceptada por Martín; ajena a #24]
- C3: [x] SQL parametrizado (postgres.js); sin console.log/TODO en código de #24; secretos en env.
- C4: [x] 103 tests de reunión verdes (50 #24 + 53 resto/#12) + migración; cubren funciones públicas.
- C5: [x] estado de #24 reflejado correctamente; sin archivos basura de #24.
- C6: [x] specs/24/ con requirements (EARS) + design + tasks; cada R con ≥1 test.

## Verificación (resultados reales, 2026-06-16)
- Suite #24 (13 archivos): **50 passed, 0 fallos**.
- Suite reunión completa (incl. #12 review API): **103 passed, 0 fallos**.
- `pnpm run check`: 14 errors — TODOS en `src/lib/server/backoffice/dashboard.ts:148-150`
  (SQL roto de #23: `empresa`/`c.razon_social`/`GROUP BY`). Cero errores en archivos de reunión/#24.
- `pnpm test` (completa): rojo por features de #23 (clients-import, empresa, backoffice-*, audit-crud,
  informe-render, audit-bundle-import). Verificado: NINGÚN test fallido importa módulos de reunión/#24.
- `./init.sh`: EXIT 1 por (a) "3 features in_progress" y (b) tests de #23 — ambos preexistentes y
  ajenos a #24, según brief y confirmado por inspección directa.

## Punto auditado — fixture de regresión
El implementer autoró el texto de `tests/fixtures/reunion-transcripcion-prueba.txt`. Verificado que
contiene las citas textuales exigidas por R16: contraseñas ("Cada uno pone la que quiere… misma
contraseña hace ocho años"), restore ("No, nunca lo probamos"), backups diario automático
("Los backups se hacen automáticos todas las noches… a las dos de la mañana"), 50 empleados.
La frase de firewall del brief NO está en el fixture, pero NO es bloqueante: el invariante R16 es que
el ítem de firewall NO se proponga, y el stub lo modela con una cita inventada que cae por grounding
(R8). El invariante de salida se cumple. Observación menor, no afecta cobertura.

## Cambios requeridos
Ninguno bloqueante. Observaciones menores (no bloquean el cierre):
1. El fixture de regresión no incluye la frase textual de firewall del brief; el invariante R16 igual
   se satisface por grounding. Opcional: agregarla para fidelidad documental.

#24 puede pasar a `done`. El rojo de init.sh/typecheck/suite es 100% de #23 (bloqueada en validación),
no de #24.

APPROVED -> progress/review_24_reunion_extraccion_precisa.md
