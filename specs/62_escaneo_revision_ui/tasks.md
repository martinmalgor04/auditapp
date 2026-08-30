# Tasks — 62_escaneo_revision_ui

> Pasos discretos en orden. Cada uno referencia los `R<n>` de
> `requirements.md`. Trazabilidad fina R↔test en
> `progress/impl_62_escaneo_revision_ui.md` (la arma el implementer).
>
> Dependencia: T11 requiere #60 mergeada (`escaneo_token`,
> `emitirTokenEscaneo`, `revocarTokenEscaneo`). Si #60 sigue in_progress al
> implementar, ejecutar T1–T10 y T12–T13 primero y dejar T11 para después
> del merge.

## Base de datos y dominio

- [ ] T1 — Crear `migrations/032_escaneo_revision_vinculo.sql`: columnas
  `relevamiento_item_id` (FK `template_item`, `ON DELETE SET NULL`) y
  `relevamiento_row_id` en `escaneo_dispositivo`, CHECK de paridad
  `escaneo_dispositivo_vinculo_ck` (guard `pg_constraint`) e índice parcial
  `escaneo_dispositivo_vinculo_idx`. Cubre: R21, R24.
- [ ] T2 — Agregar en `src/lib/server/escaneos/schemas.ts` los schemas
  `filtrosConsolidadoInput`, `crearEscaneoUiInput`,
  `marcarRevisionGrupoInput`, `fusionarDispositivoInput` y la constante
  `AGENTE_VERSION_INICIAL`; agregar `VinculoRelevamientoInvalidoError` en
  `src/lib/server/escaneos/errors.ts`. Cubre: R20, R21, R22.
- [ ] T3 — Crear `src/lib/escaneos/escaneo-view.ts` con
  `ESCANEO_ESTADO_LABELS/BADGE`, `DISPOSITIVO_TIPO_LABELS`,
  `REVISION_LABELS/BADGE` (tokens `--sys-*`) y `formatMac`. Cubre: R15,
  R31.

## Read-model consolidado (repo)

- [ ] T4 — Crear `src/lib/server/escaneos/consolidado.ts` con
  `listarConsolidado(empresaId, auditId, filtros)` (CTE `oc` + `GROUP BY
  identidad`, precedencia por campo, revisión efectiva, provenance
  `jsonb_agg`, filtros tipo/revisión/escaneo, paginación) y
  `contadoresRevisionConsolidado(empresaId, auditId)`. Cubre: R9, R10, R11,
  R12, R13, R14, R15, R16, R17, R27, R28.
- [ ] T5 — Agregar en `consolidado.ts`:
  `obtenerDispositivoConsolidado(empresaId, auditId, identidad)` (detalle +
  software/servicios de la ocurrencia canónica + raw por ocurrencia +
  resolución de vínculo con `vivo`), `listarFilasInventarioManual(empresaId,
  auditId)` (jsonb `WITH ORDINALITY`, resumen con labels de
  `options.columns`) y `listarEscaneosParaUi(empresaId, auditId)` (join
  `escaneo_token` activo). Cubre: R8, R18, R19, R25, R27, R28.

## Mutaciones de revisión (repo)

- [ ] T6 — Crear `src/lib/server/escaneos/revision.ts` con
  `marcarRevisionGrupo` (rechaza `fusionado` con `ValidationError`; limpia
  vínculo en revisiones no-fusión), `fusionarDispositivo` (validación del
  destino en la misma tx → `VinculoRelevamientoInvalidoError`; nunca escribe
  `audit_response`) y `desvincularDispositivo`. Cubre: R20, R21, R22, R23,
  R24, R26, R27, R28.

## Tests de repo (Postgres real)

- [ ] T7 — Crear `tests/escaneos-consolidado.test.ts` según la tabla de
  casos del design (dedup, precedencia, tipo, revisión efectiva, identidad
  débil, filtros, contadores, no-dedup entre auditorías, empresa ajena,
  detalle). Cubre: R9, R10, R11, R12, R13, R14, R15, R16, R17, R18, R19,
  R27, R28.
- [ ] T8 — Crear `tests/escaneos-revision.test.ts` según la tabla de casos
  del design (grupo, fusión, rechazos sin escritura, no-toque de
  `audit_response`, desvincular, vínculo roto, revertir, invariante
  fusión⟺vínculo, CHECK de paridad). Cubre: R20, R21, R22, R23, R24, R25,
  R26, R28.

## Páginas y componentes

- [ ] T9 — Crear
  `src/routes/(app)/auditorias/[id]/escaneos/+page.server.ts`: load con
  guards (`requireStaff`, 404 vía `getAuditById`, 403 si no admin ni
  asignado), `readonly` por `cerrada`, parseo de filtros por query string y
  carga de escaneos/consolidado/contadores; actions `crearEscaneo` y
  `marcar` (con guard `fail(409)` en cerrada y `failFromError`). Cubre: R2,
  R3, R4, R5, R20, R29.
- [ ] T10 — Crear
  `src/routes/(app)/auditorias/[id]/escaneos/+page.svelte` y los componentes
  `src/lib/components/escaneos/{revision-badge,escaneo-estado-badge,provenance-chips,consolidado-cards,consolidado-tabla}.svelte`:
  sección escaneos (lista + form "Nuevo escaneo"), sección dispositivos con
  `ChipFilters` de revisión + contadores, selects de tipo/escaneo, cards
  `lg:hidden` / tabla `hidden lg:block`, badge de identidad débil, acciones
  rápidas confirmar/descartar, paginación. Cubre: R8, R10, R15, R16, R17,
  R30, R31.
- [ ] T11 — Agregar actions `emitirToken`/`revocarToken` en el
  `+page.server.ts` de T9 (componen `resolverAmbitoEscaneo` +
  `emitirTokenEscaneo`/`revocarTokenEscaneo` de #60) y el componente
  `escaneo-token-panel.svelte` (claro una sola vez + expiración + copiar).
  **Requiere #60 mergeada.** Cubre: R6, R7.
- [ ] T12 — Crear
  `src/routes/(app)/auditorias/[id]/escaneos/dispositivos/[identidad]/+page.server.ts`
  (guards + `obtenerDispositivoConsolidado` + `listarFilasInventarioManual`;
  actions `confirmar`/`descartar`/`volverASinRevisar`/`fusionar`/
  `desvincular` con nota opcional) y `+page.svelte` con
  `raw-json-details.svelte` y `fusionar-panel.svelte` (bloque de vínculo
  vivo/roto incluido). Cubre: R18, R19, R20, R21, R22, R24, R25, R26, R29,
  R31.
- [ ] T13 — Agregar en
  `src/routes/(app)/auditorias/[id]/+page.svelte` el enlace "Escaneos de
  red" junto a "Abrir relevamiento técnico" (misma condición de visibilidad
  que los links de la página). Cubre: R1.

## Verificación

- [ ] T14 — Crear `tests/escaneos-revision-routes.test.ts` (patrón
  `tests/api/closure-page.test.ts`): guards 303/403/200, `readonly` y
  `fail(409)` en cerrada, crear escaneo, emitir/revocar token, marcar desde
  lista, `fail` sin stack, markup cards/tabla y targets táctiles, enlace en
  detalle de auditoría. Cubre: R1, R2, R3, R4, R5, R6, R7, R8, R20, R29,
  R30, R31.
- [ ] T15 — Crear `e2e/escaneos-revision.spec.ts`: flujo feliz con seed
  (login → auditoría con escaneo y dispositivos → confirmar → detalle →
  fusionar con fila manual → vínculo visible). Cubre: R1, R20, R21.
- [ ] T16 — Armar `progress/impl_62_escaneo_revision_ui.md` con el mapa
  R↔test completo y ejecutar gates: `pnpm test`, `pnpm exec playwright test
  e2e/escaneos-revision.spec.ts`, `pnpm run check`, `pnpm run build`,
  `./init.sh`. Cubre: todos (cierre).
