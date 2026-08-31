# Implementación — 62_escaneo_revision_ui

> Implementer: sesión 2026-08-30, rama `cursor/62-escaneo-revision-ui-impl-199b`.
> Spec: `specs/62_escaneo_revision_ui/` (puerta humana 2026-08-30: OQ1=A fusión
> solo vínculo, OQ2=B revisión post-cierre permitida + R32, OQ3=A consolidado
> con todos los escaneos con dispositivos).

## Archivos

### Nuevos

| Archivo | Contenido |
|---|---|
| `migrations/032_escaneo_revision_vinculo.sql` | `relevamiento_item_id` (FK `template_item` ON DELETE SET NULL) + `relevamiento_row_id` + CHECK de paridad `escaneo_dispositivo_vinculo_ck` + índice parcial |
| `src/lib/server/escaneos/consolidado.ts` | Read-model: `listarConsolidado`, `contadoresRevisionConsolidado`, `obtenerDispositivoConsolidado`, `listarFilasInventarioManual`, `listarEscaneosParaUi` |
| `src/lib/server/escaneos/revision.ts` | `marcarRevisionGrupo`, `fusionarDispositivo`, `desvincularDispositivo` |
| `src/lib/server/escaneos/fail-from-error.ts` | `failFromEscaneoError`: `failFromError` + errores de dominio de escaneos como `fail()` legible (R29) |
| `src/lib/escaneos/escaneo-view.ts` | Labels/badges (tokens `--sys-*`), `formatMac`, tipos UI serializados, `detalleDispositivoHref` |
| `src/routes/(app)/auditorias/[id]/escaneos/+page.server.ts` | load (guards + filtros + consolidado) y actions `crearEscaneo`, `emitirToken`, `revocarToken`, `marcar` |
| `src/routes/(app)/auditorias/[id]/escaneos/+page.svelte` | Sección escaneos (cards/tabla + alta + token) y sección dispositivos (ChipFilters + selects + cards/tabla + paginación) |
| `src/routes/(app)/auditorias/[id]/escaneos/dispositivos/[identidad]/+page.server.ts` | load detalle + actions `confirmar`/`descartar`/`volverASinRevisar`/`fusionar`/`desvincular` |
| `src/routes/(app)/auditorias/[id]/escaneos/dispositivos/[identidad]/+page.svelte` | Datos consolidados, vínculo vivo/roto, acciones con nota, software/servicios de la canónica, provenance + raw |
| `src/lib/components/escaneos/revision-badge.svelte` | Pill de revisión efectiva |
| `src/lib/components/escaneos/escaneo-estado-badge.svelte` | Pill de estado de escaneo |
| `src/lib/components/escaneos/provenance-chips.svelte` | Chips de escaneos de origen (R10) |
| `src/lib/components/escaneos/escaneo-token-panel.svelte` | Token en claro una sola vez + expiración + copiar (R6) |
| `src/lib/components/escaneos/consolidado-cards.svelte` | Lista mobile `lg:hidden` (R30) |
| `src/lib/components/escaneos/consolidado-tabla.svelte` | Tabla desktop `hidden lg:block` (R30) |
| `src/lib/components/escaneos/raw-json-details.svelte` | `<details>` colapsable con raw por ocurrencia (R19) |
| `src/lib/components/escaneos/fusionar-panel.svelte` | Modal selector de fila manual con buscador client-side (R21) |
| `tests/escaneos-consolidado.test.ts` | 12 tests del read-model |
| `tests/escaneos-revision.test.ts` | 10 tests de mutaciones/vínculo |
| `tests/escaneos-revision-routes.test.ts` | 11 tests de guards/actions/markup |
| `e2e/escaneos-revision.spec.ts` + `e2e/ensure-escaneos-audit.ts` | Flujo feliz: login → escaneos → confirmar → detalle → fusionar → vínculo |

### Modificados

| Archivo | Cambio |
|---|---|
| `src/lib/server/escaneos/schemas.ts` | `filtrosConsolidadoInput`, `crearEscaneoUiInput`, `marcarRevisionGrupoInput`, `fusionarDispositivoInput`, `AGENTE_VERSION_INICIAL` + tipos |
| `src/lib/server/escaneos/errors.ts` | `VinculoRelevamientoInvalidoError` (`VINCULO_RELEVAMIENTO_INVALIDO`) |
| `src/routes/(app)/auditorias/[id]/+page.svelte` | Enlace "Escaneos de red" (R1): junto a "Abrir relevamiento técnico" y en el bloque de `cerrada` (la revisión opera post-cierre, R4) |
| `specs/62_escaneo_revision_ui/tasks.md` | T1–T16 marcadas |

**No se modificó** código de #59 (`repo.ts`) ni #60 (`api.ts`, rutas `/api/escaneos`): se componen desde módulos propios.

## Trazabilidad R ↔ test

| R | Tests |
|---|---|
| R1 (enlace en detalle) | `escaneos-revision-routes.test.ts > el detalle de auditoría enlaza a /escaneos` · e2e `confirmar y fusionar…` (click en `link-escaneos`) |
| R2 (lectura admin/asignado) | `…routes > guards: sin sesión → 303 /login; técnico no asignado → 403; admin y asignado → 200` |
| R3 (no asignado → 403 sin datos ni mutaciones) | mismo test (403 en lista y detalle, action `marcar` → 403; fuera de scope de tipo → 404 vía `getAuditById`, patrón del detalle de auditoría) |
| R4 (cerrada: revisión permitida — puerta OQ2-B) | `…routes > auditoría cerrada: revisión permitida (R4); crear escaneo y tokens → 409 (R32)` |
| R5 (crear escaneo pendiente con técnico de sesión) | `…routes > action crearEscaneo → escaneo pendiente con el técnico de la sesión` |
| R6 (token en claro una sola vez + expiración) | `…routes > action emitirToken → claro una vez + expiración; DB guarda solo hash` (panel: `escaneo-token-panel.svelte`) |
| R7 (revocación inmediata, historial conservado) | `…routes > action revocarToken → el token deja de resolver de inmediato` |
| R8 (lista de escaneos con estado/rango/conteo/fechas) | `…routes > load lista escaneos con estado, rango, conteo y token activo` · `escaneos-consolidado.test.ts > listarEscaneosParaUi…` |
| R9 (dedup por identidad dentro de la auditoría) | `escaneos-consolidado > misma MAC en 2 escaneos → 1 dispositivo…` · `> misma MAC en otra auditoría NO se deduplica` |
| R10 (provenance con etiqueta/rango, estado, visto_at) | `escaneos-consolidado > misma MAC en 2 escaneos…` · `> consolidado incluye dispositivos de escaneos fallidos/cancelados… (OQ3)` · e2e (chips con ambas VLAN) |
| R11 (precedencia por campo con relleno de huecos) | `escaneos-consolidado > precedencia por campo…` |
| R12 (tipo salta `desconocido`) | `escaneos-consolidado > tipo 'desconocido' reciente no pisa un tipo conocido anterior` |
| R13 (revisión efectiva ≠ sin_revisar más reciente, con quién/cuándo) | `escaneos-consolidado > revisión efectiva: confirmado viejo + ocurrencia nueva…` |
| R14 (ocurrencia nueva no revierte decisión) | mismo test |
| R15 (identidad débil por IP señalada) | `escaneos-consolidado > grupo sin MAC → identidadPorIp = true` · markup `identidad-debil-badge` en cards/tabla/detalle |
| R16 (filtros tipo/revisión/escaneo + paginación server-side) | `escaneos-consolidado > filtros por tipo, revisión efectiva y escaneo de origen, con paginación` |
| R17 (contadores por revisión efectiva, consolidado completo) | `escaneos-consolidado > contadores por revisión efectiva…` · `…routes > load lista escaneos…` (contadores en load) |
| R18 (detalle: campos consolidados, provenance, software/servicios de la canónica con origen) | `escaneos-consolidado > detalle: software/servicios de la ocurrencia canónica y raw…` · e2e (`detalle-software`, `origen-canonico`) |
| R19 (raw por ocurrencia, colapsable, sin transformación) | mismo test de detalle (`ocurrenciasRaw` idéntico al payload) · e2e (2 `raw-json-details`) |
| R20 (confirmar/descartar escribe en todo el grupo con quién/cuándo + nota) | `escaneos-revision > marcarRevisionGrupo confirmado → todas las ocurrencias…` · `…routes > action marcar desde la lista aplica la revisión al grupo completo` · e2e (badge cambia) |
| R21 (fusión exige ítem+fila, registra vínculo, marca fusionado en el grupo) | `escaneos-revision > fusionarDispositivo → vínculo + fusionado…` · `> marcarRevisionGrupo con 'fusionado' → ValidationError` · `> CHECK de paridad…` · `…routes > fusión desde el detalle vincula sin tocar audit_response` · e2e |
| R22 (destino inválido → rechazo sin mutar) | `escaneos-revision > fusión con destino inválido → VINCULO_RELEVAMIENTO_INVALIDO sin mutar nada` (ítem inexistente / no-tabla / otra plantilla / row ausente) |
| R23 (nunca se escribe `audit_response`) | `escaneos-revision > la fusión NO escribe audit_response…` (value idéntico antes/después de fusionar y desvincular) · `…routes > fusión desde el detalle…` |
| R24 (desvincular limpia vínculo y vuelve a sin_revisar) | `escaneos-revision > desvincularDispositivo → vínculo NULL y sin_revisar…` · `…routes > fusión desde el detalle…` (tramo desvincular) |
| R25 (fila borrada → vínculo roto en lectura, re-vincular/desvincular) | `escaneos-revision > vínculo roto: se borra la fila del jsonb → vivo = false` (incluye re-vinculación) · UI: bloque `vinculo-roto` en detalle |
| R26 (revertir a sin_revisar limpia revisor/fecha) | `escaneos-revision > revertir a sin_revisar limpia revisor y fecha en el grupo` |
| R27 (empresaId obligatorio en la misma query) | Estructural: toda función nueva lo recibe primero y lo aplica vía join `escaneo → audit`; verificado por los tests de empresa ajena |
| R28 (empresaId ajeno → rechazo sin escrituras) | `escaneos-consolidado > empresaId ajeno → lista vacía, contadores en cero y detalle not found` · `escaneos-revision > marcarRevisionGrupo…` (tramo empresa ajena) y `> fusión con destino inválido…` (tramo empresa ajena) |
| R29 (fail() legible sin stack/SQL) | `…routes > error de dominio en action → fail() con mensaje legible, sin stack` |
| R30 (cards < lg / tabla ≥ lg) | `…routes > markup: cards lg:hidden + tabla hidden lg:block…` |
| R31 (targets `--sys-touch-min` + badges `--sys-*`) | mismo test de markup (incluye SysButton y `escaneo-view.ts`) |
| R32 (cerrada: crear escaneo / emitir / revocar → 409) | `…routes > auditoría cerrada: revisión permitida (R4); crear escaneo y tokens → 409 (R32)` |

## Decisiones y desviaciones del spec

1. **`failFromEscaneoError` (archivo no listado en el design).** El design
   asume que `failFromError` mapea los errores de dominio; pero las clases de
   `escaneos/errors.ts` (#59) son `Error` planas, no `BackofficeError`, y
   `failFromError` las relanza (→ 500). El helper las mapea a `fail(404/400)`
   con mensaje legible (R29) sin tocar #59. Equivalente a `mapErrorEscaneo`
   de #60 para form actions.
2. **FK `ON DELETE SET NULL` + CHECK de paridad (tensión del design).** El
   design pide ambos y también nota que "borrar un ítem de plantilla no debe
   romperse". Verificado empíricamente: el SET NULL de la FK solo limpia
   `relevamiento_item_id`, lo que violaría el CHECK de paridad → el borrado
   de un `template_item` vinculado se RECHAZA con violación de CHECK (no con
   FK). Comportamiento seguro (no queda `row_id` huérfano) y en la práctica
   inalcanzable hoy: la única poda de ítems (`seed/templates.ts`) exige
   `NOT EXISTS audit_response`, y toda fusión exige una response con la fila.
   Se implementó el spec al pie (T1) y se documenta acá.
3. **Guard 403 vs 404 (R3).** Stack del design: `getAuditById(id, user)` →
   404 para técnico fuera de scope de tipo (no revela existencia, igual que
   el detalle de auditoría); `techIsAssigned` → 403 para técnico en scope no
   asignado. El test cubre ambas ramas.
4. **Revisor en detalle.** `revisadoPor` es el id (R13); el nombre legible se
   resuelve en el load del detalle con un join chico a `app_user` (no cambia
   el contrato del read-model).
5. **Sin `use:enhance`**: form actions con POST plano (patrón de la página
   madre); tras cada acción SvelteKit recarga el load.

## Gates

- `pnpm exec vitest run tests/escaneos-consolidado.test.ts tests/escaneos-revision.test.ts` → 22/22 ✓
- `pnpm exec vitest run tests/escaneos-revision-routes.test.ts` → 11/11 ✓
- `pnpm exec playwright test e2e/escaneos-revision.spec.ts` → 1/1 ✓ (chromium headless en la VM)
- `pnpm run check` → 7 errores, todos preexistentes en `tests/informe-manual.test.ts` (baseline de master; mi diff no agrega ninguno)
- `pnpm run build` → ✓
- Suite completa + `./init.sh`: ver `progress/current.md` (resultados finales)

### Baseline preexistente (master, dada por el leader)

14 fallas de tests (`tests/informe-manual.test.ts` ×8,
`tests/api/report-html-download.test.ts` ×5, `tests/api/audit-crud.test.ts`
×1) y 7 errores de check (mismo archivo). No son de esta feature.

## Notas de entorno (VM del cloud agent)

- Postgres 16 vía apt (`auditapp`/`changeme`); migraciones con runner propio.
- El hook `afterFileEdit` dispara `pnpm test` (suite completa) tras cada
  edición: los gates se corrieron con árbol quieto y matando runs huérfanos
  antes (lección de #60 confirmada: un run del hook quedó con el advisory
  lock tomado y trabó la suite; se liberó matando los procesos).
- `pnpm run db:seed` vía tsx no resuelve `$lib` (preexistente); el
  global-setup de vitest migra+seedea solo. No afecta los gates.
