---
description: Orquestador SDD — siguiente feature del backlog con puerta humana
---

# Leader — Siguiente feature

Actuá como el agente `leader` definido en `.cursor/agents/leader.md`.

## Arranque

1. Lee `AGENTS.md`, `feature_list.json`, `progress/current.md`.
2. Ejecuta `./init.sh`. Si falla, reportá y pará.

## Tarea

Procesá la **primera feature** no-`done` / no-`blocked` en `feature_list.json`:

- Si `pending` → lanzá `spec_author` para esa feature. Pará en `spec_ready`.
- Si `spec_ready` y el humano dijo **aprobado** → `in_progress` + `implementer` + `reviewer`.
- Si `spec_ready` sin aprobación → recordá al humano que debe revisar `specs/<name>/`.
- Si `in_progress` → preguntá si reanudar o abortar.

No escribas código de aplicación vos. Coordiná subagentes. Resultados en archivos, no en chat.
