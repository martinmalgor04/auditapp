# Historial de sesiones

> Bitácora append-only. Cada sesión cerrada añade una entrada al final.

## 2026-06-08 — Migración ECC → harness-sdd

- **Agente:** Cursor (migración de arnés)
- **Resultado:** ECC eliminado. Arnés SDD instalado. 10 features en `feature_list.json`, todas `pending`.
- **Próximo paso:** `/leader` → feature #1 `01_stack_scaffolding` → `spec_author`

## 2026-06-08 — 01_stack_scaffolding (#1) done

- **Agente:** implementer → reviewer
- **Resultado:** Scaffolding SvelteKit 5 + adapter-node, TypeScript strict, Tailwind, Zod, postgres.js stub, vitest (9 tests), Playwright (1 e2e), Postgres 16 Docker dev. `./init.sh`, `pnpm run check`, `pnpm run build`, `pnpm test` verdes.
- **Veredicto:** APPROVED (`progress/review_01_stack_scaffolding.md`)
- **Próximo paso:** `/leader` → feature #2 `02_modelo_datos` → `spec_author`

## 2026-06-08 — 02_modelo_datos (#2) done

- **Agente:** implementer → reviewer
- **Resultado:** Schema Postgres 12 tablas, 12 `field_type`, máquina estados, runner migraciones, Zod field-schemas, seed idempotente (1 admin + 2 técnicos, 3 plantillas, 1895 clientes CSV). 38 tests DB. `./init.sh` verde.
- **Veredicto:** APPROVED (`progress/review_02_modelo_datos.md`)
- **Notas:** Plantillas generadas sin SPEC-04 en repo (fixtures representativos). CSV 1895 registros lógicos.
- **Próximo paso:** `/leader` → feature #3 `03_auth_roles` (spec ya en `spec_ready`, pendiente aprobación humana o implementación)

## 2026-06-08 — 03_auth_roles (#3) done

- **Agente:** implementer → reviewer
- **Resultado:** Auth argon2id, sesiones cookie HttpOnly/Secure/SameSite=Lax, hooks con renovación sliding, guards admin/técnico, rate limit login (5/60s), validación token briefing por `audit.status`, rutas `/login`, `/logout`, `(app)/`, `/briefing/[token]`. 51 tests nuevos en `tests/auth/` (85 total). `./init.sh`, `pnpm run check`, `pnpm run build` verdes.
- **Veredicto:** APPROVED (`progress/review_03_auth_roles.md`)
- **Próximo paso:** `/leader` → feature #4 `04_backoffice` (spec en `spec_ready`, pendiente aprobación humana)

## 2026-06-09 — 04_backoffice (#4) done

- **Agente:** implementer → reviewer
- **Resultado:** Backoffice bajo `(app)/`: tablero (filtros/búsqueda/orden/paginación 50), CRUD auditorías con congelado de plantillas, briefing link generate/regenerate/copy, ABM usuarios admin, editor plantillas acotado, layout responsive tabla/cards. Migración `002_backoffice.sql` (`archived_at`). 30 tests nuevos (115 vitest total). 2 e2e backoffice verdes. `./init.sh`, `pnpm run check`, `pnpm test`, playwright backoffice OK.
- **Veredicto:** APPROVED (`progress/review_04_backoffice.md`)
- **Próximo paso:** `/leader` → feature #5 `05_briefing_externo` (spec en `spec_ready`, pendiente aprobación humana)
