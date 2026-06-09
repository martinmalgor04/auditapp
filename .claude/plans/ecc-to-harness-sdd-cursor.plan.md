# Plan: ECC → harness-sdd (Cursor-first)

**Source**: inspección `/tmp/harness-sdd-inspect` + plan acordado en sesión
**Selected Milestone**: migración completa del arnés (Fases 0–4)
**Complexity**: Large

## Summary

Reemplazar ECC (~135M, 1700+ archivos) por harness-sdd adaptado a auditapp: SvelteKit + TypeScript + postgres.js + vitest/playwright. **Cursor es el harness primario** (`.cursor/agents`, `.cursor/hooks.json`, reglas mínimas). Metodología SDD con EARS, puerta humana en `spec_ready`, y `feature_list.json` como backlog único. Solo pre-migro feature #2 (`02_modelo_datos`) a EARS; resto queda `pending` para `spec_author`.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Naming | `specs/02_modelo_datos/spec.md:1-10` | Specs con ID `SPEC-07X`, tablas de columnas, diagramas ASCII |
| Feature IDs | `/tmp/harness-sdd-inspect/feature_list.json:11-18` | `id` numérico, `name` snake_case, `acceptance[]` verificable |
| EARS | `/tmp/harness-sdd-inspect/specs/cli_recent/requirements.md:9-38` | `R<n>` + patrones CUANDO/SI/MIENTRAS + `DEBE`/`NO DEBE` |
| SDD flow | `/tmp/harness-sdd-inspect/AGENTS.md:48-64` | `pending → spec_author → spec_ready → ⏸ HUMANO → in_progress → implementer → reviewer → done` |
| Errors | `/tmp/harness-sdd-inspect/init.sh:15-17` | `[OK]`/`[FAIL]`/`[WARN]` + exit code explícito |
| Tests | `ROADMAP.md:17-19` | vitest unit + playwright e2e (aún sin scaffolding — init tolerante) |
| Logging | N/A | Sin código app — definir en `docs/conventions.md` al instalar arnés |
| Data access | `specs/02_modelo_datos/spec.md:55` | postgres.js SQL puro, migraciones en `/migrations/` |

## Delta Cursor vs harness original

Harness original apunta a Claude Code (`.claude/agents/`, `.claude/settings.json`). Auditapp usa **Cursor como IDE primario**:

| Pieza harness | Original (Python/Claude) | Adaptación Cursor (auditapp) |
|---|---|---|
| Agentes | `.claude/agents/*.md` | `.cursor/agents/{leader,spec_author,implementer,reviewer}.md` |
| Hooks tests | PostToolUse → `python3 -m unittest` | `afterFileEdit` → `npm test` (o `npx vitest run` si no hay script) |
| Hooks cierre | Stop → `./init.sh` | `sessionEnd` → `./init.sh` |
| Reglas | N/A (solo docs/) | `.cursor/rules/` mínimo: `harness-sdd.mdc`, `stack.mdc`, `security.mdc` (~3 archivos) |
| Comandos | N/A | `.cursor/commands/leader.md` (entrada única al flujo SDD) |
| Entrada agente | `AGENTS.md` | `AGENTS.md` (Cursor lo lee nativamente) |
| Claude Code | — | `.claude/agents/` + `settings.json` espejo opcional (mismo contenido, hooks Claude) |

## Files to Change

| File | Action | Why |
|---|---|---|
| `_ecc/` | DELETE | ECC completo |
| `.cursor/` (actual ECC) | DELETE + CREATE | Reemplazar 749 archivos ECC por arnés slim |
| `.template/` | DELETE | Plantilla ECC |
| `ecc-install.json` | DELETE | Estado ECC |
| `scripts/{duplicate-project,onboard-project,reset-to-template,update-ecc}.sh` | DELETE | Scripts ECC |
| `scripts/migrate-cursor-commands-to-skills.cjs` | DELETE | Script ECC |
| `.claude/{agents,commands,skills,rules,hooks,ecc,scripts,mcp-configs,.agents}/` | DELETE | ECC Claude (conservar `.claude/prds/`, `.claude/plans/`) |
| `.claude/{AGENTS.md,settings.json,marketplace.json,...}` | DELETE | Metadatos ECC |
| `AGENTS.md` | CREATE | Mapa de navegación harness |
| `CHECKPOINTS.md` | CREATE | Criterios objetivos (adaptado SvelteKit) |
| `feature_list.json` | CREATE | Backlog 10 features |
| `init.sh` | CREATE | Gate node/npm + validación JSON + tests |
| `progress/{current,history}.md` | CREATE | Bitácora de sesiones |
| `docs/{architecture,conventions,verification,specs}.md` | CREATE | Docs del arnés (stack auditapp) |
| `docs/source-specs/` | CREATE (MOVE) | PRDs + specs/07a–07i como referencia muerta |
| `specs/02_modelo_datos/{requirements,design,tasks}.md` | CREATE | Único spec EARS pre-migrado (#2) |
| `.cursor/agents/{leader,spec_author,implementer,reviewer}.md` | CREATE | Subagentes SDD |
| `.cursor/hooks.json` | CREATE | Hooks slim (init + tests) |
| `.cursor/hooks/{after-file-edit-harness,session-end-harness}.js` | CREATE | Scripts hook mínimos |
| `.cursor/rules/{harness-sdd,stack,security}.mdc` | CREATE | Reglas esenciales |
| `.cursor/commands/leader.md` | CREATE | Comando de entrada al flujo |
| `.claude/agents/` + `.claude/settings.json` | CREATE (opcional) | Paridad Claude Code |
| `CLAUDE.md` | UPDATE | Fusionar negocio SyS + reglas harness (sin bloque ECC) |
| `PROJECT.md` | UPDATE | Quitar tabla ECC; apuntar a `feature_list.json` + `AGENTS.md` |
| `ROADMAP.md` | UPDATE | Reemplazar "Flujo ECC" por flujo harness SDD |

## Tasks

### Task 0: Branch + inventario conservar
- **Action**: `git checkout -b chore/swap-ecc-to-harness-sdd`. Verificar `_ecc/` no es submódulo. Documentar lista conservar: `.claude/prds/`, `.claude/plans/`, `ROADMAP.md`, `seed/`, `specs/` (hasta mover), `CLAUDE.md` contexto negocio.
- **Mirror**: git workflow convencional del repo
- **Validate**: `git status` en branch nuevo

### Task 1: Borrado selectivo ECC
- **Action**: Ejecutar `rm -rf` según tabla Files to Change. No tocar `docs/source-specs/` destino hasta Task 3.
- **Mirror**: plan acordado Fase 1
- **Validate**: `du -sh .` baja ~135M; `ls .claude/prds/` intacto

### Task 2: Instalar arnés core (Cursor-first)
- **Action**: Crear `AGENTS.md`, `CHECKPOINTS.md`, `progress/*`, `docs/*`, `init.sh` reescritos para SvelteKit/TS. `init.sh` verifica: node≥20, npm, archivos base, `feature_list.json` + specs, `npm test` (warn si no hay `package.json` aún).
- **Mirror**: `/tmp/harness-sdd-inspect/{AGENTS.md,init.sh,CHECKPOINTS.md,docs/*}`
- **Validate**: `chmod +x init.sh && ./init.sh` → exit 0 (pre-scaffolding)

### Task 3: Cursor harness surface
- **Action**: Crear 4 agentes en `.cursor/agents/`, `hooks.json` slim (reemplaza ECC hooks), 3 rules, comando `leader.md`. Borrar resto `.cursor/` ECC previo.
- **Mirror**: `/tmp/harness-sdd-inspect/.claude/agents/*` + `.cursor/hooks.json` formato actual
- **Validate**: `ls .cursor/agents/` = 4 archivos; `jq . .cursor/hooks.json` válido

### Task 4: feature_list.json
- **Action**: 10 features, todas `sdd: true`, `status: pending` excepto #2 si pre-migro EARS:

| id | name | title | deps |
|---|---|---|---|
| 1 | stack_scaffolding | SvelteKit + tooling base | — |
| 2 | modelo_datos | Schema Postgres + seed | 1 |
| 3 | auth_roles | Auth argon2id + guards | 2 |
| 4 | backoffice | Admin + técnico CRUD | 3 |
| 5 | briefing_externo | Link público cliente | 3 |
| 6 | storage_r2 | Presigned R2 | 1 |
| 7 | form_tecnico | Form mobile PWA | 3,6 |
| 8 | cierre_scoring | Scoring determinístico | 7 |
| 9 | contrato_datos | JSON canónico IA | 8 |
| 10 | deploy_dokploy | Docker + Dokploy | 9 |

- **Mirror**: `/tmp/harness-sdd-inspect/feature_list.json` schema exacto
- **Validate**: `node -e "JSON.parse(require('fs').readFileSync('feature_list.json'))"`

### Task 5: Pre-migrar solo modelo_datos (#2) a EARS
- **Action**: `specs/02_modelo_datos/{requirements,design,tasks}.md` desde `specs/02_modelo_datos/spec.md` + `.claude/prds/auditapp-02-modelo-datos.prd.md`. Marcar #2 como `spec_ready` (ejemplo para revisión humana) o `pending` si preferís que spec_author lo genere — **default acordado: pre-migro completo, status `spec_ready`**.
- **Mirror**: EARS de `/tmp/harness-sdd-inspect/specs/cli_recent/requirements.md`
- **Validate**: `./init.sh` pasa con specs presentes para #2

### Task 6: Archivar fuentes vivas → referencia
- **Action**: Mover `.claude/prds/` → `docs/source-specs/prds/`; mover `specs/07a..07i/` → `docs/source-specs/specs-07/`. Actualizar links en `ROADMAP.md`.
- **Mirror**: principio "una sola fuente viva" del arnés
- **Validate**: no queda `specs/07*` en raíz; `docs/source-specs/` tiene 9+1 PRDs

### Task 7: Actualizar docs proyecto
- **Action**: `CLAUDE.md`, `PROJECT.md`, `ROADMAP.md` sin referencias ECC. Flujo nuevo: `@leader` o `/leader` → feature_list.
- **Mirror**: `/tmp/harness-sdd-inspect/CLAUDE.md` estructura
- **Validate**: `rg -i "ECC|/plan |tdd-workflow" CLAUDE.md PROJECT.md ROADMAP.md` → 0 hits (salvo histórico en source-specs)

### Task 8: Verificar + commit
- **Action**: `./init.sh` verde. Commit en branch (sin push salvo pedido).
- **Mirror**: CHECKPOINTS C1–C6 adaptados
- **Validate**: `./init.sh`; `git diff --stat`

## Validation

```bash
chmod +x init.sh
./init.sh
node -e "const d=require('./feature_list.json'); console.log(d.features.length, 'features')"
test -f specs/02_modelo_datos/requirements.md
test -f .cursor/agents/leader.md
test ! -d _ecc
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Borrar PRDs/specs por error | Medium | Branch + mover a `docs/source-specs/`, no borrar |
| Hooks asumen Python | High | Reescritos a node/npm en Task 3 |
| 27 specs EARS prematuras | Medium | Solo #2 pre-migrada; resto `spec_author` |
| Perder comandos ECC | Certain | Flujo `leader` reemplaza; documentar en AGENTS.md |
| init.sh falla sin scaffolding | High | Warn tolerante en Task 2 hasta feature #1 done |
| Cursor hooks rompen sesión | Low | Hooks mínimos; sin ECC session-start bloat |

## Acceptance

- [ ] ECC eliminado (`_ecc/`, `.cursor/` viejo, `.claude/` ECC)
- [ ] Arnés completo: AGENTS.md, init.sh, feature_list.json, progress/, docs/, CHECKPOINTS.md
- [ ] Cursor: 4 agentes + hooks.json slim + 3 rules
- [ ] 10 features en feature_list.json, todas `sdd: true`
- [ ] Solo `specs/02_modelo_datos/` con EARS completo (resto pending)
- [ ] Fuentes archivadas en `docs/source-specs/`
- [ ] `./init.sh` exit 0
- [ ] ROADMAP/PROJECT/CLAUDE actualizados

## Decisiones pendientes (confirmar antes de ejecutar)

1. **Pre-migración EARS**: ¿solo #2 (recomendado) o las 10 ahora?
2. **Status #2 post-migración**: ¿`spec_ready` (ejemplo listo para aprobar) o `pending`?
3. **Espejo `.claude/`**: ¿sí (dual harness) o solo Cursor?
4. **Go Fases 0→4**: responder `dale` / `proceder` / `modificar: ...`
