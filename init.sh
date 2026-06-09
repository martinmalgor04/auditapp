#!/usr/bin/env bash
# init.sh — Verificación e inicialización del entorno (auditapp / SvelteKit)
#
# Ejecutar al COMENZAR una sesión y antes de declarar cualquier tarea `done`.
# Si falla, la sesión no debe avanzar.

set -u
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

ok()    { printf "${GREEN}[OK]${NC}    %s\n" "$1"; }
warn()  { printf "${YELLOW}[WARN]${NC}  %s\n" "$1"; }
fail()  { printf "${RED}[FAIL]${NC}  %s\n" "$1"; }

EXIT_CODE=0

echo "── 1. Verificando entorno ─────────────────────────────"

if ! command -v node >/dev/null 2>&1; then
  fail "node no está instalado"
  exit 1
fi
ok "node -> $(node --version)"

NODE_MAJOR=$(node -e 'console.log(process.version.match(/^v(\d+)/)[1])')
if [ "$NODE_MAJOR" -lt 20 ]; then
  fail "Se requiere Node >= 20"
  exit 1
fi
ok "Versión de Node compatible (>= 20)"

if ! command -v pnpm >/dev/null 2>&1; then
  fail "pnpm no está instalado (corepack enable pnpm)"
  exit 1
fi
ok "pnpm -> $(pnpm --version)"

echo ""
echo "── 2. Verificando archivos base del arnés ──────────────"

for f in AGENTS.md feature_list.json progress/current.md docs/architecture.md docs/conventions.md docs/verification.md docs/specs.md CHECKPOINTS.md; do
  if [ ! -f "$f" ]; then
    fail "Falta archivo base: $f"
    EXIT_CODE=1
  else
    ok "Existe $f"
  fi
done

echo ""
echo "── 3. Validando feature_list.json y specs ─────────────"

node - <<'NODE'
const fs = require('fs');
const path = require('path');
try {
  const data = JSON.parse(fs.readFileSync('feature_list.json', 'utf8'));
  const valid = new Set(['pending', 'spec_ready', 'in_progress', 'done', 'blocked']);
  const inProgress = data.features.filter((f) => f.status === 'in_progress');
  if (inProgress.length > 1) {
    console.log(`[FAIL]  Hay ${inProgress.length} features en in_progress (máximo 1)`);
    process.exit(1);
  }
  const requiresSpec = new Set(['spec_ready', 'in_progress', 'done']);
  const specErrors = [];
  for (const f of data.features) {
    if (!valid.has(f.status)) {
      console.log(`[FAIL]  Estado inválido en feature ${f.id}: ${f.status}`);
      process.exit(1);
    }
    if (f.sdd && requiresSpec.has(f.status)) {
      const specDir = path.join('specs', f.name);
      for (const fname of ['requirements.md', 'design.md', 'tasks.md']) {
        if (!fs.existsSync(path.join(specDir, fname))) {
          specErrors.push(
            `feature ${f.id} (${f.name}) en ${f.status} sin ${specDir}/${fname}`
          );
        }
      }
    }
  }
  if (specErrors.length) {
    for (const e of specErrors) console.log(`[FAIL]  ${e}`);
    process.exit(1);
  }
  console.log(`[OK]    feature_list.json válido (${data.features.length} features)`);
  console.log('[OK]    Specs presentes para features sdd con estado no-pending');
} catch (e) {
  console.log(`[FAIL]  feature_list.json o specs inválidos: ${e.message}`);
  process.exit(1);
}
NODE

if [ $? -ne 0 ]; then EXIT_CODE=1; fi

echo ""
echo "── 4. Ejecutando tests ─────────────────────────────────"

if [ -f package.json ]; then
  if pnpm test 2>&1; then
    ok "Todos los tests pasan"
  else
    fail "Hay tests rotos"
    EXIT_CODE=1
  fi
else
  warn "package.json no existe todavía (feature stack_scaffolding pendiente)"
fi

echo ""
echo "── 5. Resumen ──────────────────────────────────────────"

if [ $EXIT_CODE -eq 0 ]; then
  ok "Entorno listo. Puedes empezar a trabajar."
else
  fail "Entorno NO está listo. Resuelve los errores antes de avanzar."
fi

exit $EXIT_CODE
