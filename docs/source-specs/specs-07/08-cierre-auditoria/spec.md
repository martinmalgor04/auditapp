# Spec 07f — Cierre de auditoría

| Campo | Valor |
|---|---|
| **ID** | SPEC-07f |
| **Estado** | 🟢 Definido |
| **Owner** | Martín Malgor |
| **Padre** | [SPEC-07 sysaudit-app](../spec.md) |
| **Especifica** | El paso de cierre: índices, top riesgos, quick wins, próximo paso y salida para la IA |

---

## 1. Propósito

Paso 3 del flujo. Cuando el relevamiento está completo, se consolida la auditoría: se calculan los índices, se anotan los hallazgos clave y se deja la **salida estructurada** que consume el sistema IA del informe ([SPEC-00 §4](../../../specs/00-proyecto-lead-magnet/spec.md)).

Mapea directo al bloque "CIERRE DEL RELEVAMIENTO" de las plantillas v2.

---

## 2. Cálculo de índices

### Índice por plantilla (IT / ERP)

`indice = Σ(score_sección × peso_sección) / Σ(pesos)` sobre las secciones que puntúan (excluye `CAB` y secciones N/A completas).

Mapa de peso → factor (propuesto, a confirmar con Facu/Simón):

| `weight` | factor |
|---|---|
| `bajo` | 1 |
| `medio` | 2 |
| `alto` | 3 |
| `muy_alto` | 5 |

> A10 (Backups+Continuidad) es `muy_alto` por diseño de la plantilla IT.

### Índice Global SyS (combo)

Si la auditoría corrió IT + ERP, el global combina ambos índices. v1: promedio (50/50 o ponderado a confirmar). Se guarda en `audit_closure.indice_global`.

Semáforo: 🟢 70–100 · 🟠 40–69 · 🔴 0–39.

---

## 3. Contenido del cierre

Se carga en la pantalla de cierre y se guarda en `audit_closure` ([07a §3.3](../02-modelo-datos/spec.md)):

| Campo | Tipo | Origen |
|---|---|---|
| Índice de Salud IT | int 0–100 | calculado |
| Índice ERP | int 0–100 | calculado |
| Índice Global SyS | int 0–100 | calculado |
| **Top 5 riesgos** detectados | lista (texto + severidad) | lo carga el técnico/admin |
| **Quick wins** de costo cero | lista | técnico/admin |
| Hallazgos para upsell (interno) | lista | técnico/admin — **no se muestra al cliente** |
| Fotos / exports adjuntos | conteo | de `attachment` |
| Próximo paso acordado | texto | técnico/admin |

---

## 4. Salida estructurada (para la IA)

El cierre expone un **JSON canónico** por auditoría que el sistema IA del informe consume (endpoint protegido o export). Incluye: cabecera, respuestas por sección/ítem (con label, valor, N/A, observaciones), scores por sección, índices, top riesgos, quick wins, hallazgos de upsell, adjuntos. Estructura estable y versionada (campo `schema_version`).

Este JSON es el **contrato aguas abajo**: si cambia, hay que avisar al pipeline IA.

---

## 5. Confirmación de cierre

- El admin (o técnico asignado) revisa y confirma → `audit.status = cerrada`, `closed_at` y `closed_by` seteados.
- Al cerrar: el `public_token` del briefing se invalida.
- **Reabrir** (solo admin): vuelve a `en_cierre`, queda registrado.

---

## 6. Dependencias

- Scores y respuestas: [SPEC-07e](../07-form-tecnico-mobile/spec.md) + [SPEC-07a](../02-modelo-datos/spec.md).
- Pesos heredados de las plantillas: [SPEC-04](../../../specs/04-plantillas-auditoria/spec.md) (resumen del índice).
- Consumidor: sistema IA del informe ([SPEC-00](../../../specs/00-proyecto-lead-magnet/spec.md)).

---

## 7. Criterios de aceptación

- [ ] El índice por plantilla se calcula con los pesos y excluye secciones N/A.
- [ ] El índice global combina IT+ERP cuando es combo.
- [ ] Se cargan top riesgos, quick wins, hallazgos de upsell y próximo paso.
- [ ] Confirmar cierre pone la auditoría en `cerrada` e invalida el token.
- [ ] La salida JSON canónica contiene todo lo que la IA necesita y está versionada.

---

## 8. Estado y pendientes

- [ ] **Confirmar el mapa de pesos** y la fórmula del índice global con Facu/Simón (hereda pendiente de [SPEC-04 §8](../../../specs/04-plantillas-auditoria/spec.md)).
- [ ] Definir el `schema_version` y el JSON exacto que espera la IA (coordinar con el pipeline n8n).
- [ ] ¿Autocálculo del score por sección desde los ítems? — v2.
- [ ] ¿Generar acá mismo un preview del informe o eso es 100% del pipeline IA? — definir límite.
