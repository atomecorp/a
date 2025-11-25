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
UPLOADS_DIR="$APP_DIR/uploads"

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

# --- Helper Functions ------------------------------------------------------

is_apt_installed() {
    dpkg -s "$1" >/dev/null 2>&1
}

ensure_apt_package() {
    local pkg="$1"
    if is_apt_installed "$pkg"; then
        log_info "✅ Package '$pkg' is already installed."
    else
        log_info "📦 Installing package '$pkg'..."
        apt-get install -y "$pkg"
    fi
}

ensure_command() {
    local cmd="$1"
    local install_cmd="$2"
    if command -v "$cmd" >/dev/null 2>&1; then
        log_info "✅ Command '$cmd' is available."
    else
        log_info "📦 Command '$cmd' missing. Installing..."
        eval "$install_cmd"
    fi
}

# --- Pre-flight Checks -----------------------------------------------------

if [[ "$OSTYPE" != "linux-gnu"* ]]; then
  log_error "❌ This script is intended for Linux servers only."
  exit 1
fi

if [ "$EUID" -ne 0 ]; then
  log_error "❌ This script must be run as root. Please use: sudo ./install_production_server.sh"
  exit 1
fi

# Ensure we are in the right directory or clone if needed
if [ ! -d "$APP_DIR" ]; then
    log_warn "⚠️  App directory $APP_DIR not found."
    if [ -d "$(pwd)/.git" ]; then
        log_warn "ℹ️  Current directory seems to be the repo."
        log_error "❌ Please move this repository to $APP_DIR manually before running this script."
        log_error "   sudo mv \"$(pwd)\" \"$APP_DIR\""
        exit 1
    else
        log_error "❌ Please clone the repository to $APP_DIR first, or run this script from the repo root."
        exit 1
    fi
fi

cd "$APP_DIR"

# --- 1. System Dependencies ------------------------------------------------

log_info "📦 Checking System Dependencies..."

# Update apt
log_info "🔄 Updating apt repositories..."
apt-get update

# Install basic tools
ensure_apt_package "curl"
ensure_apt_package "git"
ensure_apt_package "build-essential"
ensure_apt_package "qemu-system-x86"
ensure_apt_package "qemu-utils"

# Install Node.js 20.x if not present
if ! command -v node >/dev/null 2>&1; then
    log_info "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
else
    NODE_VERSION=$(node -v)
    log_info "✅ Node.js is installed ($NODE_VERSION)."
fi

# Install Rust (via rustup)
if ! command -v rustc >/dev/null 2>&1; then
    log_info "Installing Rust..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env" || true
    export PATH="$HOME/.cargo/bin:$PATH"
else
    RUST_VERSION=$(rustc --version)
    log_info "✅ Rust is installed ($RUST_VERSION)."
fi

# Install GitHub CLI (gh)
if ! command -v gh >/dev/null 2>&1; then
    log_info "Installing GitHub CLI..."
    mkdir -p -m 755 /etc/apt/keyrings
    wget -qO- https://cli.github.com/packages/githubcli-archive-keyring.gpg | tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null
    chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null
    apt-get update
    apt-get install -y gh
else
    GH_VERSION=$(gh --version | head -n 1)
    log_info "✅ GitHub CLI is installed ($GH_VERSION)."
fi

# Install PostgreSQL
if ! command -v psql >/dev/null 2>&1; then
    log_info "Installing PostgreSQL..."
    apt-get install -y postgresql postgresql-contrib
    systemctl enable postgresql
    systemctl start postgresql
else
    PSQL_VERSION=$(psql --version)
    log_info "✅ PostgreSQL is installed ($PSQL_VERSION)."
fi

# Install Nginx & Certbot
ensure_apt_package "nginx"
ensure_apt_package "certbot"
ensure_apt_package "python3-certbot-nginx"

log_ok "✅ System dependencies check complete."

# --- 1.1 FreeBSD Virtualization Setup (QEMU) -------------------------------

log_info "😈 Setting up FreeBSD Virtualization Environment..."

# Check if KVM is available
if [ -e /dev/kvm ]; then
    log_info "✅ KVM acceleration is available."
else
    log_warn "⚠️  KVM not found. QEMU will run in emulation mode (slow)."
fi

# Create directory for FreeBSD VM images
VM_DIR="$APP_DIR/vm/freebsd"
mkdir -p "$VM_DIR"

# Note: Full automated FreeBSD installation is complex.
# We prepare the environment here.
log_info "ℹ️  FreeBSD VM directory prepared at $VM_DIR"

FREEBSD_IMG_URL="https://download.freebsd.org/releases/VM-IMAGES/14.0-RELEASE/amd64/Latest/FreeBSD-14.0-RELEASE-amd64.qcow2.xz"
FREEBSD_IMG_XZ="$VM_DIR/base.qcow2.xz"
FREEBSD_IMG="$VM_DIR/base.qcow2"

if [ ! -f "$FREEBSD_IMG" ]; then
    log_info "⬇️  Downloading FreeBSD 14.0 VM Image..."
    if curl -L "$FREEBSD_IMG_URL" -o "$FREEBSD_IMG_XZ"; then
        log_info "📦 Extracting image..."
        if command -v unxz >/dev/null 2>&1; then
            unxz "$FREEBSD_IMG_XZ"
            log_ok "✅ FreeBSD image ready: $FREEBSD_IMG"
        else
            log_warn "⚠️  'unxz' not found. Please install xz-utils to extract the image."
        fi
    else
        log_error "❌ Failed to download FreeBSD image."
    fi
else
    log_info "✅ FreeBSD image already exists."
fi

log_ok "✅ Virtualization environment ready."

# --- 2. Environment Configuration ------------------------------------------

log_info "⚙️  Configuring Environment..."

# Ensure uploads directory exists
if [ ! -d "$UPLOADS_DIR" ]; then
    log_info "Creating uploads directory at $UPLOADS_DIR..."
    mkdir -p "$UPLOADS_DIR"
    # We will fix permissions later with chown -R
fi

if [ ! -f .env ]; then
    log_info "Creating .env from defaults..."
    # Default DSN for local postgres
    echo "ADOLE_PG_DSN=postgres://postgres:postgres@localhost:5432/squirrel" > .env
    echo "NODE_ENV=production" >> .env
    echo "PORT=$NODE_PORT" >> .env
    echo "SQUIRREL_UPLOADS_DIR=$UPLOADS_DIR" >> .env
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
    # Ensure SQUIRREL_UPLOADS_DIR is set
    if ! grep -q "SQUIRREL_UPLOADS_DIR" .env; then
        echo "SQUIRREL_UPLOADS_DIR=$UPLOADS_DIR" >> .env
    fi
fi

# --- 3. Project Dependencies -----------------------------------------------

log_info "📦 Installing Project Dependencies (npm install)..."

# Hack: Remove desktop-only dependencies that cause build issues on headless servers
if grep -q "@nodegui/nodegui" package.json; then
    log_warn "⚠️  Removing @nodegui/nodegui from package.json (not needed for server)..."
    sed -i '/"@nodegui\/nodegui"/d' package.json
fi

# Ensure we are using TypeORM and not old ORMs (Sequelize/Knex)
# We run uninstall just in case they are still in package.json on the server
log_info "🧹 Cleaning up old ORMs (Sequelize, Knex, Objection)..."
npm uninstall sequelize knex objection --save || true

# Install dependencies with verbose output to debug hangs
log_info "📥 Installing dependencies..."
npm install --omit=dev --verbose

# Explicitly ensure TypeORM and drivers are present
log_info "➕ Adding TypeORM and drivers..."
npm install typeorm reflect-metadata pg fastify chokidar --save

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

# Check if we already have SSL certs to decide which config to generate
SSL_CERT="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
SSL_KEY="/etc/letsencrypt/live/$DOMAIN/privkey.pem"

if [ -f "$SSL_CERT" ] && [ -f "$SSL_KEY" ]; then
    log_info "ℹ️  SSL certificates found. Generating full HTTPS configuration."
    
    cat > /etc/nginx/sites-available/$DOMAIN <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN $WWW_DOMAIN;
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name $DOMAIN $WWW_DOMAIN;

    ssl_certificate $SSL_CERT;
    ssl_certificate_key $SSL_KEY;

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

else
    log_info "ℹ️  No SSL certificates found yet. Generating HTTP-only configuration (Certbot will upgrade this)."

    cat > /etc/nginx/sites-available/$DOMAIN <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN $WWW_DOMAIN;

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
fi

# Enable site
ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test Nginx
if ! nginx -t; then
    log_error "❌ Nginx configuration is invalid. Please check /etc/nginx/sites-available/$DOMAIN"
    exit 1
fi
# Use restart instead of reload to handle cases where Nginx is not running
systemctl restart nginx
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
