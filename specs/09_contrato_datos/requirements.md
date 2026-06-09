# Requirements — #9 09_contrato_datos

> Contrato JSON canónico versionado, endpoint de export protegido, `market_data` desnormalizado y capa compartida con el preview de cierre.
> Depende de `08_cierre_scoring` (#8) para motor de scoring, `audit_closure` y pantalla de cierre.
> Fuentes: `docs/source-specs/specs-07/09-contrato-datos-ia/spec.md`, `docs/source-specs/prds/auditapp-09-contrato-datos-ia.prd.md`.

## R1 — Constante de versión del contrato

El sistema DEBE definir la constante `CANONICAL_SCHEMA_VERSION = "1.0"` como única fuente de verdad del campo `schema_version` del JSON canónico.

**Verificación:** `tests/canonical-schema.test.ts > CANONICAL_SCHEMA_VERSION is 1.0`.

## R2 — Builder del JSON canónico

El sistema DEBE exponer `buildCanonicalAuditJson(auditId)` que agrega cabecera de auditoría, cliente, plantillas, secciones con ítems, índices, hallazgos de cierre, `market_data` y metadatos de cierre en la forma documentada en design § Estructura.

**Verificación:** `tests/canonical-builder.test.ts > builds full canonical payload for closed combo audit`.

## R3 — Campo schema_version en payload

CUANDO se genera el JSON canónico, el sistema DEBE incluir `schema_version` igual a `CANONICAL_SCHEMA_VERSION`.

**Verificación:** `tests/canonical-builder.test.ts > payload schema_version matches constant`.

## R4 — Timestamp generated_at

CUANDO se genera el JSON canónico, el sistema DEBE incluir `generated_at` en ISO 8601 con offset horario (ej. `-03:00`).

**Verificación:** `tests/canonical-builder.test.ts > generated_at is ISO 8601 with timezone offset`.

## R5 — Endpoint de export protegido

El sistema DEBE exponer `GET /api/audits/[id]/export` que devuelve el JSON canónico como cuerpo JSON (sin envelope `{ success, data }` — el contrato es el payload directo).

**Verificación:** `tests/api/audit-export.test.ts > GET export returns canonical JSON for admin`.

## R6 — Header X-Schema-Version

CUANDO responde el endpoint de export, el sistema DEBE incluir el header HTTP `X-Schema-Version` con el mismo valor que `schema_version` del payload.

**Verificación:** `tests/api/audit-export.test.ts > response includes X-Schema-Version header`.

## R7 — Autorización admin en export

SI el solicitante no tiene sesión válida con rol `admin`, ENTONCES el endpoint de export DEBE responder `401` (sin sesión) o `403` (sesión sin rol admin).

**Verificación:** `tests/api/audit-export.test.ts > returns 401 without session`; `tests/api/audit-export.test.ts > returns 403 for tecnico role`.

## R8 — Export solo auditorías cerradas

SI la auditoría existe pero `audit.status != 'cerrada'`, ENTONCES el endpoint de export DEBE responder `409` con mensaje de error genérico (sin datos de la auditoría).

**Verificación:** `tests/api/audit-export.test.ts > returns 409 when audit not closed`.

## R9 — score_basis auto por sección

CUANDO una sección tiene `has_score = true` y participa en el cálculo, el JSON canónico DEBE incluir `score_basis: "auto"` en esa sección.

**Verificación:** `tests/canonical-builder.test.ts > scored sections have score_basis auto`.

## R10 — score_contribution por ítem

CUANDO un ítem tiene scoring activo (`template_item.scores = true`) y no está marcado N/A, el JSON canónico DEBE incluir `score_contribution` entero 0–100 coherente con `audit_section_score.score_breakdown` del motor de #8.

**Verificación:** `tests/canonical-builder.test.ts > item score_contribution matches score_breakdown`; `tests/canonical-contract.test.ts > score_contribution sum aligns with section score`.

## R11 — Bloque market_data

El JSON canónico DEBE incluir el objeto `market_data` con las claves: `erp_actual`, `modulos_tango`, `empleados`, `puestos`, `sedes`, `proveedor_correo`, `soporte_it_actual`.

**Verificación:** `tests/canonical-builder.test.ts > market_data has all required keys`.

## R12 — Extracción de market_data

CUANDO se construye `market_data`, el sistema DEBE tomar `erp_actual`, `empleados`, `puestos`, `sedes`, `proveedor_correo` y `soporte_it_actual` de la fila `client` vinculada, y `modulos_tango` del ítem CAB con `item_code = 'cab_modulos_tango'` (ver design § Mapeo).

**Verificación:** `tests/canonical-builder.test.ts > market_data maps client columns and CAB multiselect`.

## R13 — Campos opcionales en market_data

DONDE un dato de origen es null o ausente, el sistema DEBE emitir `null` en la clave correspondiente de `market_data` (no omitir la clave).

**Verificación:** `tests/canonical-builder.test.ts > market_data emits null for missing source fields`.

## R14 — Preview compartido con cierre

El sistema DEBE exponer `buildReportPreview(canonical)` que transforma el mismo objeto devuelto por `buildCanonicalAuditJson` en el view-model de la pantalla de cierre (#8), sin duplicar lógica de agregación de datos.

**Verificación:** `tests/canonical-preview.test.ts > preview indices match canonical indices`; `tests/canonical-preview.test.ts > preview risks match canonical top_risks`.

## R15 — Upsell interno excluido del preview cliente

DONDE el consumidor es la vista interna de cierre, el preview DEBE incluir `upsell_findings`. DONDE el consumidor es externo al backoffice (futuro), el sistema NO DEBE incluir ítems con `internal: true` — el builder de preview interno los mantiene; un helper `stripInternalFindings(canonical)` queda disponible para pipeline externo.

**Verificación:** `tests/canonical-preview.test.ts > internal preview includes upsell_findings`; `tests/canonical-preview.test.ts > stripInternalFindings removes internal upsell entries`.

## R16 — Esquema Zod del contrato

El sistema DEBE definir `canonicalAuditSchema` (Zod) que valide la forma completa del JSON canónico v1, incluyendo tipos, rangos de scores e índices 0–100.

**Verificación:** `tests/canonical-schema.test.ts > schema accepts golden fixture`; `tests/canonical-schema.test.ts > schema rejects invalid payload`.

## R17 — Snapshot del contrato

El sistema DEBE mantener un test snapshot que fije la forma serializada del JSON canónico a partir del fixture golden; cualquier cambio incompatible DEBE actualizar `CANONICAL_SCHEMA_VERSION` (MAJOR) y el snapshot de forma consciente.

**Verificación:** `tests/canonical-contract.test.ts > canonical JSON matches snapshot`.

## R18 — Adjuntos como r2_key

CUANDO un ítem tiene attachments vinculados, el JSON canónico DEBE listar en `attachments` los `r2_key` de la tabla `attachment` (strings), no URLs presignadas.

**Verificación:** `tests/canonical-builder.test.ts > item attachments are r2_key strings`.

## R19 — Índices IT/ERP independientes

El objeto `indices` DEBE exponer `it` y/o `erp` como enteros 0–100 según los tipos de la auditoría; la clave ausente DEBE omitirse (no enviar `null`) si ese tipo no aplica.

**Verificación:** `tests/canonical-builder.test.ts > indices include only applicable types`.

## R20 — Política de versionado documentada

El design DEBE documentar la política MAJOR.MINOR: cambios compatibles (campos opcionales) incrementan MINOR; cambios incompatibles incrementan MAJOR y requieren coordinación con el pipeline aguas abajo.

**Verificación:** Revisión manual en `design.md` § Versionado; `tests/canonical-schema.test.ts > schema version field is semver string`.
