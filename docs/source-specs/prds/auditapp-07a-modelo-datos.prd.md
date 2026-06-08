# auditapp — Modelo de datos (Postgres)

**ID**: SPEC-07a | **Padre**: [auditapp.prd.md](auditapp.prd.md) | **Milestone**: 1 de 8

---

## Problem

Para que el resto de la app funcione necesitamos un esquema Postgres sólido que soporte dos cosas simultáneas: plantillas *data-driven* (editar preguntas = editar filas, sin tocar código) y auditorías como instancias de esas plantillas. Sin este contrato de datos ningún otro módulo puede arrancar.

## Evidence

- Las plantillas IT/ERP v2 (SPEC-04) ya tienen columnas "Registrar" y "Cómo" que mapean directamente a `field_type` y `method` — el esquema existe en papel, falta digitalizarlo.
- El pipeline IA (SPEC-00) espera un JSON canónico con respuestas por sección/ítem — eso exige una estructura relacional predecible.
- Requisito de combo IT+ERP en la misma auditoría: el esquema tiene que soportar múltiples `template_ids` por `audit`.

## Users

- **Primary**: Claude Code + el desarrollador — este spec es el contrato que consumen los módulos 07b–07h.
- **Not for**: usuarios finales — este módulo es invisible para ellos.

## Hypothesis

Creemos que un esquema con dos mitades (definición data-driven: `template → section → template_item`; instancia: `audit → audit_response`) dará la flexibilidad necesaria para editar plantillas sin tocar código y soportar todos los `field_type` de las plantillas v2. Sabremos que funciona cuando las 3 plantillas se carguen completas como seed y una auditoría combo pase todos los criterios de aceptación.

## Success Metrics

| Métrica | Target | Cómo medir |
|---|---|---|
| Plantillas v2 cargadas sin pérdida | 3 plantillas, 0 ítems faltantes | Revisión de seed vs. plantillas v2 originales |
| Todos los `field_type` soportados | 12 tipos incluyendo `table` y `file_ref` | Test de upsert por cada tipo |
| Auditoría combo IT+ERP sin duplicar cabecera | 1 sección CAB por auditoría | Test de creación de auditoría combo |

## Scope

**MVP** — Schema completo con todas las tablas, tipos y constraints. Seed con 1 admin, 2 técnicos y las 3 plantillas activas: **IT v2, ERP Tango v2, ERP Estándar v1** (las versiones son independientes por plantilla; v2 de IT/Tango refinó esas dos, Estándar v1 es la vigente). Índices de performance en `audit(status)`, `audit(client_id)`, `audit_response(audit_id)`.

**Out of scope**

- Editor visual de plantillas (eso es 07c) — el esquema solo necesita las tablas.
- Soft-delete de plantillas con auditorías activas (solo `archived`; la lógica de negocio la implementa 07c).
- Auditoría de cambios (audit log) — v2.

## Delivery Milestones

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1a | Schema Postgres + migraciones | Todas las tablas creadas vía SQL files versionados (sin ORM, `postgres.js`) | pending | — |
| 1b | Tipos de campo y constraints | Los 12 `field_type` con `options` JSONB validado; UNIQUEs y FKs en su lugar | pending | — |
| 1c | Seed inicial | 1 admin, 2 técnicos, 3 plantillas activas (IT v2, ERP Tango v2, ERP Estándar v1) con todas sus secciones e ítems | pending | — |
| 1d | Seed de clientes | Importar la base de clientes desde `seed/clientes-presupuestossys.csv` (1.905 filas) a la tabla `client` | pending | — |

> El CSV `seed/clientes-presupuestossys.csv` viene de presupuestos.serviciosysistemas.com.ar. **Sin procesar todavía** — el mapeo de columnas → `client` (razon_social, cuit, rubro) se define al implementar 1d.

## Open Questions

- [x] ~~¿`client` mínimo o con cabecera?~~ — **✅ `client` con todos los campos de cabecera como columnas fijas (alimenta el estudio de mercado).**
- [x] ~~Mapa `weight → factor`~~ — **✅ bajo=1, medio=2, alto=3, muy_alto=5 (automático).**
- [ ] Índices de performance adicionales — a criterio técnico al implementar 07e (autosave intensivo).

## Risks

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Plantillas v2 con ítems sin `field_type` claro | Media | Medio | Revisar mapeo completo antes del seed |
| `options.columns` de `table` con estructura inesperada | Baja | Bajo | Definir JSONB schema por tipo en la migración |

---

## Spec técnica de referencia

### Tablas principales

**`template`** — `id uuid PK · code text · name text · version text · status(draft/active/archived) · created_at`

**`section`** — `id · template_id FK · code(CAB/A1/B7…) · title · objective · standard_ref · weight(bajo/medio/alto/muy_alto) · has_score bool · sort_order int`

**`template_item`** — `id · section_id FK · label · help_text · method text[] · field_type · options jsonb · is_prefillable bool · prefill_source · filled_by(admin/cliente/tecnico) · allow_na bool · required bool · item_weight numeric default 1 · scores bool default true · sort_order`

> `options` también guarda la **rúbrica de scoring determinístico** según `field_type` (ver [07f](auditapp-07f-cierre-auditoria.prd.md)): `score_map` para `select`, `thresholds` para `number`, reglas EOL para `table` de equipos. `item_weight` = peso del ítem dentro de su sección. `scores=false` para ítems informativos que no puntúan.

**`client`** — `id · razon_social · cuit · rubro · empleados int · puestos int · sedes int · referente_nombre · referente_cargo · referente_contacto · erp_actual · proveedor_correo · soporte_it_actual · created_at · updated_at`

> **Decisión**: `client` guarda los campos de cabecera como columnas fijas (no solo razón social/CUIT/rubro). Simplifica el listado, el reuso entre auditorías y las consultas del estudio de mercado (`market_data` sale casi directo de acá). La sección `CAB` de la plantilla puede seguir teniendo ítems extra, pero los datos estructurales del cliente viven en `client`.

**`audit`** — `id · client_id FK · name · types text[] · template_ids uuid[] · segment(A/B/C) · status · assigned_tech_id FK · created_by FK · scheduled_at · public_token unique · closed_at · created_at`

> Sin `token_expires_at`: el token se invalida por `status`, no por tiempo.

**`audit_response`** — `id · audit_id FK · item_id FK · value jsonb · na bool · observations · source · updated_by FK · updated_at · UNIQUE(audit_id, item_id)`

**`audit_section_score`** — `id · audit_id FK · section_id FK · score int(0-100) **calculado** · score_breakdown jsonb · observations · UNIQUE(audit_id, section_id)`

> `score` es **calculado** automáticamente desde los ítems (no ingresado por el técnico — ver [07f](auditapp-07f-cierre-auditoria.prd.md)). `score_breakdown` guarda el aporte de cada ítem (`score_contribution`) para transparencia y para el JSON canónico (07i). `observations` sí es libre del técnico.

**`audit_closure`** — `audit_id PK FK · indice_it int · indice_erp int · top_risks jsonb · quick_wins jsonb · upsell_findings jsonb · next_step text · closed_by FK · closed_at`

> Sin `indice_global`: IT y ERP son scores independientes. Una auditoría combo muestra ambos por separado.

**`attachment`** — `id · audit_id FK · item_id FK nullable · r2_key unique · filename · content_type · size_bytes bigint · kind(photo/export) · uploaded_by FK nullable · created_at`

**`app_user`** — `id · email unique · name · password_hash · role(admin/tecnico) · active bool · created_at`

**`session`** — `id text PK · user_id FK · expires_at · created_at`

### Estados de `audit.status`

`borrador → briefing_enviado → briefing_completo → en_relevamiento → en_cierre → cerrada`

(reabrir desde `cerrada → en_cierre`, solo admin)

### `field_type` map

`text · number · bool · tri · select · multiselect · date · datetime · list · table · file_ref · money`

---

*Status: DRAFT. Spec de referencia completa en [`specs/07a-modelo-datos/spec.md`](../../specs/07a-modelo-datos/spec.md).*
