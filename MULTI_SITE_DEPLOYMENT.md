# Multi-Site Production Deployment

This guide deploys Flame Core to production with three separate applications:

## Architecture

| Domain | Application | Path | Purpose |
|--------|-------------|------|---------|
| `flamecoretechltd.com` | Marketing Website | `/var/www/marketing` | Landing page, features, pricing |
| `hosting.flamecoretechltd.com` | Hosting Platform | `/var/www/flame-core` | Admin dashboard, deployments |
| `api.flamecoretechltd.com` | Backend API | Port 3002 | REST endpoints |

## Deployment Steps

### 1. Build Frontend Applications (Local)

```bash
# Build hosting platform (root /src)
npm run build
# Output: dist/index.html (431.23 kB)

# Build marketing website
cd "flamecore-technologies-website-development (1)"
npm run build
# Output: dist/index.html (286.91 kB)
```

### 2. Deploy Marketing Website (VPS)

```bash
# SSH to VPS
ssh root@vmi3227630

# Create directory
mkdir -p /var/www/marketing

# Exit and run from local machine:
# Windows PowerShell (requires PuTTY's pscp or equivalent)
# Or use the deploy-marketing.sh script from VPS

# From VPS, if cloned repo:
bash /root/flame-core/scripts/deploy-marketing.sh /root/flame-core
```

### 3. Deploy Hosting Platform (VPS)

Already deployed to `/var/www/flame-core`. If updating:

```bash
# From VPS:
cd /root/flame-core

# Copy new build
cp -r dist/* /var/www/flame-core/

# Fix permissions
chown -R www-data:www-data /var/www/flame-core
chmod -R 755 /var/www/flame-core
```

### 4. Update Nginx Configuration

```bash
# From VPS:
cp /root/flame-core/nginx.conf.production /etc/nginx/sites-available/flamecore

# Enable if not already
ln -s /etc/nginx/sites-available/flamecore /etc/nginx/sites-enabled/

# Test configuration
nginx -t

# Reload nginx
systemctl reload nginx
```

### 5. Verify Deployments

```bash
# Test marketing site
curl -I https://flamecoretechltd.com/
# Expected: HTTP/2 200

# Test hosting platform
curl -I https://hosting.flamecoretechltd.com/
# Expected: HTTP/2 200

# Test API
curl https://api.flamecoretechltd.com/health
# Expected: {"status":"ok","version":"2.4.1",...}
```

## File Locations on VPS

```
/var/www/
├── marketing/              ← Marketing website (flamecoretechltd.com)
│   ├── index.html         ← Single-page app
│   ├── favicon.svg
│   └── og-flame-core.svg
└── flame-core/            ← Hosting platform (hosting.flamecoretechltd.com)
    ├── index.html         ← Single-page app
    ├── favicon.svg
    └── og-flame-core.svg

/root/flame-core/
├── backend/               ← API source (running in Docker/PM2)
├── backend-port.txt       ← Current port (3001-3010 range)
├── scripts/
│   ├── deploy-marketing.sh
│   └── sync-nginx-port.sh
└── nginx.conf.production  ← Master nginx config

/etc/nginx/
├── sites-available/
│   └── flamecore          ← Symlink to master config
└── sites-enabled/
    └── flamecore          ← Active config
```

## Troubleshooting

### Issue: Both domains show same content

**Cause**: Nginx config has same `root` for both domains.

**Fix**: 
- Verify `/etc/nginx/sites-available/flamecore` has correct paths:
  - `flamecoretechltd.com` → `root /var/www/marketing;`
  - `hosting.flamecoretechltd.com` → `root /var/www/flame-core;`
- Run `nginx -t` to validate
- Run `systemctl reload nginx` to apply changes

### Issue: 500 error on marketing site

**Check**:
```bash
# Verify files exist
ls -la /var/www/marketing/
# Should show: index.html, favicon.svg, og-flame-core.svg

# Check permissions
ls -ld /var/www/marketing/
# Should show: drwxr-xr-x www-data www-data

# Check nginx error log
tail -20 /var/log/nginx/flamecore-website-error.log

# Check access log
tail -20 /var/log/nginx/flamecore-website-access.log
```

### Issue: 500 error on hosting platform

**Check**:
```bash
# Verify files exist
ls -la /var/www/flame-core/
# Should show: index.html, favicon.svg, og-flame-core.svg

# Check permissions
ls -ld /var/www/flame-core/
# Should show: drwxr-xr-x www-data www-data

# Check nginx error log
tail -20 /var/log/nginx/flamecore-hosting-error.log

# Test backend API is running
curl https://api.flamecoretechltd.com/health
```

## Configuration Files

All configuration committed to git:

- [nginx.conf.production](./nginx.conf.production) - Master nginx config (3 server blocks)
- [scripts/deploy-marketing.sh](./scripts/deploy-marketing.sh) - Deploy marketing website script
- [scripts/deploy-frontend.sh](./scripts/deploy-frontend.sh) - Deploy hosting platform script
- [scripts/sync-nginx-port.sh](./scripts/sync-nginx-port.sh) - Auto-sync nginx when backend port changes
