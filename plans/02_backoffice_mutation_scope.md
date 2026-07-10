# Plan 02: Acotar mutaciones de backoffice (update / archive / briefing)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 6307b6d..HEAD -- src/routes/(app)/auditorias/[id]/+page.server.ts src/routes/(app)/auditorias/[id]/+page.svelte src/lib/server/backoffice/audits.ts src/lib/server/backoffice/briefing-link.ts src/lib/server/backoffice/briefing-email.ts src/lib/server/auth/guards.ts tests/api/backoffice-routes.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P0
- **Effort**: M
- **Risk**: MED (cambia quién puede archivar y regenerar tokens; hay un test que hoy afirma que el técnico puede archivar)
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `6307b6d`, 2026-07-10

## Why this matters

En la página de detalle de auditoría, varias actions de mutación solo llaman `requireStaff` (admin **o** técnico). Consecuencias:

1. **`update`**: `updateAudit` no recibe el `viewer` / no valida asignación. Cualquier técnico puede cambiar segmento, técnico asignado, fechas y CAB de una auditoría ajena (el `load` sí filtra por scope de tipos vía `getAuditById(id, user)`, pero la action no revalida ownership).
2. **`archive`**: el parámetro se llama `adminId` pero la action usa `requireStaff`; un técnico puede archivar. La UI oculta el botón a no-admins (`{#if data.isAdmin}`), pero el POST directo bypassa la UI. `ADMIN_ONLY_ACTIONS` en guards **no** incluye `archive` hoy.
3. **`generateBriefingLink` / `regenerateBriefingLink` / `completarBriefingInternamente`**: solo `requireStaff`, sin `techIsAssigned`. Contraste: `sendBriefingEmail` **sí** exige admin o asignado.

Hay que alinear server-side con la intención de la UI y con el patrón de `sendBriefingEmail` / `reopenAudit`.

## Current state

- `src/routes/(app)/auditorias/[id]/+page.server.ts` — load + actions.
- `src/routes/(app)/auditorias/[id]/+page.svelte` — UI: archive solo si `isAdmin`; briefing links visibles a staff.
- `src/lib/server/backoffice/audits.ts` — `updateAudit(auditId, input, userId)` sin check de rol/asignación; `archiveAudit(auditId, adminId)` ignora el id (`void adminId`).
- `src/lib/server/backoffice/briefing-link.ts` — generate/regenerate sin user.
- `src/lib/server/backoffice/briefing-email.ts` — **exemplar** de guard correcto (admin || `techIsAssigned`).
- `src/lib/server/auth/guards.ts` — `requireAdmin`, `requireStaff`, `ADMIN_ONLY_ACTIONS`.
- `src/lib/server/db/audit-assignment.ts` — `techIsAssigned`.
- `src/lib/server/backoffice/errors.ts` — `ForbiddenError` (status 403) ya usado por briefing-email.
- Test a **invertir**: `tests/api/backoffice-routes.test.ts` caso `'tecnico can archive audits'` (líneas ~77–95) hoy espera redirect exitoso.

Excerpt actions problemáticas:

```133:196:src/routes/(app)/auditorias/[id]/+page.server.ts
  update: async ({ request, locals, params }) => {
    const user = requireStaff(locals);
    // ...
      await updateAudit(params.id, { ... }, user.id);
  },
  archive: async ({ locals, params }) => {
    try {
      const user = requireStaff(locals);
      await archiveAudit(params.id, user.id);
      redirect(303, '/tablero');
  // ...
  generateBriefingLink: async ({ locals, params }) => {
    requireStaff(locals);
    // ... generateBriefingLink(params.id) — sin user
  },
  regenerateBriefingLink: async ({ locals, params }) => {
    requireStaff(locals);
    // ...
  },
```

Exemplar correcto en email:

```90:96:src/lib/server/backoffice/briefing-email.ts
  if (user.role !== 'admin') {
    const assigned = await techIsAssigned(auditId, user.id);
    if (!assigned) {
      throw new ForbiddenError('Solo el admin o el técnico asignado puede enviar el briefing por email');
    }
  }
```

UI archive (solo admin):

```250:257:src/routes/(app)/auditorias/[id]/+page.svelte
  {#if data.isAdmin}
  ...
  {#if !data.audit.archivedAt}
  ...
      action="?/archive"
```

Política objetivo (explícita para el executor — no improvisar otra):

| Action | Quién puede |
|--------|-------------|
| `archive` | **solo admin** (`requireAdmin`) |
| `update` | admin **o** técnico con `techIsAssigned(auditId, user.id)` |
| `generateBriefingLink` | admin **o** técnico asignado |
| `regenerateBriefingLink` | admin **o** técnico asignado |
| `completarBriefingInternamente` | admin **o** técnico asignado |
| `enviarBriefingEmail` / `reopenAudit` | ya correctos — **no tocar** salvo que el drift check muestre lo contrario |

Nota: `canEditVisita` en el load usa `assignedTechId === user.id` (líder). Para mutaciones de este plan usar **`techIsAssigned`** (multi-tipo), coherente con email/reopen/form.

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Tests backoffice routes | `pnpm test -- tests/api/backoffice-routes.test.ts` | exit 0 |
| Tests briefing relacionados | `pnpm test -- tests/backoffice/completar-briefing-internamente.test.ts tests/envio-briefing-email-schema.test.ts` | exit 0 (o skip si no tocan paths) |
| Typecheck | `pnpm run check` | exit 0 |
| Suite | `pnpm test` | exit 0 |

## Scope

**In scope**:

- `src/routes/(app)/auditorias/[id]/+page.server.ts`
- `src/lib/server/backoffice/audits.ts` (opcional: pasar `AppUser` a `updateAudit` / `archiveAudit` y centralizar el guard ahí — preferible para que no dependa solo de la route)
- `src/lib/server/backoffice/briefing-link.ts` (pasar `user` a generate/regenerate/completar **o** validar en la action antes de llamar; preferí validar en action + opcionalmente en dominio)
- `src/lib/server/auth/guards.ts` — agregar `'archive_audit'` a `ADMIN_ONLY_ACTIONS` si encaja; usar `requireAdmin` en archive
- `tests/api/backoffice-routes.test.ts`
- (recomendado) nuevos casos en el mismo archivo o `tests/api/backoffice-audit-mutations.test.ts` para update/briefing 403

**Out of scope**:

- Storage IDOR (plan 01).
- Manual/encuesta/CSP (plan 03).
- Cambiar `getAuditById` scope por tipos (`auditMatchesUserScope`) — ya existe para load.
- Refactor grande de `updateAudit` (tipos/templates) más allá del guard.
- UI Svelte salvo que un botón de briefing quede inconsistente; si la UI ya muestra generate a todo staff, **dejar UI** y endurecer solo server (defense in depth). No rediseñar la página.

## Git workflow

- Branch: `fix/backoffice-mutation-scope`
- Commit: `fix(backoffice): acotar update/archive/briefing a admin o asignado`
- No push/PR sin pedido explícito.

## Steps

### Step 1: Helper local o de dominio para “admin o asignado”

Opción A (mínima, preferida si querés menos churn): en `+page.server.ts`:

```ts
import { requireAdmin, requireStaff } from '$lib/server/auth/guards';
import { techIsAssigned } from '$lib/server/db/audit-assignment';
import { ForbiddenError } from '$lib/server/backoffice/errors';

async function assertAdminOrAssigned(auditId: string, user: AppUser): Promise<void> {
  if (user.role === 'admin') return;
  if (!(await techIsAssigned(auditId, user.id))) {
    throw new ForbiddenError('No tenés permiso para modificar esta auditoría');
  }
}
```

Opción B: mover el mismo helper a `src/lib/server/backoffice/audits.ts` y llamarlo desde `updateAudit` / actions.

**Verify**: el helper compila; `pnpm run check` aún puede fallar hasta cablear callers — al menos el símbolo existe (`rg assertAdminOrAssigned`).

### Step 2: `archive` → admin only

1. En action `archive`: reemplazar `requireStaff` por `requireAdmin(locals)`.
2. Opcional: `assertAdminOnly(locals, 'archive_audit')` tras agregar `'archive_audit'` a `ADMIN_ONLY_ACTIONS` en `guards.ts`.
3. Invertir test en `tests/api/backoffice-routes.test.ts`:
   - Renombrar `'tecnico can archive audits'` → `'tecnico cannot archive audits'`.
   - Esperar `fail` / status 403 (vía `failFromError` + `AuthError`/`ForbiddenError`), **no** redirect.
   - Mantener `'admin can archive audits'` con redirect 303.

**Verify**:
```bash
pnpm test -- tests/api/backoffice-routes.test.ts
```
→ el caso técnico falla el archive (403); admin sigue OK.

### Step 3: `update` → admin o asignado

1. Tras `requireStaff`, llamar `await assertAdminOrAssigned(params.id, user)` antes de `updateAudit`.
2. Preferible también: al inicio de `updateAudit`, aceptar `user: AppUser` y repetir el check (defense in depth). Si cambiás la firma, actualizar **todos** los callers de `updateAudit` (buscar con `rg`).

**Verify**:
```bash
rg -n "updateAudit\(" src tests
```
→ todos los call sites pasan el user / el guard está en la action como mínimo.

Agregar test: técnico **no** asignado hace `actions.update` → 403; técnico asignado (Facu + `insertTestAuditRow`) → success.

### Step 4: Briefing generate / regenerate / completar

1. En cada action: `const user = requireStaff(locals); await assertAdminOrAssigned(params.id, user);` luego la llamada existente.
2. No cambiar la semántica de tokens/estados en `briefing-link.ts` salvo pasar `user` si movés el guard al dominio.

**Verify**: tests nuevos o extendidos:
- Técnico no asignado → `generateBriefingLink` / `regenerateBriefingLink` → 403.
- Admin o asignado → sigue OK (reusar fixtures de `completar-briefing-internamente.test.ts` si aplica).

### Step 5: Gates

```bash
pnpm run check
pnpm test
```

## Test plan

| Caso | Esperado |
|------|----------|
| Técnico archiva | 403 (antes: redirect) |
| Admin archiva | 303 → `/tablero` |
| Técnico no asignado `update` | 403 |
| Técnico asignado `update` | success |
| Técnico no asignado `generateBriefingLink` | 403 |
| Admin `generateBriefingLink` | success (si estado lo permite) |
| `enviarBriefingEmail` / `reopenAudit` | sin regresión |

Patrón: `tests/api/backoffice-routes.test.ts` (actions importadas, `insertTestAuditRow`, `findUserIdByEmail`).

## Done criteria

- [ ] `archive` solo con `requireAdmin` (o `assertAdminOnly`).
- [ ] `update`, `generateBriefingLink`, `regenerateBriefingLink`, `completarBriefingInternamente` exigen admin o `techIsAssigned`.
- [ ] Test `'tecnico can archive audits'` eliminado/invertido; nuevos negativos 403 verdes.
- [ ] `pnpm test -- tests/api/backoffice-routes.test.ts` exit 0.
- [ ] `pnpm run check` y `pnpm test` exit 0.
- [ ] Scope respetado; fila 02 en `plans/README.md` → DONE.

## STOP conditions

- Producto decide que **cualquier** técnico debe poder archivar (contradice UI `isAdmin`) → STOP y preguntar al operador; no “arreglar” la UI para permitir archive a técnicos.
- `updateAudit` tiene más callers de los esperados (API externa) y el cambio de firma rompe módulos out-of-scope → preferí guard solo en la action y reportar.
- Drift: `sendBriefingEmail` ya no tiene el guard → STOP, re-auditar.

## Maintenance notes

- Reviewer: confirmar que multi-tipo usa `techIsAssigned`, no solo `assignedTechId`.
- Si más adelante se agrega API REST para update/archive, reutilizar el mismo helper de dominio.
- `ADMIN_ONLY_ACTIONS` documenta la lista; mantenerla sincronizada con `archive`.
