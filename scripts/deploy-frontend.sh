#!/bin/bash
# Flame Core Frontend Deployment Script
# Run on VPS to deploy the React frontend to hosting.flamecoretechltd.com

set -e

echo "🚀 Deploying Flame Core Frontend to Production..."

# Create frontend serving directory
FRONTEND_DIR="/root/flame-core/frontend-dist"
mkdir -p "$FRONTEND_DIR"

# Copy frontend build files
cd /root/flame-core
echo "📦 Copying frontend build files..."
cp -r dist/* "$FRONTEND_DIR/"

# Set proper permissions
chmod -R 755 "$FRONTEND_DIR"

echo "✅ Frontend files deployed to $FRONTEND_DIR"
echo ""
echo "📝 Next steps:"
echo "1. Update nginx config to serve from $FRONTEND_DIR"
echo "2. Run: sudo systemctl reload nginx"
echo "3. Test: curl https://hosting.flamecoretechltd.com/"
echo ""
echo "Frontend URL: https://hosting.flamecoretechltd.com"
echo "API URL: https://api.flamecoretechltd.com"
