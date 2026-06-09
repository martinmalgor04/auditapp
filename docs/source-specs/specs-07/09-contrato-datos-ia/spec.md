# Spec 07i — Contrato de datos y pipeline IA (puente a SPEC-08)

| Campo | Valor |
|---|---|
| **ID** | SPEC-07i |
| **Estado** | 🟡 En definición |
| **Owner** | Martín Malgor |
| **Padre** | [SPEC-07 sysaudit-app](../spec.md) |
| **Relación** | El pipeline de datos es **parte de esta misma app**, no un sistema aparte. No se formaliza un SPEC-08 separado; se deja una nota documentada a nivel `sysaudit/` para marcar que todo es un solo sistema |
| **Especifica** | El JSON canónico de salida, su versionado, y cómo los datos de cada auditoría alimentan el pipeline IA del informe y la base de estudio de mercado |

---

## 1. Propósito

Todo el sistema es **un solo pipeline de datos**. Esta auditoría no termina en un cierre: su salida estructurada es el insumo de dos consumidores aguas abajo:

1. **IA del informe** (SPEC-00 §4) — toma el JSON canónico y genera el informe branded (score, top riesgos, Loom).
2. **Base de estudio de mercado** (SPEC-00 §1) — cada auditoría aporta un registro al panorama tecnológico del NEA (qué ERP usan, qué módulos, dónde están parados en seguridad).

Este spec fija el **contrato**: la estructura exacta del JSON, su `schema_version`, y la frontera entre lo que produce la app (SPEC-07) y lo que hace el pipeline (SPEC-08).

> **Regla de oro**: este JSON es un contrato versionado. Si cambia de forma incompatible, sube `schema_version` y se avisa al pipeline. Nada lo consume "a mano".

---

## 2. Arquitectura del pipeline (extremo a extremo)

```
┌─ SPEC-07 (esta app) ──────────────────────────────┐      ┌─ SPEC-08 (pipeline) ────────────┐
│ briefing → relevamiento → scoring AUTO → cierre   │      │  IA informe (Claude + RAG Tango) │
│                          │                         │ JSON │  → informe branded (HTML/PDF/Loom)│
│                          ▼                         │─────▶│                                  │
│           audit_closure + JSON canónico            │      │  Base estudio de mercado (DB)    │
│           (endpoint protegido / export)            │      │  → métricas agregadas NEA        │
└────────────────────────────────────────────────────┘      └──────────────────────────────────┘
                                                                        │
                                       Dashboard de métricas (backoffice, 07c) ◀┘
```

La app **no** genera el informe final ni el Loom (eso es SPEC-08), pero **sí** genera un **preview** del informe (ver §5) para que el técnico/admin valide antes de disparar el pipeline.

---

## 3. JSON canónico (contrato)

Estructura estable, versionada. El cierre (07f) la materializa.

```json
{
  "schema_version": "1.0",
  "audit_id": "uuid",
  "generated_at": "2026-06-08T14:30:00-03:00",
  "client": {
    "razon_social": "string",
    "cuit": "string",
    "rubro": "string",
    "segment": "A|B|C"
  },
  "types": ["it", "erp-tango"],
  "templates": [
    { "code": "it", "version": "v2" },
    { "code": "erp-tango", "version": "v2" }
  ],
  "sections": [
    {
      "code": "A1",
      "title": "Inventario de activos / hardware",
      "standard_ref": "CIS 1 · NIST: Identify",
      "weight": "alto",
      "score": 72,
      "score_basis": "auto",
      "observations": "string",
      "items": [
        {
          "item_id": "uuid",
          "label": "¿Existe inventario documentado?",
          "field_type": "tri",
          "value": "parcial",
          "na": false,
          "score_contribution": 50,
          "observations": "string",
          "attachments": ["r2_key1", "r2_key2"]
        }
      ]
    }
  ],
  "indices": {
    "it": 68,
    "erp": 72
  },
  "top_risks": [
    { "text": "Sin backups offsite", "severity": "alta", "section": "A10" }
  ],
  "quick_wins": ["Activar MFA en correo (costo cero)"],
  "upsell_findings": [
    { "text": "Candidato a Tango Nexo", "internal": true }
  ],
  "next_step": "string",
  "market_data": {
    "erp_actual": "string",
    "modulos_tango": ["ventas", "stock"],
    "empleados": 45,
    "puestos": 30,
    "sedes": 2,
    "proveedor_correo": "string",
    "soporte_it_actual": "string"
  },
  "closed_at": "2026-06-08T14:25:00-03:00"
}
```

- `score_basis`: siempre `"auto"` en v1 (ver SPEC-07f scoring determinístico). Se reserva `"manual"`/`"ia"` para futuras revisiones.
- `score_contribution`: cuánto aportó cada ítem al score de su sección (transparencia del cálculo).
- `market_data`: subconjunto desnormalizado para el estudio de mercado (se extrae de los ítems de cabecera/briefing).
- `upsell_findings[].internal = true`: nunca se expone al cliente; lo consume solo SyS.

---

## 4. Versionado del contrato

- `schema_version` semántico (`MAJOR.MINOR`).
- **MINOR**: agregar campos opcionales → compatible, no rompe el pipeline.
- **MAJOR**: quitar/renombrar/cambiar tipo de un campo → incompatible, requiere coordinación con SPEC-08.
- El endpoint de export incluye siempre `schema_version` en el payload y en un header `X-Schema-Version`.

---

## 5. Preview del informe (en la app)

Decisión: la app genera un **preview** del informe, no solo el JSON crudo.

- Vista de solo lectura en el cierre: índices con semáforo, top riesgos, quick wins, próximo paso, render legible.
- Sirve para que el técnico/admin **valide** la salida antes de disparar el pipeline IA.
- El informe **final** (branded, PDF, Loom, copy IA) lo produce SPEC-08 — la app solo muestra el preview estructurado.
- Límite claro: app = datos + preview; pipeline = informe final + Loom + envío.

---

## 6. Datos de estudio de mercado

Cada auditoría cerrada aporta un registro agregable. El backoffice (07c) expone un **dashboard de métricas** que lee de estos datos:

- Distribución de ERP en uso (Tango vs otros vs Excel).
- Módulos Tango más/menos adoptados.
- Estado promedio de seguridad por segmento (A/B/C).
- Índices IT/ERP promedio del NEA.
- Oportunidades de upsell agregadas.

> El dashboard es **v2** (post-MVP), pero el modelo de datos (07a) ya guarda todo lo necesario desde v1 — solo falta la vista. No se pierde data.

---

## 7. Dependencias

- **Produce el contrato**: [SPEC-07f cierre](../08-cierre-auditoria/spec.md) materializa este JSON.
- **Scoring determinístico**: [SPEC-07f §2](../08-cierre-auditoria/spec.md) define cómo se autocalculan los scores que viajan en el JSON.
- **Datos de origen**: [SPEC-07a modelo](../02-modelo-datos/spec.md).
- **Consumidores aguas abajo**: SPEC-08 (pipeline IA + estudio de mercado), SPEC-00 §1/§4.
- **Dashboard**: [SPEC-07c backoffice](../04-backoffice/spec.md) (v2).

---

## 8. Criterios de aceptación

- [ ] El cierre produce el JSON canónico con `schema_version` y todos los campos del §3.
- [ ] El endpoint de export devuelve el JSON con header `X-Schema-Version`.
- [ ] `score_basis = "auto"` y `score_contribution` por ítem presentes y coherentes con el cálculo de 07f.
- [ ] `market_data` se extrae correctamente de los ítems de cabecera/briefing.
- [ ] La app muestra un preview legible del informe en el cierre.
- [ ] El pipeline (SPEC-08) consume el JSON sin transformaciones manuales.

---

## 9. Estado y pendientes

- [x] ~~Campos de `market_data`~~ — **✅ Confirmados (§3): ERP actual, módulos Tango, empleados, puestos, sedes, proveedor correo, soporte IT.**
- [x] ~~¿SPEC-08 aparte?~~ — **✅ NO. El pipeline es parte de esta misma app (este spec). Se documenta la relación a nivel `sysaudit/`.**
- [x] ~~Auth del endpoint de export~~ — **✅ Sesión de admin.**
- [ ] Fijar `schema_version = 1.0` al cerrar la primera auditoría real.
