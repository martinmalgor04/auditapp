# Tasks — Feature 22

| ID | Tarea | Archivo | Estado |
|---|---|---|---|
| T1 | Migración 014: INSERT 3 ítems por template, idempotente | `migrations/014_cab_contacto_items.sql` | done |
| T2 | Actualizar seed JSON erp-tango-v3 | `seed/templates/erp-tango-v3.json` | done |
| T3 | Actualizar seed JSON erp-estandar-v1 | `seed/templates/erp-estandar-v1.json` | done |
| T4 | Actualizar seed JSON it-v2 | `seed/templates/it-v2.json` | done |
| T5 | `ClientCabFields` + 3 campos; `LABEL_TO_FIELD` + 3 entradas | `src/lib/backoffice/cab-client-map.ts` | done |
| T6 | `newClientToCabFields` retorna 3 nuevos campos como null | `src/lib/backoffice/cab-client-map.ts` | done |
| T7 | SELECT y `mapClientRow` incluyen 3 nuevos campos | `src/lib/server/backoffice/audits.ts` | done |
| T8 | `syncClientFromCab` actualiza direccion/telefono/email | `src/lib/server/backoffice/audits.ts` | done |
| T9 | Objeto `ClientCabFields` inline actualizado | `src/routes/(app)/auditorias/new/+page.svelte` | done |
| T10 | Tests en `cab-contacto-map.test.ts` (R1–R7) | `tests/cab-contacto-map.test.ts` | done |

## Verificación final

- `pnpm run check` → 0 errores ✓
- `pnpm run build` → OK ✓
- `pnpm test` → 157 files / 722 pass / 2 skip ✓
- `./init.sh` → OK ✓
