# Sesión — Cierre verificación #56 / #57 / #58 (2026-07-10)

## Estado

Features **#56, #57, #58** marcadas `done` tras implementación previa + verificación.

| # | Name | Status |
|---|---|---|
| 56 | `56_storage_audit_access` | `done` |
| 57 | `57_backoffice_mutation_scope` | `done` |
| 58 | `58_manual_informe_encuesta_csp` | `done` |

Planes `plans/01–03` → DONE. Plan 04 y docs onboarding **no tocados**.

## Verificación

### Vitest focalizado (17/17 verdes)

```
pnpm exec vitest run \
  tests/api/attachments-presign.test.ts \
  tests/api/backoffice-routes.test.ts \
  tests/form-photo-upload.test.ts \
  tests/informe-manual-survey-inject.test.ts \
  tests/informe-manual-insert.test.ts
```

### Playwright (2/2 verdes)

- Instalé Chromium: `pnpm exec playwright install chromium`
- DB up + seed (`DATABASE_URL=postgres://auditapp:changeme@localhost:5432/auditapp`)
- `e2e/security-authz-56-57.spec.ts` + `e2e/smoke.spec.ts` OK

### Fix UI durante e2e (#57)

El botón «Archivar auditoría» en `auditorias/[id]/+page.svelte` no estaba
gated por `data.isAdmin` (solo el server action usaba `requireAdmin`).
Corregido: `{#if data.isAdmin && !data.audit.archivedAt}`. Tras el fix, el
técnico no ve Archivar; admin sí.

## Tasks

Todos los `[x]` en:
- `specs/56_storage_audit_access/tasks.md`
- `specs/57_backoffice_mutation_scope/tasks.md`
- `specs/58_manual_informe_encuesta_csp/tasks.md`

## Pendiente / no hecho

- Commit + push (no pedido en esta sesión)
- `./init.sh` suite completa no re-corrida acá (solo focalizados + e2e)
- Plan 04 / docs onboarding diferidos
