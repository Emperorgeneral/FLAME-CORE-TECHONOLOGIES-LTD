#!/bin/bash

# ============================================================
# Flame Core - PostgreSQL Automated Backup Script
# ============================================================
# Backs up PostgreSQL database daily
# Usage: ./backup-db.sh
# Setup cron: 0 2 * * * /root/flame-core/backend/scripts/backup-db.sh

set -e

# Configuration
BACKUP_DIR="/backups/postgresql"
RETENTION_DAYS=30
DB_NAME="flame_core"
DB_USER="postgres"
DB_HOST="127.0.0.1"  # Inside docker-compose, use "flamecore-postgres"
DB_PORT="5432"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/flame_core_$TIMESTAMP.sql.gz"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Change to backup directory
cd "$BACKUP_DIR"

echo "[$(date)] Starting PostgreSQL backup..."

# Export password for non-interactive backup
export PGPASSWORD="${DB_PASSWORD:-postgres}"

# Perform backup
if docker-compose -f /root/flame-core/backend/docker-compose.yml exec -T flamecore-postgres pg_dump -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" "$DB_NAME" | gzip > "$BACKUP_FILE"; then
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo "[$(date)] ✅ Backup successful: $BACKUP_FILE ($BACKUP_SIZE)"
    
    # Clean up old backups (keep last 30 days)
    echo "[$(date)] Cleaning up backups older than $RETENTION_DAYS days..."
    find "$BACKUP_DIR" -name "flame_core_*.sql.gz" -mtime +$RETENTION_DAYS -delete
    
    # Optional: Upload to S3 (uncomment if you have AWS CLI configured)
    # echo "[$(date)] Uploading to S3..."
    # aws s3 cp "$BACKUP_FILE" "s3://your-bucket-name/backups/$(hostname)/$BACKUP_FILE"
    
else
    echo "[$(date)] ❌ Backup failed!"
    exit 1
fi

echo "[$(date)] Backup process complete"
exit 0
