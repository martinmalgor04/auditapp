# auditapp

Auditapp permite a los tecnicos de servicios y sistemas Auditar empresas en toda su infraestructura IT e ERP, desde la agenda del cliente hasta el cierre de la auditoria con presupuestos acordes al mismovienen de presupuestos.serviciosysistemas.com.ar

## Reglas del proyecto

- Responde en español salvo que el usuario pida otro idioma.
- Lee `PROJECT.md` al inicio de cada sesión si existe.
- Usa `/project-init` para ajustar reglas ECC al stack detectado.
- No commitees secretos (.env, claves, tokens).

## Stack y comandos

Stack (SPEC-07): **SvelteKit + TypeScript · Postgres (Dokploy) · Cloudflare R2 · Docker**.

> ⚠️ App aún sin scaffolding. Comandos provisorios (SvelteKit por defecto), ajustar al crear `package.json`:

- **Dev:** `npm run dev` (vite)
- **Build:** `npm run build`
- **Typecheck:** `npm run check` (svelte-check) · `npx tsc --noEmit`
- **Lint/format:** `npx eslint .` · `npx prettier --write .`
- **Test:** `npx vitest` (unit) · `npx playwright test` (e2e)
- **DB migraciones:** `npx drizzle-kit *` (ORM por definir en 07h)

## ECC

Este proyecto incluye [ECC](https://github.com/affaan-m/ECC) a nivel de proyecto:
- Cursor: `.cursor/`
- Claude Code: `.claude/`

Skills ECC podadas al stack: **46 skills** activas en `.claude/skills/ecc/` (TS/frontend/backend/Postgres/Docker + calidad/seguridad/research/orquestación). Restaurar set completo: `node _ecc/scripts/install-apply.js --target claude-project --profile full`.

Permisos acotados al stack en `.claude/settings.json`.

Para onboarding guiado: `/onboard-proyecto`
