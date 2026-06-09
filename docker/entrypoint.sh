#!/usr/bin/env sh
set -eu

echo "[entrypoint] applying SQL migrations..."
node docker/migrate-cli.mjs

echo "[entrypoint] checking initial seed..."
node docker/seed-cli.mjs

echo "[entrypoint] starting SvelteKit (adapter-node)..."
exec node build/index.js
