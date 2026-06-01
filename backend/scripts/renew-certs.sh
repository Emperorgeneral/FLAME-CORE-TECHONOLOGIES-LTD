#!/bin/bash

# ============================================================
# Flame Core - SSL Certificate Auto-Renewal Script
# ============================================================
# Automatically renews Let's Encrypt certificates using Cloudflare DNS
# Usage: ./renew-certs.sh
# Setup cron: 0 3 1 * * /root/flame-core/backend/scripts/renew-certs.sh

set -e

CERT_DIR="/etc/letsencrypt/live"
LOG_FILE="/var/log/flame-core/cert-renewal.log"
DOMAINS=(
    "flamecoretechltd.com"
    "www.flamecoretechltd.com"
    "hosting.flamecoretechltd.com"
    "api.flamecoretechltd.com"
)

mkdir -p /var/log/flame-core

echo "[$(date)] Starting certificate renewal..." | tee -a "$LOG_FILE"

# Method 1: Using Cloudflare plugin (recommended)
# First time setup: sudo apt-get install python3-certbot-dns-cloudflare
# Then create ~/.cloudflare/cloudflare.ini with:
#   dns_cloudflare_api_token = your_api_token

if command -v certbot &> /dev/null; then
    for domain in "${DOMAINS[@]}"; do
        echo "[$(date)] Renewing certificate for $domain..." | tee -a "$LOG_FILE"
        
        # Using Cloudflare DNS challenge (non-interactive)
        if sudo certbot renew --dns-cloudflare --quiet 2>&1 | tee -a "$LOG_FILE"; then
            echo "[$(date)] ✅ Certificate renewal successful for $domain" | tee -a "$LOG_FILE"
        else
            echo "[$(date)] ⚠️  Certificate renewal warning for $domain - may not have needed renewal" | tee -a "$LOG_FILE"
        fi
    done
    
    # Reload nginx after cert renewal
    echo "[$(date)] Reloading nginx..." | tee -a "$LOG_FILE"
    sudo systemctl reload nginx
    
    echo "[$(date)] ✅ Certificate renewal process complete" | tee -a "$LOG_FILE"
else
    echo "[$(date)] ❌ Certbot not found!" | tee -a "$LOG_FILE"
    exit 1
fi

exit 0
