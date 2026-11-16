#!/bin/sh
# ============================================================================
#  Prepara o banco (SQLite no volume /data) e sobe o site.
#
#  - Primeira subida: cria o banco pelas migrations e carrega produtos e
#    pontos de venda iniciais.
#  - Subidas seguintes: só aplica migrations novas; os dados ficam como estão.
#  - Depois que o site responde, pede para ele refazer as páginas guardadas no
#    build (que foram geradas com o banco descartável do build).
# ============================================================================
set -e

mkdir -p /data/uploads
PRIMEIRA_VEZ=false
[ -f /data/prigor.db ] || PRIMEIRA_VEZ=true

echo "[entrypoint] aplicando migrations..."
node ./node_modules/prisma/build/index.js migrate deploy

if [ "$PRIMEIRA_VEZ" = "true" ]; then
  echo "[entrypoint] banco novo: carregando produtos e pontos de venda iniciais..."
  node ./docker/carga-inicial.mjs || echo "[entrypoint] carga inicial falhou (seguindo mesmo assim)"
fi

echo "[entrypoint] iniciando o site"
"$@" &
PID=$!
trap 'kill -TERM "$PID" 2>/dev/null' TERM INT

(
  i=0
  while [ $i -lt 40 ]; do
    if curl -fsS -o /dev/null http://127.0.0.1:3000/api/health 2>/dev/null; then
      curl -fsS -o /dev/null -X POST -H "x-internal-key: ${SESSION_SECRET}" http://127.0.0.1:3000/api/internal/revalidate \
        && echo "[entrypoint] páginas atualizadas com os dados do banco" \
        || echo "[entrypoint] não deu para atualizar as páginas agora (elas se atualizam sozinhas em até 1h)"
      exit 0
    fi
    i=$((i + 1)); sleep 2
  done
) &

wait "$PID"
