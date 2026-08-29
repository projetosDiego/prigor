#!/bin/sh
# ============================================================================
#  Aplica as migrations pendentes e sobe a aplicação.
#
#  `migrate deploy` só executa migrations já versionadas no repositório —
#  nunca altera o schema por conta própria, ao contrário de `migrate dev`.
#
#  O CLI é chamado pelo caminho local de propósito: `npx prisma` tentaria
#  baixar o pacote se não o resolvesse, e o container não tem por que sair
#  para a internet no boot.
# ============================================================================
set -e

echo "[entrypoint] aplicando migrations..."
node ./node_modules/prisma/build/index.js migrate deploy

if [ "$RUN_SEED" = "true" ]; then
  echo "[entrypoint] executando seed..."
  # Versão compilada no build; o runtime não tem TypeScript.
  node ./prisma/seed.js || echo "[entrypoint] seed falhou (seguindo mesmo assim)"
fi

echo "[entrypoint] iniciando aplicação"
exec "$@"
