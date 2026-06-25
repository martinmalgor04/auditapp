# Review — feature 45_inventario_it_informe

**Veredicto:** APPROVED

## Trazabilidad R↔test
- R1: [x] tests/canonical-schema.test.ts, tests/canonical/build-rows.test.ts
- R2: [x] tests/canonical/build-rows.test.ts (attachment_ids→r2_key, huérfano omitido)
- R3: [x] tests/canonical-schema.test.ts (version 1.2; legacy sin rows válido)
- R4: [x] tests/canonical-schema.test.ts, tests/canonical/build-rows.test.ts (rows vacío)
- R5: [x] tests/informe-web-render.test.ts (no-fuga; modelo vía stripInternalFindings)
- R6: [x] tests/informe/inventory-columns.test.ts, tests/informe-web-render.test.ts
- R7: [x] tests/informe-web-render.test.ts (semáforo desde scoreInventoryRow; engine intacto)
- R8: [x] tests/informe-web-render.test.ts, tests/informe/inventory-columns.test.ts
- R9: [x] tests/informe-web-render.test.ts (ERP puro sin sección), inventory-columns.test.ts
- R10: [x] tests/informe-web-render.test.ts (foto vía resolvedor fake)
- R11: [x] tests/informe-web-render.test.ts (placeholder equip-ph)
- R12: [x] web-render.ts STYLE (tokens --sys-*, reveal) + snapshot
- R13: [x] web-render.ts STYLE (@media print A4 + breakpoint) + snapshot
- R14: [x] tests/informe-web-render.test.ts (snapshot ERP sin cambios)
- R15: [x] tests/informe-web-render.test.ts (no-fuga interno)

## Tasks
- T1–T17: [x] todas marcadas
- T5: ubicación de test desviada a tests/canonical/build-rows.test.ts (unit sobre
  buildItemRows) en vez de tests/canonical-builder.test.ts. Desvío justificado en
  progress/impl_45: insertar template_item table en seed compartido contaminaba el
  snapshot de canonical-contract. R2 queda cubierto. ACEPTADO.

## Checkpoints
- C1: [x] arnés completo, init.sh exit 0
- C2: [x] una sola feature in_progress (45); features done con tests verdes
- C3: [x] sin ORM/raw; cambio en inventory-eol.ts es export-only (lógica intacta)
- C4: [x] vitest 1285 pass / 2 skip, 232 archivos verdes
- C5: [x] sin archivos sospechosos (tmp/.env); untracked son tests/impl de #45
- C6: [x] spec completo (requirements EARS, design, tasks); todas R con test

## Alcance
Sin drift. Archivos tocados coinciden con los nombrados en el spec. Motor de
scoring no modificado (solo export de keys). schema_version: MINOR limpio 1.1→1.2.

## Verificación
- pnpm run check: 0 errores
- pnpm exec vitest run: 1285 pass / 2 skip
- ./init.sh: exit 0 (verde)

APPROVED -> progress/review_45_inventario_it_informe.md
