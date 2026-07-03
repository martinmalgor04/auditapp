# Tasks — 55_informe_html_manual

> Orden de implementación. Cada paso referencia los `R<n>` que cubre.
> No empezar hasta que el spec esté aprobado por humano (puerta SDD).

## Schema y DB

- [ ] T1 — Crear `migrations/029_informe_html_manual.sql`: `ALTER TABLE audit_report`
  con `source text NOT NULL DEFAULT 'ia'` + `html_manual text` (`ADD COLUMN IF NOT
  EXISTS`) y CHECKs `audit_report_source_check` / `audit_report_manual_coherence`
  (patrón `DROP CONSTRAINT IF EXISTS` + `ADD`, re-ejecutable). Cubre: R1, R2, R3.

- [ ] T2 — `src/lib/server/db/informe-reports.ts`: agregar `source` a
  `REPORT_COLUMNS`, `AuditReportRow` (`AuditReportSource`) y `mapRow`
  (`html_manual` NO entra al row, design D1); `insertManualReport({ auditId,
  htmlManual, uploadedBy })` (INSERT atómico MAX+1, `status='aprobado'` +
  `approved_by/approved_at`, copia `canonical_json`/`schema_version` de la última
  versión; devuelve `null` sin base); `getReportManualHtml(reportId)`. Cubre: R4,
  R5, R6, R7, R8.

- [ ] T3 — `tests/informe-manual.test.ts` (parte schema/db): migración 2x sin
  error; default `'ia'` en filas del pipeline; CHECK rechaza `source='manual'`
  sin html y `source='ia'` con html; dos `insertManualReport` → versiones
  consecutivas; fila nace `aprobado` con canónico copiado; sin base → `null`;
  `listReportsByAudit` conserva las versiones IA; `getLatestApprovedReport`
  devuelve la manual. Cubre: R1–R8, R15.

## Dominio manual

- [ ] T4 — `src/lib/server/informe/errors.ts` + `access.ts`: nuevos
  `InformeManualHtmlInvalidError` (400) e `InformeManualSinBaseError` (409),
  mapeados en `informeErrorResponse`. Cubre: R7, R12, R13.

- [ ] T5 — Crear `src/lib/server/informe/manual.ts` (primera parte):
  `MAX_INFORME_MANUAL_HTML_BYTES`, `validateManualHtml` (vacío / > 5 MiB / sin
  `</body>` case-insensitive → lanza), `injectBeforeBodyClose` (última `</body>`,
  fallback append), `renderSurveyBlockHtml(state, token, flash)` (contenedor
  `#sys-encuesta`, CSS scopeado, form plano `POST /informe/[token]/encuesta` con
  los 4 campos de `SURVEY_QUESTIONS`; estado respondida → resumen sin form;
  flash `invalida`/`limite`). Cubre: R12, R13, R20, R22, R24.

- [ ] T6 — `tests/informe-manual.test.ts` (parte dominio): `validateManualHtml`
  (límites exactos, `</BODY>` mayúsculas); `injectBeforeBodyClose` con fixture
  que contiene `'</body>'` dentro de un string JS intermedio (inserta en la
  última); `renderSurveyBlockHtml` pendiente/respondida/flash. Cubre: R12, R13,
  R20, R22, R24.

## Subida (panel → nueva versión)

- [ ] T7 — `src/lib/server/api/guards.ts`: `requireReportUploadAccess(locals,
  audit)` — admin siempre; `tecnico` líder o en `audit_assignment`; 401/403.
  Cubre: R10, R11.

- [ ] T8 — Crear `src/routes/api/audits/[id]/report/manual/+server.ts`: POST
  multipart (campo `file`); `getAuditForReport` (404) → guard T7 →
  `validateManualHtml` → `insertManualReport` (null → 409); guarda el archivo
  byte a byte sin reescritura; responde envelope `{ id, version }`. Cubre: R4,
  R7, R9, R10, R11, R12, R13, R14, R15.

- [ ] T9 — `tests/api/informe-manual-upload.test.ts`: sin sesión → 401; cliente
  y técnico no asignado → 403 sin fila; técnico asignado y admin → 200; auditoría
  inexistente → 404; sin versión base → 409; vacío / > 5 MiB / sin `</body>` →
  400; éxito → envelope `{ id, version }`, contenido en DB idéntico al subido.
  Cubre: R7, R9–R15, R30 (mitad subida).

## Entrega pública

- [ ] T10 — `src/lib/server/informe/share.ts`: `resolveShareByToken` consciente
  del `source` — para `source='manual'` no exige `clientDraft` (el resto de los
  guards queda igual). Cubre: R25 (pre-requisito de R18).

- [ ] T11 — `src/lib/server/informe/manual.ts` (segunda parte):
  `handleManualInformeRequest(event)` según design D2 — match GET
  `^/informe/[^/]+(/imprimir)?$`, rate limit 429, resolve → null si !ok o IA,
  `/imprimir` manual → 303 a `/informe/[token]`, base manual →
  `getReportManualHtml` + `injectBeforeBodyClose(html,
  renderSurveyBlockHtml(...))` + `registerShareView` + Response 200 `text/html;
  charset=utf-8` + `X-Robots-Tag: noindex, nofollow`. Flash desde
  `?encuesta=`. Cubre: R18, R19, R20, R21, R25, R26, R27.

- [ ] T12 — `src/hooks.server.ts`: invocar `handleManualInformeRequest` antes de
  `resolve` (tras resolver sesión); si devuelve Response, cortocircuitar. Cubre:
  R18, R28.

- [ ] T13 — Crear `src/routes/informe/[token]/encuesta/+server.ts`: POST
  formData → `submitSurveyResponse` (reuso #47) → 303 a `/informe/[token]`
  (éxito y duplicado sin flag; `?encuesta=invalida` / `?encuesta=limite`);
  token no resoluble → 404 amable de #15. Cubre: R22, R23, R25.

- [ ] T14 — `tests/api/informe-manual-public.test.ts`: GET token manual → 200
  documento directo (no página Svelte) con `<script>` del fixture intacto y
  encuesta antes de la última `</body>`; **invariante no-filtrado**: cuerpo ===
  `injectBeforeBodyClose(html_manual, bloque)` y sin strings de
  `internal_draft`/`upsell_findings` del fixture; token IA → página actual
  (no-regresión); revocado/expirado/inexistente → 404 mismo mensaje; rate limit
  → 429; `view_count` incrementa + `X-Robots-Tag`; `/imprimir` manual → 303;
  POST encuesta: éxito → 303 y fila insertada, inválido → 303 con flag,
  duplicado → 303 y bloque respondida. Cubre: R18–R28.

## Descarga #31 y panel

- [ ] T15 — `src/routes/api/audits/[id]/report/[version]/html/+server.ts`: rama
  `source==='manual'` → cuerpo `getReportManualHtml` tal cual (sin encuesta),
  mismos guards/headers/filename; soporte `?inline=1` → `Content-Disposition:
  inline` (ambos orígenes). Test en
  `tests/api/informe-manual-public.test.ts`: round-trip subir→descargar
  idéntico byte a byte; `inline=1` → header inline; guards intactos. Cubre: R29,
  R30, R31.

- [ ] T16 — Panel `src/routes/(app)/auditorias/[id]/informe/[version]/`
  (`+page.server.ts` + `+page.svelte`): exponer `source` y metadatos de la
  manual (subida por / fecha); acción "Subir HTML" (input `.html` + POST T8 +
  `goto` a la versión nueva); badge `manual`; para versión manual: ocultar
  edición de borrador/aprobación/retry, habilitar "Descargar HTML" y "Ver
  documento" (`?inline=1`); bloques share/enviar/encuesta operativos (ya gated
  por `aprobado`). Cubre: R16, R32, R33, R34, R35.

- [ ] T17 — Listado de versiones en `src/routes/(app)/auditorias/[id]/`
  (+page.server.ts ya lista `source` vía T2): badge `manual` en la fila de la
  versión. Cubre: R33.

## Verificación final

- [ ] T18 — Test de #51 con versión manual: `enviarInforme` sobre report manual
  → `ok`, share activo sobre la versión manual; share previo de la versión IA
  sigue `activo` (sin auto-revocación). Extiende `tests/informe-enviar.test.ts`
  o `tests/api/informe-manual-public.test.ts`. Cubre: R17, R37.

- [ ] T19 — Revisión de alcance: el diff no toca `pipeline.ts`, `prompts/`,
  `claude.ts`, `scoring/`, `render.ts`, `render-erp/it/mixto`, `web-render.ts`,
  `model.ts` ni plantillas #49/#51. Cubre: R36, R37.

- [ ] T20 — Trazabilidad y cierre: mapa R↔test en
  `progress/impl_55_informe_html_manual.md`; `./init.sh`, `pnpm run check`,
  `pnpm run build`, `pnpm test` verdes. Cubre: regla dura de `docs/specs.md`.
