#!/bin/bash
# Sync nginx upstream port with discovered backend port
# This script should run every minute via cron to keep nginx in sync with backend port

PORT_FILE="/root/flame-core/backend-port.txt"
NGINX_CONF="/etc/nginx/sites-available/flamecore"
LAST_PORT_FILE="/tmp/last-backend-port"

# Read current backend port
if [ ! -f "$PORT_FILE" ]; then
    exit 0  # Port file doesn't exist yet, skip
fi

CURRENT_PORT=$(cat "$PORT_FILE" 2>/dev/null | tr -d '[:space:]')

if [ -z "$CURRENT_PORT" ]; then
    exit 0  # Port file empty, skip
fi

# Read last known port
LAST_PORT=""
if [ -f "$LAST_PORT_FILE" ]; then
    LAST_PORT=$(cat "$LAST_PORT_FILE")
fi

# If port hasn't changed, skip nginx reload
if [ "$LAST_PORT" = "$CURRENT_PORT" ]; then
    exit 0
fi

echo "[$(date)] Updating nginx upstream to port $CURRENT_PORT (was: $LAST_PORT)"

# Update nginx config - replace any port with the current one in flamecore_api upstream
# Match the line with "server 127.0.0.1:" and replace the port
sed -i "/upstream flamecore_api/,/^}/s/server 127.0.0.1:[0-9]*;/server 127.0.0.1:$CURRENT_PORT;/g" "$NGINX_CONF"

# Test nginx config
if nginx -t >/dev/null 2>&1; then
    systemctl reload nginx
    echo "[$(date)] ✅ Nginx reloaded with port $CURRENT_PORT"
    echo "$CURRENT_PORT" > "$LAST_PORT_FILE"
else
    echo "[$(date)] ❌ Nginx config test failed, reverting..."
    exit 1
fi
