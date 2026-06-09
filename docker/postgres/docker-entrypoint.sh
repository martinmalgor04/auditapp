#!/usr/bin/env bash
set -euo pipefail

HBA_FILE=/etc/postgresql/pg_hba.conf
mkdir -p /etc/postgresql

cat >"$HBA_FILE" <<'EOF'
# auditapp — generado al arranque; solo usuario auditapp vía scram-sha-256
local   all       all                         scram-sha-256
EOF

for cidr in 127.0.0.1/32 172.16.0.0/12 10.0.0.0/8 192.168.0.0/16; do
  echo "host    auditapp    auditapp    ${cidr}    scram-sha-256" >>"$HBA_FILE"
done

if [ -n "${POSTGRES_ALLOWED_CIDRS:-}" ]; then
  IFS=',' read -ra EXTRA_CIDRS <<<"$POSTGRES_ALLOWED_CIDRS"
  for cidr in "${EXTRA_CIDRS[@]}"; do
    cidr="${cidr// /}"
    if [ -n "$cidr" ]; then
      echo "host    auditapp    auditapp    ${cidr}    scram-sha-256" >>"$HBA_FILE"
    fi
  done
fi

cat >>"$HBA_FILE" <<'EOF'
host    all       all       0.0.0.0/0         reject
host    all       all       ::/0              reject
EOF

chown postgres:postgres "$HBA_FILE"
chmod 640 "$HBA_FILE"

exec docker-entrypoint.sh postgres \
  -c "hba_file=${HBA_FILE}" \
  -c password_encryption=scram-sha-256 \
  -c log_connections=on \
  -c log_disconnections=on
