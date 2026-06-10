#!/usr/bin/env sh
set -eu

export DATABASE_URL="$(node docker/database-url.mjs)"

if [ -n "${PUBLIC_APP_URL:-}" ]; then
  export ORIGIN="${PUBLIC_APP_URL}"
  export PROTOCOL_HEADER="${PROTOCOL_HEADER:-x-forwarded-proto}"
  export HOST_HEADER="${HOST_HEADER:-x-forwarded-host}"
fi

echo "[entrypoint] applying SQL migrations..."
node docker/migrate-cli.mjs

echo "[entrypoint] checking initial seed..."
node docker/seed-cli.mjs

echo "[entrypoint] starting SvelteKit (adapter-node)..."
exec node build/index.js
