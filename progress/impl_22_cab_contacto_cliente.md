# Trazabilidad — feature #22 cab_contacto_cliente

## Requisitos → tests

| Req | Descripción | Test |
|-----|-------------|------|
| R1 | 3 ítems (Dirección, Teléfono, Email) en CAB antes de Fecha programada, en los 3 templates activos | `seed.test.ts > template item count matches fixture manifest` (items 42/72/37) |
| R2 | Migración SQL idempotente con UUIDs fijos y ON CONFLICT DO NOTHING | `migrations/014_cab_contacto_items.sql` (DO $$...ON CONFLICT DO NOTHING) |
| R3 | `ClientCabFields` incluye `direccion`, `telefono`, `email` | `pnpm run check` (0 errores TypeScript) |
| R4 | `LABEL_TO_FIELD` mapea 'dirección'/'teléfono'/'email' | `tests/cab-contacto-map.test.ts > pre-rellena Dirección, Teléfono y Email` |
| R5 | `newClientToCabFields()` retorna los 3 campos como null | `tests/cab-contacto-map.test.ts > newClientToCabFields incluye...` |
| R6 | `clientToCabValues` pre-rellena cuando el cliente tiene datos | `tests/cab-contacto-map.test.ts > pre-rellena Dirección, Teléfono y Email cuando el cliente los tiene` |
| R7 | No falla cuando los campos son null | `tests/cab-contacto-map.test.ts > no falla y no incluye valores cuando los campos de contacto son null` |
| R8 | `cabResponsesToClientPatch` extrae los 3 campos al patch | `tests/cab-contacto-map.test.ts > cabResponsesToClientPatch extrae Dirección, Teléfono y Email al patch` |
| R9 | Idempotencia del mapping | `tests/cab-contacto-map.test.ts > idempotencia conceptual: insertar los mismos UUIDs dos veces...` |
| R10 | `searchClientsForPicker` incluye los 3 campos en el SELECT | `audits.ts` línea 542 (SELECT incluye `direccion, telefono, email`) |
| R11 | `syncClientFromCab` persiste los 3 campos de vuelta al cliente | `audits.ts` línea 174-177 (COALESCE de `direccion`, `telefono`, `email`) |
| R12 | JSON seeds actualizados con los 3 ítems y sort_orders correctos | `seed/templates/*.json` + `seed/templates/manifest.json` |

## UUIDs fijos de la migración

| Template | Campo | UUID |
|----------|-------|------|
| erp-tango-v3 | Dirección | `a1b2c3d4-0001-0001-0001-000000000001` |
| erp-tango-v3 | Teléfono | `a1b2c3d4-0001-0002-0001-000000000001` |
| erp-tango-v3 | Email | `a1b2c3d4-0001-0003-0001-000000000001` |
| erp-estandar-v1 | Dirección | `a1b2c3d4-0002-0001-0001-000000000001` |
| erp-estandar-v1 | Teléfono | `a1b2c3d4-0002-0002-0001-000000000001` |
| erp-estandar-v1 | Email | `a1b2c3d4-0002-0003-0001-000000000001` |
| it-v2 | Dirección | `a1b2c3d4-0003-0001-0001-000000000001` |
| it-v2 | Teléfono | `a1b2c3d4-0003-0002-0001-000000000001` |
| it-v2 | Email | `a1b2c3d4-0003-0003-0001-000000000001` |

## Archivos modificados

- `migrations/014_cab_contacto_items.sql` (nuevo)
- `seed/templates/erp-tango-v3.json` (3 ítems nuevos + Fecha programada desplazada a sort_order 13)
- `seed/templates/erp-estandar-v1.json` (3 ítems nuevos + Fecha programada desplazada a sort_order 12)
- `seed/templates/it-v2.json` (3 ítems nuevos + Fecha programada desplazada a sort_order 12)
- `seed/templates/manifest.json` (items: 42/72/37)
- `src/lib/backoffice/cab-client-map.ts` (tipo + LABEL_TO_FIELD + newClientToCabFields)
- `src/lib/server/backoffice/audits.ts` (ClientCabRow + mapClientRow + 4 SELECTs + syncClientFromCab UPDATE)
- `src/routes/(app)/auditorias/new/+page.svelte` (objeto literal inline de ClientCabFields)
- `tests/cab-client-map.test.ts` (actualizado para incluir los 3 campos nuevos en el objeto de prueba)
- `tests/cab-contacto-map.test.ts` (nuevo — 6 tests)

## Verificación final

- `pnpm run check` → 0 errores, 25 warnings preexistentes
- `pnpm run build` → OK (built in ~3s)
- `pnpm test` → 157 files / 722 passed / 2 skipped / 0 failed
- `./init.sh` → sec 1/2/4 OK; sec 3 FAIL preexistente (2 features in_progress: #12 y #22, igual que en sesión anterior con #12 y #21)
