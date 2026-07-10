# Implementation Plans — auditoría seguridad P0/P1

Generados por el skill improve el 2026-07-10 contra commit `6307b6d`.
**Specs EARS vivos:** `specs/56_storage_audit_access/`,
`specs/57_backoffice_mutation_scope/`, `specs/58_manual_informe_encuesta_csp/`
(`feature_list` status `done` para #56–#58).

Ejecutar en el orden de la tabla salvo que las dependencias digan lo contrario.
Cada executor: leer el plan completo antes de empezar, honrar STOP conditions, y actualizar la fila de status al terminar.

## Execution order & status

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 01 | Assert audit storage access (IDOR adjuntos) | P0 | M | — | DONE |
| 02 | Backoffice mutation scope (update/archive/briefing) | P0 | M | — | DONE |
| 03 | Manual informe encuesta + race + CSP documentada | P1 | M | — | DONE |

Status values: TODO | IN PROGRESS | DONE | BLOCKED (con razón de una línea) | REJECTED (con racional)

## Dependency notes

- 01, 02 y 03 son independientes entre sí (pueden ejecutarse en paralelo en worktrees distintos).
- 01 y 02 comparten el patrón de autorización por `audit_assignment` / `techIsAssigned`; si ambos corren en paralelo, no editar el mismo helper nuevo dos veces: 01 introduce el check en storage; 02 lo aplica en actions de detalle. No hay archivo compartido obligatorio.
- Un plan **04** (pool `max:1`, jobs fire-and-forget, JSONB en listados) quedó fuera de esta pasada: es escala/perf, no P0/P1 de seguridad. Abrirlo solo si el operador lo pide.

## Findings considered and deferred

- **Pool postgres `max:1` + jobs fire-and-forget + JSONB blobs en listados**: impacto de escala real, pero no es IDOR ni mutación privilegiada. Candidate a `04_pool_jobs_list_payloads.md` en una pasada posterior.
- **ROADMAP/README congelados; `init.sh` solo corre `pnpm test`**: deuda de docs/tooling; no bloquea remediación P0/P1. Los planes usan `pnpm test` + `pnpm run check` como gates (check no está en init.sh hoy).
