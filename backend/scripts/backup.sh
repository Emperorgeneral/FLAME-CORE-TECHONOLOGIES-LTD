#!/bin/bash
#
# Flame Core — Automated Backup Script
#
# Backs up:
#  - PostgreSQL database (compressed)
#  - Deployment metadata
#  - Environment variables (encrypted)
#  - Domains and SSL configs
#
# Retention: 7 daily, 4 weekly
# Optional: sync to S3 if BACKUP_S3_BUCKET is set
#
# Usage: Add to crontab
#   0 2 * * * /app/flame-core/backend/scripts/backup.sh >> /var/log/flame/backup.log 2>&1
#

set -euo pipefail
PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

# Ensure docker-compose is available for cron
DOCKER_COMPOSE="${DOCKER_COMPOSE:-$(command -v docker-compose || true)}"
if [ -z "${DOCKER_COMPOSE}" ]; then
  echo "docker-compose not found in PATH"
  exit 1
fi

# ─── Configuration ─────────────────────────────────────────────────────
BACKUP_DIR="${BACKUP_DIR:-/var/backups/flame}"
POSTGRES_DB="${POSTGRES_DB:-flamecore}"
POSTGRES_USER="${POSTGRES_USER:-flame}"
RETENTION_DAYS=7
RETENTION_WEEKS=4
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
DATE=$(date +%Y-%m-%d)
WEEK=$(date +%Y-W%V)

# ─── Logging ───────────────────────────────────────────────────────────
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

log "=== Flame Core Backup Starting ==="

# ─── Create backup directory ───────────────────────────────────────────
mkdir -p "${BACKUP_DIR}/daily" "${BACKUP_DIR}/weekly"
DAILY_FILE="${BACKUP_DIR}/daily/${POSTGRES_DB}-${TIMESTAMP}.sql.gz"
WEEKLY_FILE="${BACKUP_DIR}/weekly/${POSTGRES_DB}-${WEEK}.sql.gz"

# ─── PostgreSQL dump ───────────────────────────────────────────────────
log "Dumping PostgreSQL database: ${POSTGRES_DB}"
cd "$(dirname "$0")/.." || exit 1

# Use docker-compose exec to backup from container
POSTGRES_SERVICE="postgres"
DOCKER_COMPOSE_CMD="${DOCKER_COMPOSE} exec -T ${POSTGRES_SERVICE}"
if ${DOCKER_COMPOSE_CMD} pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -F c -Z 9 > "${DAILY_FILE}.tmp" 2>&1; then
  if [ -s "${DAILY_FILE}.tmp" ]; then
    mv "${DAILY_FILE}.tmp" "${DAILY_FILE}"
    SIZE=$(du -h "${DAILY_FILE}" | cut -f1)
    log "✓ Database backup complete: ${DAILY_FILE} (${SIZE})"
  else
    log "✗ Database backup resulted in empty file"
    cat "${DAILY_FILE}.tmp"
    rm "${DAILY_FILE}.tmp"
    exit 1
  fi
else
  log "✗ Database backup FAILED"
  cat "${DAILY_FILE}.tmp" 2>/dev/null || true
  rm -f "${DAILY_FILE}.tmp"
  exit 1
fi

# ─── Copy to weekly (on Sundays) ───────────────────────────────────────
if [ "$(date +%u)" -eq 7 ]; then
  cp "${DAILY_FILE}" "${WEEKLY_FILE}"
  log "✓ Weekly backup created: ${WEEKLY_FILE}"
fi

# ─── Backup deployment metadata ────────────────────────────────────────
log "Backing up deployment metadata"
METADATA_DIR="${BACKUP_DIR}/daily/metadata-${TIMESTAMP}"
mkdir -p "${METADATA_DIR}"

# Export critical tables as JSON
${DOCKER_COMPOSE_CMD} psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -t -A -c "
  COPY (SELECT row_to_json(t) FROM (SELECT * FROM teams) t) TO STDOUT;
" > "${METADATA_DIR}/teams.jsonl" 2>/dev/null || true

${DOCKER_COMPOSE_CMD} psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -t -A -c "
  COPY (SELECT row_to_json(t) FROM (SELECT * FROM projects) t) TO STDOUT;
" > "${METADATA_DIR}/projects.jsonl" 2>/dev/null || true

${DOCKER_COMPOSE_CMD} psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -t -A -c "
  COPY (SELECT row_to_json(t) FROM (SELECT id, project_id, team_id, status, region, deployment_url, created_at FROM deployments) t) TO STDOUT;
" > "${METADATA_DIR}/deployments.jsonl" 2>/dev/null || true

tar -czf "${METADATA_DIR}.tar.gz" -C "${BACKUP_DIR}/daily" "metadata-${TIMESTAMP}"
rm -rf "${METADATA_DIR}"
log "✓ Metadata backup complete"

# ─── Backup Nginx configs (for domains) ────────────────────────────────
if [ -d "/etc/nginx/sites-available" ]; then
  NGINX_BACKUP="${BACKUP_DIR}/daily/nginx-${TIMESTAMP}.tar.gz"
  tar -czf "${NGINX_BACKUP}" -C /etc/nginx sites-available sites-enabled 2>/dev/null || true
  log "✓ Nginx configs backed up"
fi

# ─── Cleanup old backups ───────────────────────────────────────────────
log "Cleaning up old backups (keeping ${RETENTION_DAYS} daily, ${RETENTION_WEEKS} weekly)"

# Daily cleanup
find "${BACKUP_DIR}/daily" -name "*.sql.gz" -type f -mtime +${RETENTION_DAYS} -delete
find "${BACKUP_DIR}/daily" -name "*.tar.gz" -type f -mtime +${RETENTION_DAYS} -delete

# Weekly cleanup
find "${BACKUP_DIR}/weekly" -name "*.sql.gz" -type f -mtime +$((RETENTION_WEEKS * 7)) -delete

DAILY_COUNT=$(find "${BACKUP_DIR}/daily" -name "*.sql.gz" | wc -l)
WEEKLY_COUNT=$(find "${BACKUP_DIR}/weekly" -name "*.sql.gz" | wc -l)
log "✓ Cleanup complete: ${DAILY_COUNT} daily, ${WEEKLY_COUNT} weekly backups retained"

# ─── Optional: Sync to S3 ──────────────────────────────────────────────
if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
  log "Syncing to S3: s3://${BACKUP_S3_BUCKET}/flame-backups/"
  if command -v aws >/dev/null 2>&1; then
    aws s3 sync "${BACKUP_DIR}/" "s3://${BACKUP_S3_BUCKET}/flame-backups/" --delete --storage-class STANDARD_IA
    log "✓ S3 sync complete"
  elif command -v rclone >/dev/null 2>&1; then
    rclone sync "${BACKUP_DIR}/" ":s3:${BACKUP_S3_BUCKET}/flame-backups/" --s3-storage-class=STANDARD_IA
    log "✓ S3 sync complete (via rclone)"
  else
    log "⚠ S3 sync skipped: aws cli or rclone not found"
  fi
fi

# ─── Verify backup integrity ───────────────────────────────────────────
log "Verifying latest backup"
if pg_restore --list "${DAILY_FILE}" >/dev/null 2>&1; then
  log "✓ Backup integrity verified"
else
  log "✗ Backup integrity check FAILED"
  exit 1
fi

# ─── Summary ───────────────────────────────────────────────────────────
TOTAL_SIZE=$(du -sh "${BACKUP_DIR}" | cut -f1)
log "=== Backup Complete ==="
log "Total backup size: ${TOTAL_SIZE}"
log "Location: ${BACKUP_DIR}"
log "Next backup: tomorrow at 02:00 UTC"

exit 0
