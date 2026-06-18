# Tasks — 31_descarga_html_informe

> Orden de implementación. Cada tarea referencia `R<n>` de `requirements.md`.
> No empezar hasta aprobación humana (spec_ready → in_progress). Verificación:
> `pnpm run check`, `pnpm test`, `./init.sh`.
>
> **Decisiones de la puerta humana (2026-06-18) ya incorporadas:** solo panel
> interno (no se toca share `/informe/[token]`); HTML "tal cual se ve" (logos por
> CDN, no base64); reuso exacto de `buildInformeRenderModel` + `renderInformeHtml`
> (no se crea render nuevo); sin cambios en render, scoring ni share.
> **Ajustes 2026-06-18 (2ª pasada):** (1) la visita (#27) se incluye en la
> descarga Y en el panel — ambos pasan `timestamps` a `buildInformeRenderModel`;
> (2) el filename usa el tipo de auditoría (`it`/`erp`/`mixta`) como token, no el
> literal fijo `auditoria`.

## Fase 1 — Helper de filename

- [x] T1 — Crear `src/lib/server/informe/download-name.ts` con `slugify(input)`
  (kebab-case ASCII: minúsculas, sin acentos, `[^a-z0-9]+ → '-'`, colapsa y
  recorta guiones, fallback `'cliente'`) e `informeHtmlFilename(report)` que
  devuelva `YYYY-MM-DD_informe_<cliente-slug>_<tipo>_vN.html` derivando fecha
  de `report.canonicalJson.closed_at` (fallback hoy), cliente de
  `client.razon_social`, **`<tipo>` de `tipoAuditoria(report.canonicalJson.types)`
  (`it`/`erp`/`mixta`, reusando `$lib/server/informe/tipo`)** y `N` de
  `report.version`. Cubre: R7.

## Fase 2 — Endpoint de descarga

- [x] T2 — Crear `src/routes/api/audits/[id]/report/[version]/html/+server.ts`
  con handler `GET` que: (a) cargue audit con `getAuditForReport(params.id)` y
  report con `getReportByAuditVersion(audit.id, version)`, devolviendo `404`
  envelope si falta audit, versión no entera `≥1`, o report inexistente. Cubre:
  R1, R12, R13.
- [x] T3 — En ese handler, aplicar `requireReportReadAccess(locals, audit,
  report)` antes de renderizar: `401` sin sesión, `403` sin permiso (técnico no
  asignado o informe no aprobado). Cubre: R9, R10, R11.
- [x] T4 — En ese handler, construir el modelo con
  `buildInformeRenderModel(report, { startedAt: audit.startedAt, finishedAt:
  audit.finishedAt })` (pasando los timestamps de la auditoría para incluir el
  bloque de visita) y el cuerpo con `renderInformeHtml(model)` (opts por defecto,
  sin `editMode`), reutilizando la misma cadena que `report-render.svelte`.
  Envolver en `try/catch`: si `buildInformeRenderModel` lanza (informe sin
  `client_draft`), loguear con `logger.error` y responder `409` envelope (sin
  stack ni cuerpo parcial). Cubre: R2, R3, R4, R14, R18.
- [x] T5 — En ese handler, devolver `new Response(html, …)` con status `200`,
  `Content-Type: text/html; charset=utf-8`, `Content-Disposition:
  attachment; filename="<informeHtmlFilename(report)>"`. Cubre: R5, R6, R7, R8.

## Fase 2.bis — Visita: loader compartido + panel (R18, R19, R20)

> Prerrequisito de T4: el handler necesita `audit.startedAt`/`audit.finishedAt`.

- [x] T11 — Modificar `src/lib/server/informe/access.ts`: extender el tipo
  `AuditForReport` con `startedAt: Date | null` y `finishedAt: Date | null`, y en
  `getAuditForReport` agregar `started_at, finished_at` al SELECT y mapearlos en
  el objeto devuelto (`startedAt: row.started_at`, `finishedAt: row.finished_at`).
  No cambiar la firma de la función ni otros campos. Cubre: R18, R19.
- [x] T12 — Modificar
  `src/routes/(app)/auditorias/[id]/informe/[version]/+page.server.ts`: cambiar la
  construcción del modelo a `buildInformeRenderModel(report, { startedAt:
  audit.startedAt, finishedAt: audit.finishedAt })`, de modo que el panel muestre
  el bloque de visita y coincida byte a byte con la descarga. No tocar el guard ni
  el resto del loader. Cubre: R19, R20.

## Fase 3 — Botón en el panel

- [x] T6 — En
  `src/routes/(app)/auditorias/[id]/informe/[version]/+page.svelte`, agregar un
  `<a>` "Descargar HTML" (`class="sys-btn-secondary"`,
  `data-testid="descargar-html"`) con `href="{base}/{data.version}/html"`, dentro
  del bloque de estado renderizable y envuelto en `{#if model}` para que solo
  aparezca cuando hay modelo (status `borrador`/`aprobado`). No tocar
  `report-render.svelte` ni la lógica de render. Cubre: R15, R16, R17.

## Fase 4 — Tests

- [x] T7 — Crear `tests/informe-download-name.test.ts` (vitest, unit):
  `slugify` con acentos (`"Playadito S.A."` → `playadito-s-a`), símbolos,
  cadena vacía (→ `cliente`); `informeHtmlFilename` produce
  `YYYY-MM-DD_informe_<slug>_<tipo>_vN.html`, **con `<tipo>` derivado de
  `canonical.types` cubriendo los tres casos `it` / `erp` / `mixta`** (p. ej.
  `types:['it']` → `_it_`, `['erp-tango']` → `_erp_`, `['erp-tango','it']` →
  `_mixta_`), usa `closed_at` cuando existe y hoy cuando es null, y el resultado
  solo contiene `[a-z0-9._-]`. Cubre: R7.
- [x] T8 — Crear `tests/api/report-html-download.test.ts` (vitest, integración
  del handler GET) con fixture de auditoría/informe en estado renderizable y con
  `started_at`/`finished_at` poblados:
  - 200 con `Content-Type: text/html; charset=utf-8` y
    `Content-Disposition: attachment; filename=…`. Cubre: R5, R6, R8.
  - cuerpo `=== renderInformeHtml(buildInformeRenderModel(report, { startedAt,
    finishedAt }))` (idéntico al panel, con visita) y contiene `r2.dev/LOGOS/`,
    sin `data:image` base64. Cubre: R2, R3, R4.
  - el cuerpo incluye el bloque de visita (`class="visita"`) cuando la auditoría
    tiene `started_at`/`finished_at`. Cubre: R18.
  - filename coincide con la convención del repo (token de tipo `it`/`erp`/`mixta`).
    Cubre: R7.
  Cubre: R2–R8, R18.
- [x] T13 — En `tests/api/report-html-download.test.ts`, caso de visita ausente:
  con fixture sin `finished_at`, el cuerpo descargado NO incluye el bloque de
  visita (`class="visita"`) y sigue siendo `=== renderInformeHtml(
  buildInformeRenderModel(report, { startedAt, finishedAt:null }))` (mismo HTML
  que produciría el panel). Cubre: R20.
- [x] T9 — En `tests/api/report-html-download.test.ts`, casos de control de
  acceso y errores:
  - sin `locals.user` → `401`, sin cuerpo del informe. Cubre: R9.
  - técnico no asignado, y técnico asignado sobre informe no `aprobado` → `403`.
    Cubre: R10.
  - audit inexistente → `404`; versión inválida/inexistente → `404`. Cubre: R12, R13.
  - informe sin `client_draft` → `409` envelope, sin stack ni cuerpo. Cubre: R14.
  Cubre: R9, R10, R12, R13, R14.

## Fase 5 — Cierre

- [ ] T10 — Mapa de trazabilidad `R<n> ↔ test` en `progress/impl_31_*.md`;
  confirmar que el diff NO toca `src/lib/informe/render*.ts`,
  `src/lib/server/scoring/`, `src/lib/server/informe/model.ts` (solo reuso, con
  su 2º argumento ya existente), `src/lib/server/informe/tipo.ts` (solo reuso),
  ni rutas/DB del share público (R11, R17). Los únicos `modificar` esperados son
  `access.ts` (T11), el `+page.server.ts` y el `+page.svelte` del panel (T12, T6).
  Correr `pnpm run check`, `pnpm test`, `./init.sh` verdes. Cubre: R11, R17.

## Trazabilidad R ↔ tarea

| R | Tareas |
|---|---|
| R1 | T2 |
| R2 | T4, T8 |
| R3 | T4, T8 |
| R4 | T4, T8 |
| R5 | T5, T8 |
| R6 | T5, T8 |
| R7 | T1, T5, T7, T8 |
| R8 | T5, T8 |
| R9 | T3, T9 |
| R10 | T3, T9 |
| R11 | T3, T10 |
| R12 | T2, T9 |
| R13 | T2, T9 |
| R14 | T4, T9 |
| R15 | T6 |
| R16 | T6 |
| R17 | T6, T10 |
| R18 | T4, T11, T8 |
| R19 | T11, T12 |
| R20 | T12, T13 |
