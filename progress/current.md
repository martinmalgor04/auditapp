# Sesión actual — #55_informe_html_manual

**Feature:** #55 — Informe HTML manual (subida y entrega pública con encuesta)

**Status:** in_progress (aprobado por Martín, 2026-07-02; continuado 2026-07-03)

## Decisiones confirmadas (NO re-abrir)
- OQ-1: NO auto-revoca shares viejos al subir manual (cada token sirve exactamente lo entregado)
- Entrega al cliente en `/informe/[token]` (#15)
- Sin reescritura de fotos (URLs a attachments públicos)
- Versionado: nueva versión manual nace `aprobado`
- Documento directo: sin iframe/sanitización; encuesta inyectada antes de `</body>`

## Avance

### ✅ T1–T3: Schema y DB
- Migración SQL 029_informe_html_manual.sql creada
- Tipo `AuditReportSource` en informe-reports.ts
- Función `insertManualReport` implementada (R4–R6, R7 validación)
- Función `getReportManualHtml` implementada
- Corrección: HAVING sin GROUP BY → validación separada

### ✅ T4–T6: Dominio manual
- Módulo `manual-serve.ts` con interceptor `handleManualInformeRequest`
- Función `injectSurveyBeforeBodyClose` (R20)
- Construcción del bloque de encuesta HTML plano (R22–R24)
- Integración en hooks.server.ts

### ✅ T7–T9: Endpoint subida
- Endpoint `POST /api/audits/[id]/report/manual` creado
- Validación de FormData (R10–R13)
- Guard de permisos (admin/técnico asignado)
- Response envelope estándar

### ✅ T10–T14: Entrega pública + encuesta POST
- Interceptor `handleManualInformeRequest` en hooks.server.ts
- Serving documento HTML directo (R18–R21)
- Endpoint `POST /informe/[token]/encuesta` para form plano (R22–R23)
- Redirect 303 tras submit (R23)

### ⏳ T15–T17: Descarga + Panel (EN PROGRESS)
- Tests en ejecución (vitest)
- Panel UI: botón "Subir HTML" pendiente
- Badge "manual" para distinguir versiones
- Acción "Descargar HTML" ya existe (#31)

### ⏳ T18–T20: Cierre (PENDIENTE)
- Verificación completa de tests
- No-regresión en features #15, #47, #31
- Commit y merge

## Archivos modificados
1. `migrations/029_informe_html_manual.sql` — schema cambios
2. `src/lib/server/db/informe-reports.ts` — insertManualReport, getReportManualHtml
3. `src/lib/server/informe/manual-serve.ts` (NEW) — interceptor y funciones serving
4. `src/hooks.server.ts` — integración handleManualInformeRequest
5. `src/routes/api/audits/[id]/report/manual/+server.ts` (NEW) — endpoint subida
6. `src/routes/informe/[token]/encuesta/+server.ts` (NEW) — encuesta POST

## Tests en ejecución
- `tests/informe-manual.test.ts` — schema, db, round-trip byte a byte
- Timeout issues fixed (HAVING sin GROUP BY)

## Próximas acciones
1. Esperar terminen tests
2. Agregar botón "Subir HTML" al panel interno
3. Agregar badge "manual" en listado de versiones
4. Verificar no-regresión tests #15, #47, #31
5. Commit

---

*Nota: Implementer (ac121dadd3e1f488c) se atascó tras 600s. Continuación manual.*
