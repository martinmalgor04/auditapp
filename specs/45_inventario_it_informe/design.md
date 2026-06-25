# Design — 45_inventario_it_informe

> Cómo. Decisiones técnicas, firmas y archivos a tocar. Apóyate en
> `docs/architecture.md`, `docs/conventions.md`. Cubre R1–R15.

## 1. Estado actual (lo relevante)

- **Canónico ítem** (`src/lib/server/canonical/schema.ts`):
  `canonicalItemSchema` ya tiene `value: z.unknown()` y `attachments: z.array(string)`
  **a nivel ítem**. Para un `table`, `value` es `{ rows: [...] }` (o el arreglo de
  filas, según `field-schemas.ts` `valueSchemaFor('table')`), pero **no** hay
  campo que ate cada foto a su fila.
- **Build** (`src/lib/server/canonical/build.ts`): `attachmentsByItem` agrega
  todas las fotos del ítem (`attachment.item_id`), perdiendo la fila. Las fotos
  por fila viven en `value.rows[].attachment_ids` como **UUID de attachment**.
- **Tabla `attachment`** (`migrations/001_schema.sql`): columnas
  `id, audit_id, item_id, r2_key, kind('photo'|'export'|'recording'), …`.
  **No tiene `row_id`** → la relación fila↔foto sólo existe en el JSON de
  respuesta (`value.rows[].attachment_ids`).
- **Scoring** (`src/lib/server/scoring/inventory-eol.ts`): `scoreInventoryRow(row, refDate)`
  devuelve `{ points: 0|50|100|null, rule }`. Claves reconocidas:
  `EOL_KEYS=['estado_eol','soporte','eol_status']`, `TYPE_KEYS=['tipo','categoria','type']`,
  `AGE_KEYS=['antiguedad','fecha_compra','anio','year']`.
- **Identificación de columnas** (`src/lib/server/db/field-schemas.ts`):
  `tableOptionsSchema = { columns: [{key,label,type}], eol_rules? }`. El ítem de
  inventario es un `table`; sus `columns` definen los `key` de `cells`.
- **Modelo** (`src/lib/server/informe/model.ts`): `buildInformeRenderModel`
  consume `stripInternalFindings(report.canonicalJson)` y arma `InformeRenderModel`
  (tipo en `src/lib/informe/render-shared.ts`).
- **Render web** (`src/lib/informe/web-render.ts`): `renderInformeWebHtml(model)`
  concatena secciones; el `STYLE` inline usa tokens `--sys-*`.
- **Gold standard** (`~/Downloads/2026-informe-grupo_agros_formosa-auditoria-erp-it.html`):
  clases `.equip`, `.equip-table`, `.equip-gallery`, `.equip-fig`, `.equip-ph`,
  `.equip-cap` con responsive (móvil colapsa tabla en tarjetas) y print A4.

## 2. Decisiones explícitas (las que pidió #45)

### (a) Embebido vs presigned de las fotos — **DECISIÓN: presigned R2**

Las fotos se sirven con **URL presigned GET de R2** (no data-uri embebido).

- **Por qué presigned:** `web-render.ts` ya es un módulo puro que produce HTML
  con `src` a URLs (logo CDN, Loom). Embeber data-uri exigiría descargar y
  base64-ear cada foto en build, inflando el HTML (varios MB por informe),
  rompiendo el snapshot test determinista y degradando el render web público.
- **Implicancia PDF/print:** el flujo de impresión (`.../imprimir`) renderiza el
  mismo HTML en navegador → las `<img src=presigned>` cargan antes de imprimir.
  La presigned se genera con TTL suficiente (reutilizar `presignGet`/
  `buildPublicObjectUrl` de `src/lib/server/storage/presign.ts`). **Open Q (a)**
  sobre TTL más abajo.
- **Implicancia snapshot test:** la URL presigned NO es determinista (firma con
  timestamp). Para que los snapshots sean estables, **la resolución de claves R2 →
  URL se inyecta como dependencia** en el modelo (función `photoUrl(r2Key)`),
  y el test pasa un resolvedor fake determinista (p. ej. `key => /photos/${key}`).
  El canónico expone **claves R2** (no URLs); el modelo las convierte a URL.

### (b) Cómo se identifica qué ítems `table` son "inventario" — **DECISIÓN**

Un ítem `table` se trata como inventario en el render **si y sólo si**:

1. `field_type === 'table'`, y
2. su sección pertenece al dominio IT (`resolveSectionDomain(section) === 'it'`,
   reutilizar `src/lib/server/informe/tipo.ts`), y
3. sus `columns` permiten mapear al menos tipo y (antigüedad **o** EOL), usando
   las mismas claves que el scoring (`TYPE_KEYS`/`AGE_KEYS`/`EOL_KEYS`) y/o
   `options.eol_rules` cuando esté presente.

No se introduce un flag nuevo en `template_item` (evita migración de seed y
mantiene el motor de scoring intacto). El mapeo columna→rol se centraliza en un
helper `resolveInventoryColumns(columns, eolRules?)`. **Open Q (b)** sobre si
algún template IT real usa keys fuera de las listas del scoring.

### (c) Versionado del schema canónico — **DECISIÓN: MINOR 1.1 → 1.2**

Se agrega un campo **opcional** `rows` al `canonicalItemSchema` (sólo presente en
ítems `table`). Por política de `version.ts` (campo opcional nuevo = MINOR), se
sube `CANONICAL_SCHEMA_VERSION` de `'1.1'` a `'1.2'`. Los consumidores que ignoran
`rows` siguen validando (R3). El campo `attachments` a nivel ítem **se mantiene**
(no se rompe nada); `rows[].attachments` es el detalle por fila adicional.

### (d) Caso mixto IT+ERP — **DECISIÓN**

En `tipoAuditoria='mixta'` se renderiza la sección de inventario igual que en
`'it'`, ubicada **después de hallazgos** (junto al material IT). Sólo se listan
equipos de secciones de dominio IT (R8). Las secciones ERP no aportan inventario.

## 3. Archivos a crear / modificar

### Modificar

1. **`src/lib/server/canonical/schema.ts`**
   - Agregar a `canonicalItemSchema` el campo opcional:
     ```ts
     rows: z.array(z.object({
       row_id: z.string().min(1),
       cells: z.record(z.unknown()),
       attachments: z.array(z.string().min(1))   // claves R2 (photo)
     })).optional()
     ```
   - Exportar tipo `CanonicalItemRow = z.infer<...>`.

2. **`src/lib/server/canonical/version.ts`**
   - `CANONICAL_SCHEMA_VERSION = '1.2'`. Actualizar comentario de changelog.

3. **`src/lib/server/canonical/build.ts`**
   - Construir mapa `attachmentById: Map<uuid, r2_key>` (además del actual
     `attachmentsByItem`), consultando `id, r2_key` de `attachment` con
     `kind='photo'` y `item_id` de la sección.
   - Para ítems `table`: derivar `rows` desde `response.value.rows`, mapeando
     `row.attachment_ids (uuid[]) → r2_key[]` vía `attachmentById`, omitiendo
     los que no resuelvan (R2). Si no hay filas → `rows: []` (R4).
   - No tocar el campo `attachments` a nivel ítem (compat).

4. **`src/lib/informe/render-shared.ts`** (tipo `InformeRenderModel`)
   - Agregar:
     ```ts
     inventarioIt: Array<{
       tipo: string;
       modeloCategoria: string;
       antiguedad: string;
       estadoEol: string;
       semaforo: RenderSemaphore | null;
       fotos: Array<{ url: string; alt: string }>;
     }>;
     ```

5. **`src/lib/server/informe/model.ts`**
   - Aceptar en `options` un resolvedor `photoUrl?: (r2Key: string) => string`
     (default: `buildPublicObjectUrl` o presigned). Inyectable para el test (a).
   - Recorrer `canonical.sections` de dominio IT, detectar ítems `table` de
     inventario (helper §(b)), y por cada fila construir un equipo:
     - `tipo/modeloCategoria/antiguedad/estadoEol`: leer de `cells` con
       `resolveInventoryColumns` + `pickField`.
     - `semaforo`: `scoreInventoryRow(cells, refDate).points` → `0 red / 50 amber / 100 green / null null`.
     - `fotos`: `row.attachments.map(key => ({ url: photoUrl(key), alt: tipo+modelo }))`.
   - `refDate`: `canonical.closed_at` o `generated_at`.

6. **`src/lib/informe/web-render.ts`**
   - Nueva `function renderInventario(model): string` (devuelve `''` si
     `tipoAuditoria==='erp'` o `inventarioIt.length===0`, R8/R9).
   - Insertarla en `renderInformeWebHtml` **después de `renderHallazgos`** (caso it/mixta).
   - Agregar al `STYLE` las clases `.equip*` portadas del gold standard,
     traducidas a tokens `--sys-*` (R12) con `@media print` y móvil (R13).
   - Semáforo por fila: badge con `semaphoreToRowClass`/colores `--sys-rojo/naranja/verde`.

### Crear

7. **`src/lib/informe/inventory-columns.ts`** (helper puro)
   - `resolveInventoryColumns(columns, eolRules?)`: dado `options.columns`,
     devuelve `{ tipoKey, modeloKey, antiguedadKey, eolKey }` por match contra
     `TYPE_KEYS/AGE_KEYS/EOL_KEYS` (+ label heurístico). Reutilizado por modelo.
   - `isInventoryTableItem(item, sectionDomain)`: predicado §(b).

### Tests (ver `tasks.md` para mapeo R↔test)

8. `tests/canonical-schema.test.ts` / `tests/canonical-contract.test.ts`:
   `rows` opcional, `schema_version='1.2'`, payload sin `rows` valida (R1,R3,R4).
9. `tests/canonical-builder.test.ts`: fila con `attachment_ids` → `rows[].attachments`
   resueltos a r2_key; UUID huérfano omitido (R2).
10. `tests/informe-web-render.test.ts`: snapshot ERP sin cambios (R14); nuevos
    snapshots inventario IT con fotos y sin fotos (placeholder) (R8,R10,R11);
    aserción de no-fuga interno (R5,R15); ERP puro sin sección (R9).

## 4. Firmas nuevas (resumen)

```ts
// schema.ts
export type CanonicalItemRow = { row_id: string; cells: Record<string, unknown>; attachments: string[] };

// inventory-columns.ts
export function resolveInventoryColumns(
  columns: Array<{ key: string; label: string; type: string }>,
  eolRules?: { /* eol_rules shape */ }
): { tipoKey?: string; modeloKey?: string; antiguedadKey?: string; eolKey?: string };
export function isInventoryTableItem(
  item: { field_type: string; value: unknown },
  sectionDomain: 'it' | 'erp'
): boolean;

// model.ts (buildInformeRenderModel options extendidas)
options?: { …; photoUrl?: (r2Key: string) => string };

// web-render.ts
function renderInventario(model: InformeRenderModel): string;
```

## 5. Errores

No se introducen errores nuevos. La resolución de adjuntos huérfanos es
**silenciosa** (omitir, R2/R11) — no se lanza. El render degrada a placeholder.

## 6. Alternativa descartada

- **Embeber fotos como data-uri en el canónico/HTML.** Descartada: rompe la
  pureza/determinismo del snapshot test, infla el JSON canónico (que viaja al
  pipeline n8n) y el HTML público a varios MB, y duplica almacenamiento. La
  presigned R2 con resolvedor inyectable cubre web, print/PDF y test sin esos
  costos (decisión (a)).
- **Agregar columna `row_id` a `attachment` + migración.** Descartada para esta
  feature: la relación fila↔foto ya está en `value.rows[].attachment_ids` y el
  bundle export/import ya la remapea (`src/lib/server/bundle/import.ts`).
  Introducir FK por fila es un cambio de modelo mayor fuera de alcance; el mapeo
  UUID→r2_key en build es suficiente (decisión (b)/(c)).
- **Flag `is_inventory` en `template_item`.** Descartada: exige migración de seed
  y versionado de templates; la heurística columnas+dominio IT es suficiente y no
  toca el motor de scoring (decisión (b)).

## 7. Open questions para la puerta humana

- **OQ-1 (a · TTL presigned):** ¿qué TTL para las presigned GET de fotos en el
  informe web público y en el flujo de impresión? Si el informe se comparte por
  link con token (`/informe/[token]`), una presigned corta puede expirar antes de
  que el cliente lo abra. Opción: usar `buildPublicObjectUrl` si el bucket admite
  lectura por token de informe, o regenerar presigned por request. **Necesita Martín.**
- **OQ-2 (b · columnas reales):** confirmar las `key` exactas de las columnas del
  ítem "punto 1" en el template IT vivo (#19). Si difieren de
  `TYPE_KEYS/AGE_KEYS/EOL_KEYS`, hay que ampliar las listas o usar `eol_rules`.
- **OQ-3 (orden/ubicación):** ¿la sección de inventario va inmediatamente después
  de "Hallazgos" o antes del "Plan"? Asumido: después de Hallazgos. Confirmar con
  el gold standard de Grupo Agros.
