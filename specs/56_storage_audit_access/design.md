# Design — #56 56_storage_audit_access

## Alcance

Cerrar IDOR de adjuntos alineando storage con la semántica de asignación del
form (`techIsAssigned` / `audit_assignment`).

| Incluido | Excluido |
|---|---|
| Helper `assertStorageAccess` + `StorageForbiddenError` | Reunión audio/presign |
| Cablear 5 endpoints attachments | Unificar con `assertFormAccess` en un módulo global |
| Tests IDOR 403/200 | Migraciones, UI |

## Dependencias

| Feature | Contrato |
|---|---|
| #6 storage R2 | `presignGet`/`presignPut`, keys, confirm |
| #32 / `audit_assignment` | `techIsAssigned(auditId, techId)` |
| #7 form | Patrón `assertFormAccess` (solo referencia) |

## Arquitectura

```
requireStaffApi(locals) → AppUser
  → requestPresignedUpload|confirm|download|delete|uploadObjectToR2(..., user)
       getAuditForStorage(auditId)           // existencia (+ status editable)
       assertStorageAccess(auditId, user)    // NEW: admin OK; tecnico → techIsAssigned
       … operación R2/DB …
```

**Decisión:** el guard vive en dominio (`attachments.ts`), no solo en routes,
para que no se olvide en callers futuros (R6).

**Decisión:** usar `techIsAssigned`, no `assigned_tech_id` — coherente con
multi-tipo y con form/email/reopen.

**Alternativa descartada:** filtrar solo en `+server.ts` sin tocar dominio —
frágil; un `server-put` o helper interno saltaría el check.

## Archivos

| Archivo | Cambio |
|---|---|
| `src/lib/server/storage/errors.ts` | `StorageForbiddenError` |
| `src/lib/server/storage/index.ts` | re-export |
| `src/lib/server/storage/attachments.ts` | `assertStorageAccess`; firmas reciben `user` |
| 5× `+server.ts` attachments | pasar `user`; mapear forbidden → 403 |
| `tests/api/attachments-presign.test.ts` | casos IDOR |
| `tests/api/attachments-delete.test.ts` | casos IDOR |

## Firmas

```ts
export class StorageForbiddenError extends Error {
  readonly code = 'STORAGE_FORBIDDEN';
}

async function assertStorageAccess(auditId: string, user: AppUser): Promise<void>;

// Extender firmas públicas existentes con user: AppUser
requestPresignedUpload(input & { user: AppUser }): ...
confirmUpload(input & { user: AppUser }): ...
requestPresignedDownload(input: { attachmentId; user }): ...
deleteAttachment(input & { user: AppUser }): ...
uploadObjectToR2(... + user): ...
```

## Errores HTTP

| Error | HTTP |
|---|---|
| `StorageForbiddenError` | 403 |
| `AuditNotFoundError` / `AttachmentNotFoundError` | 404 (sin cambio) |

## Tests

- Técnico seed A asignado → 200 en presign-put/get/delete.
- Técnico B sin `audit_assignment` → 403 en los mismos.
- Admin sin assignment → 200.
- Si el seed no tiene 2 técnicos: INSERT mínimo de `app_user` tecnico en
  `beforeEach` (sin tocar migraciones globales).

## Gates

`pnpm test -- tests/api/attachments-presign.test.ts tests/api/attachments-delete.test.ts`
`pnpm run check` · `pnpm test`

## Referencia

`plans/01_assert_audit_storage_access.md` (pasos detallados para el implementer).
