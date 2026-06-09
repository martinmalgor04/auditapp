#!/usr/bin/env bash
# dev.sh — Postgres (Docker) + migraciones + servidor Vite en desarrollo local
#
# Uso:
#   ./dev.sh           levanta DB, migra y arranca pnpm dev
#   ./dev.sh --seed    además ejecuta db:seed (útil en primer arranque)
#   ./dev.sh --db-only solo DB + migraciones, sin servidor

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

ok()   { printf "${GREEN}[OK]${NC}    %s\n" "$1"; }
warn() { printf "${YELLOW}[WARN]${NC}  %s\n" "$1"; }
fail() { printf "${RED}[FAIL]${NC}  %s\n" "$1"; exit 1; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

SEED=false
DB_ONLY=false

for arg in "$@"; do
  case "$arg" in
    --seed) SEED=true ;;
    --db-only) DB_ONLY=true ;;
    -h|--help)
      cat <<'EOF'
Uso: ./dev.sh [opciones]

  (sin args)   Levanta Postgres, aplica migraciones y arranca pnpm dev
  --seed       Ejecuta db:seed (usuarios, plantillas, clientes)
  --db-only    Solo DB + migraciones; no inicia el servidor
  -h, --help   Muestra esta ayuda

Primer arranque:
  1. ./dev.sh --seed
  2. Abrí http://localhost:5173 (no uses 127.0.0.1)
  3. Login: admin@serviciosysistemas.com.ar / changeme-admin

Requiere: Node >= 20, pnpm, Docker con compose v2.
EOF
      exit 0
      ;;
    *)
      fail "Opción desconocida: $arg (usá --help)"
      ;;
  esac
done

echo "── 1. Prerrequisitos ───────────────────────────────────"

command -v node >/dev/null 2>&1 || fail "node no está instalado"
command -v pnpm >/dev/null 2>&1 || fail "pnpm no está instalado (corepack enable pnpm)"
command -v docker >/dev/null 2>&1 || fail "docker no está instalado"
docker compose version >/dev/null 2>&1 || fail "docker compose no está disponible"

NODE_MAJOR="$(node -e 'console.log(process.version.match(/^v(\d+)/)[1])')"
[ "$NODE_MAJOR" -ge 20 ] || fail "Se requiere Node >= 20"

ok "node $(node --version), pnpm $(pnpm --version)"

if [ ! -d node_modules ]; then
  warn "node_modules ausente — ejecutando pnpm install"
  pnpm install
fi

load_env() {
  local file="$1"
  [ -f "$file" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%%$'\r'}"
    case "$line" in
      ''|'#'*) continue ;;
    esac
    if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
      export "${BASH_REMATCH[1]}=${BASH_REMATCH[2]}"
    fi
  done < "$file"
}

echo ""
echo "── 2. Variables de entorno ─────────────────────────────"

if [ ! -f .env ]; then
  cp .env.example .env
  warn "Creé .env desde .env.example — revisá SESSION_SECRET antes de prod"
fi

load_env .env

: "${DATABASE_URL:=postgres://auditapp:changeme@localhost:5432/auditapp}"
: "${SESSION_SECRET:=dev-secret-min-32-characters-long!!}"
: "${PUBLIC_APP_URL:=http://localhost:5173}"

export DATABASE_URL SESSION_SECRET PUBLIC_APP_URL

ok ".env cargado"

echo ""
echo "── 3. Postgres (Docker) ────────────────────────────────"

if ! docker info >/dev/null 2>&1; then
  fail "Docker no está corriendo — iniciá Docker Desktop o el daemon"
fi

docker compose up -d --wait db
ok "Contenedor db listo (healthcheck OK)"

echo ""
echo "── 4. Migraciones ──────────────────────────────────────"

pnpm run db:migrate
ok "Migraciones aplicadas"

echo ""
echo "── 5. Seed ─────────────────────────────────────────────"

if [ "$SEED" = true ]; then
  pnpm run db:seed
  ok "Seed ejecutado"
else
  USER_COUNT="$(
    docker compose exec -T db psql -U auditapp -d auditapp -tAc \
      'SELECT COUNT(*) FROM app_user' 2>/dev/null | tr -d '[:space:]' || echo 0
  )"
  if [ "${USER_COUNT:-0}" = "0" ]; then
    warn "Sin usuarios en DB — ejecutando seed automático (primer arranque)"
    pnpm run db:seed
    ok "Seed ejecutado"
  else
    ok "Seed omitido ($USER_COUNT usuarios). Usá --seed para forzar."
  fi
fi

if [ "$DB_ONLY" = true ]; then
  echo ""
  ok "DB lista. Servidor omitido (--db-only)."
  echo "    DATABASE_URL=$DATABASE_URL"
  echo "    Arrancá manualmente: pnpm dev"
  exit 0
fi

echo ""
echo "── 6. Servidor de desarrollo ───────────────────────────"
echo "    ${PUBLIC_APP_URL}"
echo "    Ctrl+C para detener (Postgres sigue en Docker)"
echo ""

exec pnpm dev
