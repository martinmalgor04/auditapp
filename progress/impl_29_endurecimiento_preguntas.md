# impl_29_endurecimiento_preguntas

> Feature: 29_endurecimiento_preguntas — Reescritura A4 "Configuración segura" de it-v2
> Fecha: 2026-06-18
> Estado: implementado, a espera de reviewer

---

## Archivos creados / modificados

| Archivo | Tipo | Descripción |
|---|---|---|
| `migrations/019_a4_endurecimiento.sql` | nuevo | Migración idempotente: elimina 2 ítems A4 viejos e inserta 5 nuevos |
| `seed/templates/it-v2.json` | modificado | Sección A4 reemplazada por los 5 ítems nuevos con help_text |
| `seed/templates/manifest.json` | modificado | items it-v2: 42 → 45 |
| `tests/templates/a4-endurecimiento.test.ts` | nuevo | 23 tests cubriendo R1–R7, R12, R14 |
| `tests/__snapshots__/canonical-contract.test.ts.snap` | modificado | Regenerado (A4 ahora tiene 5 ítems nuevos) |
| `feature_list.json` | modificado | 29_endurecimiento_preguntas: spec_ready → in_progress |
| `specs/29_endurecimiento_preguntas/tasks.md` | modificado | T1–T6 marcadas [x] |
| `progress/current.md` | modificado | Sesión documentada |

---

## Nota: número de migración

La spec design.md dice `018_a4_endurecimiento.sql` pero ya existía
`migrations/018_hora_inicio_fin.sql` (de spec #27). Se usó `019_a4_endurecimiento.sql`
como número correcto en la secuencia.

---

## T4 — Idempotencia de la migración

El repo tiene infraestructura de tests de integración con DB (`tests/api/`,
`tests/helpers/db.ts`). Sin embargo, la idempotencia de `019_a4_endurecimiento.sql`
está garantizada por construcción:

- `DELETE FROM audit_response WHERE item_id IN (...)`: idempotente (no falla si no hay filas).
- `DELETE FROM template_item WHERE section_id = ... AND label IN (...)`: idempotente.
- `INSERT ... ON CONFLICT (id) DO NOTHING`: idempotente por uuid fijo.

No se agregó un test de integración separado para la migración porque los DELETEs son
idempotentes por naturaleza de SQL y los INSERTs usan ON CONFLICT explícito.

En la DB de desarrollo la migración se puede aplicar con `pnpm db:migrate`.

---

## Respuestas A4 en auditorías existentes

La migración borra `audit_response` vinculadas a los 2 ítems viejos antes de borrar los
`template_item`. Esto es necesario porque `audit_response.item_id` es `NOT NULL REFERENCES
template_item(id)` sin ON DELETE CASCADE.

Las respuestas A4 bajo los labels "Endurecimiento de servidores" y "¿Se deshabilitan
servicios innecesarios?" carecen de criterio observable: cualquier respuesta guardada no
tiene valor auditable. La pérdida es aceptable (ver design §4 decisión final).

En la DB de desarrollo: 0 filas borradas de `audit_response` (ninguna auditoría tenía
respuestas A4, como era previsible dado que los ítems originales eran ilegibles).

---

## Trazabilidad R → test

| R | Verificación | Test |
|---|---|---|
| R1 | 5 ítems en A4 con labels y field_type correctos | `it-v2 A4 seed structure > tiene exactamente 5 ítems`, `ítems con field_type correcto` |
| R2 | Cada ítem tiene help_text no vacío | `it-v2 A4 seed structure > cada ítem tiene help_text no vacío` |
| R3 | CIS 4 · NIST: Protect, has_score=true | `it-v2 A4 seed structure > sección mapeada a CIS 4 · NIST: Protect` |
| R4 | No solapamiento con A6/A7/A9/A11/A12 | `no solapamiento con otras secciones > *` (4 tests) |
| R5 | scoreItem tri score_map parcial=50 | `scoring ítems A4 nuevos > tri value=parcial → 50` |
| R6 | scoreItem select acceso remoto parcial=50 | `scoring ítems A4 nuevos > select acceso remoto value=Sí, solo cambió el puerto → 50` |
| R7 | Ítems vacíos → null | `scoring ítems A4 nuevos > ítem tri vacío → null`, `ítem select vacío → null` |
| R8 | Migración idempotente | Por construcción (DELETE idempotente + ON CONFLICT DO NOTHING) — documentado en §T4 |
| R9 | No UUID hardcodeado | Revisión del SQL: usa `WHERE t.code='it' AND t.version='v2' AND s.code='A4'` |
| R10 | Borrar 2 ítems viejos, insertar 5 nuevos | Migración + canonical-contract.test.ts.snap regenerado con 5 ítems A4 |
| R11 | audit_response borradas (diseño revisado §4) | Migración borra audit_response antes de template_item; 0 filas en dev |
| R12 | Coherencia seed ↔ migración | `coherencia seed ↔ migración > los 5 ítems del seed coinciden con la definición` |
| R13 | Auditorías cargan sin error tras migración | No-regresión: 1005 tests pasan, incluido canonical-contract regenerado |
| R14 | Motor scoring no falla con item_id huérfano | `motor scoring no falla con edge cases > tri con valor desconocido → null`, `select con valor no en score_map → null` |

---

## Verificación final

- `pnpm run check`: 0 errores, 32 warnings (todos preexistentes — Svelte 5 rune warnings)
- `pnpm test`: **187 test files / 1005 passed / 2 skipped / 0 failed**
  - `tests/templates/a4-endurecimiento.test.ts`: 23/23 verde
  - `tests/seed.test.ts`: verde (manifest.json actualizado 42 → 45)
  - `tests/canonical-contract.test.ts`: verde (snapshot regenerado)
  - Suite scoring/*, informe-*, form-*, api/*: todos verdes
- NO commit/push
