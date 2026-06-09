# auditapp

Auditapp permite a los técnicos de Servicios y Sistemas auditar empresas en toda su infraestructura IT e ERP, desde la agenda del cliente hasta el cierre de la auditoría con presupuestos acordes al mismo origen de presupuestos.serviciosysistemas.com.ar.

## Reglas del proyecto

- Responde en español salvo que el usuario pida otro idioma.
- Lee `AGENTS.md` y `PROJECT.md` al inicio de cada sesión.
- No commitees secretos (.env, claves, tokens).
- Backlog único: `feature_list.json`. Una feature a la vez.

## Arnés SDD (harness-sdd)

Este repo usa **Spec-Driven Development** con puerta de aprobación humana.

| Harness | Ubicación |
|---|---|
| **Cursor (primario)** | `.cursor/agents/`, `.cursor/hooks.json`, `/leader` |
| Claude Code (espejo) | `.claude/agents/`, `.claude/settings.json` |

Flujo: `pending → spec_author → spec_ready → ⏸ HUMANO → in_progress → implementer → reviewer → done`

Entrada: `AGENTS.md`. Verificación: `./init.sh`.

Specs históricos (referencia): `docs/source-specs/`. Specs vivos: `specs/<feature>/`.

## Stack y comandos

**SvelteKit 5 · TypeScript · PostgreSQL · postgres.js · Cloudflare R2 · Docker · Tailwind · Zod**

> App aún sin scaffolding. Tras feature #1 `stack_scaffolding`:

- **Dev:** `pnpm run dev`
- **Build:** `pnpm run build`
- **Typecheck:** `pnpm run check` · `pnpm exec tsc --noEmit`
- **Test:** `pnpm test` (vitest) · `pnpm exec playwright test` (e2e)
- **Gate arnés:** `./init.sh`
- **DB:** SQL en `migrations/` + runner propio

## Rol en Claude Code

Actuá como `leader` (`.claude/agents/leader.md`): coordiná, no implementes código de app.
Lanzá `spec_author`, `implementer`, `reviewer` según el estado en `feature_list.json`.
