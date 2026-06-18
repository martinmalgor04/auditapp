# Design — 27_hora_inicio_fin

## Decisiones de diseño

### 1. Columnas en `audit` vs tabla separada

Se agregan `started_at` y `finished_at` directamente en `audit`, como ya están
`scheduled_at` y `closed_at`. No se crea tabla de eventos/log porque los requisitos
no exigen historial de cambios, solo el primer inicio y el primer cierre del
relevamiento.

**Alternativa descartada:** tabla `audit_event (audit_id, type, ts)`. Más flexible
para tracking, pero agrega complejidad innecesaria. El requisito es registro único,
no historial.

### 2. Sellado atómico con guard SQL (no en aplicación)

El sellado de `started_at` se hace con:

```sql
UPDATE audit
SET started_at = now()
WHERE id = $auditId
  AND started_at IS NULL
```

La condición `AND started_at IS NULL` en la query garantiza atomicidad sin
necesidad de leer el valor previo en la capa de aplicación (elimina race condition
entre dos tabs/requests simultáneos del mismo técnico). El mismo patrón aplica a
`finished_at` en `completeRelevamiento()`.

**Alternativa descartada:** leer `started_at`, verificar en TS, luego hacer UPDATE.
Introduce window de race condition.

### 3. `started_at` se sella en el `load` del form, no en una acción

El `load` de `+page.server.ts` de `/auditorias/[id]/form` ya tiene acceso al
`auditId` y al `user`. Agregar el stamp aquí no requiere cambio de contrato ni
nueva acción de form. Solo se ejecuta cuando el status está en
`FORM_EDITABLE_STATUSES` (condición que ya valida `assertFormAccess`).

### 4. `finished_at` se sella en `completeRelevamiento()`, no en `setAuditStatus()`

`setAuditStatus()` es genérico y se usa en más contextos. `completeRelevamiento()`
es el único punto que transiciona a `en_cierre` desde el form del técnico, es el
lugar semánticamente correcto.

### 5. `finished_at` NO se toca en `reopenAudit()`

`reopenAudit()` en `src/lib/server/scoring/persist.ts` revierte a `en_cierre`; no
implica que el relevamiento se re-realizó, así que `finished_at` mantiene el valor
del primer cierre hasta que el admin/técnico lo edite explícitamente (R6).

### 6. Edición manual via `updateAudit()` extendido

Se extiende `UpdateAuditInput` en `src/lib/server/backoffice/schemas.ts` con campos
`startedAt?: string` y `finishedAt?: string` (ISO 8601). La validación Zod aplica
el refinement `fin >= inicio`. El guard de permisos ya existe en la ruta
(`requireStaff` + verificación de técnico asignado).

### 7. `visita` en `InformeRenderModel` como campo opcional

Se agrega `visita?: { inicio: string; fin: string; duracionMin: number }` a
`InformeRenderModel` en `render-shared.ts`. El campo es opcional para no romper
tests existentes de render. `buildInformeRenderModel()` en `model.ts` necesita leer
`started_at`/`finished_at` de la tabla `audit` (hoy solo lee el canonical JSON, que
no los incluye). Se pasan al model via `AuditReportRow` extendido o query directa.

**Alternativa descartada:** incluir `started_at`/`finished_at` en el canonical JSON
snapshot. El canonical está versionado y tiene schema Zod propio; agregar campos
requeriría bump de `CANONICAL_SCHEMA_VERSION` y migración de snapshots guardados.
Es excesivo para metadatos de auditoría. Se leen frescos de `audit` al construir el
render model.

### 8. Función utilitaria `formatVisita()`

Una función pura `formatVisita(opts: { startedAt: Date | null; finishedAt: Date |
null; tz?: string }): VisitaDisplay | null` se extrae a
`src/lib/informe/visita.ts` (pure TS, sin dependencias de servidor). Retorna
`null` si faltan datos (R13, R15). El formato "DD/MM HH:MM" asume timezone
`America/Argentina/Buenos_Aires` (UTC-3 fijo, sin DST).

---

## Archivos a tocar

| Archivo | Qué cambia |
|---|---|
| `migrations/018_hora_inicio_fin.sql` | **NUEVO** — agrega `started_at`, `finished_at` con `IF NOT EXISTS` |
| `src/lib/server/db/audit-form.ts` | nueva función `stampStartedAt(auditId)` |
| `src/lib/server/form/complete.ts` | llama `stampFinishedAt(auditId)` antes de `setAuditStatus` |
| `src/lib/server/backoffice/audits.ts` | extiende `AuditDetail` y `AuditRow` con `started_at`/`finished_at`; extiende `updateAudit()` |
| `src/lib/server/backoffice/schemas.ts` | agrega `startedAt?`, `finishedAt?` a `UpdateAuditInput` con refinement `fin >= inicio` |
| `src/routes/(app)/auditorias/[id]/form/+page.server.ts` | llama `stampStartedAt(params.id)` en `load` |
| `src/routes/(app)/auditorias/[id]/+page.server.ts` | expone `startedAt`/`finishedAt` en el load |
| `src/routes/(app)/auditorias/[id]/+page.svelte` | muestra bloque visita (R11-R13) |
| `src/lib/informe/render-shared.ts` | agrega `visita?` a `InformeRenderModel` |
| `src/lib/informe/visita.ts` | **NUEVO** — `formatVisita()`, `formatDuracion()` puras |
| `src/lib/server/informe/model.ts` | lee `started_at`/`finished_at` de `audit` y construye `visita` |
| `src/lib/informe/render-it.ts` | renderiza bloque visita si existe |
| `src/lib/informe/render-erp.ts` | renderiza bloque visita si existe |
| `src/lib/informe/web-render.ts` | renderiza bloque visita si existe |

---

## Firmas nuevas

```typescript
// src/lib/server/db/audit-form.ts
export async function stampStartedAt(auditId: string): Promise<void>
// UPDATE audit SET started_at = now() WHERE id = $1 AND started_at IS NULL

// src/lib/server/db/audit-form.ts
export async function stampFinishedAt(auditId: string): Promise<void>
// UPDATE audit SET finished_at = now() WHERE id = $1 AND finished_at IS NULL

// src/lib/informe/visita.ts
export type VisitaDisplay = {
  rangoStr: string;   // e.g. "14/06 09:30–11:15 · 1h 45m"
  inicioStr: string;  // e.g. "14/06 09:30"
  finStr: string;     // e.g. "11:15"
  duracionMin: number;
}

export function formatVisita(opts: {
  startedAt: Date | null;
  finishedAt: Date | null;
}): VisitaDisplay | null

export function formatDuracion(minutos: number): string
// e.g. 105 → "1h 45m", 45 → "45m"
```

```typescript
// Extensión de InformeRenderModel (src/lib/informe/render-shared.ts)
visita?: {
  inicio: string;   // "14/06 09:30"
  fin: string;      // "11:15"
  duracionMin: number;
}
```

```typescript
// Extensión de UpdateAuditInput (src/lib/server/backoffice/schemas.ts)
startedAt?: string   // ISO 8601 datetime, nullable string
finishedAt?: string  // ISO 8601 datetime, nullable string
// Refinement: si ambos presentes, new Date(finishedAt) >= new Date(startedAt)
```

---

## Errores nuevos

| Error | Código HTTP | Mensaje |
|---|---|---|
| `finishedAt < startedAt` | 400 | "La hora de fin no puede ser anterior a la de inicio" |
| edición por usuario sin permiso | 403 | (guard existente `requireStaff` + técnico asignado) |

---

## Migración SQL

```sql
-- migrations/018_hora_inicio_fin.sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit' AND column_name = 'started_at'
  ) THEN
    ALTER TABLE audit ADD COLUMN started_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit' AND column_name = 'finished_at'
  ) THEN
    ALTER TABLE audit ADD COLUMN finished_at timestamptz;
  END IF;
END $$;
```
