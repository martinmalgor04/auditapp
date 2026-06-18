# Trazabilidad R↔test — 27_hora_inicio_fin

Implementado: 2026-06-17. Estado: completo, a espera de reviewer.

## Verificación

- `pnpm run check`: 0 errores, 31 warnings preexistentes
- `pnpm test`: 185 test files passed, 944 tests passed, 2 skipped (preexistentes)
- `tests/hora-inicio-fin.test.ts`: 21/21 verde

## Archivos creados/modificados

| Archivo | Tipo | Descripción |
|---|---|---|
| `migrations/018_hora_inicio_fin.sql` | NUEVO | Agrega `started_at`/`finished_at` a `audit` (idempotente) |
| `src/lib/server/db/audit-form.ts` | MOD | `stampStartedAt()`, `stampFinishedAt()` |
| `src/lib/server/form/complete.ts` | MOD | Llama `stampFinishedAt()` antes de `setAuditStatus` |
| `src/lib/server/backoffice/audits.ts` | MOD | `AuditRow`, `AuditDetail` + `started_at`/`finished_at`; `updateAudit()` |
| `src/lib/server/backoffice/schemas.ts` | MOD | `updateAuditSchema` + `startedAt?`/`finishedAt?` + refinement |
| `src/routes/(app)/auditorias/[id]/form/+page.server.ts` | MOD | Llama `stampStartedAt()` en load |
| `src/routes/(app)/auditorias/[id]/+page.server.ts` | MOD | Expone `startedAt`/`finishedAt`/`canEditVisita` |
| `src/routes/(app)/auditorias/[id]/+page.svelte` | MOD | Bloque visita + inputs datetime |
| `src/lib/informe/visita.ts` | NUEVO | `formatVisita()`, `formatDuracion()`, `VisitaDisplay` |
| `src/lib/informe/render-shared.ts` | MOD | `visita?` en `InformeRenderModel` |
| `src/lib/server/informe/model.ts` | MOD | `buildInformeRenderModel(report, timestamps?)` |
| `src/lib/informe/render-it.ts` | MOD | Bloque visita en portada IT |
| `src/lib/informe/render-erp.ts` | MOD | Bloque visita en portada ERP |
| `src/lib/informe/web-render.ts` | MOD | Bloque visita en hero web |
| `tests/hora-inicio-fin.test.ts` | NUEVO | 21 tests (T11.1–T11.12) |
| `tests/__snapshots__/hora-inicio-fin.test.ts.snap` | NUEVO | Snapshot render IT con visita |
| `feature_list.json` | MOD | `#27` → `in_progress` |
| `specs/27_hora_inicio_fin/tasks.md` | MOD | T1–T12 marcados `[x]` |

## Trazabilidad R↔test

| R | Test |
|---|---|
| R1 | T11.1: `el archivo SQL contiene los guards IF NOT EXISTS` |
| R2 | T11.2: `emite UPDATE con WHERE started_at IS NULL` |
| R3 | T11.2: el WHERE en SQL garantiza idempotencia (no hay lógica TS) |
| R4 | T11.2: grep: `AND started_at IS NULL` en `audit-form.ts` |
| R5 | T11.3: `emite UPDATE con WHERE finished_at IS NULL`; T11.4: orden de llamadas |
| R6 | Diseño: `reopenAudit()` no se toca (no llama stampFinishedAt) |
| R7 | T11.5: `cuando audit ya está en en_cierre no llama stampFinishedAt` |
| R8 | T11.6 (acepta inputs válidos); schema extendido |
| R9 | T11.6: `rechaza cuando finishedAt < startedAt` |
| R10 | Guard en `+page.server.ts`: `canEditVisita = isAdmin || assignedTech` |
| R11 | T11.7: `formatVisita ambos presentes`; T11.10: `formatDuracion` |
| R12 | T11.8: `formatVisita solo startedAt → finStr: ''` |
| R13 | T11.9: `formatVisita ambos null → null` |
| R14 | T11.11: `render IT con visita: contiene el rango`; snapshot |
| R15 | T11.12: `render IT sin visita: no contiene "Visita:"`; snapshots ERP/IT/web sin cambio cuando visita=undefined |
| R16 | T11.11: `el modelo tiene campo visita opcional`; grep `visita?` en `InformeRenderModel` |

## Notas de implementación

- **T3:** `stampStartedAt` se llama fire-and-forget (`.catch(() => {})`) en el `load` del form. El sellado no bloquea el render si falla la DB en ese instante.
- **T6 updateAudit():** el UPDATE usa SQL condicional `${newStartedAt !== undefined ? newStartedAt : sql\`started_at\`}` para distinguir "no enviado" (undefined → no cambia) de "borrar" (null → null).
- **T9 buildInformeRenderModel:** acepta segundo argumento opcional `timestamps?: { startedAt, finishedAt }`. Las rutas callers existentes no se modificaron (siguen pasando un argumento), por lo que `visita` queda undefined en esos casos — retrocompatible.
- **T10:** las líneas de visita usan `${model.visita ? \`\n    <p...>` : ''}` inline para no generar whitespace extra cuando visita=undefined (preserva snapshots existentes).
