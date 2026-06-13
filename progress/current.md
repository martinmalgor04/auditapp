# Sesión actual

## Batch de implementación (2026-06-12, noche)

Mandato de Martín (goal autónomo): **implementar TODAS las features `spec_ready`**
(#15, #16, #13, #17, #18, #19, #12 en ese orden), una a la vez, con commit + push
por feature al quedar verde. La aprobación humana de la puerta SDD quedó dada por
el mandato; las open questions de cada design se resuelven adoptando la propuesta
del spec_author (documentado por feature abajo).

## Feature en curso: #15 `15_entrega_informe`

- **Estado:** in_progress — implementación T1–T16 completa; pendiente reviewer
- **Specs:** `specs/15_entrega_informe/{requirements,design,tasks}.md` (tasks [x] T1–T16)
- **Trazabilidad:** `progress/impl_15_entrega_informe.md`
- **Verificación:** `./init.sh` verde · `pnpm test` 451 passed · e2e entrega-informe OK

## Cola pendiente

| # | Feature | Estado |
|---|---|---|
| 16 | 16_presupuesto_psys | spec_ready (siguiente) |
| 13 | 13_crm_leads | spec_ready |
| 17 | 17_contexto_ia | spec_ready |
| 18 | 18_dashboard_mercado | spec_ready |
| 19 | 19_template_informe_it | spec_ready |
| 12 | 12_reunion_asistente | spec_ready (último — mayor alcance) |

⚠️ Los designs de #13/#16/#17 asumen migración `006_*.sql` (escritos en paralelo):
el implementer de cada una debe renumerar a la próxima libre al entrar.
