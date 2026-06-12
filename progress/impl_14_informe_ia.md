# Implementación — #14 14_informe_ia

Implementer, 2026-06-12. Tasks T1–T29 + T16b completadas (ver `specs/14_informe_ia/tasks.md`).

## Qué se construyó

- Migración `migrations/004_informe_ia.sql`: `audit_report` (versionado, snapshot canónico,
  CHECKs de coherencia) + `audit_report_edit` (historial append-only, UNIQUE `(report_id, seq)`).
- Capa DB `src/lib/server/db/informe-reports.ts`: version y seq atómicos (`COALESCE(MAX)+1`),
  transición atómica `WHERE status = from`, drafts, loom, approve, guard de timeout, historial.
- Dominio `src/lib/server/informe/`: `state.ts` (máquina de estados), `errors.ts`,
  `schemas.ts` (Zod strict cliente/interno/envelope/loom/patch), `prompts/generate-report.ts`
  (`INFORME_PROMPT_VERSION = '1.0'`, jerga prohibida, líneas/rangos), `claude.ts` (adapter
  `@anthropic-ai/sdk`, modelo por env, `output_config.format` vía `zod-to-json-schema`,
  override para tests + fake para e2e con `INFORME_FAKE=1`), `pipeline.ts` (createReport +
  runInformePipeline: snapshot, validaciones, sobrescritura de índices, seccion_codes),
  `guard.ts` (timeout `INFORME_GENERATION_TIMEOUT_MS`), `sanitize.ts` (texto plano inline),
  `model.ts` (view-model del render con `stripInternalFindings`), `access.ts`.
- Guards API `src/lib/server/api/guards.ts`: `requireAdminApi` extraído del export (que ahora
  lo reutiliza) + `requireReportReadAccess` (técnico asignado solo `aprobado`, sin internal).
- API `/api/audits/[id]/report[...]`: POST/GET, GET/PATCH `[version]`, `/status` (guard
  timeout), `/retry`, `/approve`, `/edits`.
- Render `src/lib/informe/render.ts` (módulo puro, template A4 oficial de 7 páginas, tokens
  `--sys-*`, logos CDN R2, gauge, `data-field`, Loom solo pantalla) + `report-render.svelte`.
- UI: sección «Informe IA» en el detalle (CTA + polling + badges), pantalla de revisión con
  tabs cliente/interna, edición por sección, edición inline (`inline-editor.svelte` +
  `src/lib/client/informe/inline-edit.ts`, autosave 1 s, «Guardado (edición N)», «Listo»),
  campo Loom, Aprobar/Regenerar/Reintentar, ruta `imprimir/`.
- `.env.example`: `ANTHROPIC_API_KEY`, `INFORME_CLAUDE_MODEL`, `INFORME_GENERATION_TIMEOUT_MS`.

## Notas de implementación

- `zodOutputFormat` del SDK requiere Zod v4 (el repo usa v3): el JSON schema del envelope se
  deriva con `zod-to-json-schema`. La validación Zod local sigue siendo la fuente de verdad.
- jsonb por postgres.js: los objetos se pasan directo como parámetro (un string se
  doble-codifica como escalar JSON).
- El PATCH con `origin: 'inline'` además sanitiza HTML embebido server-side (R30).
- e2e: `INFORME_FAKE=1` en el webServer de Playwright activa un adapter determinístico que
  arma el envelope desde el canónico del prompt (sin credenciales reales).
- Fixes preexistentes para dejar `pnpm run check` en verde (estaba rojo en master):
  `canonical/build.ts` (tipo del Map), `scoring/score-item.ts` (reduce), `vite.config.ts`
  (`globalTeardown` no tipado), `tests/api/users-admin.test.ts` (`auditTypes`).
- `tests/migrate.test.ts` actualizado para incluir `004_informe_ia`.

## Trazabilidad

- R1 → api/informe-create.test.ts (401/403/2xx) + api/informe-review.test.ts (técnico asignado lee aprobado; borrador/no asignado 403)
- R2 → api/informe-create.test.ts (en_cierre 409)
- R3 → api/informe-create.test.ts (503 sin key)
- R4 → api/informe-create.test.ts (version 1/2, snapshot 1.0)
- R5 → informe-pipeline.test.ts (builder canónico spy, schema_version mismatch)
- R6 → api/informe-create.test.ts (respuesta inmediata, mock colgado)
- R7 → informe-state-machine.test.ts
- R8 → informe-pipeline.test.ts (modelo env/default, output_config.format)
- R9 → informe-prompt.test.ts + informe-pipeline.test.ts (prompt_version/model persistidos)
- R10 → informe-schemas.test.ts (draft cliente)
- R11 → informe-schemas.test.ts (draft interno)
- R12 → informe-pipeline.test.ts (índices sobrescritos, seccion_code inválido) + informe-render.test.ts (scores del snapshot) + api/informe-review.test.ts (PATCH re-sobrescribe)
- R13 → informe-pipeline.test.ts (error sin drafts parciales)
- R14 → api/informe-status.test.ts (timeout)
- R15 → api/informe-status.test.ts + e2e/informe.spec.ts
- R16 → informe-render.test.ts (sin upsell) + informe-schemas.test.ts (strict)
- R17 → api/informe-review.test.ts (internal_draft solo admin) + e2e (tab vista interna)
- R18 → informe-prompt.test.ts (líneas/rangos)
- R19 → informe-prompt.test.ts (jerga prohibida)
- R20 → api/informe-review.test.ts (PATCH, edited_by/at, 409, 400)
- R21 → api/informe-create.test.ts (regenerar v2 sin tocar v1)
- R22 → api/informe-review.test.ts (retry misma versión; 409 sobre borrador) + informe-pipeline.test.ts
- R23 → api/informe-review.test.ts (approve inmutable)
- R24 → informe-pipeline.test.ts + informe-state-machine.test.ts
- R25 → informe-schemas.test.ts + informe-render.test.ts (Loom) + api/informe-review.test.ts (PATCH loom)
- R26 → informe-render.test.ts (7 páginas, gauge, dots, tokens, logos R2, @media print, snapshot)
- R27 → api/informe-create.test.ts (listado ordenado) + e2e (CTA)
- R28 → `pnpm test` (suite informe verde sin ANTHROPIC_API_KEY real; mocks/adapter override)
- R29 → e2e/informe.spec.ts
- R30 → informe-render.test.ts (contenteditable/data-field, canónicos no) + api/informe-review.test.ts (HTML → texto plano)
- R31 → api/informe-review.test.ts (historial seq 1/2, summary, GET /edits) + e2e (autosave «Guardado (edición 1)» + «Listo»)

## Gates

- `pnpm run check` → 0 errores.
- `pnpm test` → 100 archivos / 401 tests verdes (2 skipped preexistentes).
- `pnpm exec playwright test e2e/informe.spec.ts` → **1 passed** (R29; fix post-review 2026-06-12, ver progress/current.md). Suite e2e completa: **17 passed**.
- `./init.sh` → exit 0.
