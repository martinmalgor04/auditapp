# Requirements — 56_storage_audit_access

> Cerrar IDOR en adjuntos (auditoría seguridad 2026-07-10, finding S1).
> Hoy cualquier staff autenticado puede presign/confirm/delete/download
> adjuntos de **cualquier** auditoría: `getAuditForStorage` solo verifica
> existencia. El form ya exige asignación (`assertFormAccess`); storage debe
> alinearse. Plan de referencia: `plans/01_assert_audit_storage_access.md`.

## Contexto verificado

- `src/lib/server/storage/attachments.ts` — `getAuditForStorage` sin ownership.
- `src/lib/server/form/load-form.ts` — patrón `assertFormAccess` + `techAssignedTypes`.
- `src/lib/server/db/audit-assignment.ts` — `techIsAssigned` / `techAssignedTypes`.
- Endpoints solo con `requireStaffApi`:
  - `.../attachments/presign-put`, `confirm`, `server-put`, `DELETE [attachmentId]`
  - `GET /api/attachments/[attachmentId]/presign-get`
- Tests: `tests/api/attachments-presign.test.ts`, `attachments-delete.test.ts`.

## Fuera de alcance

- Endpoints de reunión (`.../reunion/.../presign-*`).
- Refactor de `assertFormAccess` / helper compartido global (follow-up).
- Migraciones / UI de cámara.
- Features #57 (backoffice) y #58 (informe manual).

## Requerimientos

**R1** — El sistema DEBE exponer un error de dominio tipado
`StorageForbiddenError` (o equivalente) para denegar acceso a storage sin
permiso sobre la auditoría.

**R2** — CUANDO un usuario con rol `admin` opera sobre adjuntos de cualquier
auditoría existente, el sistema DEBE permitir la operación (bypass de
asignación).

**R3** — CUANDO un usuario con rol `tecnico` opera sobre adjuntos, el sistema
DEBE exigir que `techIsAssigned(auditId, user.id)` sea verdadero (al menos una
fila en `audit_assignment`; NO solo `assigned_tech_id` líder).

**R4** — SI un técnico no asignado intenta `presign-put`, `confirm`,
`server-put`, `DELETE` o `presign-get` ENTONCES el sistema DEBE responder HTTP
403 con envelope de error (sin generar URL firmada ni mutar R2/DB).

**R5** — CUANDO se resuelve un adjunto por `attachmentId` (`presign-get` /
delete), el sistema DEBE evaluar ownership sobre el `audit_id` del adjunto
después de resolverlo y antes de presign/borrar.

**R6** — El sistema DEBE invocar el check de ownership en el dominio
(`attachments.ts`) además de (o en lugar de solo) la route, de modo que
nuevos callers no omitan el guard.

**R7** — CUANDO un técnico asignado o un admin opera en el happy path existente,
el sistema DEBE conservar el comportamiento actual (200 / URLs firmadas /
confirm/delete OK).

**R8** — El sistema DEBE cubrir R3–R5 con tests de API que demuestren: técnico
no asignado → 403; técnico asignado → 200; admin no asignado → 200.

## Acceptance (feature_list)

- Los 5 endpoints de adjuntos listados en contexto deniegan a técnico no asignado con 403.
- Admin y técnico asignado (multi-tipo vía `audit_assignment`) siguen operando.
- Tests vitest verdes para casos IDOR nuevos + no-regresión.
- Sin cambios de schema ni de endpoints de reunión.
