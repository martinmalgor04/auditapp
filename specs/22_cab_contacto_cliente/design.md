# Design — Feature 22

## Capas afectadas

| Capa | Archivo | Cambio |
|---|---|---|
| Migración DB | `migrations/014_cab_contacto_items.sql` | INSERT 3 ítems por template, idempotente (ON CONFLICT DO NOTHING), sort_order antes de "Fecha programada" |
| Seed JSON | `seed/templates/erp-tango-v3.json`, `erp-estandar-v1.json`, `it-v2.json` | Agregar 3 ítems con los mismos UUIDs fijos de la migración |
| Dominio mapeo | `src/lib/backoffice/cab-client-map.ts` | `ClientCabFields` + 3 campos; `LABEL_TO_FIELD` + 3 entradas; `newClientToCabFields` con nulls |
| Query picker | `src/lib/server/backoffice/audits.ts` | SELECT incluye `direccion, telefono, email`; `mapClientRow` y `syncClientFromCab` actualizados |
| Form new audit | `src/routes/(app)/auditorias/new/+page.svelte` | Objeto `ClientCabFields` inline actualizado |

## UUIDs fijos de los ítems nuevos

| Template | Campo | UUID |
|---|---|---|
| erp-tango-v3 | Dirección | `a1b2c3d4-0001-0001-0001-000000000001` |
| erp-tango-v3 | Teléfono | `a1b2c3d4-0001-0002-0001-000000000001` |
| erp-tango-v3 | Email | `a1b2c3d4-0001-0003-0001-000000000001` |
| erp-estandar-v1 | Dirección | `a1b2c3d4-0002-0001-0001-000000000001` |
| erp-estandar-v1 | Teléfono | `a1b2c3d4-0002-0002-0001-000000000001` |
| erp-estandar-v1 | Email | `a1b2c3d4-0002-0003-0001-000000000001` |
| it-v2 | Dirección | `a1b2c3d4-0003-0001-0001-000000000001` |
| it-v2 | Teléfono | `a1b2c3d4-0003-0002-0001-000000000001` |
| it-v2 | Email | `a1b2c3d4-0003-0003-0001-000000000001` |

## Flujo pre-relleno

```
ClientPicker selecciona cliente
  → searchClientsForPicker (SELECT incluye direccion/telefono/email)
  → cabFields { ..., direccion, telefono, email }
  → onClientSelect(clientId, cabFields)
  → clientToCabValues() matchea 'dirección'→direccion, 'teléfono'→telefono, 'email'→email
  → CAB ítems pre-cargados
```

## Sin migración de datos existentes

Las respuestas CAB ya guardadas (`audit_response`) no se modifican. Los nuevos ítems solo aplican a auditorías nuevas o que aún estén en edición.
