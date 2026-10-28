#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -f .env ]; then
  umask 077
  python3 - <<'PY'
import secrets
with open('.env','x') as f:
    f.write('APP_PORT=3080\nMINIO_USER=amanda-storage\n')
    for key in ['DB_PASSWORD','DB_ROOT_PASSWORD','MINIO_PASSWORD','ADMIN_TOKEN']:
        f.write(key+'='+secrets.token_hex(32)+'\n')
PY
fi
docker compose up -d --build
