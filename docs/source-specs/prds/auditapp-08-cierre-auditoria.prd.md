# auditapp — Cierre de auditoría

**ID**: SPEC-07f | **Padre**: [auditapp.prd.md](auditapp.prd.md) | **Milestone**: 7 de 8 | **Depende de**: 07a, 07b, 07e

---

## Problem

Cuando el técnico termina el relevamiento, los datos están en la DB pero sin procesar: no hay índices, no hay top riesgos, no hay salida estructurada para la IA. El cierre es el paso que convierte los datos crudos en inteligencia de negocio — sin él la auditoría no sirve para generar el informe ni para el upsell. **Y el scoring no lo puede poner el técnico a dedo**: eso le mete subjetividad a un diagnóstico que tiene que ser comparable entre clientes y defendible ante el cliente. El score tiene que ser **determinístico y automático**, basado en estándares de la industria (CIS, NIST, EOL de equipos), no en el criterio del día.

## Evidence

- El pipeline IA (SPEC-00 §4) espera un JSON canónico — sin el cierre ese JSON no existe.
- Los clientes de SyS esperan un Índice de Salud IT/ERP comparable y defendible — un score subjetivo del técnico no es ni comparable entre auditorías ni defendible ante el cliente.
- Las plantillas v2 referencian estándares (CIS, NIST) por sección — esa es la base objetiva del scoring.
- Las plantillas v2 tienen el bloque "CIERRE DEL RELEVAMIENTO" ya definido con la estructura de riesgos y quick wins.

## Users

- **Primary — Técnico (Facu/Simón)**: carga top riesgos, quick wins, próximo paso. **No carga scores** (se autocalculan).
- **Primary — Admin (Martín)**: revisa, confirma el cierre, puede reabrir.
- **Not for**: clientes — no ven hallazgos de upsell ni detalles internos.

## Hypothesis

Creemos que scores autocalculados de forma determinística desde los ítems (rúbrica por ítem + pesos de sección) + campos para riesgos/quick wins/próximo paso + JSON canónico + preview del informe darán una salida objetiva, comparable y lista para la IA sin intervención subjetiva. Sabremos que funciona cuando dos técnicos distintos, con las mismas respuestas, obtengan exactamente el mismo score, y el pipeline n8n consuma el JSON sin transformaciones.

## Success Metrics

| Métrica | Target | Cómo medir |
|---|---|---|
| Scoring determinístico (mismo input → mismo output) | 100% reproducible | Test unitario: mismas respuestas → mismo score, siempre |
| Índice calculado correctamente con pesos | Error 0% (es cálculo puro) | Test unitario con fixture de respuestas |
| JSON canónico consumible por la IA | 100% compatible con el schema acordado | Validación del schema en el pipeline |
| Cierre completo < 10 min post-relevamiento | Promedio < 10 min | Medición en primeras 3 auditorías reales |

## Scope

**MVP** — **Scoring determinístico y automático**: cada ítem tiene una rúbrica que aporta puntos; el score de sección se calcula desde los ítems; los índices IT y ERP **independientes** se calculan con pesos data-driven (sin índice global). Campos para top riesgos + quick wins + hallazgos de upsell + próximo paso. **Preview del informe** legible en el cierre. Confirmación de cierre (`cerrada`), invalidación de token, JSON canónico con `schema_version`, endpoint de export. Ver contrato en [07i](auditapp-09-contrato-datos-ia.prd.md).

**Out of scope**

- Generación del informe final branded / PDF / Loom (eso es el pipeline SPEC-08; la app solo hace el preview).
- Scoring con IA generativa para inventario físico (v2 — ver Open Questions; en v1 el scoring de equipos es por reglas determinísticas de EOL/edad).
- Dashboard de comparativa entre auditorías (v2).

## Delivery Milestones

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 7a | Motor de scoring determinístico | Rúbrica por ítem → score de sección → índices IT/ERP. Mismo input = mismo output | pending | — |
| 7b | Pantalla de cierre + preview | Top riesgos + quick wins + upsell + próximo paso; preview legible del informe | pending | — |
| 7c | Confirmación y JSON canónico | `cerrada` + invalidación de token + endpoint de export con `schema_version` (ver 07i) | pending | — |

## Open Questions

- [x] ~~Confirmar mapa `weight → factor`~~ — **CONFIRMADO**: bajo=1, medio=2, alto=3, muy_alto=5.
- [x] ~~Índice global para combos~~ — **DECISIÓN**: no existe índice global. IT y ERP son scores independientes. Una auditoría combo tiene `indice_it` y `indice_erp` separados, sin combinación.
- [x] ~~¿Score manual o automático?~~ — **✅ AUTOMÁTICO y determinístico. El técnico no carga scores. Mismo input → mismo output.**
- [x] ~~¿Autocálculo del score por sección desde ítems?~~ — **✅ SÍ, es el MVP (no v2).**
- [x] ~~¿Preview del informe en la app?~~ — **✅ SÍ. La app genera el preview; el informe final/branded/Loom lo hace el pipeline SPEC-08.**
- [x] ~~Mapa de pesos~~ — **✅ AUTOMÁTICO: bajo=1, medio=2, alto=3, muy_alto=5, aplicado sin intervención.**
- [x] ~~Definir el JSON canónico~~ — **✅ Lo define SyS (el pipeline n8n no existe aún): [07i Contrato de datos](auditapp-09-contrato-datos-ia.prd.md). El pipeline se adapta a este contrato.**
- [x] ~~Estándar de scoring~~ — **✅ CIS Controls v8 + NIST CSF + escala de madurez 0/50/100, transversal a todo el proyecto. EOL por ciclo de vida del fabricante. Ver "Estándar de referencia" abajo.**
- [x] ~~Scoring por `field_type`~~ — **✅ Mapeado a la escala de madurez (no=0, parcial=50, si=100); umbrales numéricos y EOL según estándar.**
- [x] ~~Rangos de antigüedad fallback~~ — **✅ PC: <3a=100, 3-5a=50, >5a=0. Servidor/switch/firewall: <4a=100, 4-6a=50, >6a=0. Ajustables después.**
- [ ] Scoring de inventario físico con IA generativa (asistida, determinística) — v2; en v1 son reglas EOL.
- [x] ~~Auth del endpoint de export~~ — **✅ Sesión de admin.** El pipeline IA accede con credenciales de admin (no API key por ahora).

## Risks

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| JSON canónico no coincide con lo que espera la IA | Media | Alto | Coordinar schema antes de implementar 07f |
| Pesos del índice cambian después de lanzar | Alta | Medio | Pesos en `section.weight` en DB — cambiar = editar fila, no deploy |
| Técnico cierra antes de cargar todos los riesgos | Media | Bajo | Validación blanda — avisa si campos clave están vacíos pero no bloquea |

---

## Spec técnica de referencia

### Estándar de referencia (consistente en todo el proyecto)

El scoring se ancla a los estándares que **ya citan las plantillas v2** — no inventamos una escala propia:

- **CIS Controls v8** — cada sección de seguridad referencia un control CIS (ej. A1 = CIS 1 Inventario de activos). El nivel de cumplimiento mapea al puntaje.
- **NIST Cybersecurity Framework (CSF)** — las funciones Identify / Protect / Detect / Respond / Recover dan la dimensión de cada sección (el `standard_ref` ya lo trae).
- **Escala de madurez 0–100** derivada de esos estándares, uniforme en todo el proyecto:

| Madurez | Puntaje | Equivale a |
|---|---|---|
| Inexistente | 0 | `no` · control ausente |
| Inicial / parcial | 50 | `parcial` · control informal o incompleto |
| Definido / cumple | 100 | `si` · control implementado y verificable |

- **Hardware / EOL**: ciclo de vida del fabricante (End-of-Life / End-of-Support). Regla determinística: **en soporte vigente = 100 · soporte extendido = 50 · fuera de soporte (EOL) = 0**. Si no hay dato de fabricante, **fallback por antigüedad**:

| Tipo | 100 | 50 | 0 |
|---|---|---|---|
| PC / notebook | < 3 años | 3–5 años | > 5 años |
| Servidor / switch / firewall / red | < 4 años | 4–6 años | > 6 años |

> Esta escala es **transversal**: la misma para IT, ERP Tango y ERP Estándar. Cualquier ítem con scoring se mapea a 0/50/100 según madurez, y los pesos de sección (bajo/medio/alto/muy_alto) ponderan el resultado.

### Scoring determinístico (3 niveles)

El score se construye de abajo hacia arriba, sin intervención humana:

**1. Ítem → puntos (rúbrica por `field_type`)**

Cada `template_item` define cuánto aporta cada respuesta. La rúbrica vive en la plantilla (data-driven), por eso editar el criterio = editar una fila.

| field_type | Regla determinística de puntaje (0–100) |
|---|---|
| `bool` | `si`=100 · `no`=0 |
| `tri` | `si`=100 · `parcial`=50 · `no`=0 |
| `select` | mapa `options → puntaje` definido en `options.score_map` (ej. `WPA3`=100, `WPA2`=60, `abierto`=0) |
| `number`/`percent` | umbral configurable en `options.thresholds` (ej. ≥95%→100, 80-94→60, <80→0) |
| `table` (inventario) | promedio determinístico por fila según reglas de EOL/edad (ver abajo) |
| `text`/`list`/`file_ref` | informativo — no puntúa, salvo `required` no respondido (penaliza presencia) |

Cada ítem puede tener un peso relativo dentro de su sección (`item_weight`, opcional; default 1).

**2. Ítems → score de sección**

```
score_sección = Σ(puntos_ítem × item_weight) / Σ(item_weight)   [solo ítems que puntúan y no N/A]
```

**3. Secciones → índice de plantilla**

```
indice_plantilla = Σ(score_sección × factor_peso_sección) / Σ(factores)
```
Excluye `CAB` (has_score=false) y secciones N/A completas.
Factores **automáticos**: `bajo=1 · medio=2 · alto=3 · muy_alto=5`.

### Scoring de inventario físico (`table` de equipos)

Determinístico por reglas, **no** por criterio del técnico:
- Edad / EOL del equipo (fecha de compra o modelo → tabla EOL conocida).
- Estado de soporte del fabricante (vigente / extendido / fin de vida).
- Relación con la infra disponible (¿está sobre/sub-dimensionado para su rol?).

> v1: tabla de reglas determinísticas (rangos de edad, lista EOL). v2: una IA puede asistir el scoring de inventario **pero el resultado debe seguir siendo determinístico y reproducible** (misma entrada → mismo score).

`audit_section_score.score` pasa a ser un valor **calculado**, no ingresado (ver 07a). `score_basis = "auto"` en el JSON (07i).

### Sin índice global

IT y ERP son scores independientes. Una auditoría combo expone `indice_it` y `indice_erp` por separado — no se combinan. `audit_closure.indice_global` se elimina del schema (ver 07a).

### JSON canónico (estructura de referencia)

```json
{
  "schema_version": "1.0",
  "audit_id": "...",
  "client": { "razon_social": "...", "cuit": "..." },
  "types": ["it", "erp-tango"],
  "sections": [
    {
      "code": "A1",
      "title": "...",
      "score": 75,
      "weight": "alto",
      "items": [
        { "label": "...", "value": true, "na": false, "observations": "..." }
      ]
    }
  ],
  "indices": { "it": 68, "erp": 72 },
  "top_risks": [{ "text": "...", "severity": "alta" }],
  "quick_wins": ["..."],
  "next_step": "...",
  "closed_at": "2026-06-07T..."
}
```

### Semáforo de índices

🟢 70–100 · 🟠 40–69 · 🔴 0–39

---

*Status: DRAFT. Spec de referencia completa en [`specs/08_cierre_scoring/requirements.md`](../../specs/08_cierre_scoring/requirements.md).*
