# Tasks — 27_hora_inicio_fin

> Orden de implementación: DB → capa de datos → lógica de negocio → rutas →
> render → tests. Ejecutar `./init.sh` al finalizar.

---

## T1 — Migración SQL idempotente `018_hora_inicio_fin.sql` (R1)

- [x] Crear `migrations/018_hora_inicio_fin.sql` con bloque `DO $$ BEGIN ... END $$`
      que agrega `started_at timestamptz` y `finished_at timestamptz` a `audit`
      usando `IF NOT EXISTS` en `information_schema.columns`.
- [x] Verificar que ejecutar la migración dos veces no produce error.

**Referencia:** diseño §Migración SQL.

---

## T2 — Funciones de sello en `audit-form.ts` (R2, R3, R4, R5, R7)

- [x] Agregar `stampStartedAt(auditId: string): Promise<void>` en
      `src/lib/server/db/audit-form.ts`.
      Query: `UPDATE audit SET started_at = now() WHERE id = $1 AND started_at IS NULL`.
- [x] Agregar `stampFinishedAt(auditId: string): Promise<void>` con mismo patrón
      (`finished_at IS NULL`).
- [x] Exportar ambas funciones.

---

## T3 — Sellado de `started_at` en el `load` del form (R2, R3, R4)

- [x] En `src/routes/(app)/auditorias/[id]/form/+page.server.ts`, importar
      `stampStartedAt` y llamarla dentro de `load` después de que
      `assertFormAccess` haya pasado (el form es editable).
- [x] La llamada NO bloquea el render si falla (envolver en `.catch(() => {})` o
      hacer fire-and-forget solo si es aceptable — decidir: dado que es metadata
      operativa, se recomienda await sin bloquear el redirect de error).

---

## T4 — Sellado de `finished_at` en `completeRelevamiento()` (R5, R6, R7)

- [x] En `src/lib/server/form/complete.ts`, importar `stampFinishedAt` y llamarla
      antes de `setAuditStatus(auditId, 'en_cierre')`.
- [x] La llamada usa el mismo patrón atómico: solo sella si era NULL.
- [x] Verificar que si `header.status === 'en_cierre'` (rama idempotente), se
      retorna sin llamar `stampFinishedAt`.

---

## T5 — Función utilitaria `formatVisita()` en `visita.ts` (R11, R12, R13)

- [x] Crear `src/lib/informe/visita.ts` con:
  - `VisitaDisplay` type
  - `formatVisita(opts: { startedAt: Date | null; finishedAt: Date | null }): VisitaDisplay | null`
  - `formatDuracion(minutos: number): string` — "1h 45m" / "45m"
- [x] Formato fecha: `DD/MM HH:MM` (UTC-3 fijo, `America/Argentina/Buenos_Aires`).
- [x] Retorna `null` cuando `startedAt` es null.
- [x] Cuando `finishedAt` es null, retorna objeto con `finStr: ''` y `duracionMin: 0`.

---

## T6 — Extensión de `UpdateAuditInput` con validación (R8, R9, R10)

- [x] En `src/lib/server/backoffice/schemas.ts`, agregar a `updateAuditSchema`:
  ```typescript
  startedAt: z.string().datetime({ offset: true }).nullable().optional(),
  finishedAt: z.string().datetime({ offset: true }).nullable().optional(),
  ```
  con `.refine()` que rechaza cuando ambos presentes y `finishedAt < startedAt`,
  mensaje: "La hora de fin no puede ser anterior a la de inicio".
- [x] En `updateAudit()` en `src/lib/server/backoffice/audits.ts`:
  - Extender `AuditRow` con `started_at: Date | null` y `finished_at: Date | null`.
  - Extender `AuditDetail` con `startedAt: Date | null` y `finishedAt: Date | null`.
  - Agregar `started_at`, `finished_at` a la query SELECT de `getAuditById`.
  - En el UPDATE de `updateAudit()`, agregar:
    ```sql
    started_at = COALESCE($startedAt, started_at),
    finished_at = COALESCE($finishedAt, finished_at)
    ```
    Permitir `null` explícito para borrar (borrar = pasar `null` como valor).

---

## T7 — Exposición en la ruta de detalle (R11, R12, R13)

- [x] En `src/routes/(app)/auditorias/[id]/+page.server.ts`, exponer
      `startedAt: audit.startedAt?.toISOString() ?? null` y `finishedAt` en el
      objeto retornado por `load`.
- [x] Agregar inputs datetime (o texto readonly + botón de edición) en el form de
      detalle (`/auditorias/[id]`) para `started_at` y `finished_at`, visible solo
      si `isAdmin || audit.assignedTechId === user.id`.
- [x] Agregar la acción de edición o extender la acción `update` existente para
      aceptar `startedAt`/`finishedAt`.

---

## T8 — Bloque "Visita" en la vista de detalle (R11, R12, R13)

- [x] En `src/routes/(app)/auditorias/[id]/+page.svelte`, agregar bloque de visita
      usando `formatVisita({ startedAt, finishedAt })` (importar desde
      `$lib/informe/visita.ts`).
- [x] Mostrar "Visita: DD/MM HH:MM–HH:MM · Xh YYm" cuando ambos presentes.
- [x] Mostrar "Inicio: DD/MM HH:MM" cuando solo `startedAt`.
- [x] Ocultar el bloque cuando ambos son null (R13).

---

## T9 — Extensión de `InformeRenderModel` y `buildInformeRenderModel()` (R14, R15, R16)

- [x] En `src/lib/informe/render-shared.ts`, agregar campo opcional `visita?` a
      `InformeRenderModel`:
      ```typescript
      visita?: { inicio: string; fin: string; duracionMin: number }
      ```
- [x] En `src/lib/server/informe/model.ts`, extender la query o leer de `AuditReportRow`
      para obtener `started_at`/`finished_at` de la tabla `audit` (query directa
      o join al construir el model).
- [x] Llamar `formatVisita()` y poblar `model.visita` cuando existan.
- [x] Si faltan datos, no asignar el campo (undefined = omitido).

---

## T10 — Render del bloque visita en los templates HTML (R14, R15)

- [x] En `src/lib/informe/render-it.ts`, agregar en la portada/cabecera:
      `${model.visita ? `<p class="visita">Visita: ${e(model.visita.inicio)}–${e(model.visita.fin)} · ${e(formatDuracion(model.visita.duracionMin))}</p>` : ''}`.
- [x] Aplicar el mismo cambio en `src/lib/informe/render-erp.ts` y
      `src/lib/informe/web-render.ts`.
- [x] Cuando `model.visita` es undefined, no se genera ningún HTML (R15).

---

## T11 — Tests (R1–R16)

- [x] `tests/hora-inicio-fin.test.ts` — nuevo archivo:
  - **T11.1** Migración idempotente: ejecutar el SQL dos veces no arroja error
    (mock o test de integración con DB de test).
  - **T11.2** `stampStartedAt`: emite UPDATE cuando `startedAt` era NULL;
    NO emite UPDATE cuando ya tenía valor (spy sobre `getSql()`).
  - **T11.3** `stampFinishedAt`: mismo patrón que T11.2.
  - **T11.4** `completeRelevamiento()` con audit en `en_relevamiento`: llama
    `stampFinishedAt` antes de `setAuditStatus`.
  - **T11.5** `completeRelevamiento()` con audit ya en `en_cierre`: no llama
    `stampFinishedAt` (idempotencia).
  - **T11.6** Schema Zod: `updateAuditSchema.safeParse({ finishedAt: '...antes...', startedAt: '...después...' })` → `.success === false`, `.error.errors[0].message` contiene "fin".
  - **T11.7** `formatVisita` — ambos presentes: retorna `VisitaDisplay` con
    strings correctos.
  - **T11.8** `formatVisita` — solo `startedAt`: retorna objeto con `finStr: ''`.
  - **T11.9** `formatVisita` — ambos null: retorna `null`.
  - **T11.10** `formatDuracion(105)` → `"1h 45m"`, `formatDuracion(45)` → `"45m"`,
    `formatDuracion(60)` → `"1h"`.
  - **T11.11** Render IT: snapshot con visita presente contiene texto del rango.
  - **T11.12** Render IT: snapshot sin visita no contiene el string "Visita:".
- [x] Actualizar snapshots existentes si el render IT/ERP cambia por la adición
      del bloque visita (cuando `visita` es undefined, no debe cambiar ningún
      snapshot existente).

---

## T12 — Cierre y verificación

- [x] Ejecutar `pnpm test` — todos los tests verdes.
- [x] Ejecutar `pnpm run check` — sin errores de tipos.
- [x] Ejecutar `./init.sh` — 100%.
- [x] Marcar cada tarea como `[x]` en este archivo.
