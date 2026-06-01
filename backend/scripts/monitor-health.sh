#!/bin/bash

# ============================================================
# Flame Core - System Health Monitor
# ============================================================
# Monitors VPS health: disk, memory, containers, API response
# Usage: ./monitor-health.sh
# Setup cron: */5 * * * * /root/flame-core/backend/scripts/monitor-health.sh

ALERT_LOG="/var/log/flame-core/alerts.log"
METRICS_LOG="/var/log/flame-core/metrics.log"
mkdir -p /var/log/flame-core

# Thresholds
DISK_WARN=80      # % used
MEM_WARN=85       # % used
CONTAINER_TIMEOUT=10  # seconds

log_alert() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ⚠️  $1" | tee -a "$ALERT_LOG"
}

log_metric() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$METRICS_LOG"
}

# ─────────────────────────────────────────────────────────
# 1. Disk Space
# ─────────────────────────────────────────────────────────
DISK_USAGE=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -gt "$DISK_WARN" ]; then
    log_alert "DISK USAGE HIGH: ${DISK_USAGE}% used"
fi
log_metric "DISK_USAGE=${DISK_USAGE}%"

# ─────────────────────────────────────────────────────────
# 2. Memory
# ─────────────────────────────────────────────────────────
MEM_USAGE=$(free | awk 'NR==2 {printf("%.0f", $3/$2 * 100)}')
if [ "$MEM_USAGE" -gt "$MEM_WARN" ]; then
    log_alert "MEMORY USAGE HIGH: ${MEM_USAGE}% used"
fi
log_metric "MEMORY_USAGE=${MEM_USAGE}%"

# ─────────────────────────────────────────────────────────
# 3. Docker Containers
# ─────────────────────────────────────────────────────────
cd /root/flame-core/backend

# Check API container
if ! docker-compose ps flamecore-api | grep -q "Up"; then
    log_alert "API CONTAINER DOWN"
else
    log_metric "CONTAINER_API=up"
fi

# Check PostgreSQL
if ! docker-compose ps flamecore-postgres | grep -q "Up"; then
    log_alert "POSTGRES CONTAINER DOWN"
else
    log_metric "CONTAINER_POSTGRES=up"
fi

# Check Redis
if ! docker-compose ps flamecore-redis | grep -q "Up"; then
    log_alert "REDIS CONTAINER DOWN"
else
    log_metric "CONTAINER_REDIS=up"
fi

# ─────────────────────────────────────────────────────────
# 4. API Health Check
# ─────────────────────────────────────────────────────────
if timeout $CONTAINER_TIMEOUT curl -sf http://localhost:3001/health > /dev/null 2>&1; then
    log_metric "API_HEALTH=ok"
else
    log_alert "API HEALTH CHECK FAILED"
fi

# ─────────────────────────────────────────────────────────
# 5. Nginx Status
# ─────────────────────────────────────────────────────────
if systemctl is-active --quiet nginx; then
    log_metric "NGINX=up"
else
    log_alert "NGINX IS DOWN"
fi

# ─────────────────────────────────────────────────────────
# 6. Certificate Expiry
# ─────────────────────────────────────────────────────────
for cert in /etc/letsencrypt/live/*/fullchain.pem; do
    if [ -f "$cert" ]; then
        DOMAIN=$(basename $(dirname "$cert"))
        EXPIRY=$(openssl x509 -in "$cert" -noout -enddate | cut -d= -f2)
        DAYS_LEFT=$(( ($(date -d "$EXPIRY" +%s) - $(date +%s)) / 86400 ))
        
        if [ "$DAYS_LEFT" -lt 14 ]; then
            log_alert "CERTIFICATE EXPIRING SOON: $DOMAIN expires in ${DAYS_LEFT} days"
        fi
        log_metric "CERT_$DOMAIN=${DAYS_LEFT}_days"
    fi
done

exit 0
