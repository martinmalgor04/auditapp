#!/usr/bin/env bash
# Restaura esta carpeta al estado de plantilla maestra (sin datos de proyecto).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ "${1:-}" == "--force" ]]; then
  :
elif [[ -f "$ROOT/.template/config.yaml" ]] && grep -q 'is_template: false' "$ROOT/.template/config.yaml" 2>/dev/null; then
  echo "Error: is_template: false — parece un proyecto real." >&2
  echo "Usá --force solo si sabés que querés borrar metadata de proyecto." >&2
  exit 1
fi

echo "Restaurando plantilla en: $ROOT"

mkdir -p "$ROOT/.template"
cat > "$ROOT/.template/config.yaml" <<'EOF'
is_template: true
project_name: "{{PROJECT_NAME}}"
description: "Plantilla de proyecto con ECC para Cursor y Claude Code"
languages:
  - typescript
ecc_version: "2.0.0-rc.1"
maintainer: "martinmalgor"
EOF

cat > "$ROOT/PROJECT.md" <<'EOF'
# {{PROJECT_NAME}}

> Plantilla de proyecto con [ECC](https://github.com/affaan-m/ECC) preconfigurado para **Cursor** y **Claude Code**.

Describe aquí el propósito del proyecto una vez que completes el onboarding.

## Estado

- [ ] Ejecutar `./scripts/onboard-project.sh` o `/onboard-proyecto`
- [ ] Completar sección "Notas del proyecto" abajo
- [ ] Configurar `.env` desde `.env.example`

## Comandos del agente

| Comando | Uso |
|---------|-----|
| `/onboard-proyecto` | Onboarding guiado en español |
| `/project-init` | Detectar stack y plan ECC |
| `/ecc-guide` | Explorar capacidades de ECC |
| `/harness-audit` | Verificar hooks, reglas y skills |

## Notas del proyecto

<!-- arquitectura, URLs, convenciones, decisiones -->
EOF

cat > "$ROOT/CLAUDE.md" <<'EOF'
# Plantilla ECC — no es un proyecto de producto

Este directorio es la **plantilla maestra**. Duplícala con `./scripts/duplicate-project.sh` antes de desarrollar.

Para onboarding en agentes: `/onboard-proyecto`

Ver [README.md](./README.md) para instrucciones completas.
EOF

rm -f "$ROOT/.env"

if [[ -f "$ROOT/scripts/migrate-cursor-commands-to-skills.cjs" ]]; then
  node "$ROOT/scripts/migrate-cursor-commands-to-skills.cjs"
fi

if [[ -d "$ROOT/_ecc" ]]; then
  (cd "$ROOT/_ecc" && npm install --no-audit --no-fund --loglevel=error 2>/dev/null) || true
  node "$ROOT/_ecc/scripts/ecc.js" repair 2>/dev/null || true
fi

echo ""
echo "Plantilla restaurada (is_template: true)."
echo "Duplicar: ./scripts/duplicate-project.sh <nombre-proyecto>"
