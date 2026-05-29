# ============================================================
# Flame Core — Production Deployment Guide
# ============================================================
#
# This document covers:
# - Domain & DNS setup
# - Environment configuration
# - VPS deployment steps
# - Nginx configuration
# - SSL certificate provisioning
# - Backend API setup
# - Monitoring & maintenance
#

## 1. DOMAIN SETUP
============================================================

### Register domains:
- Primary: flamecoretechltd.com
- Subdomains:
  - www.flamecoretechltd.com (optional, auto-redirect to primary)
  - hosting.flamecoretechltd.com (hosting platform)
  - api.flamecoretechltd.com (optional, if separate from /api/v1)

### DNS Records (in your domain registrar):

```
Type    Name                          Value
─────────────────────────────────────────────────────────
A       flamecoretechltd.com         <VPS-IP>
A       www.flamecoretechltd.com     <VPS-IP>
A       hosting.flamecoretechltd.com <VPS-IP>
A       api.flamecoretechltd.com     <VPS-IP>
```

Replace `<VPS-IP>` with your VPS's public IP address.

---

## 2. VPS SETUP
============================================================

### Prerequisites:
- Ubuntu 22.04 LTS (or Debian 12)
- 4GB RAM minimum (8GB recommended for production)
- 50GB SSD storage
- SSH access

### Initial setup:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install required packages
sudo apt install -y \
  git \
  curl \
  wget \
  nginx \
  docker.io \
  docker-compose \
  nodejs \
  npm \
  postgresql \
  redis-server \
  certbot \
  python3-certbot-nginx

# Create app user
sudo useradd -m -s /bin/bash flamecore
sudo usermod -aG docker flamecore

# Clone repository
cd /var/www
sudo mkdir -p flamecore-apps
sudo chown -R flamecore:flamecore flamecore-apps
cd flamecore-apps

# As flamecore user:
su - flamecore
git clone https://github.com/yourusername/flame-core.git
cd flame-core
```

---

## 3. ENVIRONMENT CONFIGURATION
============================================================

### Copy and configure .env file:

```bash
# Copy production template
cp .env.production .env.production.local

# Edit with your values
nano .env.production.local
```

### Key production values to set:

```bash
# Domains
VITE_MAIN_DOMAIN=https://flamecoretechltd.com
VITE_HOSTING_DOMAIN=https://hosting.flamecoretechltd.com
VITE_API_URL=https://api.flamecoretechltd.com

# Database (must be created first)
DATABASE_URL=postgresql://flame_prod:STRONG_PASSWORD_HERE@localhost:5432/flamecore_prod

# Redis
REDIS_URL=redis://localhost:6379

# Security
JWT_SECRET=<generate-32-char-random-key>
  # Use: openssl rand -base64 32

# OAuth credentials (from GitHub & Google)
GITHUB_CLIENT_ID=xxx
GITHUB_CLIENT_SECRET=xxx
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx

# Payment keys (Stripe, Paystack, etc.)
STRIPE_SECRET_KEY=sk_live_xxx
PAYSTACK_SECRET_KEY=sk_xxx

# Email service
EMAIL_SERVICE=sendgrid
EMAIL_API_KEY=SG.xxx
EMAIL_FROM=noreply@flamecoretechltd.com

# CORS origins
CORS_ORIGINS=https://flamecoretechltd.com,https://hosting.flamecoretechltd.com
```

---

## 4. DATABASE SETUP
============================================================

### Create PostgreSQL database and user:

```bash
# Connect to PostgreSQL
sudo -u postgres psql

# Inside psql:
CREATE USER flame_prod WITH PASSWORD 'STRONG_PASSWORD_HERE';
CREATE DATABASE flamecore_prod OWNER flame_prod;

# Grant all privileges
GRANT ALL PRIVILEGES ON DATABASE flamecore_prod TO flame_prod;

# Exit
\\q
```

### Run migrations:

```bash
cd /var/www/flamecore-apps/flame-core/backend
npm install
npm run db:init
npm run db:seed
```

---

## 5. SSL CERTIFICATE SETUP
============================================================

### Generate certificates with Certbot:

```bash
sudo certbot certonly \
  --standalone \
  --email admin@flamecoretechltd.com \
  -d flamecoretechltd.com \
  -d www.flamecoretechltd.com \
  -d hosting.flamecoretechltd.com \
  -d api.flamecoretechltd.com \
  --agree-tos
```

### Auto-renewal (runs automatically):

```bash
# Check renewal status
sudo certbot renew --dry-run

# Renewal cron (usually already set up)
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
```

---

## 6. NGINX CONFIGURATION
============================================================

### Install Nginx config:

```bash
# Backup existing
sudo cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.backup

# Copy production config
sudo cp nginx.conf.production /etc/nginx/sites-available/flamecore

# Create symlink
sudo ln -s /etc/nginx/sites-available/flamecore /etc/nginx/sites-enabled/flamecore

# Disable default
sudo rm /etc/nginx/sites-enabled/default

# Test config
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

### Create log directories:

```bash
sudo mkdir -p /var/log/nginx
sudo touch /var/log/nginx/flamecore-website-*.log
sudo touch /var/log/nginx/flamecore-hosting-*.log
sudo touch /var/log/nginx/flamecore-api-*.log
sudo chown -R www-data:www-data /var/log/nginx
```

---

## 7. BUILD & DEPLOY APPLICATIONS
============================================================

### Build frontend applications:

```bash
# Main website
cd src
npm install
npm run build
# Output: dist/

# Copy to production location
sudo mkdir -p /var/www/flamecore-website/dist
sudo cp -r dist/* /var/www/flamecore-website/dist/
sudo chown -R www-data:www-data /var/www/flamecore-website
```

### Build hosting platform:

```bash
# Go to hosting platform folder
cd flamecore-technologies-website-development\ \(1\)
npm install
npm run build
# Output: dist/

sudo mkdir -p /var/www/flamecore-hosting/dist
sudo cp -r dist/* /var/www/flamecore-hosting/dist/
sudo chown -R www-data:www-data /var/www/flamecore-hosting
```

### Backend deployment:

```bash
cd backend
npm install

# Option 1: PM2 (process manager)
npm install -g pm2
pm2 start npm --name "flamecore-api" -- start
pm2 save
pm2 startup

# Option 2: Docker Compose (recommended)
docker-compose -f docker-compose.yml up -d
```

---

## 8. DOCKER & CONTAINER SUPPORT
============================================================

### Build Docker image for API:

```bash
cd backend
docker build -t flamecore-api:latest .

# Push to registry (if using)
docker tag flamecore-api:latest your-registry/flamecore-api:latest
docker push your-registry/flamecore-api:latest
```

### Deploy with Docker Compose:

```bash
cd backend
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f api
```

---

## 9. FIRST-TIME INITIALIZATION
============================================================

### Start the application:

```bash
# Verify services are running
curl https://api.flamecoretechltd.com/api/health

# Check website
curl https://flamecoretechltd.com

# Check hosting platform
curl https://hosting.flamecoretechltd.com
```

### Admin account:

The seeder creates a default admin:
- Email: admin@flamecore.app
- Password: (set in seed.ts)

Change this immediately in production.

---

## 10. MONITORING & MAINTENANCE
============================================================

### Regular backups:

```bash
# Database backup
pg_dump -U flame_prod flamecore_prod > /backups/db-$(date +%Y%m%d).sql

# Daily backup script
cd backend
bash scripts/backup.sh

# Set up cron job
0 2 * * * cd /var/www/flamecore-apps/flame-core/backend && bash scripts/backup.sh
```

### Log rotation:

```bash
# Nginx logs
sudo logrotate /etc/logrotate.d/nginx

# Application logs
sudo logrotate /etc/logrotate.d/flamecore
```

### Monitoring:

```bash
# Check resource usage
htop

# Check Docker containers
docker ps

# Check service status
systemctl status nginx
systemctl status postgresql
systemctl status redis-server
```

### Health checks:

```bash
# API health
curl https://api.flamecoretechltd.com/api/health

# Database
psql -U flame_prod -d flamecore_prod -c "SELECT 1;"

# Redis
redis-cli ping
```

---

## 11. TROUBLESHOOTING
============================================================

### Nginx not starting

```bash
# Check config
sudo nginx -t

# View errors
sudo systemctl status nginx
sudo tail -f /var/log/nginx/error.log
```

### Database connection errors

```bash
# Test connection
psql -U flame_prod -d flamecore_prod -c "SELECT 1;"

# Check PostgreSQL status
sudo systemctl status postgresql
```

### SSL certificate issues

```bash
# Check certificate
sudo certbot certificates

# Renew manually
sudo certbot renew

# Test renewal
sudo certbot renew --dry-run
```

### API not responding

```bash
# Check logs
docker-compose logs -f api
# or
pm2 logs

# Restart service
docker-compose restart api
# or
pm2 restart flamecore-api
```

---

## 12. SECURITY CHECKLIST
============================================================

- [ ] Change default admin password
- [ ] Set strong JWT_SECRET
- [ ] Enable SSH key authentication only (disable password login)
- [ ] Configure firewall (UFW):
  ```bash
  sudo ufw enable
  sudo ufw allow 22/tcp
  sudo ufw allow 80/tcp
  sudo ufw allow 443/tcp
  ```
- [ ] Set up fail2ban for brute force protection
- [ ] Configure rate limiting in Nginx (already in config)
- [ ] Enable automatic security updates:
  ```bash
  sudo apt install unattended-upgrades
  ```
- [ ] Set up monitoring and alerts
- [ ] Regular backups to offsite storage
- [ ] Review CORS origins (limit to your domains)
- [ ] Verify all OAuth secrets are set
- [ ] Test payment provider integration in test mode first

---

## 13. SCALING CONSIDERATIONS
============================================================

When ready to scale:

### Multi-region deployment:
- Backend supports REGION_CODE env var
- Set up separate worker nodes per region
- Database stays centralized or replicated

### Load balancing:
- Use managed load balancer (AWS ALB, DigitalOcean LB)
- Implement sticky sessions for WebSocket support
- Use Redis for distributed session storage

### Database scaling:
- PostgreSQL replicas for read scaling
- Connection pooling with PgBouncer
- Archive old data regularly

### CDN:
- Cloudflare for static assets + DDoS protection
- Cache API responses strategically
- Serve media files from CDN

---

## 14. SUPPORT & NEXT STEPS
============================================================

### Documentation:
- ARCHITECTURE.md — Platform design
- MVP_REFINEMENTS.md — Feature implementations
- Backend README in backend/

### Contact & Issues:
- Email: admin@flamecoretechltd.com
- WhatsApp: +234 707 172 6082
- Support hours: 9 AM - 6 PM WAT

### Common tasks:
```bash
# View API logs
docker-compose logs api

# Restart all services
docker-compose restart

# Deploy new version
git pull origin main
docker-compose up -d --build

# Database backup
bash backend/scripts/backup.sh

# SSH into server
ssh flamecore@<VPS-IP>
```

---

Generated: May 2026
Environment: Production
Version: 1.0.0
