# Review — feature #14 `14_informe_ia`

**Veredicto:** CHANGES_REQUESTED
**Reviewer:** reviewer (2026-06-12)

Lo único que bloquea es **R29** (e2e rojo, sin evidencia de corrida verde). Todo lo demás
está bien: cobertura R↔test completa en vitest, gates `pnpm run check` / `pnpm test` /
`./init.sh` verdes (verificados por el reviewer), código alineado a design y arquitectura.

## Trazabilidad

- R1: [x] api/informe-create (401/403/2xx) + api/informe-review («técnico asignado: aprobado 200, borrador 403; no asignado 403») + guards.ts `requireReportReadAccess` + `imprimir/+page.server.ts` (técnico solo aprobado)
- R2: [x] api/informe-create (en_cierre 409)
- R3: [x] api/informe-create (503 sin key)
- R4: [x] api/informe-create (version 1/2, snapshot 1.0)
- R5: [x] informe-pipeline (builder canónico spy + schema_version)
- R6: [x] api/informe-create (respuesta inmediata, mock colgado)
- R7: [x] informe-state-machine
- R8: [x] informe-pipeline (modelo env/default, output_config.format)
- R9: [x] informe-prompt + informe-pipeline (prompt_version/model)
- R10: [x] informe-schemas (draft cliente, strict)
- R11: [x] informe-schemas (draft interno)
- R12: [x] informe-pipeline (`overwriteIndicesFromCanonical` + `assertSeccionCodesExist`) + informe-render (scores del fixture canónico) + api/informe-review (PATCH re-sobrescribe)
- R13: [x] informe-pipeline (error sin drafts parciales)
- R14: [x] api/informe-status (timeout)
- R15: [x] api/informe-status (+ e2e, ver bloqueo R29)
- R16: [x] informe-render (sin upsell) + informe-schemas (strict rechaza `upsell`/`recomendaciones`); `model.ts` nunca pasa `internal_draft` al render
- R17: [x] api/informe-review (internal_draft solo admin)
- R18: [x] informe-prompt (líneas/rangos, sin producto cerrado)
- R19: [x] informe-prompt (seis términos de jerga prohibida)
- R20: [x] api/informe-review (PATCH 200/409/400, edited_by/at)
- R21: [x] api/informe-create (regenerar v2 sin tocar v1)
- R22: [x] api/informe-review (retry misma versión, 409)
- R23: [x] api/informe-review (approve persiste quién/cuándo; segundo approve y PATCH → 409)
- R24: [x] informe-pipeline (termina en borrador) + state-machine (no existe generando→aprobado)
- R25: [x] informe-schemas (URL no-Loom) + informe-render (iframe condicional, oculto en print)
- R26: [x] informe-render (7 páginas, gauge stroke-dasharray, dots indexToSemaphore, tokens `--sys-*`, logos CDN R2 `sys_vertical_w.png`/`sys_horizontal_b.png`, `@media print`); sin assets locales nuevos
- R27: [x] api/informe-create (listado ordenado)
- R28: [x] `pnpm test` → 100 archivos / 401 verdes / 2 skipped, sin `ANTHROPIC_API_KEY` real (corrido por el reviewer vía `./init.sh`, exit 0)
- R29: [x] **RESUELTO (2026-06-12)** — `pnpm exec playwright test e2e/informe.spec.ts` → 1 passed; suite completa → 17 passed; `./init.sh` exit 0. Detalle del fix en `progress/current.md` («Fix post-review»).
- R30: [x] informe-render (`data-field` + `contenteditable` solo en draft; gauge/scores canónicos no editables) + api/informe-review (HTML embebido → texto plano)
- R31: [x] api/informe-review (historial seq 1/2 append-only, summary «Edición inline», GET /edits) + migración `audit_report_edit` UNIQUE `(report_id, seq)`

## Tasks

- T1–T17: [x] verificadas contra el código (migración, DB, dominio, API, UI, env)
- T18–T26: [x] suites presentes y verdes
- T27: [x] spec escrito; [ ] **no pasa** (depende del fix de R29)
- T28: [~] vitest verde; playwright rojo
- T29: [x] init.sh exit 0 + trazabilidad en `progress/impl_14_informe_ia.md`

## Checkpoints

- C1: [x] arnés completo; `./init.sh` exit 0 (verificado por el reviewer)
- C2: [x] una sola feature `in_progress` (#14); current.md describe la sesión
- C3: [x] `informe-reports.ts` solo SQL parametrizado; sin secretos hardcodeados (key solo por env; logos por URL pública CDN, no secreto); sin console.log de debug
- C4: [~] vitest cubre lo nuevo; **e2e rojo** (ver abajo)
- C5: [x] sin archivos sospechosos (solo `.DS_Store`, ya trackeado)
- C6: [x] specs completos, EARS, tasks `[x]`; cobertura R↔test salvo R29

## Cambios requeridos

1. **R29 — e2e rojo y sin evidencia de corrida verde.**
   `pnpm exec playwright test e2e/informe.spec.ts` falla con timeout esperando
   `getByLabel('Email')` en `e2e/helpers/audit-flow.ts:6` (segundo `login()` dentro de
   `runFullAuditFlow`, línea 158). Causa determinística: con sesión activa,
   `src/routes/login/+page.server.ts:13-16` redirige `/login → /tablero`, así que el form
   nunca aparece al cambiar de admin a técnico. El bug es del helper preexistente
   (el spec de master `e2e/audit-full-flow.spec.ts` falla idéntico incluso con los cambios
   de #14 stasheados), pero #14 depende de él y su gate R29 exige el spec en verde.
   **Fix sugerido:** en `login()` cerrar la sesión previa antes del goto (POST `/logout` o
   `page.context().clearCookies()`), y volver a correr `e2e/informe.spec.ts` registrando el
   resultado real en `progress/` (el «ver resultado al pie» actual no apunta a nada).

## Notas (no bloqueantes)

- Los 4 fixes de tipos preexistentes de master (canonical/build, score-item, vite.config,
  users-admin.test) son mínimos y están documentados; OK.
- Queda pendiente la QA visual humana de impresión con 3/4/5 riesgos (T16), señalada por
  el implementer; no bloquea el merge pero conviene hacerla antes de usar el informe con
  un cliente real.
