# Review — feature #20 20_export_import_auditorias

**Veredicto:** APPROVED

## Gate objetivo (ejecutado por el reviewer)

- `pnpm test` (= gate de `init.sh`): **136 archivos, 612 tests verdes** (2 skip Docker). Exit 0.
- `pnpm exec vitest run` sobre los 7 archivos de #20: **40/40 verdes**.
- `./init.sh`: termina con `[OK] Entorno listo` — exit 0.
- `pnpm exec playwright test e2e/audit-bundle.spec.ts`: **2/2 verdes**.
- `pnpm exec tsc --noEmit`: 4 errores, **todos PREEXISTENTES y ajenos a #20**
  (`tests/setup.ts`, `tests/api/attachments-delete.test.ts`,
  `tests/form-save-indicator.test.ts`, `src/lib/server/db/audit-responses.ts`).
  Verificado con `git diff --quiet HEAD -- <archivo>`: los 4 son byte-idénticos a HEAD
  (UNCHANGED). Ningún error de tsc proviene de archivos de #20. Afirmación del implementer
  CONFIRMADA. El gate del arnés corre `pnpm test`, no `tsc`.

## Trazabilidad R↔test (verificada abriendo cada test, no el mapa)

- R1: [x] `audit-bundle-schema.test.ts` (acepta válido; rechaza sin version; ≠ CANONICAL) + `audit-bundle-build.test.ts > valida contra auditBundleSchema`
- R2: [x] `api/audit-bundle-export.test.ts` (401 sin sesión, 403 tecnico, ambos con spy `not.toHaveBeenCalled` sobre el builder; admin 200)
- R3: [x] `audit-bundle-build.test.ts > no contiene UUID de origen en campos de referencia` (serializa header/responses/scores/closure y asserta ausencia de clientId/itemId; cliente por clave natural)
- R4: [x] `audit-bundle-item-key.test.ts` (misma key; distinto sort_order; **drift field_type → key distinta**; índice 1:1)
- R5: [x] `audit-bundle-build.test.ts > preserva el status original (borrador, en_relevamiento, cerrada)`
- R6: [x] `audit-bundle-build.test.ts > adjuntos como refs r2_key sin binario; item_key null sin ítem` (asserta no `content`/`base64`)
- R7: [x] `api/audit-bundle-import.test.ts` (401/403 + conteo audit sin cambio)
- R8: [x] `audit-bundle-import.test.ts > body inválido lanza AuditBundleValidationError` + `api/...> 400 sin escribir`
- R9: [x] `audit-bundle-import.test.ts > crea audit con FK locales y status preservado` (client_id, assigned_tech_id resueltos a UUID locales)
- R10: [x] `audit-bundle-import.test.ts` (conteos responses/scores == bundle; closure en cerrada)
- R11: [x] `audit-bundle-import.test.ts > remapea attachment_ids embebidos (file_ref y table)` — **file_ref**: `value.attachment_ids` NO contiene el id de origen y SÍ el id local (JOIN a attachment local); **table**: `rows[].attachment_ids` no contiene el id de origen; **dedupe r2_key**: conteo de attachment sin cambio. La rama `table` ejecuta de verdad (el seed `it-v2.json` tiene 1 ítem `table` y 1 `file_ref`).
- R12: [x] `audit-bundle-import.test.ts` (dry-run no escribe; template faltante listado) + `api/...` (200 con report; default sin mode = dry-run)
- R13: [x] `audit-bundle-import.test.ts > reimport no duplica (duplicate:true, +1 audit)`
- R14: [x] `audit-bundle-import.test.ts > atomicidad: error a mitad hace rollback total` (fuerza constraint en closure tras crear audit; conteo audit/response sin cambio)
- R15: [x] `audit-bundle-import.test.ts > template faltante lanza AuditBundleResolutionError` (code='AUDIT_BUNDLE_RESOLUTION', missing>0, sin escribir) + `api/...> 422 con lista`
- R16: [x] `audit-bundle-roundtrip.test.ts` (export→import→export; comparador `bundlesEquivalent` normaliza UUID/timestamps/attachment_ids)
- R17: [x] `audit-bundle-import.test.ts` (strict cliente ausente falla sin escribir; permissive crea cliente por CUIT y deja assigned_tech NULL)
- R18: [x] `e2e/audit-bundle.spec.ts` (admin export → dry-run report → confirm → import-success → DB status preservado; tecnico no ve `audit-bundle-actions`)

Cada test mapea a un R; cada R tiene al menos un test concreto que asserta resultado (no solo "no lanza").

## Tasks

- T1–T23: [x] todas. Archivos existen con las firmas del design:
  `version.ts`, `schema.ts`, `errors.ts`, `item-key.ts`, `build.ts`, `resolve.ts`, `import.ts`,
  `db/audit-bundle.ts`, ambos `+server.ts`, `migrations/011_audit_bundle_import.sql`,
  `audit-bundle-actions.svelte` + mount en `+page.svelte` gated por `data.isAdmin`.

## Decisiones humanas (design §Open Questions)

- OQ-1: [x] clave `{section_code, field_type, sort_order, label}`; drift (mismo sort_order, distinto field_type) ⇒ key distinta ⇒ faltante. Test `item-key > detecta drift` + tratamiento como `missing` en `resolve.ts`.
- OQ-2: [x] endpoint default dry-run (`z.enum(...).default('dry-run')`); escritura exige strict|permissive; permissive crea cliente (`INSERT INTO client`), strict no (lanza ResolutionError). Tests: `default sin mode es dry-run`, `strict vs permissive`.
- OQ-3: [x] `public_token` regenerado solo si status ∈ {briefing_enviado, briefing_completo} (`TOKEN_STATUSES`), NULL resto (test cerrada → NULL; briefing_completo → no NULL). Bundle no exporta token de origen (ausente del schema).

## Puntos críticos del diseño

- (a) Remapeo `attachment_ids` para `file_ref` Y `table` (`import.ts:38-69`), verificado contra IDs locales — R11 ✓
- (b) Atomicidad por `db.begin` único con dedupe dentro de la tx (`import.ts:119-302`); test de rollback — R14 ✓
- (c) Idempotencia: dedupe `{origin_instance_id, origin_audit_id}` (PK de `audit_bundle_import`), test reimport +1 — R13 ✓
- (d) Export por clave natural; UUID de origen ausente de refs (solo `dedupe_key.origin_audit_id` y `attachment.origin_id`, ambos por diseño, no son refs de resolución) — R3 ✓

## Checkpoints

- C1: [x] arnés completo; `init.sh` exit 0
- C2: [x] una sola feature in_progress (#20); todo `done` con tests verdes
- C3: [x] `db/audit-bundle.ts` solo SQL parametrizado; sin ORM; sin `console.log`/`.only`/TODO; sin secretos en código (INSTANCE_ID por env con fallback)
- C4: [x] tests cubren funciones públicas de `src/lib/server/bundle/`; vitest >0 verde; e2e presente
- C5: [x] sin archivos sospechosos de #20
- C6: [x] spec completo (requirements/design/tasks EARS); todas las tasks [x]; cada R con test

## Notas (no bloqueantes)

- El working tree trae cambios uncommitted **ajenos a #20** (psys/informe/mercado: `e2e/helpers.ts`,
  `e2e/mercado.spec.ts`, `playwright.config.ts`, `tests/psys-*`, `tests/informe-*`,
  `progress/impl_18_*`, `e2e/ensure-mercado.ts`) que ya estaban en el árbol al iniciar la sesión
  (features ya `done`). No son responsabilidad de #20 y no afectan este veredicto.
- Cambios de infra de tests declarados por el implementer (`tests/migrate.test.ts`,
  `tests/helpers/db.ts`, `.env.example`, `src/lib/env.ts`) presentes y acotados.

Feature lista para `done` (el cambio de status lo hace el leader).
