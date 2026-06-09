# auditapp — Contrato de datos y pipeline IA

**ID**: SPEC-07i | **Padre**: [auditapp.prd.md](auditapp.prd.md) | **Milestone**: parte de 7 | **Puente a**: SPEC-08 | **Depende de**: 07a, 07f

---

## Problem

El sistema completo es un solo pipeline de datos: la auditoría no termina en el cierre, su salida alimenta la IA del informe y la base de estudio de mercado del NEA. Sin un contrato de datos versionado y explícito, cada cambio en la app puede romper el pipeline aguas abajo, y los datos de mercado se pierden o quedan inconsistentes.

## Evidence

- SPEC-00 define dos consumidores de cada auditoría: la IA del informe (§4) y el estudio de mercado (§1).
- El pipeline IA (n8n + RAG Tango + Claude) ya existe en diseño y espera un JSON estructurado.
- Martín insiste en que "todo es lo mismo": la app y el pipeline son un solo sistema de datos, no piezas sueltas.

## Users

- **Primary — Pipeline IA / n8n**: consume el JSON canónico para generar el informe.
- **Primary — Estudio de mercado**: agrega los datos de cada auditoría para métricas del NEA.
- **Secondary — Técnico/Admin**: validan el preview del informe antes de disparar el pipeline.
- **Not for**: el cliente — no ve el JSON ni los hallazgos internos de upsell.

## Hypothesis

Creemos que un JSON canónico versionado (`schema_version`) + un preview del informe en la app + un subconjunto `market_data` desnormalizado dará un contrato estable que el pipeline consume sin transformaciones manuales y que preserva todos los datos de mercado. Sabremos que funciona cuando el pipeline n8n genere un informe desde el JSON sin tocar nada a mano.

## Success Metrics

| Métrica | Target | Cómo medir |
|---|---|---|
| JSON consumido sin transformación manual | 100% | Validación en el pipeline n8n |
| `schema_version` presente y respetado | 100% | Header `X-Schema-Version` + payload |
| Datos de mercado capturados por auditoría | 100% de los campos `market_data` | Revisión de registros agregados |

## Scope

**MVP** — JSON canónico completo con `schema_version`, endpoint de export protegido, `score_basis="auto"` + `score_contribution` por ítem, `market_data` extraído de cabecera/briefing, preview legible del informe en el cierre.

**Out of scope**

- Dashboard de métricas agregadas (v2 — el modelo ya guarda los datos desde v1).
- Generación del informe final branded / PDF / Loom (eso es SPEC-08).
- Formalización de SPEC-08 como spec top-level (decisión pendiente).

## Delivery Milestones

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 7i-a | JSON canónico + schema_version | Endpoint de export con el contrato completo y header de versión | pending | — |
| 7i-b | market_data | Subconjunto desnormalizado para estudio de mercado extraído por auditoría | pending | — |
| 7i-c | Preview del informe | Vista legible de índices/riesgos/quick wins en el cierre | pending | — |

## Open Questions

- [x] ~~¿El pipeline n8n define el formato?~~ — **✅ NO existe aún. El contrato lo define SyS en este spec; el pipeline se adapta a él.**
- [x] ~~Validar campos `market_data`~~ — **✅ La lista del §3 está bien (ERP actual, módulos Tango, empleados, puestos, sedes, proveedor correo, soporte IT).**
- [x] ~~¿SPEC-08 spec aparte?~~ — **✅ NO. El pipeline es parte de esta misma app; vive en 07i. Se deja una nota documentada en `sysaudit/` para marcar que todo es un solo sistema.**
- [x] ~~Auth del endpoint de export~~ — **✅ Sesión de admin (no API key por ahora).**
- [ ] Fijar `schema_version = 1.0` al cerrar la primera auditoría real.

## Risks

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Contrato cambia y rompe el pipeline | Media | Alto | Versionado semántico; MAJOR requiere coordinación explícita |
| `market_data` incompleto por ítems no cargados | Media | Medio | Campos opcionales; el pipeline tolera nulls |
| Preview de la app diverge del informe final | Baja | Bajo | Preview = solo datos estructurados; el branding lo pone SPEC-08 |

---

*Status: DRAFT. Spec de referencia completa en [`specs/09_contrato_datos/requirements.md`](../../specs/09_contrato_datos/requirements.md).*
