#!/usr/bin/env bash
set -euo pipefail
echo "── pre-push gate ──"
pnpm test
pnpm run build
docker build -t auditapp:pre-push .
echo "── pre-push OK ──"
