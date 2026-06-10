#!/usr/bin/env sh
set -eu

export DATABASE_URL="$(node docker/database-url.mjs)"

if [ -n "${PUBLIC_APP_URL:-}" ]; then
  export ORIGIN="${PUBLIC_APP_URL}"
  export PROTOCOL_HEADER="${PROTOCOL_HEADER:-x-forwarded-proto}"
  export HOST_HEADER="${HOST_HEADER:-x-forwarded-host}"
fi

echo '{"ts":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","level":"info","msg":"entrypoint_migrations_start","service":"auditapp"}'
node docker/migrate-cli.mjs

echo '{"ts":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","level":"info","msg":"entrypoint_seed_check","service":"auditapp"}'
node docker/seed-cli.mjs

echo '{"ts":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","level":"info","msg":"entrypoint_templates_seed","service":"auditapp"}'
node docker/seed-templates-cli.mjs

echo '{"ts":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","level":"info","msg":"entrypoint_app_start","service":"auditapp","port":"'${PORT:-3033}'"}'
exec node build/index.js
