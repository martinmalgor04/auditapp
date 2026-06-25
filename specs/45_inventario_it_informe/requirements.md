# Requirements — 45_inventario_it_informe

> Inventario IT (tabla + galería de fotos) en el informe IT puro y mixto.
> Notación EARS estricta (ver `docs/specs.md`). Cada `R<n>` es verificable por
> al menos un test concreto. Trazabilidad en `tasks.md` y `progress/impl_45_*.md`.

## Contexto

Los datos del inventario de equipos ya existen:

- En el form técnico se relevan con un ítem `field_type='table'` cuyo
  `value.rows = [{ row_id, cells, attachment_ids }]`
  (`src/lib/components/form/fields/field-table.svelte`).
- Las fotos por fila son adjuntos `kind='photo'` en la tabla `attachment`,
  referenciados por su UUID en `row.attachment_ids`
  (`src/lib/server/form/schemas.ts`: `attachment_ids: z.array(z.string().uuid())`).
- El scoring de fin de vida (EOL) por equipo existe en
  `src/lib/server/scoring/inventory-eol.ts` (`scoreInventoryRow`,
  `scoreInventoryTable`).

Hoy el render del informe (`src/lib/informe/web-render.ts`) solo arma resumen,
hallazgos, riesgos, día-a-día y plan: **no muestra el inventario**. El canónico
(`build.ts`) agrega los attachments a nivel ítem (`attachmentsByItem`) y
**pierde** la asociación fila→foto. Esta feature cierra esa brecha.

## Mapa acceptance (#45) → requirements

| Acceptance #45 | Requirements |
|---|---|
| Canónico expone filas de inventario con celdas y attachment keys por fila, sin romper schema_version | R1, R2, R3 |
| InformeRenderModel incluye inventario IT derivado vía stripInternalFindings; nunca interno | R4, R5, R11 |
| Render IT/mixta muestra tabla + galería; ERP puro no la muestra | R6, R7, R8, R9 |
| Fotos con URL válida (presigned/embebido) y placeholder si falta | R9, R10 |
| Branding SyS, reveal-on-scroll y print A4 | R12, R13 |
| Snapshots ERP no cambian; nuevos snapshots inventario; no-fuga interno | R5, R8, R14, R15 |

---

## Requirements

### Canónico (schema + build)

**R1.** El sistema DEBE exponer, para cada ítem canónico con `field_type='table'`,
las filas del relevamiento como un arreglo `rows`, donde cada fila incluye
`row_id` (string), `cells` (objeto clave→valor de columna) y `attachments`
(arreglo de claves R2 de las fotos vinculadas a esa fila).

**R2.** CUANDO se construye una fila de inventario, el sistema DEBE resolver cada
UUID de `row.attachment_ids` a su `r2_key` correspondiente en la tabla
`attachment` (kind `'photo'`), y DEBE omitir los UUID que no resuelvan a un
adjunto existente.

**R3.** El sistema DEBE conservar la compatibilidad del contrato: el `schema_version`
canónico sólo se incrementa en MINOR (campo opcional nuevo, ver
`src/lib/server/canonical/version.ts`), y los consumidores existentes que ignoran
`rows` DEBEN seguir validando contra el schema.

**R4.** DONDE un ítem canónico tipo `table` no tiene filas relevadas, el sistema
DEBE exponer `rows` como arreglo vacío (nunca `null`).

### Modelo de render

**R5.** El `InformeRenderModel` DEBE derivar el inventario IT exclusivamente del
snapshot canónico pasado por `stripInternalFindings`
(`src/lib/server/informe/model.ts`), de modo que ningún material interno
(`internal_draft`, `upsell_findings.internal`) llegue al render.

**R6.** El sistema DEBE incluir en `InformeRenderModel` un arreglo `inventarioIt`
de equipos, cada uno con: `tipo`, `modeloCategoria`, `antiguedad` (año/años o
texto relevado), `estadoEol` (etiqueta legible), `semaforo` (`'red' | 'amber' | 'green' | null`)
y `fotos` (arreglo de `{ url, alt }`).

**R7.** El `semaforo` de cada equipo DEBE derivarse del puntaje de
`scoreInventoryRow` (`inventory-eol.ts`): `0 → red`, `50 → amber`, `100 → green`,
`null → null` (sin dato). El sistema NO DEBE modificar el motor de scoring.

### Render del informe

**R8.** DONDE `tipoAuditoria` es `'it'` o `'mixta'` y existe al menos un equipo
de inventario, el sistema DEBE renderizar una sección "Inventario de equipos"
con una tabla `equip-table` (columnas: tipo, modelo/categoría, antigüedad/año,
estado EOL con semáforo).

**R9.** SI `tipoAuditoria` es `'erp'` (ERP puro) ENTONCES el sistema NO DEBE
renderizar la sección de inventario.

**R10.** DONDE un equipo tiene fotos con URL válida, el sistema DEBE renderizar
una galería `equip-gallery` con una figura `equip-fig` por foto (imagen +
caption `equip-cap` con el equipo).

**R11.** SI un equipo no tiene fotos resolubles ENTONCES el sistema DEBE renderizar
un placeholder `equip-ph` (sin romper la grilla) en lugar de una imagen rota.

### Branding y presentación

**R12.** La sección de inventario DEBE usar tokens de marca SyS (`--sys-*`),
coherente con el resto de `web-render.ts`, y DEBE aplicar `reveal` (reveal-on-scroll)
a sus bloques.

**R13.** MIENTRAS se imprime en A4 (`@media print`), la sección de inventario
DEBE mantener tabla y galería legibles (grilla responsive, sin recortes), igual
que el resto del informe.

### No-regresión y no-fuga

**R14.** El sistema NO DEBE alterar el HTML renderizado de informes ERP puros: los
snapshots existentes de `web-render` DEBEN permanecer idénticos.

**R15.** SI el `value.rows` o los datos de inventario contienen referencias a
material interno (p. ej. claves de adjuntos no `photo`, o findings internos)
ENTONCES el sistema NO DEBE incluirlos en el render ni en el modelo.
