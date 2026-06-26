# Tasks — 46_paridad_informe_gold

> Orden de ejecución para el implementer. NO empezar hasta aprobación humana
> (resolver OQ-1..OQ-5 de `design.md`). Una feature a la vez. Cada test mapea a `R<n>`.

## Modelo y datos

- [x] T1 — Agregar campo opcional `seguridad` a `RenderClientDraft` en
  `src/lib/informe/render-shared.ts` según firma del design. Cubre: R3.
- [x] T2 — Reflejar `seguridad` en el schema Zod del draft
  (`src/lib/server/informe/schemas.ts`) como opcional/nullable. Cubre: R3, R18.
- [x] T3 — Poblar `draft.seguridad` en el builder server
  (`src/lib/server/informe/model.ts` / generador del draft) desde la sección canónica
  de seguridad identificada por su `code` (OQ-3); si no existe la sección, dejar
  `seguridad = null`. Cubre: R1, R2, R3.

## Brecha 1 — Tabla de seguridad

- [x] T4 — Implementar `renderSeguridad(model)` en `web-render.ts`: tabla `equip-table`
  con columnas control/estado/observaciones, una fila por `draft.seguridad.filas`,
  `escapeHtml` en cada celda, `data-label` para responsive. Cubre: R1, R3, R4.
- [x] T5 — Insertar `renderSeguridad` dentro/después de `renderHallazgos`, devolviendo
  cadena vacía cuando `draft.seguridad` es null o sin filas. Cubre: R2.
- [x] T6 — Portar CSS `.equip-table` (web + responsive) al `STYLE` con tokens `--sys-*`.
  Cubre: R1, R17.

## Brecha 2 — Próximos pasos + excl-grid

- [x] T7 — Implementar `renderProximosPasos(model)`: bloque `.steps/.step/.sn` desde
  `draft.proximos_pasos` (omitido si vacío) + `excl-grid` con dos `excl-box`
  (necesitamos_cliente / no_incluye). Cubre: R5, R6, R7.
- [x] T8 — Refactor `renderPlan`: eliminar el bloque `.twocol` (su contenido vive ahora
  en el excl-grid de T7). Cubre: R8.
- [x] T9 — Insertar `renderProximosPasos` en `renderInformeWebHtml` tras `renderPlan`,
  antes del CTA, con el rótulo de eyebrow resuelto según OQ-1. Cubre: R5, R6.
- [x] T10 — Portar CSS `.steps/.step/.sn` y `.excl-grid/.excl-box` con tokens `--sys-*`.
  Cubre: R5, R6, R17.

## Brecha 3 — Timeline vertical

- [x] T11 — Añadir constante `TL_HORIZONTAL_MAX` (valor según OQ-2) e implementar
  `renderTimelineVertical(etapas)` con `.tl/.tl-item`. Cubre: R9, R11.
- [x] T12 — En `renderPlan`, elegir horizontal (`tl-h`) vs vertical (`tl`) según
  `etapas.length` y el umbral, sin romper el caso horizontal existente. Cubre: R9, R10.
- [x] T13 — Portar CSS `.tl/.tl-item` con tokens `--sys-*`. Cubre: R9, R17.

## Brecha 4 — Print A4

- [x] T14 — Añadir `@page { size: A4 portrait; margin: 14mm 16mm }` y bloque
  `@media print` en `STYLE` con saltos de página por sección
  (`hero` page-break-after, secciones wrap). Cubre: R12.
- [x] T15 — Emitir en el render el valor final estático del gauge (arco lleno + número
  real) y reglas print que lo fijen sin depender de JS. Cubre: R13.
- [x] T16 — Reglas print para barras (`.bar i[data-w] { width:N% }`, `transition:none`)
  y contadores de cards en valor final estático. Cubre: R14.
- [x] T17 — Reglas print de tema claro legible (fondo blanco, texto oscuro, hero azul)
  con acentos `--sys-*`. Cubre: R15, R17.
- [x] T18 — `break-inside: avoid` en card, score-row, risk, fix, equip-table tr, step,
  tl-item, excl-box. Cubre: R16.

## Verificación

- [x] T19 — Snapshots nuevos: tabla seguridad presente y ausente. Cubre: R1, R2.
- [x] T20 — Snapshot nuevo: sección Próximos pasos (steps + excl-grid), incluyendo caso
  `proximos_pasos` vacío. Cubre: R5, R6, R7, R8.
- [x] T21 — Snapshots nuevos: timeline horizontal (≤ umbral) y vertical (> umbral).
  Cubre: R9, R10.
- [x] T22 — Snapshot/test de print: presencia de `@page` A4, saltos de página, gauge y
  barras en valor final estático, tema claro. Cubre: R12, R13, R14, R15, R16.
- [x] T23 — Test explícito: ningún `upsell_finding`/material interno aparece en el render
  y todo el contenido nuevo proviene de `client_draft`. Cubre: R18.
- [x] T24 — Confirmar no-regresión: snapshots ERP/IT existentes pasan sin cambios salvo
  los intencionales. Cubre: R19.
- [x] T25 — `./init.sh`, `pnpm run check` y `pnpm test` verdes; trazabilidad R↔test en
  `progress/impl_46_paridad_informe_gold.md`. Cubre: R1–R19.
