# Feature 22 — CAB: Dirección, Teléfono y Email desde cliente

## Decisiones de puerta (Martín, 2026-06-15)

- Los 3 nuevos ítems se agregan a los 3 templates activos (erp-tango-v3, erp-estandar-v1, it-v2).
- Posicionados antes de "Fecha programada de visita".
- Origen de datos: client.direccion, client.telefono, client.email (llegados vía import #21).

## Requirements EARS

| ID | Requirement | Test |
|---|---|---|
| R1 | WHEN el admin aplica la migración 014, THEN los 3 templates tienen ítems Dirección/Teléfono/Email en CAB antes de "Fecha programada de visita" | tests/cab-contacto-map.test.ts |
| R2 | WHEN se selecciona un cliente con dirección/teléfono/email, THEN esos campos aparecen pre-cargados en el CAB del form de nueva auditoría | tests/cab-contacto-map.test.ts |
| R3 | WHEN el cliente no tiene dirección/teléfono/email, THEN los campos quedan vacíos sin error | tests/cab-contacto-map.test.ts |
| R4 | WHEN se aplica la migración 014 dos veces, THEN no falla (INSERT ON CONFLICT DO NOTHING) | tests/cab-contacto-map.test.ts |
| R5 | WHEN se re-seedea la DB, THEN los JSON seed incluyen los 3 ítems nuevos coherentes con los UUIDs de la migración | - |
| R6 | ClientCabFields incluye direccion, telefono, email; LABEL_TO_FIELD los mapea correctamente | tests/cab-contacto-map.test.ts |
| R7 | syncClientFromCab actualiza client.direccion/telefono/email cuando el técnico los completa en el CAB | tests/cab-contacto-map.test.ts |
