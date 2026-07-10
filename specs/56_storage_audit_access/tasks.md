# Tasks — #56 56_storage_audit_access

> No implementar hasta aprobación humana (`spec_ready` → `in_progress`).
> Detalle operativo: `plans/01_assert_audit_storage_access.md`.

- [x] T1 — Agregar `StorageForbiddenError` en `src/lib/server/storage/errors.ts`
  y re-exportar en `index.ts`. Cubre: R1.

- [x] T2 — Implementar `assertStorageAccess(auditId, user)` en `attachments.ts`
  (admin bypass; tecnico → `techIsAssigned`). Cubre: R2, R3.

- [x] T3 — Extender firmas de dominio (`requestPresignedUpload`, `confirmUpload`,
  `requestPresignedDownload`, `deleteAttachment`, `uploadObjectToR2`) para
  recibir `user` e invocar el assert tras resolver auditoría/adjunto. Cubre:
  R5, R6.

- [x] T4 — Actualizar los 5 `+server.ts` de attachments: pasar `user` de
  `requireStaffApi` y mapear `StorageForbiddenError` → `apiError(..., 403)`.
  Cubre: R4.

- [x] T5 — Tests IDOR en `attachments-presign.test.ts` y
  `attachments-delete.test.ts` (asignado 200, no asignado 403, admin 200).
  Cubre: R7, R8.

- [x] T6 — Gates: `pnpm run check` y `pnpm test` verdes. Cubre: R7, R8.
