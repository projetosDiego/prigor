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

# O site oficial (./site) entra no deploy quando já foi configurado na VPS
# (scripts/publicar-site.sh grava SITE_DOMAIN no .env). Antes disso, o deploy
# segue exatamente como sempre foi: só o sistema.
com_site=false
if grep -qE '^SITE_DOMAIN=.+' .env && [[ -f site/Dockerfile ]]; then
  com_site=true
  export COMPOSE_PROFILES=site
fi

echo -e "${y}Deploy do Doces Prigor OS${n}"
$com_site && echo -e "${y}  + site oficial${n}"

echo -e "${g}→ git pull${n}"
git pull --ff-only

# Um build de cada vez: dois builds do Next em paralelo não cabem na memória
# desta VPS junto com o ActPost.
echo -e "${g}→ build do sistema${n}"
docker compose -f "$compose" --env-file .env build app
if $com_site; then
  echo -e "${g}→ build do site${n}"
  docker compose -f "$compose" --env-file .env build site
fi

echo -e "${g}→ up${n}"
docker compose -f "$compose" --env-file .env up -d

echo -e "${g}→ limpando imagens antigas${n}"
docker image prune -f

# Mesmo cuidado do ActPost: sem isso o cache de build enche o disco.
echo -e "${g}→ limpando build cache (mantendo 3GB)${n}"
docker builder prune -f --keep-storage 3GB

# Espera o container ficar saudável. Devolve 0 (ok), 1 (unhealthy) ou 2 (tempo esgotado).
aguardar() {
  local nome="$1"
  for i in $(seq 1 40); do
    local estado
    estado="$(docker inspect -f '{{.State.Health.Status}}' "$nome" 2>/dev/null || echo desconhecido)"
    [[ "$estado" == "healthy" ]] && return 0
    [[ "$estado" == "unhealthy" ]] && return 1
    sleep 4
  done
  return 2
}

falhou=false
servicos=(prigor-app)
$com_site && servicos+=(prigor-site)

for nome in "${servicos[@]}"; do
  echo -e "${g}→ aguardando o healthcheck de ${nome}${n}"
  resultado=0
  aguardar "$nome" || resultado=$?
  case "$resultado" in
    0) echo -e "${g}${nome}: saudável.${n}" ;;
    1) echo -e "${r}${nome} subiu mas está unhealthy. Últimas linhas do log:${n}"
       docker logs --tail 40 "$nome"
       falhou=true ;;
    *) echo -e "${y}Tempo esgotado esperando ${nome}. Veja o log:  docker logs -f ${nome}${n}"
       falhou=true ;;
  esac
done

docker compose -f "$compose" ps
if $falhou; then exit 1; fi
echo -e "${g}Deploy concluído.${n}"
