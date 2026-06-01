# Flame Core - Production Setup Guide

This guide sets up automated backups, certificate renewal, and health monitoring.

## Prerequisites

```bash
# Make scripts executable
chmod +x /root/flame-core/backend/scripts/*.sh

# Install required tools
sudo apt-get update
sudo apt-get install -y postgresql-client-common curl openssl

# Install Cloudflare certbot plugin (for auto-renewal)
sudo apt-get install -y python3-certbot-dns-cloudflare
```

## 1. PostgreSQL Backups (Daily at 2 AM)

```bash
# Test backup script
sudo /root/flame-core/backend/scripts/backup-db.sh

# Add to crontab
sudo crontab -e
# Add this line:
# 0 2 * * * /root/flame-core/backend/scripts/backup-db.sh
```

The script:
- Creates daily backups in `/backups/postgresql/`
- Keeps last 30 days of backups
- Compresses backups automatically
- Logs to syslog

**To restore from backup:**
```bash
gunzip -c /backups/postgresql/flame_core_20260601_020000.sql.gz | \
  docker-compose -f ~/flame-core/backend/docker-compose.yml exec -T flamecore-postgres psql -U postgres
```

---

## 2. SSL Certificate Auto-Renewal (Monthly on 1st at 3 AM)

### Setup Cloudflare API

1. Go to https://dash.cloudflare.com/profile/api-tokens
2. Create API Token with "Edit Zone DNS" permission
3. Save the token

### Configure Certbot

```bash
# Create credentials file
mkdir -p ~/.cloudflare
nano ~/.cloudflare/cloudflare.ini
# Paste:
# dns_cloudflare_api_token = <YOUR_API_TOKEN>

chmod 600 ~/.cloudflare/cloudflare.ini

# Test renewal (dry run - doesn't actually renew yet)
sudo certbot renew --dns-cloudflare --dry-run

# Add to crontab for automatic renewal
sudo crontab -e
# Add this line:
# 0 3 1 * * /root/flame-core/backend/scripts/renew-certs.sh
```

Certbot will automatically:
- Check if certs need renewal (within 30 days of expiry)
- Renew using Cloudflare DNS validation
- Reload nginx automatically

---

## 3. Health Monitoring (Every 5 minutes)

```bash
# Test monitoring script
sudo /root/flame-core/backend/scripts/monitor-health.sh

# View alerts
sudo tail -f /var/log/flame-core/alerts.log

# View metrics
sudo tail -f /var/log/flame-core/metrics.log

# Add to crontab
sudo crontab -e
# Add this line:
# */5 * * * * /root/flame-core/backend/scripts/monitor-health.sh

# Optional: Send alerts to Slack
# Modify monitor-health.sh to:
# curl -X POST -H 'Content-type: application/json' \
#   --data '{"text":"'"$ALERT_MSG"'"}' \
#   $SLACK_WEBHOOK_URL
```

The script monitors:
- **Disk usage** (warns at 80%)
- **Memory usage** (warns at 85%)
- **Container status** (API, PostgreSQL, Redis)
- **API health** (HTTP /health endpoint)
- **Nginx status**
- **Certificate expiry** (warns 14 days before expiry)

---

## 4. AWS S3 Backups (Optional but Recommended)

```bash
# Install AWS CLI
sudo apt-get install -y awscli

# Configure AWS credentials
aws configure
# Enter your AWS Access Key and Secret

# Update backup script to upload to S3
# Edit: /root/flame-core/backend/scripts/backup-db.sh
# Uncomment the S3 upload lines and set your bucket name

# Verify S3 upload works
aws s3 ls s3://your-bucket-name/backups/
```

---

## 5. Log Rotation

```bash
# Create log rotation config
sudo nano /etc/logrotate.d/flame-core

# Paste:
/var/log/flame-core/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 root root
    sharedscripts
}

# Test rotation
sudo logrotate -f /etc/logrotate.d/flame-core
```

---

## 6. Database Maintenance (Weekly)

```bash
# Add weekly maintenance job
sudo crontab -e
# Add:
# 0 3 * * 0 docker-compose -f ~/flame-core/backend/docker-compose.yml exec -T flamecore-postgres vacuumdb -U postgres flame_core
```

This:
- Runs VACUUM (cleans dead rows)
- Reclaims disk space
- Optimizes queries

---

## Monitoring Dashboard (Optional)

To see all metrics in one place, you can use:

**Option 1: Prometheus + Grafana (advanced)**
```bash
cd /root/flame-core/backend
docker-compose -f docker-compose.monitoring.yml up -d
# Access at http://localhost:9090 (Prometheus) and http://localhost:3000 (Grafana)
```

**Option 2: Simple Bash Dashboard**
```bash
watch -n 5 'cat /var/log/flame-core/metrics.log | tail -20'
```

---

## Checklist

- [ ] Scripts are executable
- [ ] Backup script tested and working
- [ ] Backup directory has space (at least 50GB free)
- [ ] Cloudflare API token configured
- [ ] Cert renewal script tested (dry-run)
- [ ] Health monitor script running
- [ ] Cron jobs configured
- [ ] Logs being written to /var/log/flame-core/
- [ ] Log rotation configured
- [ ] Database maintenance scheduled
- [ ] Alerting configured (Slack/email optional)

---

## Emergency Procedures

**If API is down:**
```bash
cd /root/flame-core/backend
docker-compose restart api
docker-compose logs api | tail -100
```

**If PostgreSQL is down:**
```bash
# Restore from backup
gunzip -c /backups/postgresql/flame_core_LATEST.sql.gz | \
  docker-compose exec -T flamecore-postgres psql -U postgres -d flame_core
```

**If disk is full:**
```bash
# Find large files
du -sh /var/log/flame-core/*
du -sh /backups/*
du -sh /var/lib/docker/*

# Clean old backups manually if needed
rm /backups/postgresql/flame_core_*.sql.gz -mtime +60
```

---

## Support

Check logs for issues:
```bash
# API logs
docker-compose -f ~/flame-core/backend/docker-compose.yml logs api

# Nginx
sudo tail -f /var/log/nginx/error.log

# Certbot
sudo tail -f /var/log/letsencrypt/letsencrypt.log

# Health/alerts
sudo tail -f /var/log/flame-core/alerts.log
```
