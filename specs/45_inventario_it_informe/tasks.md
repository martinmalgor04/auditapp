# Tasks — 45_inventario_it_informe

> Orden de implementación. Cada tarea referencia los `R<n>` que cubre.
> El implementer marca `[x]` al completar. Trazabilidad R↔test en
> `progress/impl_45_inventario_it_informe.md`. No empezar sin aprobación humana.

## Contrato canónico

- [ ] T1 — En `src/lib/server/canonical/schema.ts`, agregar a `canonicalItemSchema`
  el campo opcional `rows` (`{ row_id, cells: record, attachments: string[] }`) y
  exportar `CanonicalItemRow`. Cubre: R1, R4.

- [ ] T2 — En `src/lib/server/canonical/version.ts`, subir
  `CANONICAL_SCHEMA_VERSION` `'1.1' → '1.2'` y actualizar el changelog del comentario. Cubre: R3.

- [ ] T3 — En `src/lib/server/canonical/build.ts`, construir
  `attachmentById: Map<uuid, r2_key>` (kind `'photo'`) y, para ítems
  `field_type='table'`, derivar `rows` desde `value.rows`, mapeando
  `attachment_ids (uuid) → r2_key` y omitiendo UUID huérfanos; `rows: []` si no hay filas.
  No alterar el `attachments` a nivel ítem. Cubre: R1, R2, R4.

- [ ] T4 — Tests de contrato en `tests/canonical-schema.test.ts` y
  `tests/canonical-contract.test.ts`: `rows` opcional valida con y sin el campo;
  `schema_version` es `'1.2'`; payload legacy sin `rows` sigue válido. Cubre: R1, R3, R4.

- [ ] T5 — Test en `tests/canonical-builder.test.ts`: ítem table con filas y
  `attachment_ids` produce `rows[].attachments` resueltos a r2_key; UUID sin
  attachment se omite. Cubre: R2.

## Helper de identificación de columnas

- [ ] T6 — Crear `src/lib/informe/inventory-columns.ts` con
  `resolveInventoryColumns(columns, eolRules?)` e `isInventoryTableItem(item, sectionDomain)`,
  reutilizando las listas de keys de `inventory-eol.ts`. Cubre: R6 (parcial), R8.

- [ ] T7 — Test unitario `tests/informe/inventory-columns.test.ts`: mapea
  columnas tipo/modelo/antigüedad/EOL; rechaza tablas no-inventario y dominio ERP. Cubre: R8, R9.

## Modelo de render

- [ ] T8 — En `src/lib/informe/render-shared.ts`, extender `InformeRenderModel`
  con `inventarioIt: Array<{ tipo, modeloCategoria, antiguedad, estadoEol, semaforo, fotos }>`. Cubre: R6.

- [ ] T9 — En `src/lib/server/informe/model.ts`, derivar `inventarioIt` desde el
  canónico ya pasado por `stripInternalFindings`: recorrer secciones de dominio IT,
  detectar ítems inventario (T6), por fila derivar campos vía `resolveInventoryColumns`,
  `semaforo` vía `scoreInventoryRow().points` (`0 red / 50 amber / 100 green / null null`)
  y `fotos` resolviendo r2_key con el resolvedor `photoUrl` inyectable. Cubre: R5, R6, R7, R11.

- [ ] T10 — Añadir a `options` de `buildInformeRenderModel` el resolvedor
  `photoUrl?: (r2Key) => string` (default presigned/`buildPublicObjectUrl` de
  `src/lib/server/storage/presign.ts`); inyectable para tests deterministas. Cubre: R10.

## Render web

- [ ] T11 — En `src/lib/informe/web-render.ts`, agregar `renderInventario(model)`
  que devuelve `''` si `tipoAuditoria==='erp'` o `inventarioIt` vacío; si no,
  renderiza sección con tabla `equip-table` (tipo, modelo/categoría, antigüedad,
  EOL con semáforo) y galería `equip-gallery`/`equip-fig`/`equip-cap`, con
  placeholder `equip-ph` por equipo sin fotos. Cubre: R8, R9, R10, R11.

- [ ] T12 — Insertar `renderInventario(model)` en `renderInformeWebHtml` después
  de `renderHallazgos` (it/mixta). Cubre: R8.

- [ ] T13 — Portar al `STYLE` de `web-render.ts` las clases `.equip*` del gold
  standard traducidas a tokens `--sys-*`, con `reveal`, `@media print` (A4) y
  breakpoint móvil (tabla colapsada). Cubre: R12, R13.

## Tests de render y no-regresión

- [ ] T14 — En `tests/informe-web-render.test.ts`: nuevo snapshot inventario IT
  **con** fotos (URLs deterministas vía resolvedor fake) y **sin** fotos
  (placeholder). Cubre: R8, R10, R11.

- [ ] T15 — En `tests/informe-web-render.test.ts`: verificar que el snapshot ERP
  puro existente no cambia y que ERP puro no incluye la sección inventario. Cubre: R9, R14.

- [ ] T16 — En `tests/informe-web-render.test.ts`: aserción de no-fuga — el HTML
  de inventario no contiene material interno (claves no-photo, findings internos);
  el modelo se deriva sólo de `stripInternalFindings`. Cubre: R5, R15.

## Cierre

- [ ] T17 — Ejecutar `pnpm run check`, `pnpm test` y `./init.sh` en verde;
  registrar el mapa R↔test en `progress/impl_45_inventario_it_informe.md`.
  Cubre: trazabilidad (todas las R).
