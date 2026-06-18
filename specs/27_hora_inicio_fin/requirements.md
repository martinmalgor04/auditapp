# Requirements — 27_hora_inicio_fin

> Registrar la hora real de inicio y fin del relevamiento en campo. `started_at` se
> sella automáticamente al abrir el form por primera vez; `finished_at` al marcar
> "Relevamiento completo". Ambas editables con guard de permisos y validación
> `fin >= inicio`. Se muestran en el detalle y en el informe.

## Contexto verificado (código real)

- La tabla `audit` vive en `migrations/001_schema.sql`. Hoy tiene `scheduled_at
  timestamptz` (fecha programada) y `closed_at timestamptz` (sello de cierre
  definitivo en `confirmClosure`). No existe `started_at` ni `finished_at`.
- La migración más reciente es `017_empresa_deprecacion.sql`; la nueva será
  `018_hora_inicio_fin.sql`.
- **Inicio del relevamiento:** `loadAuditForm()` en
  `src/lib/server/form/load-form.ts` es invocado por `load` en
  `src/routes/(app)/auditorias/[id]/form/+page.server.ts`. Es el punto de entrada
  del técnico al form. No hay acción explícita de "abrir": la primera vez que `load`
  se ejecuta, el status puede ser `briefing_completo`, `en_relevamiento` o
  `en_cierre` (según `FORM_EDITABLE_STATUSES`).
- **Fin del relevamiento:** `completeRelevamiento()` en
  `src/lib/server/form/complete.ts` llama a `setAuditStatus(auditId, 'en_cierre')`.
  Es el único camino a `en_cierre` desde el form (acción `?/complete`).
- **Edición manual:** `updateAudit()` en
  `src/lib/server/backoffice/audits.ts` maneja el form de detalle
  (`/auditorias/[id]`); sus inputs provienen de `UpdateAuditInput` (schema Zod en
  `src/lib/server/backoffice/schemas.ts`).
- **Guards de rol:** `requireStaff(locals)` en ambas rutas exige `admin` o
  `tecnico`; guard de scope `auditMatchesUserScope` aplica en `load-form.ts`.
- **Informe:** `InformeRenderModel` en `src/lib/informe/render-shared.ts` no tiene
  hoy campo de visita/duración. El model se construye en
  `src/lib/server/informe/model.ts` y consume el `CanonicalAudit` JSON (schema en
  `src/lib/server/canonical/schema.ts`). Las columnas `started_at`/`finished_at` no
  forman parte del snapshot canónico; se leen directamente de la tabla `audit` al
  construir el model de render.
- **Tests de referencia:** `tests/audit-status.test.ts`,
  `tests/audits-create.test.ts` usan vitest y mocks de `getSql()`.

---

## Requirements (EARS)

### Migración de base de datos

**R1** — El sistema DEBE agregar las columnas `started_at timestamptz NULL` y
`finished_at timestamptz NULL` a la tabla `audit` mediante una migración SQL
idempotente que NO falle si las columnas ya existen.

### Sellado automático de `started_at`

**R2** — CUANDO el técnico (o admin) abre el form de relevamiento
(`GET /auditorias/[id]/form`) por primera vez y `audit.started_at` es `NULL`, el
sistema DEBE sellar `started_at = now()` en la tabla `audit` sin solicitarlo
manualmente al usuario.

**R3** — CUANDO `audit.started_at` ya tiene un valor (no es `NULL`), el sistema NO
DEBE sobreescribirlo al abrir el form nuevamente.

**R4** — El sellado de `started_at` DEBE ocurrir en el `load` de
`+page.server.ts` del form, de forma atómica con un `UPDATE ... WHERE started_at IS
NULL` para evitar race conditions.

### Sellado automático de `finished_at`

**R5** — CUANDO el técnico marca "Relevamiento completo" (`action ?/complete`),
el sistema DEBE sellar `finished_at = now()` en la tabla `audit` si aún es `NULL`,
como parte de la misma operación que transiciona el status a `en_cierre`.

**R6** — CUANDO la auditoría se reabre desde `en_cierre` o `cerrada` hacia
`en_cierre` (acción `reopenAudit`), el sistema NO DEBE modificar `finished_at`;
solo se modifica si el admin/técnico lo edita explícitamente.

**R7** — Si `completeRelevamiento()` se llama sobre una auditoría que ya está en
`en_cierre` (idempotencia), el sistema NO DEBE sobreescribir `finished_at`.

### Edición manual

**R8** — El sistema DEBE permitir que un usuario con rol `admin` o `tecnico`
(asignado a la auditoría) edite `started_at` y `finished_at` mediante un input
datetime en el form de detalle de la auditoría (`/auditorias/[id]`).

**R9** — CUANDO se envía una edición manual con `finished_at < started_at` (o
`finished_at < started_at` después de resolución de zonas horarias), el sistema
DEBE rechazarla con un mensaje de error claro ("La hora de fin no puede ser anterior
a la de inicio") y NO DEBE persistir los valores inválidos.

**R10** — SOLO SI el usuario tiene rol `admin` o es el técnico asignado a la
auditoría, el sistema DEBE permitir la edición manual de `started_at` y
`finished_at`; cualquier otro rol DEBE recibir error 403.

### Display en el detalle de la auditoría

**R11** — CUANDO ambos `started_at` y `finished_at` están presentes, el detalle de
la auditoría (`/auditorias/[id]`) DEBE mostrar el rango y la duración calculada en
formato "Visita: DD/MM HH:MM–HH:MM · Xh YYm" (o "· Xm" si < 1 hora).

**R12** — CUANDO solo `started_at` está presente (y `finished_at` es `NULL`), el
detalle DEBE mostrar "Inicio: DD/MM HH:MM" sin duración ni hora de fin.

**R13** — CUANDO ambas columnas son `NULL`, el detalle NO DEBE mostrar ningún bloque
de visita (degradación limpia, sin placeholder ni guiones vacíos visibles).

### Display en el informe

**R14** — CUANDO ambos `started_at` y `finished_at` están presentes, el informe
(render A4 y web) DEBE mostrar el rango y la duración en la portada/cabecera en
el mismo formato que R11.

**R15** — CUANDO falta `started_at` o `finished_at` (o ambos), el informe DEBE
omitir el bloque de visita sin generar error de render ni placeholder visible.

**R16** — El campo `visita` (objeto con `inicio`, `fin`, `duracionMin`) DEBE
agregarse a `InformeRenderModel` como opcional (`visita?: { inicio: string; fin:
string; duracionMin: number }`) y al `load` del informe en
`src/lib/server/informe/model.ts`.

---

## Trazabilidad R ↔ verificación

| R   | Verificación (test / grep)                                                                                      |
|-----|------------------------------------------------------------------------------------------------------------------|
| R1  | test: ejecutar la migración 2 veces no arroja error (idempotencia)                                              |
| R2  | test unitario: `stampStartedAt(auditId)` → llama UPDATE WHERE started_at IS NULL cuando started_at era NULL     |
| R3  | test unitario: `stampStartedAt(auditId)` no emite UPDATE cuando started_at ya tiene valor                       |
| R4  | grep: `UPDATE audit SET started_at = now() WHERE id = ... AND started_at IS NULL` (atomicidad via SQL guard)    |
| R5  | test unitario: `completeRelevamiento()` sella finished_at = now() cuando era NULL                               |
| R6  | test unitario: `reopenAudit()` no modifica finished_at                                                          |
| R7  | test unitario: `completeRelevamiento()` con audit ya en `en_cierre` no sobreescribe finished_at                 |
| R8  | test de integración: PATCH `/auditorias/[id]` con started_at/finished_at válidos persiste los valores           |
| R9  | test: schema Zod rechaza finished_at < started_at con mensaje claro                                             |
| R10 | test: usuario sin permisos (no admin ni técnico asignado) recibe 403 al editar fechas                           |
| R11 | test unitario: `formatVisita({ started_at, finished_at })` → string esperado cuando ambos presentes             |
| R12 | test unitario: `formatVisita({ started_at, finished_at: null })` → string "Inicio: ..."                        |
| R13 | test unitario: `formatVisita({ started_at: null, finished_at: null })` → null                                   |
| R14 | snapshot test del render HTML del informe: contiene el bloque de visita cuando ambos presentes                   |
| R15 | snapshot test del render HTML: ausencia del bloque visita cuando faltan campos                                   |
| R16 | grep: `visita` presente en definición de `InformeRenderModel`; campo opcional (`?`)                             |

---

## Open questions

Ninguna. Todos los criterios de acceptance están cubiertos por los requirements y
son verificables con tests concretos.
