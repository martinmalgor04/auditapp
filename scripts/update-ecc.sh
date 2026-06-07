#!/usr/bin/env bash
# Actualiza la copia local de ECC desde GitHub y reaplica el perfil base.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ECC_DIR="$ROOT/_ecc"
TMP="/tmp/ecc-update-$$"

echo "Actualizando ECC en $ECC_DIR..."

git clone --depth 1 https://github.com/affaan-m/ECC.git "$TMP"

rsync -a --delete \
  --exclude='.git' \
  --exclude='node_modules' \
  "$TMP/" "$ECC_DIR/"

rm -rf "$TMP"

(cd "$ECC_DIR" && npm install --no-audit --no-fund --loglevel=error)

echo "Reaplicando perfil core..."
node "$ECC_DIR/scripts/install-apply.js" --target cursor --profile core
node "$ECC_DIR/scripts/install-apply.js" --target claude-project --profile core --with lang:typescript

echo ""
echo "ECC actualizado. Revisa cambios con git diff antes de commitear."
