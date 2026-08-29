#!/usr/bin/env bash
# ============================================================================
#  Type-check com os tipos REAIS do Prisma, num container descartável.
#
#  Existe porque o ambiente onde o código é escrito não alcança os binários do
#  Prisma, então `prisma generate` não roda lá e o `tsc` local usa um stub
#  permissivo. Este script roda o mesmo type-check do build de produção em
#  ~1 minuto, sem construir a imagem inteira.
#
#  Uso (na VPS ou em qualquer máquina com Docker):
#      ./scripts/typecheck-real.sh
# ============================================================================
set -euo pipefail

raiz="$(cd "$(dirname "$0")/.." && pwd)"

docker run --rm \
  -v "$raiz":/app \
  -w /app \
  -e DATABASE_URL="postgresql://x:x@localhost:5432/x" \
  node:22-alpine sh -c '
    apk add --no-cache libc6-compat openssl >/dev/null
    [ -d node_modules ] || npm ci --no-audit --no-fund
    npx prisma generate >/dev/null
    echo "=== type-check com os tipos reais do Prisma ==="
    npx tsc --noEmit -p tsconfig.json
  '
