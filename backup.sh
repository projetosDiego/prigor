#!/usr/bin/env bash
# ============================================================================
#  Doces Prigor OS — backup completo (banco + configuração), criptografado,
#  com cópia automática para fora da VPS.
#
#  O que faz, nesta ordem:
#    1. Dump do banco (pg_dump) e confere se o arquivo não está vazio/corrompido.
#    2. Guarda a configuração (.env, que tem as chaves e o certificado do Sicoob).
#    3. CRIPTOGRAFA os dois (AES-256) com a chave de /opt/prigor/.backup-key.
#    4. Envia para a nuvem com rclone (se RCLONE_REMOTE estiver no .env).
#    5. Apaga backups antigos (local e nuvem).
#    6. Avisa o serviço de monitoramento (se HEALTHCHECK_URL estiver no .env).
#
#  Passo a passo de instalação: docs/BACKUP.md
# ============================================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/prigor}"
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/backups}"
KEY_FILE="${KEY_FILE:-$APP_DIR/.backup-key}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
REMOTE_RETENTION_DAYS="${REMOTE_RETENTION_DAYS:-90}"
CONTAINER="${CONTAINER:-actpost-postgres}"
DATE="$(date +%Y%m%d-%H%M%S)"

# Lê uma chave do .env sem executar nada dele (aceita aspas).
envval() {
  [[ -f "$APP_DIR/.env" ]] || return 0
  grep -E "^$1=" "$APP_DIR/.env" | tail -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//" || true
}

DB_USER="${PRIGOR_DB_USER:-$(envval PRIGOR_DB_USER)}"; DB_USER="${DB_USER:-prigor}"
DB_NAME="${PRIGOR_DB_NAME:-$(envval PRIGOR_DB_NAME)}"; DB_NAME="${DB_NAME:-prigor}"
RCLONE_REMOTE="${RCLONE_REMOTE:-$(envval RCLONE_REMOTE)}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-$(envval HEALTHCHECK_URL)}"

ping_health() {  # $1 = "" (sucesso) ou "/fail"
  [[ -n "$HEALTHCHECK_URL" ]] && curl -fsS -m 15 --retry 2 "${HEALTHCHECK_URL}$1" >/dev/null 2>&1 || true
}
on_error() {
  echo "✗ BACKUP FALHOU (linha $1)" >&2
  ping_health "/fail"
}
trap 'on_error $LINENO' ERR

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

if [[ ! -s "$KEY_FILE" ]]; then
  echo "Falta a chave de criptografia em $KEY_FILE." >&2
  echo "Crie com:  openssl rand -base64 48 > $KEY_FILE && chmod 600 $KEY_FILE" >&2
  echo "E GUARDE uma cópia dela fora da VPS (sem ela o backup não abre). Ver docs/BACKUP.md." >&2
  exit 1
fi

encrypt() {  # $1 = arquivo de entrada → grava $1.enc e apaga o original
  openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass "file:$KEY_FILE" -in "$1" -out "$1.enc"
  rm -f "$1"
}

# 1. Banco ------------------------------------------------------------------
db_file="$BACKUP_DIR/${DB_NAME}-${DATE}.sql.gz"
echo "→ Dump $DB_NAME → $db_file"
docker exec -t "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" --clean --if-exists | gzip -9 > "$db_file"

# Um dump vazio é falha silenciosa (credencial errada, banco fora). Falhe alto.
if [[ "$(stat -c%s "$db_file")" -lt 1000 ]]; then
  echo "Backup suspeito: arquivo com menos de 1KB. Verifique as credenciais." >&2
  rm -f "$db_file"
  exit 1
fi
gzip -t "$db_file"
encrypt "$db_file"

# 2. Configuração (.env = chaves, senhas, certificado do banco Sicoob) --------
cfg_file="$BACKUP_DIR/${DB_NAME}-${DATE}-config.tar.gz"
if [[ -f "$APP_DIR/.env" ]]; then
  tar -czf "$cfg_file" -C "$APP_DIR" .env
  encrypt "$cfg_file"
fi

ls -lh "$BACKUP_DIR"/*"${DATE}"* 

# 3. Nuvem ------------------------------------------------------------------
if [[ -n "$RCLONE_REMOTE" ]]; then
  command -v rclone >/dev/null || { echo "rclone não instalado (ver docs/BACKUP.md)." >&2; exit 1; }
  echo "→ Enviando para $RCLONE_REMOTE"
  rclone copy "$BACKUP_DIR" "$RCLONE_REMOTE" --include "*${DATE}*.enc" --checksum
  echo "→ Limpando na nuvem o que passa de ${REMOTE_RETENTION_DAYS} dias"
  rclone delete "$RCLONE_REMOTE" --min-age "${REMOTE_RETENTION_DAYS}d" --include "*.enc"
else
  echo "⚠ RCLONE_REMOTE não definido: o backup ficou SÓ nesta VPS. Configure a nuvem (docs/BACKUP.md)."
fi

# 4. Limpeza local ------------------------------------------------------------
echo "→ Limpando backups locais com mais de ${RETENTION_DAYS} dias"
find "$BACKUP_DIR" \( -name '*.enc' -o -name '*.sql.gz' \) -mtime +"$RETENTION_DAYS" -delete

echo "✓ Backup concluído. Total no diretório:"
du -sh "$BACKUP_DIR"
ping_health ""
