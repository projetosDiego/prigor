#!/usr/bin/env bash
# ============================================================================
#  Configura a nota fiscal (Notaas) na VPS sem editar o .env à mão.
#
#  Uso (na VPS):  cd /opt/prigor && bash scripts/configurar-nf.sh
#
#  Pergunta a chave da API (oculta) e o ambiente, grava no .env e reinicia o
#  container. Não mexe em mais nada do .env.
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  echo ".env não encontrado em $(pwd)."; exit 1
fi

read -r -s -p "Cole a chave da API da Notaas (ntaas_...): " KEY; echo
if [[ ! "$KEY" =~ ^ntaas_[A-Za-z0-9_-]{16,}$ ]]; then
  echo "Isso não parece uma chave da Notaas (começa com ntaas_)."; exit 1
fi

echo "Ambiente:"
echo "  1) homologação (teste, sem valor fiscal)"
echo "  2) PRODUÇÃO (nota oficial)"
read -r -p "Escolha 1 ou 2: " AMB
case "$AMB" in
  1) ENV_VAL="homologacao" ;;
  2) ENV_VAL="producao"
     read -r -p "Confirma emitir notas OFICIAIS? digite SIM: " OK
     [[ "$OK" == "SIM" ]] || { echo "Cancelado."; exit 1; } ;;
  *) echo "Opção inválida."; exit 1 ;;
esac

upsert() {
  local key="$1" val="$2"
  if grep -q "^${key}=" .env; then
    # usa | como separador; a chave da Notaas não tem |
    sed -i "s|^${key}=.*|${key}='${val}'|" .env
  else
    printf "\n%s='%s'\n" "$key" "$val" >> .env
  fi
}
cp .env ".env.bak.$(date +%Y%m%d%H%M%S)"
upsert FISCAL_PROVIDER notaas
upsert FISCAL_API_TOKEN "$KEY"
upsert FISCAL_ENV "$ENV_VAL"

echo "→ reiniciando o PRIGOR com a nova configuração..."
docker compose -f docker-compose.prod.yml --env-file .env up -d
echo "✔ Nota fiscal configurada (ambiente: $ENV_VAL). Backup do .env anterior salvo como .env.bak.*"
