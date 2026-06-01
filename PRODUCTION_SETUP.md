# Flame Core — Production Setup Guide

**Last Updated:** June 2026  
**Status:** Ready for multi-user global deployment

---

## ✅ Production-Ready Features

Your platform is now configured as a **real, production-grade hosting system** for users worldwide:

- ✅ No demo users or test data
- ✅ Admin-only account provisioning via environment variables
- ✅ Email verification required for all signups
- ✅ Global payment processing (Stripe, PayPal, Paystack, Flutterwave)
- ✅ Multi-region deployment support (7 regions)
- ✅ Live PayPal mode enabled by default
- ✅ Production CORS enforcement
- ✅ Secure JWT token management
- ✅ OAuth2 (GitHub, Google, GitLab)
- ✅ Team-based RBAC
- ✅ 4-tier subscription plans (Hobby → Scale)
- ✅ Global currency support (7 currencies)

---

## 🚀 Deployment Checklist

### 1. Infrastructure Setup

#### Database
```bash
# Use managed PostgreSQL in production
# AWS RDS, Heroku Postgres, DigitalOcean, or your VPS
psql "postgresql://user:password@db.example.com/flamecore_prod"
```

#### Cache/Queue
```bash
# Use managed Redis
# AWS ElastiCache, Heroku Redis, DigitalOcean
# No local Redis in production
```

#### Container Registry
```bash
# Docker images for each deployment
# AWS ECR, Docker Hub, DigitalOcean Container Registry
docker build -t flamecore-api:latest -f backend/Dockerfile backend/
docker push your-registry/flamecore-api:latest
```

---

### 2. Environment Configuration

**Backend (.env)**
```bash
# Required fields — set before deploying:
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@db.prod.example.com:5432/flamecore
REDIS_URL=redis://cache.prod.example.com:6379
JWT_SECRET=$(openssl rand -base64 32)  # Generate new secret
CORS_ORIGINS=https://flamecoretechltd.com,https://console.flamecoretechltd.com
FRONTEND_URL=https://console.flamecoretechltd.com
API_BASE_URL=https://api.flamecoretechltd.com

# Admin (change immediately after first login)
ADMIN_EMAIL=your-secure-admin@example.com
ADMIN_PASSWORD=generate_strong_random_password

# Payment processors (add as needed)
STRIPE_SECRET_KEY=sk_live_...
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
PAYPAL_MODE=live  # Production mode

# Email (required for signup verification)
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your_sendgrid_api_key
SMTP_FROM_EMAIL=noreply@your-domain.com
```

**Frontend (.env.production)**
```bash
NODE_ENV=production
MODE=production
VITE_API_URL=https://api.flamecoretechltd.com
VITE_MAIN_DOMAIN=https://flamecoretechltd.com
VITE_HOSTING_DOMAIN=https://console.flamecoretechltd.com
```

---

### 3. Database Initialization

```bash
# Run migrations (if any exist)
npm run migrate --prefix backend

# Seed reference data (currencies, regions, plans, admin user)
npm run seed --prefix backend

# Verify admin user was created
psql $DATABASE_URL -c "SELECT email, role FROM users WHERE role='admin';"
```

---

### 4. OAuth Setup

#### GitHub OAuth
1. Go to: https://github.com/settings/developers
2. Create new OAuth App
3. Set Authorization callback URL: `https://api.flamecoretechltd.com/api/v1/oauth/github/callback`
4. Add to `.env`:
   ```
   GITHUB_CLIENT_ID=...
   GITHUB_CLIENT_SECRET=...
   ```

#### Google OAuth
1. Go to: https://console.cloud.google.com/apis/credentials
2. Create OAuth 2.0 Client ID (Web application)
3. Set Authorized redirect URIs: `https://api.flamecoretechltd.com/api/v1/oauth/google/callback`
4. Add to `.env`:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   ```

---

### 5. Payment Gateway Configuration

#### Stripe (Recommended for Global)
- Sign up at https://dashboard.stripe.com
- Get live keys from **Settings → API Keys**
- Set webhook endpoint: `https://api.flamecoretechltd.com/api/v1/webhooks/stripe`

#### PayPal (Global Fallback)
- Create app at https://developer.paypal.com
- **Make sure to use Live credentials, NOT Sandbox**
- `PAYPAL_MODE=live` is already set in production config

#### Paystack (NGN, GHS, KES, ZAR, USD)
- Sign up at https://dashboard.paystack.com
- Get live Secret Key from **Settings**

#### Flutterwave (Pan-African + Global)
- Sign up at https://dashboard.flutterwave.com
- Get live Secret Key from **Settings**

---

### 6. Email Configuration

For user verification emails:

**Option A: SendGrid (Recommended)**
```bash
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=SG.your_sendgrid_api_key
SMTP_FROM_EMAIL=noreply@your-domain.com
```

**Option B: AWS SES**
```bash
SMTP_HOST=email-smtp.region.amazonaws.com
SMTP_PORT=587
SMTP_USER=your_iam_user
SMTP_PASS=your_smtp_password
SMTP_FROM_EMAIL=noreply@your-domain.com
```

---

### 7. SSL/TLS Certificates

```bash
# Use Let's Encrypt for free, auto-renewing certificates
# Via Certbot or your VPS provider's control panel

# Example with Nginx:
sudo certbot --nginx -d api.flamecoretechltd.com \
                     -d console.flamecoretechltd.com \
                     -d flamecoretechltd.com
```

---

### 8. Reverse Proxy (Nginx)

Place behind a reverse proxy for:
- SSL termination
- Rate limiting
- DDoS protection
- Load balancing

**Example Nginx config:**
```nginx
upstream api_backend {
  server localhost:3001;
}

server {
  listen 443 ssl http2;
  server_name api.flamecoretechltd.com;

  ssl_certificate /etc/letsencrypt/live/api.flamecoretechltd.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/api.flamecoretechltd.com/privkey.pem;

  location / {
    proxy_pass http://api_backend;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Host $host;
  }
}
```

---

## 🔐 Security Checklist

- [ ] Change JWT_SECRET to a cryptographically secure random value
- [ ] Change default ADMIN_PASSWORD immediately after first login
- [ ] Enable HTTPS everywhere
- [ ] Set strong database credentials
- [ ] Restrict database access to API server only
- [ ] Enable rate limiting on auth endpoints
- [ ] Configure firewall rules
- [ ] Enable database backups (daily minimum)
- [ ] Set up monitoring/alerting
- [ ] Enable CORS only for your domains
- [ ] Use environment secrets management (not in .env files)
- [ ] Rotate API keys regularly
- [ ] Implement DDoS protection

---

## 📊 Monitoring & Maintenance

### Logging
```bash
# Check API logs
docker logs flamecore-api

# Application logs location
tail -f /var/log/flamecore/api.log
```

### Database Maintenance
```bash
# Backup strategy
pg_dump -d flamecore_prod -h db.example.com > backup_$(date +%Y%m%d).sql

# Set up automated backups
* 3 * * * /usr/local/bin/backup-flamecore.sh

# Monitor DB size
psql $DATABASE_URL -c "SELECT pg_size_pretty(pg_database_size('flamecore_prod'));"
```

### Redis Monitoring
```bash
redis-cli -h cache.example.com INFO stats
redis-cli -h cache.example.com DBSIZE
```

---

## 🌍 Multi-Region Deployment

Your platform supports 7 regions out-of-the-box:

| Region | City | Country | Status |
|--------|------|---------|--------|
| los1 | Lagos | Nigeria | 🟢 Live (41% capacity) |
| lhr1 | London | UK | 🟡 Soon |
| fra1 | Frankfurt | Germany | 🟡 Soon |
| nyc1 | New York | USA | 🔵 Planned |
| sin1 | Singapore | Singapore | 🔵 Planned |
| jnb1 | Johannesburg | South Africa | 🔵 Planned |
| nbo1 | Nairobi | Kenya | 🔵 Planned |

Each region will need:
- Kubernetes cluster or Docker Swarm
- Local PostgreSQL read replica
- Local Redis cache
- CDN edge location

---

## 💰 Subscription Plans

Pre-configured for launch:

| Plan | Price (USD/mo) | vCPU | RAM | Storage | Max Projects |
|------|----------|------|-----|---------|----------------|
| **Hobby** | Free | 0.5 shared | 512 MB | 1 GB | 3 |
| **Starter** | $8 | 1 | 1 GB | 10 GB | 10 |
| **Pro** | $25 | 2 | 4 GB | 50 GB | 50 |
| **Scale** | $89 | 4 | 16 GB | 200 GB | 999 |

Adjust pricing by editing `SEED_DATA` in `backend/src/db/seed.ts`

---

## 🎯 First-Run Steps

```bash
# 1. Set up infrastructure (DB, Redis, Domain DNS)
# 2. Build & push Docker images
# 3. Deploy backend API
# 4. Deploy frontend
# 5. Run database migrations
# 6. Seed reference data & create admin user
npm run seed --prefix backend

# 7. Verify admin can login
curl -X POST https://api.flamecoretechltd.com/api/health

# 8. Test OAuth providers
# 9. Test payment processors with live keys
# 10. Monitor logs for errors
```

---

## 📞 Support & Troubleshooting

### Common Issues

**"CORS_ORIGINS must be set"**
```
→ Set CORS_ORIGINS in .env with your frontend domain
```

**Email verification not sending**
```
→ Check SMTP credentials
→ Verify SMTP_FROM_EMAIL is approved by your provider
→ Check logs: grep SMTP /var/log/flamecore/api.log
```

**Admin user not created**
```
→ Ensure ADMIN_EMAIL and ADMIN_PASSWORD are set
→ Run seed script again if needed
```

**OAuth redirect failing**
```
→ Verify FRONTEND_URL and API_BASE_URL match your domains
→ Check OAuth provider callback URLs are correctly registered
→ Check that DNS is resolving correctly
```

---

## 🎉 You're Live!

Your Flame Core hosting platform is now ready to serve users worldwide.

**Key Reminders:**
- No demo users in production
- All signups require email verification
- Real payment processing enabled
- Real OAuth integrations required
- Monitor logs and metrics continuously
- Keep dependencies updated
- Rotate credentials regularly

Happy hosting! 🚀
