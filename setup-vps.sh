#!/bin/bash

################################################################################
# FLAME CORE - VPS PRODUCTION SETUP SCRIPT
################################################################################
#
# This script automatically installs and configures all components needed for
# Flame Core hosting platform production deployment:
#
# Components installed:
# ✓ System dependencies & build tools
# ✓ Docker & Docker Compose
# ✓ Node.js & npm (LTS)
# ✓ PostgreSQL 16 (primary database)
# ✓ MongoDB (NoSQL database)
# ✓ MySQL 8 (alternative SQL database)
# ✓ Redis (cache & sessions)
# ✓ RabbitMQ (message queue)
# ✓ Elasticsearch (full-text search)
# ✓ Nginx (reverse proxy - already managed)
# ✓ Certbot (SSL certificates)
# ✓ PM2 (process manager - optional)
# ✓ Monitoring & logging tools
# ✓ Backup utilities
#
# Usage:
#   chmod +x setup-vps.sh
#   ./setup-vps.sh
#
# Or directly:
#   curl -fsSL https://your-domain.com/setup-vps.sh | bash
#
# Note: Run as root or with sudo
#
################################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
FLAME_USER="flamecore"
FLAME_HOME="/home/$FLAME_USER"
APP_DIR="/var/www/flamecore-apps"
LOG_FILE="/var/log/flamecore-setup.log"

################################################################################
# UTILITY FUNCTIONS
################################################################################

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

success() {
    echo -e "${GREEN}✓ $1${NC}" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}✗ $1${NC}" | tee -a "$LOG_FILE"
    exit 1
}

warning() {
    echo -e "${YELLOW}⚠ $1${NC}" | tee -a "$LOG_FILE"
}

section() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        error "This script must be run as root (use: sudo ./setup-vps.sh)"
    fi
}

# Detect OS
detect_os() {
    if [[ -f /etc/os-release ]]; then
        . /etc/os-release
        OS=$ID
        VERSION=$VERSION_ID
    else
        error "Cannot detect OS"
    fi
    
    if [[ "$OS" != "ubuntu" && "$OS" != "debian" ]]; then
        error "This script only supports Ubuntu/Debian. Detected: $OS"
    fi
    
    success "Detected: $OS $VERSION"
}

################################################################################
# MAIN INSTALLATION FUNCTIONS
################################################################################

setup_system() {
    section "1. SYSTEM UPDATE & BASE DEPENDENCIES"
    
    log "Updating system packages..."
    apt-get update
    apt-get upgrade -y
    
    log "Installing essential packages..."
    apt-get install -y \
        build-essential \
        curl \
        wget \
        git \
        vim \
        nano \
        htop \
        net-tools \
        unzip \
        jq \
        openssl \
        ca-certificates \
        gnupg \
        lsb-release \
        apt-transport-https \
        software-properties-common \
        lsof \
        telnet \
        dnsutils \
        traceroute \
        screen \
        tmux \
        supervisor
    
    success "System packages installed"
}

setup_docker() {
    section "2. DOCKER & DOCKER COMPOSE"
    
    if command -v docker &> /dev/null; then
        warning "Docker already installed: $(docker --version)"
        return
    fi
    
    log "Adding Docker repository..."
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    
    echo \
        "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu \
        $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    
    log "Installing Docker Compose..."
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    
    systemctl enable docker
    systemctl start docker
    
    success "Docker installed: $(docker --version)"
    success "Docker Compose installed: $(docker-compose --version)"
}

setup_nodejs() {
    section "3. NODE.JS & NPM (LTS)"
    
    if command -v node &> /dev/null; then
        warning "Node.js already installed: $(node --version)"
        return
    fi
    
    log "Adding NodeSource repository..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    
    apt-get install -y nodejs
    
    npm install -g npm@latest
    npm install -g pm2 yarn pnpm
    
    success "Node.js installed: $(node --version)"
    success "npm installed: $(npm --version)"
}

setup_postgresql() {
    section "4. POSTGRESQL 16"
    
    if command -v psql &> /dev/null; then
        warning "PostgreSQL already installed"
        return
    fi
    
    log "Adding PostgreSQL repository..."
    curl https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor | tee /usr/share/keyrings/postgresql-archive-keyring.gpg >/dev/null
    
    echo "deb [signed-by=/usr/share/keyrings/postgresql-archive-keyring.gpg] http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" | tee /etc/apt/sources.list.d/postgresql.list >/dev/null
    
    apt-get update
    apt-get install -y postgresql-16 postgresql-contrib-16 postgresql-16-pg-stat-kcache
    
    systemctl enable postgresql
    systemctl start postgresql
    
    success "PostgreSQL installed: $(psql --version)"
}

setup_mongodb() {
    section "5. MONGODB"
    
    if command -v mongod &> /dev/null; then
        warning "MongoDB already installed"
        return
    fi
    
    log "Installing MongoDB via Docker..."
    docker run -d \
        --name mongodb \
        --restart always \
        -p 27017:27017 \
        -e MONGO_INITDB_ROOT_USERNAME=admin \
        -e MONGO_INITDB_ROOT_PASSWORD=flamecore_secure_pwd_change_me \
        -v mongodb_data:/data/db \
        -v mongodb_config:/data/configdb \
        mongo:latest
    
    log "Waiting for MongoDB to start..."
    sleep 5
    
    success "MongoDB installed and running on port 27017"
}

setup_mysql() {
    section "6. MYSQL 8"
    
    if command -v mysql &> /dev/null; then
        warning "MySQL already installed"
        return
    fi
    
    log "Installing MySQL via Docker..."
    docker run -d \
        --name mysql \
        --restart always \
        -p 3306:3306 \
        -e MYSQL_ROOT_PASSWORD=flamecore_secure_pwd_change_me \
        -e MYSQL_DATABASE=flamecore \
        -v mysql_data:/var/lib/mysql \
        mysql:8.0
    
    log "Waiting for MySQL to start..."
    sleep 10
    
    success "MySQL installed and running on port 3306"
}

setup_redis() {
    section "7. REDIS"
    
    if command -v redis-cli &> /dev/null; then
        warning "Redis already installed"
        return
    fi
    
    log "Installing Redis via Docker..."
    docker run -d \
        --name redis \
        --restart always \
        -p 6379:6379 \
        -v redis_data:/data \
        redis:7-alpine \
        redis-server --appendonly yes --requirepass flamecore_secure_pwd_change_me
    
    success "Redis installed and running on port 6379"
}

setup_rabbitmq() {
    section "8. RABBITMQ"
    
    if docker ps -a | grep -q rabbitmq; then
        warning "RabbitMQ already installed"
        return
    fi
    
    log "Installing RabbitMQ via Docker..."
    docker run -d \
        --name rabbitmq \
        --restart always \
        -p 5672:5672 \
        -p 15672:15672 \
        -e RABBITMQ_DEFAULT_USER=admin \
        -e RABBITMQ_DEFAULT_PASS=flamecore_secure_pwd_change_me \
        -v rabbitmq_data:/var/lib/rabbitmq \
        rabbitmq:3-management-alpine
    
    log "Waiting for RabbitMQ to start..."
    sleep 5
    
    success "RabbitMQ installed and running on port 5672 (AMQP) and 15672 (Management)"
}

setup_elasticsearch() {
    section "9. ELASTICSEARCH"
    
    if docker ps -a | grep -q elasticsearch; then
        warning "Elasticsearch already installed"
        return
    fi
    
    log "Installing Elasticsearch via Docker..."
    docker run -d \
        --name elasticsearch \
        --restart always \
        -p 9200:9200 \
        -e discovery.type=single-node \
        -e "ES_JAVA_OPTS=-Xms512m -Xmx512m" \
        -e xpack.security.enabled=false \
        -v elasticsearch_data:/usr/share/elasticsearch/data \
        docker.elastic.co/elasticsearch/elasticsearch:8.0.0
    
    log "Waiting for Elasticsearch to start..."
    sleep 10
    
    success "Elasticsearch installed and running on port 9200"
}

setup_nginx() {
    section "10. NGINX (REVERSE PROXY)"
    
    if command -v nginx &> /dev/null; then
        warning "Nginx already installed: $(nginx -v 2>&1)"
        return
    fi
    
    apt-get install -y nginx
    systemctl enable nginx
    systemctl start nginx
    
    success "Nginx installed and running"
}

setup_certbot() {
    section "11. CERTBOT (SSL CERTIFICATES)"
    
    if command -v certbot &> /dev/null; then
        warning "Certbot already installed"
        return
    fi
    
    apt-get install -y certbot python3-certbot-nginx
    systemctl enable certbot.timer
    systemctl start certbot.timer
    
    success "Certbot installed and auto-renewal enabled"
}

setup_monitoring() {
    section "12. MONITORING & LOGGING"
    
    log "Installing monitoring tools..."
    apt-get install -y \
        prometheus-node-exporter \
        logrotate
    
    systemctl enable prometheus-node-exporter
    systemctl start prometheus-node-exporter
    
    success "Monitoring tools installed"
}

setup_backup_tools() {
    section "13. BACKUP TOOLS"
    
    apt-get install -y \
        rsync \
        tar \
        gzip \
        bzip2
    
    log "Creating backup directories..."
    mkdir -p /backups/databases
    mkdir -p /backups/applications
    chmod 700 /backups
    
    success "Backup tools installed"
}

setup_flamecore_user() {
    section "14. FLAME CORE APPLICATION USER"
    
    if id "$FLAME_USER" &>/dev/null; then
        warning "User '$FLAME_USER' already exists"
        return
    fi
    
    log "Creating application user..."
    useradd -m -s /bin/bash -G docker,sudo "$FLAME_USER"
    
    mkdir -p "$APP_DIR"
    chown -R "$FLAME_USER:$FLAME_USER" "$APP_DIR"
    
    success "User '$FLAME_USER' created"
}

setup_docker_volumes() {
    section "15. DOCKER VOLUMES FOR PERSISTENCE"
    
    log "Creating Docker volumes..."
    
    docker volume create mongodb_data 2>/dev/null || true
    docker volume create mongodb_config 2>/dev/null || true
    docker volume create mysql_data 2>/dev/null || true
    docker volume create redis_data 2>/dev/null || true
    docker volume create rabbitmq_data 2>/dev/null || true
    docker volume create elasticsearch_data 2>/dev/null || true
    docker volume create postgres_data 2>/dev/null || true
    
    success "Docker volumes created"
}

setup_firewall() {
    section "16. FIREWALL CONFIGURATION (UFW)"
    
    if ! command -v ufw &> /dev/null; then
        apt-get install -y ufw
    fi
    
    log "Configuring firewall..."
    ufw --force enable
    
    # Allow SSH, HTTP, HTTPS
    ufw allow 22/tcp
    ufw allow 80/tcp
    ufw allow 443/tcp
    
    # Allow service ports (restrict to localhost or specific IPs in production)
    # ufw allow from 127.0.0.1 to 127.0.0.1 port 3306
    # ufw allow from 127.0.0.1 to 127.0.0.1 port 5432
    
    success "Firewall configured"
}

setup_environment() {
    section "17. ENVIRONMENT CONFIGURATION"
    
    log "Creating system environment file..."
    cat > /etc/profile.d/flamecore.sh << 'EOF'
export FLAMECORE_USER=flamecore
export FLAMECORE_HOME=/home/flamecore
export FLAMECORE_APP_DIR=/var/www/flamecore-apps
export FLAMECORE_LOG_DIR=/var/log/flamecore

# Docker Compose aliases
alias dc='docker-compose'
alias dcup='docker-compose up -d'
alias dcdown='docker-compose down'
alias dclogs='docker-compose logs -f'
EOF
    
    success "Environment configuration created"
}

verify_services() {
    section "18. VERIFY INSTALLED SERVICES"
    
    echo ""
    log "Checking system components..."
    
    echo -e "\n${BLUE}OS:${NC}"
    lsb_release -d
    
    echo -e "\n${BLUE}Docker:${NC}"
    docker --version && docker-compose --version
    
    echo -e "\n${BLUE}Node.js & npm:${NC}"
    node --version && npm --version
    
    echo -e "\n${BLUE}PostgreSQL:${NC}"
    psql --version
    
    echo -e "\n${BLUE}Nginx:${NC}"
    nginx -v 2>&1
    
    echo -e "\n${BLUE}Certbot:${NC}"
    certbot --version
    
    echo -e "\n${BLUE}Docker Containers:${NC}"
    docker ps
    
    echo -e "\n${BLUE}System Users:${NC}"
    grep "$FLAME_USER" /etc/passwd || echo "User not found"
    
    success "Service verification complete"
}

show_summary() {
    section "INSTALLATION SUMMARY"
    
    cat << EOF

${GREEN}✓ FLAME CORE VPS SETUP COMPLETE${NC}

${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}

${BLUE}Installed Components:${NC}

✓ System: Ubuntu/Debian with all dev tools
✓ Docker & Docker Compose
✓ Node.js 20 LTS & npm
✓ PostgreSQL 16 (SQL database)
✓ MongoDB (NoSQL database)
✓ MySQL 8 (Alternative SQL)
✓ Redis (Cache & Sessions)
✓ RabbitMQ (Message Queue)
✓ Elasticsearch (Full-text Search)
✓ Nginx (Reverse Proxy)
✓ Certbot (SSL/TLS)
✓ Monitoring Tools
✓ Backup Utilities
✓ Firewall (UFW)

${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}

${YELLOW}Next Steps:${NC}

1. Clone Flame Core repository:
   su - $FLAME_USER
   cd $APP_DIR
   git clone https://github.com/Emperorgeneral/FLAME-CORE-TECHONOLOGIES-LTD.git

2. Configure environment:
   cp .env.production .env.production.local
   nano .env.production.local  # Fill in your credentials

3. Set up PostgreSQL database:
   sudo -u postgres psql
   CREATE USER flame_prod WITH PASSWORD 'YOUR_SECURE_PASSWORD';
   CREATE DATABASE flamecore_prod OWNER flame_prod;
   GRANT ALL PRIVILEGES ON DATABASE flamecore_prod TO flame_prod;

4. Deploy backend:
   cd backend
   npm install
   docker-compose up -d
   npm run db:init

5. Build and deploy frontend:
   cd ../src
   npm install && npm run build
   
6. Configure Nginx:
   sudo cp nginx.conf.production /etc/nginx/sites-available/flamecore
   sudo ln -s /etc/nginx/sites-available/flamecore /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx

7. Generate SSL certificates:
   sudo certbot certonly --standalone -d yourdomain.com

${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}

${YELLOW}Service Connection Details:${NC}

Database:        PostgreSQL localhost:5432
NoSQL:           MongoDB localhost:27017
Cache:           Redis localhost:6379
SQL Alternative: MySQL localhost:3306
Queue:           RabbitMQ localhost:5672 (Management: 15672)
Search:          Elasticsearch localhost:9200
API Backend:     localhost:3001
Web Server:      Nginx on 80/443

${YELLOW}Important Security Notes:${NC}

⚠ Change ALL default passwords in Docker containers!
⚠ Configure firewall to restrict database access
⚠ Set up automatic backups
⚠ Enable log rotation
⚠ Keep SSL certificates updated
⚠ Monitor system resources
⚠ Set up uptime monitoring

${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}

Setup log saved to: $LOG_FILE

${GREEN}Happy hosting! 🚀${NC}

EOF
}

################################################################################
# MAIN EXECUTION
################################################################################

main() {
    clear
    echo -e "${BLUE}"
    cat << "EOF"
╔═══════════════════════════════════════════════════════════════╗
║                  FLAME CORE - VPS SETUP SCRIPT                ║
║                  Production Deployment Wizard                 ║
╚═══════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
    
    # Create log file
    touch "$LOG_FILE"
    chmod 644 "$LOG_FILE"
    
    # Run setup steps
    check_root
    detect_os
    
    setup_system
    setup_docker
    setup_nodejs
    setup_postgresql
    setup_mongodb
    setup_mysql
    setup_redis
    setup_rabbitmq
    setup_elasticsearch
    setup_nginx
    setup_certbot
    setup_monitoring
    setup_backup_tools
    setup_flamecore_user
    setup_docker_volumes
    setup_firewall
    setup_environment
    verify_services
    show_summary
}

# Run main function
main
