#!/bin/sh
# Aplica as migrations pendentes e sobe a aplicação.
# `migrate deploy` só executa migrations já versionadas — nunca altera o
# schema por conta própria, ao contrário de `migrate dev`.
set -e

echo "[entrypoint] aplicando migrations..."
npx prisma migrate deploy

if [ "$RUN_SEED" = "true" ]; then
  echo "[entrypoint] executando seed..."
  npx prisma db seed || echo "[entrypoint] seed falhou (seguindo mesmo assim)"
fi

echo "[entrypoint] iniciando aplicação"
exec "$@"
