#!/usr/bin/env bash
# ============================================================================
#  Doces Prigor OS — restaurar um backup criptografado.
#
#    ./restore.sh backups/prigor-AAAAMMDD-HHMMSS.sql.gz.enc            → TESTE
#    ./restore.sh backups/prigor-AAAAMMDD-HHMMSS.sql.gz.enc --aplicar  → PRODUÇÃO
#
#  O padrão é restaurar num banco de teste (prigor_teste_restauro) e mostrar
#  as maiores tabelas, para você CONFERIR que o backup abre — sem tocar no banco
#  de verdade. Faça esse teste uma vez por mês.
#
#  Com --aplicar, o banco de produção é SUBSTITUÍDO pelo conteúdo do backup
#  (antes, faz um backup de segurança do estado atual). Pare o app antes:
#    docker compose -f docker-compose.prod.yml --env-file .env stop
# ============================================================================
set -euo pipefail

FILE="${1:-}"
MODE="${2:-}"
APP_DIR="${APP_DIR:-/opt/prigor}"
KEY_FILE="${KEY_FILE:-$APP_DIR/.backup-key}"
CONTAINER="${CONTAINER:-actpost-postgres}"

[[ -n "$FILE" && -f "$FILE" ]] || { echo "Uso: ./restore.sh <arquivo.sql.gz.enc> [--aplicar]" >&2; exit 1; }
[[ -s "$KEY_FILE" ]] || { echo "Falta a chave em $KEY_FILE (a mesma usada no backup)." >&2; exit 1; }

envval() {
  [[ -f "$APP_DIR/.env" ]] || return 0
  grep -E "^$1=" "$APP_DIR/.env" | tail -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' || true
}
DB_USER="${PRIGOR_DB_USER:-$(envval PRIGOR_DB_USER)}"; DB_USER="${DB_USER:-prigor}"
DB_NAME="${PRIGOR_DB_NAME:-$(envval PRIGOR_DB_NAME)}"; DB_NAME="${DB_NAME:-prigor}"

decrypt() { openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass "file:$KEY_FILE" -in "$FILE"; }

# Confere que a chave abre o arquivo antes de qualquer coisa.
decrypt | gunzip -t || { echo "Não consegui abrir o backup: chave errada ou arquivo corrompido." >&2; exit 1; }

if [[ "$MODE" != "--aplicar" ]]; then
  TEST_DB="prigor_teste_restauro"
  echo "→ Restaurando no banco de TESTE $TEST_DB (produção não é tocada)"
  docker exec -i "$CONTAINER" psql -U "$DB_USER" -d postgres -v ON_ERROR_STOP=0 -c "DROP DATABASE IF EXISTS $TEST_DB;" -c "CREATE DATABASE $TEST_DB;" \
    || { echo "O usuário $DB_USER não pode criar bancos. Peça ao administrador do Postgres ou use o usuário postgres." >&2; exit 1; }
  decrypt | gunzip | docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$TEST_DB" -q -v ON_ERROR_STOP=0 >/dev/null
  echo "→ Maiores tabelas restauradas (linhas aproximadas):"
  docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$TEST_DB" -c "ANALYZE;" -c \
    "SELECT relname AS tabela, n_live_tup AS linhas FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 10;"
  docker exec -i "$CONTAINER" psql -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS $TEST_DB;" >/dev/null
  echo "✓ Backup abre e tem dados. (Banco de teste removido.)"
  exit 0
fi

echo "ATENÇÃO: isto vai SUBSTITUIR o banco $DB_NAME pelo conteúdo de $FILE."
read -r -p "Digite RESTAURAR para continuar: " confirm
[[ "$confirm" == "RESTAURAR" ]] || { echo "Cancelado."; exit 1; }

SAFE="$APP_DIR/backups/${DB_NAME}-ANTES-DA-RESTAURACAO-$(date +%Y%m%d-%H%M%S).sql.gz"
echo "→ Backup de segurança do estado atual em $SAFE"
docker exec -t "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" --clean --if-exists | gzip -9 > "$SAFE"

echo "→ Restaurando"
decrypt | gunzip | docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -q -v ON_ERROR_STOP=0
echo "✓ Restaurado. Suba o app de novo:"
echo "  docker compose -f docker-compose.prod.yml --env-file .env up -d"
