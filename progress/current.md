# Sesión actual

## Feature en curso: #24 24_reunion_extraccion_precisa (implementer, 2026-06-16)

**Estado:** in_progress — implementación arrancada. Spec aprobado (puerta humana 2026-06-16).
Plan de tasks T1..T21 (+ T12a–e). Análisis migra OpenAI→Claude (Anthropic Messages API, fetch crudo,
tool use forzado `propose_values`); STT (Whisper) intacto; guards Tier 1 (grounding/umbral/dedup) +
verificador Tier 2 opcional; columna nullable `verification_status` (migración 016) + badge en UI.

> Entorno: Docker daemon arrancado en esta sesión para levantar Postgres y correr `pnpm test`/`init.sh`.
> Nota de arnés: feature_list tiene 3 in_progress (#12, #23, #24) → init.sh §3 reporta FAIL por
> ">1 in_progress". Condición conocida/aceptada por Martín; no bloquea el trabajo de #24. Verifico
> #24 con la suite de tests (sección 4 de init.sh) + check/build.

### Progreso #24 — COMPLETO (a espera de reviewer)
- [x] T1..T21 (+T12a–e) — todas marcadas en tasks.md. Trazabilidad R↔test en
  `progress/impl_24_reunion_extraccion_precisa.md`.
- Verificación real: `pnpm run check` 0 errors; `pnpm run build` ✓; suite reunion+migración 103/103
  verde; `pnpm test` 770 passed / 17 failed (los 17 son de #23, no importan módulos de #24).
- `./init.sh` EXIT 1 por condiciones PREEXISTENTES ajenas a #24: §3 ">1 in_progress" (#12/#23/#24,
  aceptado) y §4 los 17 tests de #23 (Fase 1 bloqueada). Detalle en impl_24.
- NO toqué estado en feature_list.json. NO commit/push.

---

## Spec drafted: #24 24_reunion_extraccion_precisa (spec_author, 2026-06-16)

**Estado:** `spec_ready` — esperando puerta humana. NO código aún.
`specs/24_reunion_extraccion_precisa/{requirements,design,tasks}.md` creados (EARS, R1–R18).
Alcance: STT Whisper intacto; análisis migra a Claude (Anthropic Messages API, tool use forzado
`propose_values`, `REUNION_ANALYSIS_MODEL` default `claude-sonnet-4-6`); guards Tier 1
(grounding/dedup/umbral) + verificador Tier 2 opcional (`REUNION_VERIFIER_ENABLED`,
default `claude-haiku-4-5`); fixture de regresión con la transcripción de prueba. NO toca el modelo
de datos `reunion_proposal` ni la UI de revisión de #12.

**Ajuste post-puerta humana (2026-06-16):** el humano pasó la puerta y tomó 4 decisiones sobre las
open questions. Spec actualizado (sigue en `spec_ready`, NO se reabre aprobación):
1. Modo webhook/n8n → cerrado fuera de alcance (feature aparte si va a prod).
2. Defaults de modelo confirmados (`claude-sonnet-4-6` extracción, `claude-haiku-4-5` verificador).
3. `REUNION_CONFIDENCE_MIN` default `0.5` confirmado.
4. ERROR del verificador en una propuesta puntual → **conservar + marcar `unverified`** (antes:
   descartar). El caso `supported=false` sigue siendo descarte.
Implica requisito nuevo **R19**: columna nullable idempotente `verification_status` en
`reunion_proposal` (`migrations/016_reunion_verification_status.sql`), persistencia en
`insertReunionProposals`, badge "No verificada — revisar" en `proposal-review.svelte`. R12 y R15
ajustados (R15 aclara que el único cambio en la tabla es esa columna aditiva). Tasks nuevas T12a–T12e
y T11/T12/T15 actualizadas. Las 4 open questions de `design.md` pasaron a §Decisiones de la puerta
humana (ninguna queda abierta).

## Feature en curso: #23 23_crm_empresa_unificada

**Estado:** in_progress — arranque. Spec aprobado por Martín (puerta humana 2026-06-16).
Rollout faseado (6 fases). Cada fase deja el repo verde y es verificable de forma independiente.

> Nota de arnés: #12 `reunion_asistente` queda en `in_progress` por decisión de Martín
> (2026-06-16). Por eso `init.sh` sección 3 reporta FAIL por "2 in_progress" — condición
> conocida y aceptada, no bloquea el trabajo de #23.

### Plan de fases (specs/23_crm_empresa_unificada/tasks.md)
- **Fase 1** — `empresa` + migración 015 con compat `client` (T1–T5). Gate: init.sh verde.
- **Fase 2** — Importador #21 reconectado a `empresa` + selector relacion (T6–T8b).
- **Fase 3** — Form nueva auditoría + mercado → `empresa` (T9–T13).
- **Fase 4** — Cockpit `/crm` listado/ficha/edición (T14–T19).
- **Fase 5** — Estado híbrido, eventos/timeline, crear auditoría desde ficha, export (T20–T25).
- **Fase 6** — Deprecación documentada SIN drop (T26–T28).

### Progreso
- [x] Fase 1 — **VALIDADA Y VERDE.** Migración 015 aplicada: fold 1933 client + 52 crm_lead − 2
  dedup = **1983 empresa**, **0 audits huérfanas**, FK intacta, idempotente. Suite **787 passed / 0
  failed**, `check` 0 errores, `build` OK. 2 regresiones reales del rename arregladas
  (`dashboard.ts`, `clients-import.ts`: la vista no cubre `xmax`/`ON CONFLICT`/`GROUP BY`). Wart:
  el seed dev deja todo `prospecto` (inserta por la vista sin `relacion`) → se corrige en Fase 2.
  Detalle/counts en `progress/impl_23_crm_empresa_unificada.md`.
- [ ] Fase 2
- [ ] Fase 3
- [ ] Fase 4
- [ ] Fase 5
- [ ] Fase 6
