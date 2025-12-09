#!/usr/bin/env bash
#
# install_production_server.sh
# ----------------------------
# Complete production setup script for Debian/Ubuntu AND FreeBSD servers.
#
# Usage: sudo ./install_production_server.sh

set -euo pipefail

# --- Configuration ---------------------------------------------------------
DOMAIN="atome.one"
WWW_DOMAIN="www.atome.one"
APP_DIR="/opt/a"
SERVICE_NAME="squirrel"
NODE_PORT="3001"
USER="www-data" # Will be adjusted for FreeBSD
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

# --- OS Detection ----------------------------------------------------------
OS_TYPE="unknown"
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS_TYPE="linux"
    NGINX_CONF_DIR="/etc/nginx"
    USER="www-data"
elif [[ "$OSTYPE" == "freebsd"* ]]; then
    OS_TYPE="freebsd"
    NGINX_CONF_DIR="/usr/local/etc/nginx"
    USER="www" # FreeBSD standard www user
    APP_DIR="/usr/local/a" # FreeBSD prefers /usr/local
    UPLOADS_DIR="$APP_DIR/uploads"
else
    log_error "❌ Unsupported OS: $OSTYPE"
    exit 1
fi

log_info "🖥️  Detected OS: $OS_TYPE"

# --- Helper Functions ------------------------------------------------------

ensure_package() {
    local pkg_linux="$1"
    local pkg_freebsd="$2"
    
    if [ "$OS_TYPE" == "linux" ]; then
        if dpkg -s "$pkg_linux" >/dev/null 2>&1; then
            log_info "✅ Package '$pkg_linux' is already installed."
        else
            log_info "📦 Installing package '$pkg_linux'..."
            apt-get install -y "$pkg_linux"
        fi
    elif [ "$OS_TYPE" == "freebsd" ]; then
        if pkg info "$pkg_freebsd" >/dev/null 2>&1; then
            log_info "✅ Package '$pkg_freebsd' is already installed."
        else
            log_info "📦 Installing package '$pkg_freebsd'..."
            pkg install -y "$pkg_freebsd"
        fi
    fi
}

# --- Pre-flight Checks -----------------------------------------------------

if [ "$EUID" -ne 0 ]; then
  log_error "❌ This script must be run as root. Please use: sudo ./install_production_server.sh"
  exit 1
fi

# Ensure we are in the right directory or clone if needed
if [ ! -d "$APP_DIR" ]; then
    log_warn "⚠️  App directory $APP_DIR not found."
    if [ -d "$(pwd)/.git" ]; then
        log_warn "ℹ️  Current directory seems to be the repo."
        log_info "🚚 Moving repo to $APP_DIR..."
        mkdir -p "$(dirname "$APP_DIR")"
        mv "$(pwd)" "$APP_DIR"
    else
        log_error "❌ Please clone the repository to $APP_DIR first."
        exit 1
    fi
fi

cd "$APP_DIR"

# --- 1. System Dependencies ------------------------------------------------

log_info "📦 Checking System Dependencies..."

if [ "$OS_TYPE" == "linux" ]; then
    log_info "🔄 Updating apt repositories..."
    apt-get update
    ensure_package "curl" "curl"
    ensure_package "git" "git"
    ensure_package "build-essential" "gmake" # gmake on FreeBSD
    ensure_package "qemu-system-x86" "qemu"
    ensure_package "qemu-utils" "qemu-utils" # Included in qemu on FreeBSD usually

    # Node.js
    if ! command -v node >/dev/null 2>&1; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt-get install -y nodejs
    fi

    # SQLite dependencies (for better-sqlite3 compilation)
    ensure_package "libsqlite3-dev" "sqlite3"

    # Nginx & Certbot
    ensure_package "nginx" "nginx"
    ensure_package "certbot" "py39-certbot"
    ensure_package "python3-certbot-nginx" "py39-certbot-nginx"

elif [ "$OS_TYPE" == "freebsd" ]; then
    log_info "🔄 Updating pkg repositories..."
    pkg update
    ensure_package "curl" "curl"
    ensure_package "git" "git"
    ensure_package "gmake" "gmake"
    ensure_package "bash" "bash"
    
    # Node.js
    ensure_package "node" "node20"
    ensure_package "npm" "npm-node20"

    # SQLite (for better-sqlite3)
    ensure_package "sqlite3" "sqlite3"

    # Nginx & Certbot
    ensure_package "nginx" "nginx"
    ensure_package "certbot" "py311-certbot" # Version may vary
    ensure_package "certbot-nginx" "py311-certbot-nginx"
    
    sysrc nginx_enable="YES"
fi

# Install Rust (Common)
if ! command -v rustc >/dev/null 2>&1; then
    log_info "Installing Rust..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env" || true
    export PATH="$HOME/.cargo/bin:$PATH"
fi

log_ok "✅ System dependencies check complete."

# --- 2. Environment Configuration ------------------------------------------

log_info "⚙️  Configuring Environment..."

if [ ! -d "$UPLOADS_DIR" ]; then
    mkdir -p "$UPLOADS_DIR"
fi

if [ ! -f .env ]; then
    log_info "Creating .env from defaults..."
    echo "# SQLite/libSQL Database Configuration" > .env
    echo "SQLITE_PATH=$APP_DIR/data/adole.db" >> .env
    echo "# For Turso cloud (optional):" >> .env
    echo "# LIBSQL_URL=libsql://your-database.turso.io" >> .env
    echo "# LIBSQL_AUTH_TOKEN=your-auth-token" >> .env
    echo "" >> .env
    echo "NODE_ENV=production" >> .env
    echo "PORT=$NODE_PORT" >> .env
    echo "SQUIRREL_UPLOADS_DIR=$UPLOADS_DIR" >> .env
    echo "HOST=127.0.0.1" >> .env
    chmod 600 .env
fi

# Create data directory for SQLite database
DATA_DIR="$APP_DIR/data"
if [ ! -d "$DATA_DIR" ]; then
    mkdir -p "$DATA_DIR"
    chown $USER:$USER "$DATA_DIR"
    chmod 755 "$DATA_DIR"
    log_ok "✅ Created data directory: $DATA_DIR"
fi

# --- 3. Project Dependencies -----------------------------------------------

log_info "📦 Installing Project Dependencies..."

# Install deps (production only, excludes devDependencies)
npm install --omit=dev --verbose

# Ensure critical production dependencies are installed
npm install fastify chokidar pino-pretty better-sqlite3 @libsql/client --save

# Create marker to skip reinstallation on run.sh
touch node_modules/.install_complete

log_ok "✅ npm dependencies installed."

# --- 4. Database Setup (SQLite) --------------------------------------------

log_info "🗄️  Initializing SQLite Database..."

# Initialize the database by running migrations
cd "$APP_DIR"
node -e "
import { connect } from './database/driver.js';
import { runMigrations } from './database/migrate.js';

const db = await connect();
await runMigrations(db);
console.log('Database initialized successfully');
db.close();
" 2>&1 || log_warn "Database initialization will be done on first run"

log_ok "✅ Database ready."

# --- 5. Nginx Configuration ------------------------------------------------

log_info "🌐 Configuring Nginx Reverse Proxy..."

# Paths differ by OS
if [ "$OS_TYPE" == "linux" ]; then
    SITES_AVAIL="/etc/nginx/sites-available"
    SITES_ENABLED="/etc/nginx/sites-enabled"
    mkdir -p "$SITES_AVAIL" "$SITES_ENABLED"
    CONF_PATH="$SITES_AVAIL/$DOMAIN"
elif [ "$OS_TYPE" == "freebsd" ]; then
    SITES_AVAIL="/usr/local/etc/nginx/conf.d"
    mkdir -p "$SITES_AVAIL"
    CONF_PATH="$SITES_AVAIL/$DOMAIN.conf"
    # Ensure nginx.conf includes conf.d
    if ! grep -q "include $SITES_AVAIL/*.conf;" /usr/local/etc/nginx/nginx.conf; then
        sed -i '' "s|http {|http {\n    include $SITES_AVAIL/*.conf;|" /usr/local/etc/nginx/nginx.conf
    fi
fi

# Check if SSL is already configured (don't overwrite certbot's config)
if [ -f "$CONF_PATH" ] && grep -q "ssl_certificate" "$CONF_PATH"; then
    log_info "✅ Nginx SSL configuration already exists, preserving it"
else
    # Generate HTTP Config (certbot will add SSL later)
    cat > "$CONF_PATH" <<EOF
server {
    listen 80;
    server_name $DOMAIN $WWW_DOMAIN;
    location / {
        proxy_pass http://127.0.0.1:$NODE_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
    }
}
EOF
fi

if [ "$OS_TYPE" == "linux" ]; then
    ln -sf "$CONF_PATH" "$SITES_ENABLED/"
    rm -f "$SITES_ENABLED/default"
    systemctl restart nginx
elif [ "$OS_TYPE" == "freebsd" ]; then
    service nginx restart
fi

log_ok "✅ Nginx configured."

# --- 5b. SSL Certificate with Let's Encrypt --------------------------------

log_info "🔐 Configuring SSL Certificate..."

# Check if SSL is already configured in nginx
if [ -f "$CONF_PATH" ] && grep -q "ssl_certificate" "$CONF_PATH"; then
    log_info "✅ SSL already configured in nginx for $DOMAIN"
elif [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
    # Certificate exists but nginx not configured - reinstall to nginx
    log_info "🔄 SSL certificate exists, configuring nginx..."
    if certbot install --nginx -d "$DOMAIN" -d "$WWW_DOMAIN" --non-interactive --redirect 2>/dev/null; then
        log_ok "✅ SSL certificate configured in nginx!"
    else
        log_warn "⚠️  Could not configure SSL in nginx. Run manually:"
        log_warn "   sudo certbot --nginx -d $DOMAIN -d $WWW_DOMAIN"
    fi
else
    # No certificate - try to obtain one
    log_info "🔄 Requesting SSL certificate from Let's Encrypt..."
    
    # First, verify the domain points to this server
    SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || curl -s icanhazip.com 2>/dev/null || echo "")
    DOMAIN_IP=$(dig +short "$DOMAIN" 2>/dev/null | head -1 || echo "")
    
    if [ -z "$SERVER_IP" ]; then
        log_warn "⚠️  Could not determine server IP. Skipping SSL setup."
        log_warn "   Run manually: sudo certbot --nginx -d $DOMAIN -d $WWW_DOMAIN"
    elif [ -z "$DOMAIN_IP" ]; then
        log_warn "⚠️  Could not resolve $DOMAIN. Skipping SSL setup."
        log_warn "   Ensure DNS is configured, then run: sudo certbot --nginx -d $DOMAIN -d $WWW_DOMAIN"
    elif [ "$SERVER_IP" != "$DOMAIN_IP" ]; then
        log_warn "⚠️  Domain $DOMAIN ($DOMAIN_IP) does not point to this server ($SERVER_IP)"
        log_warn "   Update DNS records, then run: sudo certbot --nginx -d $DOMAIN -d $WWW_DOMAIN"
    else
        # DNS looks correct, try certbot
        if certbot --nginx -d "$DOMAIN" -d "$WWW_DOMAIN" --non-interactive --agree-tos --email "admin@$DOMAIN" --redirect 2>/dev/null; then
            log_ok "✅ SSL certificate installed successfully!"
        else
            log_warn "⚠️  Certbot failed. You may need to run it manually:"
            log_warn "   sudo certbot --nginx -d $DOMAIN -d $WWW_DOMAIN"
        fi
    fi
fi

# --- 6. Service Setup (Systemd vs RC.D) ------------------------------------

log_info "⚙️  Configuring Service ($SERVICE_NAME)..."

# Fix permissions - ensure www-data can read the app but root owns node_modules
chown -R root:root "$APP_DIR"
chmod -R 755 "$APP_DIR"

# Ensure uploads directory is writable by www-data
mkdir -p "$UPLOADS_DIR"
chown -R $USER:$USER "$UPLOADS_DIR"
chmod -R 775 "$UPLOADS_DIR"

NODE_EXEC=$(command -v node)

if [ "$OS_TYPE" == "linux" ]; then
    # --- Systemd (Linux) ---
    # Note: We run as root to avoid permission issues with node_modules
    # The server binds to 127.0.0.1 so it's only accessible via Nginx
    cat > /etc/systemd/system/$SERVICE_NAME.service <<EOF
[Unit]
Description=Squirrel Node.js Server
After=network.target postgresql.service

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=$APP_DIR
ExecStart=$NODE_EXEC $APP_DIR/server/server.js
Restart=always
RestartSec=5
EnvironmentFile=$APP_DIR/.env
Environment=NODE_ENV=production
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE_NAME

[Install]
WantedBy=multi-user.target
EOF
    systemctl daemon-reload
    systemctl enable $SERVICE_NAME
    systemctl restart $SERVICE_NAME

elif [ "$OS_TYPE" == "freebsd" ]; then
    # --- RC.D (FreeBSD) ---
    RC_SCRIPT="/usr/local/etc/rc.d/$SERVICE_NAME"
    cat > "$RC_SCRIPT" <<EOF
#!/bin/sh
# PROVIDE: $SERVICE_NAME
# REQUIRE: LOGIN postgresql
# KEYWORD: shutdown

. /etc/rc.subr

name="$SERVICE_NAME"
rcvar="${SERVICE_NAME}_enable"

load_rc_config \$name

: \${${SERVICE_NAME}_enable:="NO"}
: \${${SERVICE_NAME}_user:="$USER"}
: \${${SERVICE_NAME}_chdir:="$APP_DIR"}

pidfile="/var/run/\${name}.pid"
command="/usr/sbin/daemon"
command_args="-P \${pidfile} -r -f $NODE_EXEC server/server.js"

# Export env vars from .env manually for sh
export \$(grep -v '^#' $APP_DIR/.env | xargs)

run_rc_command "\$1"
EOF
    chmod +x "$RC_SCRIPT"
    sysrc "${SERVICE_NAME}_enable=YES"
    service "$SERVICE_NAME" restart
fi

log_ok "✅ Service started."

# --- Summary ---------------------------------------------------------------

echo ""
log_ok "🎉 INSTALLATION COMPLETE ($OS_TYPE)!"
if [ "$OS_TYPE" == "linux" ]; then
    echo "🔧 Service: systemctl status $SERVICE_NAME"
else
    echo "🔧 Service: service $SERVICE_NAME status"
fi
echo "📜 Logs:         journalctl -u $SERVICE_NAME -f"
echo "🛑 Stop:         systemctl stop $SERVICE_NAME"
echo "♻️  Restart:      systemctl restart $SERVICE_NAME"
echo "------------------------------------------------"
