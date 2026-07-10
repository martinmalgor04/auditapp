# Design — #57 57_backoffice_mutation_scope

## Alcance

Alinear mutaciones del detalle de auditoría con la intención de la UI y con
`sendBriefingEmail`.

| Action | Quién puede |
|---|---|
| `archive` | solo admin |
| `update` | admin o `techIsAssigned` |
| `generateBriefingLink` / `regenerate` / `completarBriefingInternamente` | admin o asignado |
| `enviarBriefingEmail` / `reopenAudit` | sin cambio (ya OK) |

## Dependencias

| Feature | Contrato |
|---|---|
| #4 backoffice | actions detalle, `ForbiddenError` |
| #32 assignment | `techIsAssigned` |
| #34 / #52 briefing | `briefing-link.ts`, email |

## Arquitectura

```
actions.update:
  user = requireStaff(locals)
  await assertAdminOrAssigned(params.id, user)   // NEW
  await updateAudit(...)

actions.archive:
  user = requireAdmin(locals)                    // NEW (antes requireStaff)
  await archiveAudit(...)

actions.generateBriefingLink | regenerate | completar:
  user = requireStaff(locals)
  await assertAdminOrAssigned(params.id, user)   // NEW
  await generateBriefingLink|... (params.id)
```

**Helper preferido** (mínimo churn):

```ts
async function assertAdminOrAssigned(auditId: string, user: AppUser): Promise<void> {
  if (user.role === 'admin') return;
  if (!(await techIsAssigned(auditId, user.id))) {
    throw new ForbiddenError('No tenés permiso para modificar esta auditoría');
  }
}
```

Opcional defense-in-depth: repetir el check al inicio de `updateAudit` pasando
`AppUser` (actualizar todos los callers vía `rg`).

**Alternativa descartada:** confiar solo en ocultar botones en Svelte — el POST
directo bypassa la UI (S5 confirmado).

**Alternativa descartada:** usar solo `assignedTechId` — rompe multi-tipo (#32).

## Archivos

| Archivo | Cambio |
|---|---|
| `src/routes/(app)/auditorias/[id]/+page.server.ts` | guards en actions |
| `src/lib/server/backoffice/audits.ts` | opcional: guard en `updateAudit` |
| `src/lib/server/auth/guards.ts` | opcional: `'archive_audit'` en `ADMIN_ONLY_ACTIONS` |
| `tests/api/backoffice-routes.test.ts` | invertir archive; nuevos 403 |

## Tests

| Caso | Esperado |
|---|---|
| Técnico archiva | 403 |
| Admin archiva | 303 → `/tablero` |
| Técnico no asignado `update` | 403 |
| Técnico asignado `update` | success |
| Técnico no asignado `generateBriefingLink` | 403 |
| Admin generate (estado válido) | success |
| `enviarBriefingEmail` / `reopenAudit` | sin regresión |

## Gates

`pnpm test -- tests/api/backoffice-routes.test.ts`
`pnpm run check` · `pnpm test`

## Referencia

`plans/02_backoffice_mutation_scope.md`
