#!/bin/bash
# Update nginx upstream based on discovered backend port

PORT_FILE="/root/flame-core/backend-port.txt"
NGINX_CONF="/etc/nginx/sites-available/flamecore"

# Check if port file exists
if [ ! -f "$PORT_FILE" ]; then
    echo "❌ Port file not found: $PORT_FILE"
    exit 1
fi

# Read port from file
BACKEND_PORT=$(cat "$PORT_FILE")

if [ -z "$BACKEND_PORT" ]; then
    echo "❌ Port file is empty"
    exit 1
fi

echo "📝 Updating nginx upstream to use port $BACKEND_PORT..."

# Update nginx config (replace hardcoded 3001 with discovered port in flamecore_api upstream)
if [ -f "$NGINX_CONF" ]; then
    sed -i "s|server 127.0.0.1:3001;|server 127.0.0.1:$BACKEND_PORT;|g" "$NGINX_CONF"
    echo "✅ Updated $NGINX_CONF"
    
    # Test nginx config
    if nginx -t; then
        echo "✅ Nginx config is valid, reloading..."
        systemctl reload nginx
        echo "✅ Nginx reloaded successfully"
    else
        echo "❌ Nginx config test failed!"
        exit 1
    fi
else
    echo "❌ Nginx config not found: $NGINX_CONF"
    exit 1
fi
