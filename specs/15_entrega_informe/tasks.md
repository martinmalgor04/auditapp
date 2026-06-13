# Tasks — #15 15_entrega_informe

Implementación en orden. Marcar `[x]` al completar. Documentar trazabilidad R→test en
`progress/impl_15_entrega_informe.md`.

> Prerrequisito: #14 en `done` (lo está). Sin dependencias npm nuevas.
> Resolver primero las open questions del design en la puerta humana (especialmente 1, 3 y 5).

## Schema y DB

- [x] T1 — Crear migración `migrations/006_entrega_informe.sql`: tabla `audit_report_share`
  (token UNIQUE, expires_at/revoked_at nullable, created_by/created_at, view_count con CHECK,
  first/last_viewed_at) + índice único parcial `(report_id) WHERE revoked_at IS NULL` + índice
  `(report_id)`. Cubre: **R3, R6, R9**.
- [x] T2 — Implementar `src/lib/server/db/informe-shares.ts`:
  `createShareRevokingPrevious` (transacción: UPDATE `revoked_at` del activo + INSERT nuevo),
  `getActiveShareByReport`, `listSharesByReport`, `findShareByToken` (con status del report),
  `revokeShare`, `registerShareView` (UPDATE atómico `view_count + 1` +
  `COALESCE(first_viewed_at, now())` + `last_viewed_at`). Cubre: **R3, R5, R6, R9**.

## Dominio

- [x] T3 — Implementar `src/lib/server/informe/share.ts`: `generateShareToken` (patrón
  briefing, `randomBytes(32).toString('base64url')`), `computeExpiresAt`, `buildShareUrl`
  (`PUBLIC_APP_URL/informe/<token>`), `createReportShare` (guard `aprobado` →
  `InformeReportNotApprovedError`), `resolveShareByToken` (no revocado + no expirado +
  `aprobado`; `{ ok: false }` sin causa externa, log server-side). Extender `errors.ts`
  (`InformeShareNotFoundError`, `InformeReportNotApprovedError`) y `informeErrorResponse`;
  extender `schemas.ts` con `createShareSchema` (`expires_in_days` 1–365 | null, default 90).
  Cubre: **R2, R3, R4, R5, R7**.

## API admin

- [x] T4 — `src/routes/api/audits/[id]/report/[version]/share/+server.ts`: POST (201, 400
  Zod, 401/403 `requireAdminApi`, 404, 409 no aprobado; regenera revocando el activo), GET
  (share actual/último + historial con url, created_by_name, created_at, expires_at,
  revoked_at, estado derivado, view_count, first/last_viewed_at; `data: null` si nunca hubo),
  DELETE (revoca activo; 404 sin activo). Envelope estándar. Cubre: **R3, R4, R5, R6, R7,
  R8, R9**.

## Rutas públicas

- [x] T5 — `src/routes/informe/[token]/`: `+layout.svelte` público sin chrome con meta
  `robots noindex,nofollow`; `+page.server.ts` con rate limit por IP (patrón
  `briefing/rate-limit.ts` → 429), `resolveShareByToken` (inválido → `error(404)`),
  `registerShareView`, `buildInformeRenderModel`, `setHeaders X-Robots-Tag`;
  `+error.svelte` pantalla amable branded («Este enlace ya no está disponible» + contacto
  SyS). Cubre: **R1, R2, R9, R14**.
- [x] T6 — Implementar `src/lib/components/informe/report-web-render.svelte` según
  `template_informe_web_v2.html`: hero dark (logo `sys_vertical_w.png` CDN R2, tag
  período/tipo, cliente, CUIT, gauge SVG con color/badge por `indexToSemaphore`, meta
  fecha/sistema), sección Loom condicional (iframe embed; ausente sin `loomUrl`), 01 resumen
  (lead, 3 cards `data-count` — card de circuitos con controles omitida si null,
  interpretación, recomendación central, callout fortalezas), 02 score-rows (secciones del
  snapshot vía `seccion_code` con barra y valor canónicos + dimensiones del draft, legend con
  lectura transversal), 03 riesgos numerados con evidencia, 04 día a día («hoy N/100» del
  snapshot), 05 plan, CTA mailto con cliente en subject + contacto fijo + footer
  confidencial; tokens `--sys-*`; consume solo `InformeRenderModel` (jamás internal_draft).
  Cubre: **R10, R11, R12**.
- [x] T7 — Implementar `src/lib/client/informe/web-effects.ts` (scroll progress, reveal con
  IntersectionObserver, `animateCount`, animación de gauge; helpers puros testeables para
  color/badge/dashoffset) y montar en `+page.svelte` junto al botón «Descargar PDF» →
  `/informe/[token]/imprimir`. Cubre: **R10, R13**.
- [x] T8 — `src/routes/informe/[token]/imprimir/`: `+page.server.ts` con la misma validación
  pública (y conteo de vista según open question 3 resuelta) y `+page.svelte` montando el
  `report-render.svelte` A4 de #14 sin cambios + botón «Descargar PDF» (`window.print()`)
  visible solo en pantalla; noindex igual que la web. Cubre: **R13, R14**.

## UI backoffice

- [x] T9 — Implementar `src/lib/components/informe/share-panel.svelte` y montarlo en
  `(app)/auditorias/[id]/informe/[version]/` (load extendido; visible solo admin + informe
  `aprobado`): generar link con selector de expiración (30/90/365/sin vencimiento, default
  90), URL con copiar, estado activo/revocado/expirado, enviado por/cuándo, vistas
  (contador + primera/última), Regenerar con confirmación (invalida el anterior) y Revocar.
  Cubre: **R5, R6, R7, R8, R9**.

## Tests

- [x] T10 — `tests/informe-share.test.ts`: token 43 chars base64url y unicidad,
  `computeExpiresAt` (días y null), `resolveShareByToken` rechaza revocado/expirado/no
  aprobado con `{ ok: false }` uniforme. Cubre: **R2, R3, R7**.
- [x] T11 — `tests/informe-web-render.test.ts`: snapshot con fixture canónico estable —
  hero con logo CDN y gauge del índice canónico, secciones 01–05 + CTA + footer
  confidencial, score-rows con valores del snapshot (no del draft), `data-count`, `.reveal`,
  tokens `--sys-*`; iframe Loom presente/ausente según `loomUrl`; con `upsell_findings` e
  `internal_draft` poblados ningún texto interno aparece (test explícito del acceptance);
  card de circuitos con controles omitida con null. Cubre: **R10, R11, R12**.
- [x] T12 — `tests/api/informe-share-admin.test.ts`: sin sesión 401, `tecnico` 403 en
  POST/GET/DELETE; POST sobre `borrador` 409 sin fila; POST crea share con metadatos;
  segundo POST regenera (nuevo token, anterior con `revoked_at`); `expires_in_days: 0` →
  400; DELETE revoca (fila persiste) y segundo DELETE 404; GET devuelve url,
  created_by_name, created_at, expires_at, estado y stats de vistas. Cubre: **R3, R4, R5,
  R6, R7, R8, R9**.
- [x] T13 — `tests/api/informe-share-public.test.ts`: GET con token vigente 200 sin sesión
  con contenido del informe; token inexistente/revocado/expirado/informe no aprobado → mismo
  404 amable sin datos del cliente ni del draft; dos GET exitosos → `view_count = 2` con
  `first_viewed_at` estable; GET fallido no incrementa; HTML público sin textos de
  `internal_draft`; `/imprimir` 200 con 7 páginas y `@media print`, 404 con token revocado;
  header `X-Robots-Tag` y meta noindex presentes; ráfaga de tokens inválidos → 429. Cubre:
  **R1, R2, R5, R6, R7, R9, R12, R13, R14**.
- [x] T14 — `e2e/entrega-informe.spec.ts` (flujo #14 con Claude fake hasta `aprobado`):
  generar link en el panel «Entrega al cliente» → abrir la URL en contexto sin sesión y ver
  hero + secciones (+ navegar a imprimir y ver el botón Descargar PDF) → volver al
  backoffice y ver contador de vistas ≥ 1 → revocar → la URL pública muestra la pantalla
  amable. Cubre: **R8, R13, R16**.

## Cierre

- [x] T15 — Ejecutar `pnpm test` (suites share/web-render verdes, sin servicios externos) y
  `pnpm exec playwright test e2e/entrega-informe.spec.ts`. Cubre: **R15, R16**.
- [x] T16 — Ejecutar `./init.sh` exit 0, `pnpm run check` 0 errores y completar la
  trazabilidad R→test en `progress/impl_15_entrega_informe.md`. QA visual: vista web en
  mobile (~380px) y desktop, imprimir A4 desde la ruta pública. Cubre: todos.

## Trazabilidad R → tests

- R1 → api/informe-share-public.test.ts (200 sin sesión) + e2e
- R2 → informe-share.test.ts + api/informe-share-public.test.ts (404 uniforme)
- R3 → informe-share.test.ts (token) + api/informe-share-admin.test.ts (creación/unicidad)
- R4 → api/informe-share-admin.test.ts (401/403/409)
- R5 → api/informe-share-admin.test.ts (regenerar) + api/informe-share-public.test.ts (token viejo 404)
- R6 → api/informe-share-admin.test.ts (DELETE) + api/informe-share-public.test.ts
- R7 → informe-share.test.ts (computeExpiresAt) + api admin (400) + api public (expirado 404)
- R8 → api/informe-share-admin.test.ts (metadatos) + e2e (panel)
- R9 → api/informe-share-public.test.ts (contador) + api/informe-share-admin.test.ts (stats) + e2e
- R10 → informe-web-render.test.ts (snapshot template v2)
- R11 → informe-web-render.test.ts (Loom con/sin)
- R12 → informe-web-render.test.ts (sin internos, explícito) + api/informe-share-public.test.ts
- R13 → api/informe-share-public.test.ts (imprimir) + e2e (botón PDF)
- R14 → api/informe-share-public.test.ts (noindex + 429)
- R15 → pnpm test (suites T10–T13)
- R16 → e2e/entrega-informe.spec.ts
