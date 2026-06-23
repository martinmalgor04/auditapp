# Design — 39_relevamiento_visible_reapertura

Feature: Ver relevamiento de auditorías cerradas + reapertura accesible  
Estado objetivo: `spec_ready`  
Fecha: 2026-06-22

---

## Decisión clave: marca de informe desactualizado (columna vs derivado)

### Alternativa A — columna `stale_since timestamptz` en `audit_report` (elegida)

Agregar `stale_since timestamptz DEFAULT NULL` a la tabla `audit_report`.
`reopenAudit` la escribe con `now()` para todos los informes de esa auditoría
en una transacción. `NULL` = vigente, `NOT NULL` = desactualizado.

**Ventajas:**
- Intención explícita. El UI y los queries son triviales: `WHERE stale_since IS NOT NULL`.
- Idempotente: reabrir dos veces no cambia el valor si ya era NOT NULL.
- Permite persistir la fecha exacta de cuándo el informe quedó desactualizado.
- Al regenerar exitosamente (`saveDraftsAndFinish`), se limpia en la misma tx.

**Desventajas:**
- Requiere una migración SQL.
- Hay que actualizar `mapRow` en `informe-reports.ts` y la columna `REPORT_COLUMNS`.

### Alternativa B — derivado por timestamps (descartada)

Derivar `stale` comparando `audit_report.created_at` con `audit.reopened_at`
(o algún timestamp en `audit`). Requeriría agregar `reopened_at` a `audit`,
mantener semántica cruzada de tablas y hacer joins adicionales en cada query
de listado. La lógica se volvería frágil ante reaperturas múltiples y versiones
nuevas de informe. Se descarta por complejidad innecesaria.

**Decisión: Alternativa A.**

---

## Archivos a crear

### 1. Migración

`migrations/NNN_audit_report_stale_since.sql`

```sql
-- Idempotente: agrega la columna solo si no existe.
ALTER TABLE audit_report
  ADD COLUMN IF NOT EXISTS stale_since timestamptz DEFAULT NULL;
```

### 2. Ruta de solo lectura del relevamiento

`src/routes/(app)/auditorias/[id]/form-readonly/+page.server.ts`  
`src/routes/(app)/auditorias/[id]/form-readonly/+page.svelte`

La ruta `form-readonly` carga el mismo contenido que `form` pero sin habilitar
edición. Usar una subruta separada (no query param) por tres razones:
- Semántica clara: URL distinta para estado distinto.
- Evita contaminación del server loader de `form/` con lógica de solo lectura.
- El técnico puede guardar el enlace para consultas posteriores.

---

## Archivos a modificar

### `src/lib/server/db/informe-reports.ts`

- Agregar `stale_since: Date | null` a `AuditReportRow`.
- Incluir `stale_since` en `REPORT_COLUMNS`.
- Actualizar `mapRow`.
- Agregar función `markReportsStale(auditId: string, tx): Promise<void>` que
  ejecuta `UPDATE audit_report SET stale_since = now() WHERE audit_id = $1 AND stale_since IS NULL`.
- Agregar función `clearReportStale(reportId: string, tx): Promise<void>` que
  ejecuta `UPDATE audit_report SET stale_since = NULL WHERE id = $1` (se llama
  desde `saveDraftsAndFinish` tras nueva generación exitosa — ver §pipeline).

### `src/lib/server/scoring/persist.ts` — `reopenAudit`

Ampliar para:
1. Aceptar `user: AppUser` en lugar de `adminUser: AppUser`.
2. Validar permiso: `admin` O `techIsAssigned(auditId, user.id)` (importar de
   `audit-assignment`). Lanzar `ForbiddenError` si no.
3. En la misma transacción de reapertura, llamar `markReportsStale(auditId, tx)`.

Firma nueva:
```typescript
export async function reopenAudit(auditId: string, user: AppUser): Promise<void>
```

### `src/lib/server/db/audit-status.ts`

Agregar la opción `allowTechReopen` a `isValidAuditStatusTransition`:

```typescript
if (from === 'cerrada' && to === 'en_cierre') {
  return opts?.allowAdminReopen === true || opts?.allowTechReopen === true;
}
```

Nota: `allowAdminReopen` es el flag existente; se mantiene para no romper
callers actuales. Se agrega `allowTechReopen` como alias para dejar la semántica
explícita en el call site de `reopenAudit`.

### `src/lib/server/form/load-form.ts`

Agregar función `loadAuditFormReadonly`:

```typescript
export async function loadAuditFormReadonly(
  auditId: string,
  user: AppUser
): Promise<{
  audit: AuditHeader;
  sections: FormSection[];
  progressPct: number;
  liveIndices: LiveIndices;
  cab: CabState;
}>
```

Lógica: idéntica a `loadAuditForm` PERO reemplaza `assertFormAccess` por
`assertFormReadonlyAccess` (ver abajo). No lanza `AuditFormNotEditableError`
para estado `cerrada`.

Agregar función `assertFormReadonlyAccess`:

```typescript
export async function assertFormReadonlyAccess(
  audit: NonNullable<Awaited<ReturnType<typeof getAuditFormHeader>>>,
  user: AppUser
): Promise<void>
```

Reglas:
- `admin` → siempre permitido.
- `tecnico` → permitido solo si `techAssignedTypes(audit.id, user.id).length > 0`.
- Cualquier otro rol → `AuditFormNotAllowedError`.
- No verifica estado editable (a diferencia de `assertFormAccess`).

### `src/routes/(app)/auditorias/[id]/+page.server.ts`

- Agregar cálculo de `canViewRelevamientoReadonly`:
  - `true` si `audit.status === 'cerrada'` Y (admin O técnico asignado a ≥1 tipo).
  - Requiere importar `techIsAssigned` de `audit-assignment`.
- Agregar cálculo de `canReopenAudit`:
  - `true` si `audit.status === 'cerrada'` Y (admin O técnico asignado).
- Exponer ambos en el return del loader.
- Agregar action `reopenAudit` que llama `reopenAudit(params.id, user)` y
  redirige a `/auditorias/[id]` tras éxito.

### `src/routes/(app)/auditorias/[id]/+page.svelte`

- Sección del detalle (estado `cerrada`): mostrar botón/enlace
  "Ver relevamiento (solo lectura)" que apunta a `form-readonly/` cuando
  `data.canViewRelevamientoReadonly`.
- Sección del detalle (estado `cerrada`): mostrar botón "Reabrir auditoría"
  (form POST a action `?/reopenAudit`) cuando `data.canReopenAudit`.
- Componente `InformeSection`: debe recibir y mostrar el aviso "Este informe
  puede estar desactualizado" cuando `stale_since` no es null en ese informe.
  (Ver §InformeSection abajo.)

### `src/lib/components/informe/informe-section.svelte`

- Prop nueva: `reports` ya lleva los campos serializados; agregar
  `stale_since: string | null` a cada ítem del array.
- Mostrar aviso inline en cada versión de informe con `stale_since !== null`.
  Texto sugerido: "Este informe puede estar desactualizado. La auditoría fue
  reabierta el [fecha]. Considerá regenerar."

### `src/routes/(app)/auditorias/[id]/cierre/+page.server.ts`

- La action `reopenAudit` existente llama `reopenAudit(params.id, user)`.
  Con la firma nueva (acepta `AppUser`), el call funciona sin cambios de
  lógica; solo debe pasar `user` en lugar de `user` (ya lo hace). Verificar
  que el guard interno de `reopenAudit` valide correctamente el rol.
- La redirección post-reapertura desde `/cierre` queda apuntando a
  `/auditorias/[id]/cierre` (comportamiento actual); no se cambia.

### `src/lib/server/informe/pipeline.ts` (menor)

- Tras `saveDraftsAndFinish` exitoso, limpiar `stale_since` de ese report:
  llamar `clearReportStale(report.id)`.

---

## Nuevos errores

No se agregan errores nuevos: se reutilizan `AuditFormNotAllowedError` (403),
`ForbiddenError` (403) y `AuditNotFoundError` (404) ya existentes.

---

## Estructura de rutas nueva

```
src/routes/(app)/auditorias/[id]/
├── form-readonly/
│   ├── +page.server.ts   # loadAuditFormReadonly + guard
│   └── +page.svelte      # render idéntico al form; readonly=true prop
```

La página `+page.svelte` de `form-readonly` puede reusar los componentes de
render del form editable pasando un prop `readonly: true`. Si un componente
interno no soporta `readonly`, se clona mínimamente o se conditiona con `{#if !readonly}`.

---

## Fuera de alcance / Fase posterior

- Edición del relevamiento con la auditoría cerrada (requiere diseño de
  conflictos con scoring ya calculado).
- Inventario editable de equipos IT como entidad independiente.
- Historial de aperturas/cierres de auditoría.
- Notificación automática al técnico al reabrir.
- Limpieza automática de `stale_since` al aprobar un nuevo informe (se limpia
  al generar, no al aprobar; si se requiere diferente, es fase posterior).

---

## Consideraciones de seguridad

- `assertFormReadonlyAccess` valida permisos server-side antes de cualquier
  query de datos.
- La action `reopenAudit` en el detalle valida rol internamente en
  `reopenAudit` (dominio), no solo en el loader; doble guard.
- El técnico solo ve los informes aprobados en el detalle (comportamiento
  preexistente en `+page.server.ts`); la marca `stale_since` se muestra solo
  en lo que ya era visible para él.
