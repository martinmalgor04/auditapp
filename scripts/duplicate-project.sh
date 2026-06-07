#!/usr/bin/env bash
# Duplica esta plantilla a una nueva carpeta de proyecto.
set -euo pipefail

TEMPLATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_PARENT="$(dirname "$TEMPLATE_DIR")"

usage() {
  cat <<'EOF'
Uso: ./scripts/duplicate-project.sh <nombre-proyecto> [ruta-destino]

Ejemplos:
  ./scripts/duplicate-project.sh mi-saas
  ./scripts/duplicate-project.sh mi-saas ~/Projects

Crea una copia limpia de la plantilla (sin .git ni node_modules de _ecc)
y ejecuta el onboarding interactivo.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ $# -lt 1 ]]; then
  usage
  exit 1
fi

PROJECT_NAME="$1"
DEST_PARENT="${2:-$DEFAULT_PARENT}"
DEST_DIR="$DEST_PARENT/$PROJECT_NAME"

if [[ -e "$DEST_DIR" ]]; then
  echo "Error: ya existe $DEST_DIR" >&2
  exit 1
fi

echo "Duplicando plantilla → $DEST_DIR"

rsync -a \
  --exclude='.git' \
  --exclude='_ecc/node_modules' \
  --exclude='.DS_Store' \
  "$TEMPLATE_DIR/" "$DEST_DIR/"

# Resetear estado de git del proyecto destino
rm -rf "$DEST_DIR/.git" 2>/dev/null || true

# Marcar como proyecto nuevo (no plantilla)
sed -i '' "s/is_template: true/is_template: false/" "$DEST_DIR/.template/config.yaml" 2>/dev/null || \
  sed -i "s/is_template: true/is_template: false/" "$DEST_DIR/.template/config.yaml"

# Actualizar nombre del proyecto en metadata
if grep -q '^project_name:' "$DEST_DIR/.template/config.yaml"; then
  if [[ "$(uname)" == "Darwin" ]]; then
    sed -i '' "s/^project_name:.*/project_name: \"$PROJECT_NAME\"/" "$DEST_DIR/.template/config.yaml"
  else
    sed -i "s/^project_name:.*/project_name: \"$PROJECT_NAME\"/" "$DEST_DIR/.template/config.yaml"
  fi
fi

# Reemplazar placeholders en PROJECT.md
if [[ "$(uname)" == "Darwin" ]]; then
  sed -i '' "s/{{PROJECT_NAME}}/$PROJECT_NAME/g" "$DEST_DIR/PROJECT.md"
else
  sed -i "s/{{PROJECT_NAME}}/$PROJECT_NAME/g" "$DEST_DIR/PROJECT.md"
fi

# Migrar comandos ECC → skills (Cursor) y reparar install-state
if [[ -f "$DEST_DIR/scripts/migrate-cursor-commands-to-skills.cjs" ]]; then
  node "$DEST_DIR/scripts/migrate-cursor-commands-to-skills.cjs"
fi
if [[ -f "$DEST_DIR/_ecc/scripts/ecc.js" ]]; then
  node "$DEST_DIR/_ecc/scripts/ecc.js" repair 2>/dev/null || true
fi

echo ""
echo "Proyecto creado en: $DEST_DIR"
echo ""
echo "Siguiente paso:"
echo "  cd \"$DEST_DIR\""
echo "  ./scripts/onboard-project.sh"
echo ""
echo "O abre la carpeta en Cursor/Claude Code y ejecuta:"
echo "  /onboard-proyecto   (Cursor)"
echo "  /onboard-proyecto   (Claude Code)"
