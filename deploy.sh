#!/usr/bin/env bash
# ============================================================================
#  Doces Prigor OS — deploy de 1 comando (rodar na VPS)
#
#  Uso:  ./deploy.sh
#
#  Roda em /opt/prigor. Segue o mesmo fluxo do deploy.sh do ActPost:
#  git pull, build, up, limpeza de imagem e de cache.
# ============================================================================
set -euo pipefail

g='\033[0;32m'; y='\033[1;33m'; r='\033[0;31m'; n='\033[0m'
compose="docker-compose.prod.yml"

if [[ ! -f .env ]]; then
  echo -e "${r}.env não encontrado. Copie o template:${n}"
  echo "   cp .env.prod.example .env && nano .env"
  exit 1
fi

# A infraestrutura compartilhada precisa estar de pé: sem ela o compose sobe
# mas o container fica órfão, sem roteamento e sem banco.
for rede in actpost-proxy actpost-internal; do
  if ! docker network inspect "$rede" >/dev/null 2>&1; then
    echo -e "${r}Rede '$rede' não existe.${n}"
    echo "   O stack do ActPost precisa estar rodando (cd /opt/actpost && ./deploy.sh)."
    exit 1
  fi
done

if ! docker ps --format '{{.Names}}' | grep -qx actpost-postgres; then
  echo -e "${r}Container 'actpost-postgres' não está rodando.${n}"
  echo "   Suba o stack do ActPost antes."
  exit 1
fi

echo -e "${y}Deploy do Doces Prigor OS${n}"

echo -e "${g}→ git pull${n}"
git pull --ff-only

echo -e "${g}→ build${n}"
docker compose -f "$compose" --env-file .env build

echo -e "${g}→ up${n}"
docker compose -f "$compose" --env-file .env up -d

echo -e "${g}→ limpando imagens antigas${n}"
docker image prune -f

# Mesmo cuidado do ActPost: sem isso o cache de build enche o disco.
echo -e "${g}→ limpando build cache (mantendo 3GB)${n}"
docker builder prune -f --keep-storage 3GB

echo -e "${g}→ aguardando o healthcheck${n}"
for i in $(seq 1 30); do
  estado="$(docker inspect -f '{{.State.Health.Status}}' prigor-app 2>/dev/null || echo desconhecido)"
  if [[ "$estado" == "healthy" ]]; then
    echo -e "${g}Deploy concluído — aplicação saudável.${n}"
    docker compose -f "$compose" ps
    exit 0
  fi
  if [[ "$estado" == "unhealthy" ]]; then
    echo -e "${r}Container subiu mas está unhealthy. Últimas linhas do log:${n}"
    docker logs --tail 40 prigor-app
    exit 1
  fi
  sleep 4
done

echo -e "${y}Tempo esgotado esperando o healthcheck. Veja o log:${n}"
echo "   docker logs -f prigor-app"
docker compose -f "$compose" ps
