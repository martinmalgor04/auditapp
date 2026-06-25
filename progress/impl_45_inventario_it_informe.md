# Implementación — 45_inventario_it_informe

Inventario IT (tabla + galería de fotos) en el informe web IT/mixto.

## Archivos tocados

### Canónico (contrato)
- `src/lib/server/canonical/schema.ts` — `canonicalItemRowSchema` + campo
  opcional `rows` en `canonicalItemSchema`; tipo `CanonicalItemRow`.
- `src/lib/server/canonical/version.ts` — `CANONICAL_SCHEMA_VERSION` 1.1 → 1.2 + changelog.
- `src/lib/server/canonical/build.ts` — `photoKeyById` (Map uuid→r2_key, kind
  'photo'); `buildItemRows()` (exportada) deriva `rows` de `value.rows` para
  ítems `field_type='table'`, resolviendo `attachment_ids` y omitiendo huérfanos;
  `rows: []` cuando no hay filas. No altera `attachments` a nivel ítem.

### Helper
- `src/lib/informe/inventory-columns.ts` (nuevo) — `resolveInventoryColumns`,
  `isInventoryTableItem`, `extractColumns`, `extractEolRules`. Reutiliza
  `EOL_KEYS/TYPE_KEYS/AGE_KEYS` exportadas desde `scoring/inventory-eol.ts`
  (solo se exportaron; el motor de scoring no se modificó).

### Modelo
- `src/lib/informe/render-shared.ts` — `InformeRenderModel.inventarioIt`.
- `src/lib/server/informe/model.ts` — `deriveInventarioIt` (secciones dominio IT,
  ítems table con rows → equipos), `rowToEquipo` (campos vía
  `resolveInventoryColumns`, semáforo vía `scoreInventoryRow().points`, fotos vía
  resolvedor `photoUrl`), `defaultPhotoUrl` (`buildPublicObjectUrl`). Opción
  `photoUrl` inyectable en `buildInformeRenderModel`.

### Render web
- `src/lib/informe/web-render.ts` — `renderInventario` (tabla `equip-table` +
  galería `equip-fig`/`equip-cap`, placeholder `equip-ph`), `renderInventarioSlot`
  (inserción tras hallazgos sin alterar HTML ERP), estilos `.equip*` con tokens
  `--sys-*`, `reveal`, `@media print` A4 y breakpoint móvil.

## Trazabilidad R → test

| R | Verificación |
|---|---|
| R1 | tests/canonical-schema.test.ts (rows con/sin campo); tests/canonical/build-rows.test.ts |
| R2 | tests/canonical/build-rows.test.ts (attachment_ids→r2_key, huérfano omitido) |
| R3 | tests/canonical-schema.test.ts (version 1.2, payload legacy sin rows válido) |
| R4 | tests/canonical-schema.test.ts; tests/canonical/build-rows.test.ts (rows vacío/sin fotos) |
| R5 | tests/informe-web-render.test.ts (no-fuga inventario; modelo vía stripInternalFindings) |
| R6 | tests/informe/inventory-columns.test.ts; tests/informe-web-render.test.ts (campos equipo) |
| R7 | tests/informe-web-render.test.ts (semáforo equip-dot r/o/g desde scoreInventoryRow) |
| R8 | tests/informe-web-render.test.ts (tabla equip-table en IT); inventory-columns.test.ts |
| R9 | tests/informe-web-render.test.ts (ERP puro sin sección); inventory-columns.test.ts (dominio erp) |
| R10 | tests/informe-web-render.test.ts (foto resuelta vía resolvedor fake) |
| R11 | tests/informe-web-render.test.ts (placeholder equip-ph sin fotos) |
| R12 | web-render.ts STYLE (tokens --sys-*, reveal); snapshot inventario |
| R13 | web-render.ts STYLE (@media print A4 + breakpoint 720px); snapshot |
| R14 | tests/informe-web-render.test.ts (ERP sin sección); snapshot principal sin cambios |
| R15 | tests/informe-web-render.test.ts (no-fuga: sin material interno) |

## Desvío respecto al plan

- T5: el test de resolución de filas se ubicó en `tests/canonical/build-rows.test.ts`
  (unit, sobre `buildItemRows`) en vez de `tests/canonical-builder.test.ts`. Razón:
  insertar `template_item` table en el seed compartido contaminaba el snapshot de
  `canonical-contract.test.ts` (templates IT compartidos entre auditorías). El test
  unitario cubre R2 (resolución + omisión de huérfanos) sin tocar estado global.

## Verificación

- `pnpm run check`: 0 errores
- `pnpm run build`: OK
- `pnpm test`: 1285 pass / 2 skip
- `./init.sh`: verde
