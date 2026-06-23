# Tasks — #41 41_referencia_auditoria

Implementación en orden. Marcar `[x]` al completar. Cada task referencia requirements.

---

## Dominio y migración

- [x] T1 — Implementar `buildEmpresaCode(razonSocial)` y `formatRefCode(codigo, type, seq)` en
  `src/lib/server/clients/normalize.ts`. Cubre: R1, R5.

- [x] T2 — Tests unitarios `tests/clients/empresa-code.test.ts`: INGENIERIA SIGLO XXI → `ISX`;
  GRUPO AGROS FORMOSA SA → `GAF`; colisión → sufijo `2`; mínimo 3 chars. Cubre: R1, R2.

- [x] T3 — Agregar `TYPE_REF_TOKEN` y `refTokenForType()` en `src/lib/audit-types.ts`
  (`it→IT`, `erp-tango→ERP`, `erp-estandar→ERPE`). Cubre: R6.

- [x] T4 — Migración `migrations/022_audit_ref_code.sql`: columnas `empresa.codigo` y
  `audit.ref_code`; tabla `audit_ref_counter`; función SQL de backfill de códigos; backfill
  `ref_code` con tipo líder legacy; seed contador; NOT NULL + UNIQUE; triggers de inmutabilidad.
  Cubre: R4, R10, R11, R12, R13.

- [x] T5 — Tests de migración `tests/migrations/audit_ref_code.test.ts`: toda empresa con
  `codigo` único; toda auditoría con `ref_code` único y formato válido; correlativos contiguos
  por (empresa, tipo); legacy multi-tipo usa tipo líder; contador alineado al máximo. Cubre:
  R4, R5, R7, R10, R11, R12, R13.

## Alta de auditoría (ref_code + codigo)

- [x] T6 — `ensureEmpresaCodigo(tx, empresaId, razonSocial)` y `allocateRefCode(tx, empresaId,
  auditType)` en `backoffice/audits.ts` usando UPSERT atómico sobre `audit_ref_counter`.
  Integrar en `createAudit` dentro de la transacción existente. Cubre: R8.

- [x] T7 — Generar `codigo` en upsert de import (`clients/import.ts`) y en alta de empresa nueva
  en `createAudit`. Cubre: R1, R2.

- [x] T8 — Test de concurrencia `tests/backoffice/audit-ref-concurrency.test.ts`: N altas
  paralelas misma empresa+tipo → N `ref_code` distintos y secuenciales. Cubre: R8.

- [x] T9 — Test de inmutabilidad `tests/backoffice/ref-immutability.test.ts`: UPDATE directo a
  `codigo`/`ref_code` falla (trigger); `updateAudit`/`updateEmpresa` no los alteran. Cubre: R3,
  R9.

- [x] T10 — Extender tipos de lectura (`AuditDetail`, `DashboardAuditRow`, queries) con
  `refCode`; incluir en `getAuditById` y `listDashboardAudits`. Cubre: R16, R17 (datos).

## Un solo tipo + guard anti-duplicado

- [x] T11 — Restringir `createAuditSchema` a `types.length(1)`; agregar `confirmDuplicate`
  opcional; actualizar `form-parsers.ts`. Cubre: R14.

- [x] T12 — Cambiar `new/+page.svelte` a selección de tipo única (radio); un técnico asignado.
  Cubre: R14.

- [x] T13 — Test `tests/backoffice/single-type.test.ts`: POST con 2 tipos → 400; con 1 → OK;
  lectura de auditoría legacy multi-tipo sin error. Cubre: R14, R15.

- [x] T14 — Implementar `findActiveSameTypeAudits` + `DuplicateAuditWarning`; integrar guard en
  `createAudit` con flag `confirmDuplicate`. Cubre: R21, R23, R24.

- [x] T15 — UI de aviso en `new/+page.svelte` + action `create` mapea 409 con lista de
  conflictos (`ref_code`, estado, encargada) y reenvío con `confirmDuplicate=true`. Cubre: R21,
  R22, R23.

- [x] T16 — Tests `tests/backoffice/duplicate-guard.test.ts`: ERP activa → aviso; confirm →
  crea con correlativo siguiente; sin conflicto → crea directo; cerrada/archivada → no avisa.
  Cubre: R21, R22, R23, R24.

## Visualización

- [x] T17 — Mostrar `refCode` + etiqueta de tipo en `audit-table.svelte` y
  `audit-card-list.svelte`. Cubre: R16.

- [x] T18 — Mostrar `refCode` en cabecera de `auditorias/[id]/+page.svelte`. Cubre: R17.

- [x] T19 — Mostrar `refCode` en `cierre/+page.svelte` y en modelo/render del informe
  (`render-shared`, ERP/IT/mixto, web). Cubre: R18.

- [x] T20 — Bump contrato psys a v1.1: `source.ref_code` en schema + `buildPsysPayload`. Cubre:
  R19.

- [x] T21 — Exponer `refCode` en briefing (`load-form.ts`, `briefing-header.svelte` o subtítulo).
  Cubre: R20.

- [x] T22 — Tests de render: `tests/backoffice/dashboard-ref.test.ts`,
  `tests/informe/ref-code-render.test.ts`, `tests/briefing/ref-code.test.ts`,
  `tests/psys/payload-ref.test.ts`. Cubre: R16, R17, R18, R19, R20.

- [x] T23 — Smoke `tests/backoffice/routes-still-uuid.test.ts`: links del tablero/detalle siguen
  usando `/auditorias/{uuid}`. Cubre: R25.

## Cierre

- [x] T24 — Mapa R↔test en `progress/impl_41_referencia_auditoria.md`; entrada en
  `specs/README.md`. Cubre: trazabilidad reviewer.

- [x] T25 — `./init.sh` verde antes de marcar feature `done`. Cubre: harness.
  (Nota: `pnpm run check` y `pnpm test` verdes; `./init.sh` falla mientras #40 siga
  `in_progress` en paralelo — regla arnés máx. 1 feature activa.)
