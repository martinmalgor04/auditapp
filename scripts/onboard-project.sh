#!/usr/bin/env bash
# Onboarding interactivo para un proyecto nuevo basado en esta plantilla.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "=============================================="
echo "  Onboarding de proyecto — ECC Template"
echo "=============================================="
echo ""

read -r -p "Nombre del proyecto: " PROJECT_NAME
PROJECT_NAME="${PROJECT_NAME:-$(basename "$ROOT")}"

read -r -p "Descripción breve: " PROJECT_DESC
PROJECT_DESC="${PROJECT_DESC:-Proyecto basado en plantilla ECC}"

echo ""
echo "Stack principal (elige números separados por coma):"
echo "  1) TypeScript / JavaScript"
echo "  2) Python"
echo "  3) Go"
echo "  4) Swift"
echo "  5) PHP"
echo "  6) Rust"
echo "  7) Solo reglas comunes (sin stack extra)"
read -r -p "Selección [1]: " STACK_CHOICE
STACK_CHOICE="${STACK_CHOICE:-1}"

LANGS=()
case "$STACK_CHOICE" in
  *1*) LANGS+=("typescript") ;;
  *2*) LANGS+=("python") ;;
  *3*) LANGS+=("golang") ;;
  *4*) LANGS+=("swift") ;;
  *5*) LANGS+=("php") ;;
  *6*) LANGS+=("rust") ;;
esac

read -r -p "¿Inicializar repositorio git? [S/n]: " INIT_GIT
INIT_GIT="${INIT_GIT:-S}"

read -r -p "¿Instalar dependencias de _ecc (para actualizar ECC)? [S/n]: " INSTALL_ECC
INSTALL_ECC="${INSTALL_ECC:-S}"

# Actualizar PROJECT.md
cat > "$ROOT/PROJECT.md" <<EOF
# $PROJECT_NAME

$PROJECT_DESC

## Stack

$(printf '- %s\n' "${LANGS[@]:-common}")

## Comandos útiles

| Acción | Cursor | Claude Code |
|--------|--------|-------------|
| Onboarding | \`/onboard-proyecto\` | \`/onboard-proyecto\` |
| Inicializar ECC en repo | \`/project-init\` | \`/project-init\` |
| Guía ECC | \`/ecc-guide\` | \`/ecc-guide\` |
| Auditoría de harness | \`/harness-audit\` | \`/harness-audit\` |

## Notas del proyecto

<!-- Añade aquí convenciones, URLs, credenciales (sin secretos), arquitectura -->

EOF

# CLAUDE.md mínimo (no copiar AGENTS.md de ECC)
cat > "$ROOT/CLAUDE.md" <<EOF
# $PROJECT_NAME

$PROJECT_DESC

## Reglas del proyecto

- Responde en español salvo que el usuario pida otro idioma.
- Lee \`PROJECT.md\` al inicio de cada sesión si existe.
- Usa \`/project-init\` para ajustar reglas ECC al stack detectado.
- No commitees secretos (.env, claves, tokens).

## ECC

Este proyecto incluye [ECC](https://github.com/affaan-m/ECC) a nivel de proyecto:
- Cursor: \`.cursor/\`
- Claude Code: \`.claude/\`

Para onboarding guiado: \`/onboard-proyecto\`
EOF

# Actualizar config de plantilla
mkdir -p "$ROOT/.template"
cat > "$ROOT/.template/config.yaml" <<EOF
is_template: false
project_name: "$PROJECT_NAME"
description: "$PROJECT_DESC"
languages:
$(for lang in "${LANGS[@]}"; do echo "  - $lang"; done)
onboarded_at: "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
ecc_version: "2.0.0-rc.1"
EOF

# Instalar reglas de idioma adicionales si hace falta
if [[ ${#LANGS[@]} -gt 0 && -d "$ROOT/_ecc" ]]; then
  echo ""
  echo "Instalando reglas ECC para: ${LANGS[*]}"
  for lang in "${LANGS[@]}"; do
    node "$ROOT/_ecc/scripts/install-apply.js" --target cursor "$lang" 2>/dev/null || true
    node "$ROOT/_ecc/scripts/install-apply.js" --target claude-project --profile core --with "lang:$lang" 2>/dev/null || true
  done
fi

# Migrar comandos a Skills (Cursor) y reparar install-state
if [[ -f "$ROOT/scripts/migrate-cursor-commands-to-skills.cjs" ]]; then
  echo ""
  echo "Migrando comandos ECC al formato Skills de Cursor..."
  node "$ROOT/scripts/migrate-cursor-commands-to-skills.cjs"
fi
if [[ -f "$ROOT/_ecc/scripts/ecc.js" ]]; then
  node "$ROOT/_ecc/scripts/ecc.js" repair 2>/dev/null || true
fi

if [[ "$INSTALL_ECC" =~ ^[Ss]$ ]]; then
  echo ""
  echo "Instalando dependencias de _ecc..."
  (cd "$ROOT/_ecc" && npm install --no-audit --no-fund --loglevel=error)
fi

if [[ "$INIT_GIT" =~ ^[Ss]$ ]]; then
  if [[ ! -d "$ROOT/.git" ]]; then
    git init "$ROOT"
    git -C "$ROOT" add .
    git -C "$ROOT" commit -m "$(cat <<EOF
chore: onboarding inicial de $PROJECT_NAME

Plantilla ECC con configuración para Cursor y Claude Code.
EOF
)"
    echo "Repositorio git inicializado."
  else
    echo "Ya existe .git — omitiendo git init."
  fi
fi

# .env desde ejemplo si no existe
if [[ -f "$ROOT/.env.example" && ! -f "$ROOT/.env" ]]; then
  cp "$ROOT/.env.example" "$ROOT/.env"
  echo "Creado .env desde .env.example (revisa valores)."
fi

echo ""
echo "=============================================="
echo "  Onboarding completado"
echo "=============================================="
echo ""
echo "Proyecto: $PROJECT_NAME"
echo "Stack:    ${LANGS[*]:-common}"
echo ""
echo "Abre el proyecto en Cursor o Claude Code y prueba:"
echo "  /onboard-proyecto   — repasar o ampliar configuración"
echo "  /project-init       — plan ECC según archivos del repo"
echo "  /harness-audit      — verificar que todo carga bien"
echo ""
