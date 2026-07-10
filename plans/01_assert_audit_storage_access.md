# Plan 01: Cerrar IDOR de storage — ownership en adjuntos

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 6307b6d..HEAD -- src/lib/server/storage/ src/lib/server/form/load-form.ts src/lib/server/db/audit-assignment.ts src/routes/api/audits/[auditId]/attachments/ src/routes/api/attachments/ tests/api/attachments-presign.test.ts tests/api/attachments-delete.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P0
- **Effort**: M
- **Risk**: MED (cambia quién puede subir/borrar/descargar fotos; tests de adjuntos deben actualizarse)
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `6307b6d`, 2026-07-10

## Why this matters

Cualquier usuario `admin` o `tecnico` autenticado puede llamar a los endpoints de adjuntos de **cualquier** auditoría: `getAuditForStorage` solo verifica que el `auditId` exista y (en mutaciones) que el status sea editable. No consulta `audit_assignment` ni `assigned_tech_id`. Eso es IDOR: un técnico no asignado puede obtener URLs firmadas de subida/descarga, confirmar objetos en R2 y borrar fotos de auditorías ajenas. El form de relevamiento ya exige asignación (`assertFormAccess`); storage debe alinearse.

## Current state

Archivos relevantes:

- `src/lib/server/storage/attachments.ts` — dominio de adjuntos; `getAuditForStorage` sin ownership.
- `src/lib/server/storage/errors.ts` — errores de dominio storage (falta Forbidden).
- `src/lib/server/storage/index.ts` — re-exports públicos del módulo.
- `src/lib/server/form/load-form.ts` — **patrón a copiar**: `assertFormAccess` usa `techAssignedTypes` / admin bypass.
- `src/lib/server/db/audit-assignment.ts` — `techIsAssigned`, `techAssignedTypes`.
- Endpoints (solo `requireStaffApi`, sin ownership):
  - `src/routes/api/audits/[auditId]/attachments/presign-put/+server.ts`
  - `src/routes/api/audits/[auditId]/attachments/confirm/+server.ts`
  - `src/routes/api/audits/[auditId]/attachments/server-put/+server.ts`
  - `src/routes/api/audits/[auditId]/attachments/[attachmentId]/+server.ts` (DELETE)
  - `src/routes/api/attachments/[attachmentId]/presign-get/+server.ts` (GET)
- Tests patrón: `tests/api/attachments-presign.test.ts`, `tests/api/attachments-delete.test.ts`
- Helper: `tests/helpers/backoffice.ts` → `insertTestAuditRow({ assignedTechEmail })`

Excerpt actual de `getAuditForStorage` (sin user):

```24:33:src/lib/server/storage/attachments.ts
async function getAuditForStorage(auditId: string): Promise<{ id: string; status: AuditStatus }> {
  const sql = getSql();
  const [row] = await sql<{ id: string; status: AuditStatus }[]>`
    SELECT id, status FROM audit WHERE id = ${auditId} LIMIT 1
  `;
  if (!row) {
    throw new AuditNotFoundError();
  }
  return row;
}
```

Patrón de autorización del form (copiar semántica):

```126:142:src/lib/server/form/load-form.ts
export async function assertFormAccess(
  audit: NonNullable<Awaited<ReturnType<typeof getAuditFormHeader>>>,
  user: AppUser
): Promise<void> {
  if (user.role !== 'admin' && user.role !== 'tecnico') {
    throw new AuditFormNotAllowedError();
  }
  if (user.role === 'tecnico') {
    const assigned = await techAssignedTypes(audit.id, user.id);
    if (assigned.length === 0) {
      throw new AuditFormNotAllowedError();
    }
  }
  if (!FORM_EDITABLE_STATUSES.includes(audit.status)) {
    throw new AuditFormNotEditableError();
  }
}
```

Convenciones:

- Errores de dominio tipados + mapeo a HTTP en `+server.ts` (404/400/409/403). Ver `src/routes/api/audits/[auditId]/responses/+server.ts` (mapea `AuditFormNotAllowedError` → 403).
- SQL parametrizado con postgres.js tagged templates.
- Tests de API: vitest + `setupTestDb` / `insertTestAuditRow` / `requireStaffApi` vía `locals`.
- Mensajes de commit observados: `fix(scope): …` / `feat(scope): …` (español o inglés corto).

## Commands you will need

| Purpose   | Command | Expected on success |
|-----------|---------|---------------------|
| Tests adjuntos | `pnpm test -- tests/api/attachments-presign.test.ts tests/api/attachments-delete.test.ts` | exit 0 |
| Suite storage/form related | `pnpm test -- tests/storage-r2.test.ts tests/form-attachment-delete.test.ts` | exit 0 |
| Typecheck | `pnpm run check` | exit 0 |
| Gate arnés (subset) | `pnpm test` | exit 0 |

## Scope

**In scope** (únicos archivos a modificar / crear):

- `src/lib/server/storage/attachments.ts`
- `src/lib/server/storage/errors.ts`
- `src/lib/server/storage/index.ts`
- `src/routes/api/audits/[auditId]/attachments/presign-put/+server.ts`
- `src/routes/api/audits/[auditId]/attachments/confirm/+server.ts`
- `src/routes/api/audits/[auditId]/attachments/server-put/+server.ts`
- `src/routes/api/audits/[auditId]/attachments/[attachmentId]/+server.ts`
- `src/routes/api/attachments/[attachmentId]/presign-get/+server.ts`
- `tests/api/attachments-presign.test.ts`
- `tests/api/attachments-delete.test.ts`
- (opcional) `tests/api/attachments-access.test.ts` si preferís no inflar los existentes

**Out of scope**:

- `src/lib/server/form/**` — no refactorizar `assertFormAccess`; solo reutilizar el patrón.
- Endpoints de reunión (`.../reunion/.../presign-put`) — otro dominio; no mezclar.
- Cambios de schema / migraciones.
- UI Svelte de cámara/adjuntos.
- Plan 02 (backoffice mutations) y plan 03 (manual/encuesta).

## Git workflow

- Branch: `fix/storage-audit-access` (o `advisor/01-assert-audit-storage-access`)
- Commits estilo repo: `fix(storage): exigir asignación en adjuntos`
- Do NOT push ni abrir PR salvo que el operador lo pida.

## Steps

### Step 1: Error Forbidden en storage

En `src/lib/server/storage/errors.ts`, agregar:

```ts
export class StorageForbiddenError extends Error {
  readonly code = 'STORAGE_FORBIDDEN';
  constructor(message = 'No tenés permiso para esta auditoría') {
    super(message);
    this.name = 'StorageForbiddenError';
  }
}
```

Re-exportar desde `src/lib/server/storage/index.ts`.

**Verify**: `rg -n "StorageForbiddenError" src/lib/server/storage/` → aparece en `errors.ts` e `index.ts`.

### Step 2: Helper de ownership en `attachments.ts`

1. Importar `AppUser` desde `$lib/server/auth/types` y `techIsAssigned` (o `techAssignedTypes`) desde `$lib/server/db/audit-assignment`.
2. Agregar función interna (o exportada si los tests unitarios la necesitan):

```ts
async function assertStorageAccess(auditId: string, user: AppUser): Promise<void> {
  if (user.role === 'admin') return;
  if (user.role !== 'tecnico') {
    throw new StorageForbiddenError();
  }
  const assigned = await techIsAssigned(auditId, user.id);
  if (!assigned) {
    throw new StorageForbiddenError();
  }
}
```

Semántica: **admin** siempre; **tecnico** solo si tiene ≥1 fila en `audit_assignment` para esa auditoría (igual que form / reopen / briefing-email). No usar solo `assigned_tech_id` líder: las auditorías multi-tipo asignan por área.

3. Extender las firmas públicas para recibir `user: AppUser` (o al menos lo necesario para el check) y llamar `assertStorageAccess` **después** de `getAuditForStorage` / resolución del attachment, **antes** de presign/confirm/delete/upload:

| Función | Dónde insertar el check |
|---------|-------------------------|
| `requestPresignedUpload` | tras `getAuditForStorage`, antes de `assertAuditEditable` |
| `confirmUpload` | igual |
| `requestPresignedDownload` | tras resolver attachment + `getAuditForStorage(attachment.audit_id)` |
| `deleteAttachment` | tras `getAuditForStorage` |
| `uploadObjectToR2` | al inicio (hoy **no** llama `getAuditForStorage`; agregar check de ownership + opcional existencia de audit). El endpoint `server-put` debe pasar `user`. |

4. Actualizar callers en los 5 `+server.ts` para pasar `userOrResponse` (el `AppUser` ya obtenido de `requireStaffApi`) a las funciones de dominio.

5. Mapear `StorageForbiddenError` → `apiError(..., 403)` en cada handler (mismo estilo que `AuditFormNotAllowedError` en responses).

**Verify**:
```bash
rg -n "assertStorageAccess|StorageForbiddenError" src/lib/server/storage src/routes/api/audits src/routes/api/attachments
```
→ matches en attachments.ts + los 5 handlers.

### Step 3: Tests de regresión IDOR

En `tests/api/attachments-presign.test.ts` (y delete), agregar casos:

1. **Técnico asignado** (default de `insertTestAuditRow` → `facu@...`) puede `presign-put` / `confirm` / `presign-get` / `DELETE` → 200 (comportamiento actual feliz).
2. **Técnico NO asignado**: crear segunda auditoría asignada a Facu; autenticar como otro técnico del seed (buscar email distinto en seed, p.ej. otro `@serviciosysistemas.com.ar` vía `findUserIdByEmail` / listado `app_user`). Llamar `presign-put` y `presign-get` con `locals` de ese técnico → **403**.
3. **Admin** sobre auditoría ajena → sigue **200**.

Si el seed solo tiene un técnico usable, crear un segundo `app_user` role `tecnico` en el `beforeEach` del test (INSERT mínimo) y no asignarlo a la auditoría.

Modelo estructural: el describe existente en `attachments-presign.test.ts` (mock aws4fetch + `setupTestDb`).

**Verify**:
```bash
pnpm test -- tests/api/attachments-presign.test.ts tests/api/attachments-delete.test.ts
```
→ exit 0; los nuevos casos de 403 pasan.

### Step 4: Gates finales

```bash
pnpm run check
pnpm test
```

**Verify**: ambos exit 0. `git status` solo muestra archivos in-scope (+ `plans/README.md` status).

## Test plan

- Happy path staff asignado / admin: sin regresión (tests existentes).
- Negativo: técnico sin `audit_assignment` → 403 en presign-put, confirm, server-put, DELETE, presign-get.
- Positivo: admin no asignado → 200.
- No inventar e2e Playwright en este plan.

## Done criteria

- [ ] `getAuditForStorage` / flujos de storage invocan ownership vía `techIsAssigned` (o equivalente) para `tecnico`.
- [ ] Los 5 endpoints listados mapean forbidden → HTTP 403.
- [ ] `pnpm test -- tests/api/attachments-presign.test.ts tests/api/attachments-delete.test.ts` exit 0 con casos IDOR nuevos.
- [ ] `pnpm run check` exit 0.
- [ ] `pnpm test` exit 0.
- [ ] Ningún archivo fuera de Scope modificado.
- [ ] Fila 01 en `plans/README.md` → DONE.

## STOP conditions

- El seed de tests no tiene un segundo técnico y no podés crear uno sin tocar migraciones/seed globales de forma invasiva → STOP y reportar; no soft-fail el test.
- Descubrís que `server-put` o `presign-get` ya tienen ownership en HEAD distinto al excerpt → STOP, re-leer y reportar drift.
- El fix parece requerir cambiar `assertFormAccess` o el schema de `audit_assignment` → STOP (out of scope).
- Un test de reunión/presign-put falla por un cambio colateral → STOP; no “arreglar” reunión en este plan.

## Maintenance notes

- Cualquier nuevo endpoint de storage bajo `/api/audits/[auditId]/attachments/*` debe llamar al mismo helper.
- Reviewer: verificar que **no** se use solo `assigned_tech_id` (rompe multi-tipo #32).
- Follow-up posible: unificar `assertStorageAccess` / `assertFormAccess` en un helper compartido `assertAuditAssigned` — **no** hacerlo en este plan.
