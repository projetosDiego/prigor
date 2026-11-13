#!/usr/bin/env bash
# ============================================================================
#  Doces Prigor OS — backup do banco
#
#  Mesmo formato do backup.sh do ActPost, apontando para o banco do Prigor
#  dentro do Postgres compartilhado. Roda por cron (ver docs/DEPLOY.md).
# ============================================================================
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/opt/prigor/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
DATE="$(date +%Y%m%d-%H%M%S)"
CONTAINER="actpost-postgres"

mkdir -p "$BACKUP_DIR"

if [[ -f /opt/prigor/.env ]]; then
  export $(grep -v '^#' /opt/prigor/.env | grep -E '^PRIGOR_DB_(USER|NAME)=' | xargs) || true
fi
DB_USER="${PRIGOR_DB_USER:-prigor}"
DB_NAME="${PRIGOR_DB_NAME:-prigor}"

out="$BACKUP_DIR/${DB_NAME}-${DATE}.sql.gz"
echo "→ Dump $DB_NAME → $out"
docker exec -t "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" --clean --if-exists \
  | gzip -9 > "$out"
ls -lh "$out"

# Um dump vazio significa falha silenciosa (credencial errada, banco fora).
# Melhor falhar alto do que acumular arquivos inúteis por semanas.
if [[ "$(stat -c%s "$out")" -lt 1000 ]]; then
  echo "Backup suspeito: arquivo com menos de 1KB. Verifique as credenciais."
  exit 1
fi

echo "→ Limpando backups com mais de ${RETENTION_DAYS} dias"
find "$BACKUP_DIR" -name '*.sql.gz' -mtime +"$RETENTION_DAYS" -delete

echo "Backup concluído. Total no diretório:"
du -sh "$BACKUP_DIR"
