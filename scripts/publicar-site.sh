#!/usr/bin/env bash
# ============================================================================
#  Coloca o site oficial no ar na VPS, sem editar o .env à mão.
#
#  Uso (na VPS):   cd /opt/prigor && bash scripts/publicar-site.sh
#  Para desfazer:  cd /opt/prigor && bash scripts/publicar-site.sh --desfazer
#
#  O que ele faz:
#    1. confere se o endereço app.<domínio> já aponta para esta VPS;
#    2. pergunta o e-mail e a senha do painel do site;
#    3. grava no .env (com backup): o sistema passa para app.<domínio>, o site
#       assume <domínio>, e os dois ganham o segredo que liga os pedidos;
#    4. roda o deploy.
#
#  Os endereços antigos do sistema (login, links de boleto/nota, /app)
#  continuam funcionando: o site encaminha para o endereço novo.
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

g='\033[0;32m'; y='\033[1;33m'; r='\033[0;31m'; n='\033[0m'

[[ -f .env ]] || { echo -e "${r}.env não encontrado em $(pwd).${n}"; exit 1; }

# ─── desfazer ───────────────────────────────────────────────────────────────
if [[ "${1:-}" == "--desfazer" ]]; then
  # o backup mais ANTIGO é o de antes da primeira publicação
  ultimo="$(ls -1tr .env.bak.site.* 2>/dev/null | head -1 || true)"
  [[ -n "$ultimo" ]] || { echo -e "${r}Não achei backup do .env feito por este script.${n}"; exit 1; }
  echo -e "${y}Vou restaurar $ultimo, tirar o site do ar e devolver o sistema ao endereço antigo.${n}"
  read -r -p "Confirma? digite SIM: " OK
  [[ "$OK" == "SIM" ]] || { echo "Cancelado."; exit 1; }
  cp .env ".env.antes-de-desfazer.$(date +%Y%m%d%H%M%S)"
  cp "$ultimo" .env
  docker rm -f prigor-site >/dev/null 2>&1 || true
  ./deploy.sh
  echo -e "${g}Desfeito. Os pedidos e dados do site continuam guardados no volume prigor-site-data.${n}"
  exit 0
fi

[[ -f site/Dockerfile ]] || {
  echo -e "${r}A pasta site/ ainda não chegou nesta VPS.${n}"
  echo "   No seu computador, rode o publicar.cmd e espere o deploy terminar. Depois rode este script de novo."
  exit 1
}

valor() { grep -E "^$1=" .env | tail -1 | cut -d= -f2- | sed -e "s/^['\"]//" -e "s/['\"]$//" || true; }

atual="$(valor APP_DOMAIN)"
[[ -n "$atual" ]] || { echo -e "${r}APP_DOMAIN não está no .env.${n}"; exit 1; }
raiz="$(valor SITE_DOMAIN)"
[[ -n "$raiz" ]] || raiz="${atual#app.}"
app="app.${raiz}"

echo -e "${y}Publicação do site oficial${n}"
echo "   Site:     https://${raiz}  (e www.${raiz})"
echo "   Sistema:  https://${app}   (hoje em https://${atual})"
echo

# ─── 1. DNS ─────────────────────────────────────────────────────────────────
ip_de() { getent ahostsv4 "$1" 2>/dev/null | awk 'NR==1{print $1}'; }
ip_raiz="$(ip_de "$raiz" || true)"
ip_app="$(ip_de "$app" || true)"
if [[ -z "$ip_app" ]]; then
  echo -e "${r}O endereço ${app} ainda não existe no DNS.${n}"
  echo "   No painel onde o domínio está (Hostinger → Domínios → DNS), crie um registro:"
  echo "      Tipo A    Nome: app    Aponta para: ${ip_raiz:-o IP desta VPS}"
  echo "   Espere alguns minutos e rode este script de novo. Nada foi alterado."
  exit 1
fi
if [[ -n "$ip_raiz" && "$ip_app" != "$ip_raiz" ]]; then
  echo -e "${r}${app} aponta para ${ip_app}, mas ${raiz} aponta para ${ip_raiz}.${n}"
  echo "   Os dois precisam apontar para esta VPS. Corrija o registro A de 'app' e rode de novo. Nada foi alterado."
  exit 1
fi
echo -e "${g}✔ DNS: ${app} → ${ip_app}${n}"

# ─── 2. Acesso ao painel do site ────────────────────────────────────────────
email="$(valor SITE_ADMIN_EMAIL)"
senha="$(valor SITE_ADMIN_PASSWORD)"
if [[ -n "$email" && -n "$senha" ]]; then
  echo -e "${g}✔ Acesso ao painel do site já configurado (${email}).${n}"
else
  echo
  echo "Acesso ao painel do site (https://${raiz}/admin) — é separado do login do sistema."
  read -r -p "E-mail: " email
  [[ "$email" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] || { echo -e "${r}E-mail inválido.${n}"; exit 1; }
  while true; do
    read -r -s -p "Senha (mínimo 12 caracteres): " senha; echo
    read -r -s -p "Repita a senha: " senha2; echo
    if [[ "$senha" != "$senha2" ]]; then echo "As senhas não conferem."; continue; fi
    if [[ ${#senha} -lt 12 ]]; then echo "Muito curta."; continue; fi
    if [[ "$senha" =~ [\'\"\|\\\$[:space:]] ]]; then echo "Evite aspas, barra invertida, |, \$ e espaços."; continue; fi
    break
  done
fi

sessao="$(valor SITE_SESSION_SECRET)"; [[ ${#sessao} -ge 32 ]] || sessao="$(openssl rand -hex 32)"
pedidos="$(valor SITE_ORDERS_SECRET)"; [[ ${#pedidos} -ge 32 ]] || pedidos="$(openssl rand -hex 32)"

# ─── 3. Confirmação e gravação ──────────────────────────────────────────────
echo
echo -e "${y}Ao confirmar:${n}"
echo "   • https://${raiz} passa a mostrar o site novo;"
echo "   • o sistema passa a abrir em https://${app} (quem estiver logado entra de novo);"
echo "   • os links antigos do sistema continuam funcionando, encaminhados pelo site."
read -r -p "Confirma? digite SIM: " OK
[[ "$OK" == "SIM" ]] || { echo "Cancelado. Nada foi alterado."; exit 1; }

upsert() {
  local key="$1" val="$2"
  if grep -q "^${key}=" .env; then
    sed -i "s|^${key}=.*|${key}='${val}'|" .env
  else
    printf "\n%s='%s'\n" "$key" "$val" >> .env
  fi
}
bak=".env.bak.site.$(date +%Y%m%d%H%M%S)"
cp .env "$bak"
upsert APP_DOMAIN "$app"
upsert APP_HOSTS "$app"
upsert SITE_DOMAIN "$raiz"
upsert SITE_ADMIN_EMAIL "$email"
upsert SITE_ADMIN_PASSWORD "$senha"
upsert SITE_SESSION_SECRET "$sessao"
upsert SITE_ORDERS_SECRET "$pedidos"
echo -e "${g}✔ .env atualizado (backup em ${bak})${n}"

# ─── 4. Deploy ──────────────────────────────────────────────────────────────
if ! ./deploy.sh; then
  echo -e "${r}O deploy falhou. Para voltar ao que era:  bash scripts/publicar-site.sh --desfazer${n}"
  exit 1
fi

echo
echo -e "${g}Pronto.${n}"
echo "   Site:             https://${raiz}"
echo "   Painel do site:   https://${raiz}/admin"
echo "   Sistema:          https://${app}   (ou https://${raiz}/app)"
echo "   O certificado de ${app} pode levar 1 a 2 minutos para ser emitido."

if crontab -l 2>/dev/null | grep -q "://\(www\.\)\?${raiz}/api/"; then
  echo
  echo -e "${y}Atenção: há tarefa no crontab chamando https://${raiz}/api/... — troque o endereço para https://${app}/api/...${n}"
  crontab -l | grep "${raiz}/api/" || true
fi
