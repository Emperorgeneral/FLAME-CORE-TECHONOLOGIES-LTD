#!/bin/bash
# Deploy marketing website to production
# Usage: ./deploy-marketing.sh

set -e

MARKETING_BUILD_DIR="${1:-.}"
MARKETING_DIST="$MARKETING_BUILD_DIR/flamecore-technologies-website-development (1)/dist"
DEPLOY_PATH="/var/www/marketing"

echo "📦 Deploying marketing website from: $MARKETING_DIST"

# Create deployment directory
mkdir -p $DEPLOY_PATH

# Copy files
echo "📁 Copying files to $DEPLOY_PATH..."
cp -r $MARKETING_DIST/* $DEPLOY_PATH/

# Set permissions
echo "🔐 Setting permissions..."
chown -R www-data:www-data $DEPLOY_PATH
chmod -R 755 $DEPLOY_PATH

# Verify deployment
echo "✅ Marketing website deployed to: $DEPLOY_PATH"
ls -lah $DEPLOY_PATH | head -10

echo ""
echo "📌 Now update nginx config to serve:"
echo "   - flamecoretechltd.com → $DEPLOY_PATH (marketing)"
echo "   - hosting.flamecoretechltd.com → /var/www/flame-core (hosting platform)"
