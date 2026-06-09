# CHECKPOINTS — Evaluación del estado final

> En sistemas multi-agente no se evalúa el camino, se evalúa el destino.

## C1 — El arnés está completo

- [ ] Existen: `AGENTS.md`, `init.sh`, `feature_list.json`, `progress/current.md`.
- [ ] Existen: `docs/architecture.md`, `docs/conventions.md`, `docs/verification.md`, `docs/specs.md`.
- [ ] `./init.sh` termina con exit code 0.

## C2 — El estado es coherente

- [ ] Como mucho una feature en `in_progress` en `feature_list.json`.
- [ ] Toda feature `done` tiene tests asociados que pasan.
- [ ] `progress/current.md` vacío o describe sesión activa (sin basura histórica).

## C3 — El código respeta la arquitectura

- [ ] `src/lib/server/db/` solo SQL parametrizado (postgres.js).
- [ ] No hay ORM ni queries raw sin parametrizar.
- [ ] No hay `console.log` de debug ni TODOs sin contexto.
- [ ] Secretos solo en env vars, nunca en código.

## C4 — La verificación es real

- [ ] `tests/` cubre funciones públicas de `src/lib/`.
- [ ] `pnpm exec vitest run` muestra > 0 tests y todos verdes (cuando exista scaffolding).
- [ ] Flujos críticos tienen spec playwright en `e2e/` (post-MVP features).

## C5 — La sesión se cerró bien

- [ ] No hay archivos sin trackear sospechosos (`*.tmp`, `.env`).
- [ ] `progress/history.md` tiene entrada de la última sesión.
- [ ] La última feature trabajada refleja su estado correcto.

## C6 — Spec Driven Development

- [ ] Toda feature `sdd: true` en `spec_ready`, `in_progress` o `done` tiene
      `specs/<name>/` con `requirements.md`, `design.md`, `tasks.md`.
- [ ] `requirements.md` usa EARS estricto (ver `docs/specs.md`).
- [ ] Toda feature `done` con `sdd: true` tiene todas las tasks `[x]` en `tasks.md`.
- [ ] Cada `R<n>` cubierto por al menos un test en `tests/` o `e2e/`.

---

**Uso:** el `reviewer` recorre cada checkbox y rechaza el cierre si C1–C6 fallan.
