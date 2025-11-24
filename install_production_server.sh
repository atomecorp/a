#!/usr/bin/env bash
#
# install_production_server.sh
# ----------------------------
# Complete production setup script for Debian/Ubuntu servers.
# This script:
# 1. Installs system dependencies (Node.js, PostgreSQL, Nginx, Certbot)
# 2. Configures the environment (.env)
# 3. Installs project dependencies (npm install)
# 4. Sets up the Database (PostgreSQL)
# 5. Configures Nginx as a Reverse Proxy (hiding port 3001)
# 6. Sets up Systemd for auto-restart and background execution
# 7. Configures SSL (HTTPS) with Let's Encrypt
#
# Usage: sudo ./install_production_server.sh

set -euo pipefail

# --- Configuration ---------------------------------------------------------
DOMAIN="atome.one"
WWW_DOMAIN="www.atome.one"
APP_DIR="/opt/a"
SERVICE_NAME="squirrel"
NODE_PORT="3001"
USER="www-data"

# --- Colors ----------------------------------------------------------------
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO] $1${NC}"; }
log_ok() { echo -e "${GREEN}[SUCCESS] $1${NC}"; }
log_warn() { echo -e "${YELLOW}[WARN] $1${NC}"; }
log_error() { echo -e "${RED}[ERROR] $1${NC}"; }

# --- Pre-flight Checks -----------------------------------------------------

if [ "$EUID" -ne 0 ]; then
  log_error "❌ This script must be run as root. Please use: sudo ./install_production_server.sh"
  exit 1
fi

# Ensure we are in the right directory or clone if needed
if [ ! -d "$APP_DIR" ]; then
    log_warn "⚠️  App directory $APP_DIR not found."
    if [ -d "$(pwd)/.git" ]; then
        log_info "ℹ️  Current directory seems to be the repo. Moving it to $APP_DIR..."
        mkdir -p /opt
        mv "$(pwd)" "$APP_DIR"
        cd "$APP_DIR"
    else
        log_error "❌ Please clone the repository to $APP_DIR first, or run this script from the repo root."
        exit 1
    fi
fi

cd "$APP_DIR"

# --- 1. System Dependencies ------------------------------------------------

log_info "📦 Installing System Dependencies (Node.js, PostgreSQL, Nginx, Certbot)..."

# Update apt
apt-get update

# Install Node.js 20.x if not present
if ! command -v node >/dev/null 2>&1; then
    log_info "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs build-essential git
fi

# Install PostgreSQL
if ! command -v psql >/dev/null 2>&1; then
    log_info "Installing PostgreSQL..."
    apt-get install -y postgresql postgresql-contrib
    systemctl enable postgresql
    systemctl start postgresql
fi

# Install Nginx & Certbot
log_info "Installing Nginx & Certbot..."
apt-get install -y nginx certbot python3-certbot-nginx

log_ok "✅ System dependencies installed."

# --- 2. Environment Configuration ------------------------------------------

log_info "⚙️  Configuring Environment..."

if [ ! -f .env ]; then
    log_info "Creating .env from defaults..."
    # Default DSN for local postgres
    echo "ADOLE_PG_DSN=postgres://postgres:postgres@localhost:5432/squirrel" > .env
    echo "NODE_ENV=production" >> .env
    echo "PORT=$NODE_PORT" >> .env
    # Bind to localhost only (Nginx will proxy)
    echo "HOST=127.0.0.1" >> .env
    chmod 600 .env
    log_ok "✅ .env created."
else
    log_info "ℹ️  .env already exists. Ensuring production settings..."
    # Ensure HOST is 127.0.0.1 to prevent outside access to port 3001
    if ! grep -q "HOST=127.0.0.1" .env; then
        echo "HOST=127.0.0.1" >> .env
    fi
fi

# --- 3. Project Dependencies -----------------------------------------------

log_info "📦 Installing Project Dependencies (npm install)..."
npm install --omit=dev
log_ok "✅ npm dependencies installed."

# --- 4. Database Setup -----------------------------------------------------

log_info "🗄️  Configuring PostgreSQL Database..."

# Configure 'postgres' user and 'squirrel' database
# We use a subshell to unset PG vars to force peer auth for sudo
(
    unset PGHOST
    unset PGPORT
    sudo -u postgres psql -c "DO \$\$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'postgres') THEN
        CREATE ROLE postgres WITH LOGIN SUPERUSER PASSWORD 'postgres';
      ELSE
        ALTER ROLE postgres WITH PASSWORD 'postgres';
      END IF;
    END
    \$\$;"

    sudo -u postgres psql -c "CREATE DATABASE squirrel OWNER postgres;" 2>/dev/null || true
)
log_ok "✅ Database configured."

# --- 5. Nginx Configuration ------------------------------------------------

log_info "🌐 Configuring Nginx Reverse Proxy..."

cat > /etc/nginx/sites-available/$DOMAIN <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN $WWW_DOMAIN;

    # Redirect HTTP to HTTPS
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $DOMAIN $WWW_DOMAIN;

    # SSL Config (Managed by Certbot later)
    # ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:$NODE_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

# Enable site
ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test Nginx
if ! nginx -t; then
    log_error "❌ Nginx configuration is invalid. Please check /etc/nginx/sites-available/$DOMAIN"
    exit 1
fi
systemctl reload nginx
log_ok "✅ Nginx configured."

# --- 6. Systemd Service Setup ----------------------------------------------

log_info "⚙️  Configuring Systemd Service ($SERVICE_NAME)..."

# Stop existing service if running
systemctl stop $SERVICE_NAME || true

# Fix permissions for www-data
chown -R $USER:$USER $APP_DIR

# Create Service File
cat > /etc/systemd/system/$SERVICE_NAME.service <<EOF
[Unit]
Description=Squirrel Node.js Server
Documentation=https://github.com/atomecorp/a
After=network.target postgresql.service

[Service]
Type=simple
User=$USER
Group=$USER
WorkingDirectory=$APP_DIR
ExecStart=$(which node) server/server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=$NODE_PORT
Environment=HOST=127.0.0.1
EnvironmentFile=$APP_DIR/.env

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable $SERVICE_NAME
systemctl start $SERVICE_NAME

log_ok "✅ Systemd service started."

# --- 7. SSL Configuration (Certbot) ----------------------------------------

log_info "🔒 Configuring SSL with Let's Encrypt..."

# Only run if not already configured or if forced
if [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
    certbot --nginx --non-interactive --agree-tos --redirect \
        -m admin@$DOMAIN \
        -d $DOMAIN -d $WWW_DOMAIN || {
        log_warn "⚠️  Certbot failed. This is normal if DNS is not yet pointing to this server."
        log_warn "   Run 'certbot --nginx' manually once DNS is propagated."
    }
else
    log_info "ℹ️  SSL certificates already exist. Skipping generation."
fi

# --- Summary ---------------------------------------------------------------

echo ""
log_ok "🎉 PRODUCTION INSTALLATION COMPLETE!"
echo "------------------------------------------------"
echo "🌍 URL:          https://$DOMAIN"
echo "🔧 Service:      systemctl status $SERVICE_NAME"
echo "📜 Logs:         journalctl -u $SERVICE_NAME -f"
echo "🛑 Stop:         systemctl stop $SERVICE_NAME"
echo "♻️  Restart:      systemctl restart $SERVICE_NAME"
echo "------------------------------------------------"
