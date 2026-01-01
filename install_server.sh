#!/usr/bin/env bash
#
# install_production_server.sh
# ----------------------------
# Complete production setup script for Debian/Ubuntu AND FreeBSD servers.
#
# Usage: sudo ./install_production_server.sh

set -euo pipefail

# --- Configuration ---------------------------------------------------------
# You can override these via interactive prompts or environment variables.
DOMAIN="${DOMAIN:-atome.one}"
WWW_DOMAIN="${WWW_DOMAIN:-www.atome.one}"
APP_DIR="${APP_DIR:-/opt/a}"
SERVICE_NAME="${SERVICE_NAME:-squirrel}"
NODE_PORT="${NODE_PORT:-3001}"
USER="www-data" # Will be adjusted for FreeBSD
UPLOADS_DIR="${UPLOADS_DIR:-$APP_DIR/uploads}"
MONITORED_DIR="${MONITORED_DIR:-$APP_DIR/monitored}"
ENV_DIR="${ENV_DIR:-/etc/squirrel}"
ENV_FILE="${ENV_FILE:-$ENV_DIR/squirrel.env}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"
NGINX_CLIENT_MAX_BODY_SIZE="${NGINX_CLIENT_MAX_BODY_SIZE:-1024m}"

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

move_aside_untracked_file_if_needed() {
    local rel_path="$1"
    if [[ ! -f "$rel_path" ]]; then
        return 0
    fi

    if [[ ! -d ".git" ]]; then
        return 0
    fi

    # If the file is tracked, we never move it.
    if git ls-files --error-unmatch "$rel_path" >/dev/null 2>&1; then
        return 0
    fi

    # If it's untracked, it can block future pulls when the repo starts tracking it.
    if git status --porcelain=v1 --untracked-files=all | grep -q "^?? ${rel_path}$"; then
        local stamp
        stamp="$(date -u +%Y%m%d_%H%M%SZ)"
        local backup_name
        backup_name="${rel_path}.untracked.${stamp}.bak"
        mv "$rel_path" "$backup_name"
        log_warn "Moved aside untracked ${rel_path} -> ${backup_name}"
    fi
}

sync_repo_if_possible() {
    # Installation should be reproducible. Syncing is safe in production because
    # updates are expected to be applied via git.
    if [[ ! -d ".git" ]]; then
        return 0
    fi

    # Migration helper: older installs had package-lock.json ignored, which leaves
    # an untracked lockfile on disk. When we start tracking it, git pull would fail.
    move_aside_untracked_file_if_needed "package-lock.json"

    if git remote get-url origin >/dev/null 2>&1; then
        log_info "🔄 Syncing repository (fast-forward only)..."
        git fetch origin >/dev/null 2>&1 || true
        git pull --ff-only || true
    fi
}

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
    ENV_DIR="/usr/local/etc/squirrel"
    ENV_FILE="$ENV_DIR/squirrel.env"
else
    log_error "❌ Unsupported OS: $OSTYPE"
    exit 1
fi

log_info "🖥️  Detected OS: $OS_TYPE"

# --- Interactive configuration (optional) ---------------------------------
if [[ -t 0 ]]; then
    log_info "🧩 Interactive configuration (press Enter to keep defaults)"

    read -r -p "Domain [${DOMAIN}]: " input_domain
    if [[ -n "${input_domain}" ]]; then DOMAIN="${input_domain}"; fi

    read -r -p "WWW Domain [${WWW_DOMAIN}]: " input_www
    if [[ -n "${input_www}" ]]; then WWW_DOMAIN="${input_www}"; fi

    if [[ -z "${CERTBOT_EMAIL}" ]]; then
        CERTBOT_EMAIL="admin@${DOMAIN}"
    fi
    read -r -p "Certbot email [${CERTBOT_EMAIL}]: " input_email
    if [[ -n "${input_email}" ]]; then CERTBOT_EMAIL="${input_email}"; fi

    read -r -p "Internal Node port [${NODE_PORT}]: " input_port
    if [[ -n "${input_port}" ]]; then NODE_PORT="${input_port}"; fi

    read -r -p "Uploads directory [${UPLOADS_DIR}]: " input_uploads
    if [[ -n "${input_uploads}" ]]; then UPLOADS_DIR="${input_uploads}"; fi

    read -r -p "Monitored directory (aBox sync) [${MONITORED_DIR}]: " input_monitored
    if [[ -n "${input_monitored}" ]]; then MONITORED_DIR="${input_monitored}"; fi

    read -r -p "Env directory [${ENV_DIR}]: " input_env_dir
    if [[ -n "${input_env_dir}" ]]; then
        ENV_DIR="${input_env_dir}"
        ENV_FILE="$ENV_DIR/squirrel.env"
    fi

    read -r -p "Env file [${ENV_FILE}]: " input_env_file
    if [[ -n "${input_env_file}" ]]; then ENV_FILE="${input_env_file}"; fi
fi

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

sync_repo_if_possible

# --- 1. System Dependencies ------------------------------------------------

log_info "📦 Checking System Dependencies..."

if [ "$OS_TYPE" == "linux" ]; then
    log_info "🔄 Updating apt repositories..."
    apt-get update
    ensure_package "ca-certificates" "ca_root_nss"
    ensure_package "curl" "curl"
    ensure_package "git" "git"
    ensure_package "build-essential" "gmake" # gmake on FreeBSD
    ensure_package "python3" "python3"
    ensure_package "pkg-config" "pkgconf"
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

if [ ! -d "$MONITORED_DIR" ]; then
    mkdir -p "$MONITORED_DIR"
fi

mkdir -p "$ENV_DIR"
chmod 755 "$ENV_DIR"

if [ ! -f "$ENV_FILE" ]; then
    log_info "Creating server env file at $ENV_FILE ..."
        SQLITE_PATH_DEFAULT="$APP_DIR/database_storage/adole.db"
        HOST_DEFAULT="127.0.0.1"

        SQLITE_PATH_VALUE="$SQLITE_PATH_DEFAULT"
        HOST_VALUE="$HOST_DEFAULT"

        if [[ -t 0 ]]; then
                read -r -p "SQLite path [${SQLITE_PATH_VALUE}]: " input_sqlite
                if [[ -n "${input_sqlite}" ]]; then SQLITE_PATH_VALUE="${input_sqlite}"; fi
                read -r -p "Bind host (should be 127.0.0.1) [${HOST_VALUE}]: " input_host
                if [[ -n "${input_host}" ]]; then HOST_VALUE="${input_host}"; fi
        fi

    {
            echo "# Squirrel/Atome production environment"
            echo "# This file is intentionally stored outside the git checkout"
            echo "# so updates cannot delete it."
            echo ""
      echo "NODE_ENV=production"
            echo "HOST=$HOST_VALUE"
      echo "PORT=$NODE_PORT"
            echo "SQLITE_PATH=$SQLITE_PATH_VALUE"
      echo "SQUIRREL_UPLOADS_DIR=$UPLOADS_DIR"
            echo "SQUIRREL_MONITORED_DIR=$MONITORED_DIR"
      echo ""
    } >"$ENV_FILE"
    chmod 600 "$ENV_FILE"
fi

# Convenience: keep a local .env so tools that read it still work.
# Never treat it as canonical (git clean can delete it).
ln -sf "$ENV_FILE" "$APP_DIR/.env"

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

# Reproducible install (never mutate package.json/package-lock.json on the server)
if [[ ! -f "package-lock.json" ]]; then
    log_error "Missing package-lock.json. Production installs require a committed lockfile to run npm ci reproducibly."
    log_error "Fix: run 'npm install --package-lock-only' on your dev machine, commit package-lock.json, then re-run install." 
    exit 1
fi

if [[ -d ".git" ]] && ! git ls-files --error-unmatch "package-lock.json" >/dev/null 2>&1; then
    log_error "package-lock.json is present but not tracked by git. This breaks reproducible production installs."
    log_error "Fix: ensure package-lock.json is not ignored, commit it, push, then re-run install." 
    exit 1
fi

if ! npm ci --omit=dev --verbose; then
    log_error "npm ci failed. This usually means package.json and package-lock.json are not in sync."
    log_error "Fix: regenerate the lockfile on your dev machine (npm install --package-lock-only), commit it, push, then re-run install." 
    exit 1
fi

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
    if ! grep -q "include /etc/nginx/conf.d/*.conf;" /etc/nginx/nginx.conf; then
        sed -i "s|http {|http {\n    include /etc/nginx/conf.d/*.conf;|" /etc/nginx/nginx.conf
    else
        include_count=$(grep -c "include /etc/nginx/conf.d/*.conf;" /etc/nginx/nginx.conf || true)
        if [ "${include_count:-0}" -gt 1 ]; then
            awk '
                $0 ~ /include \/etc\/nginx\/conf\.d\/\*\.conf;/ {
                    if (seen++) next
                }
                { print }
            ' /etc/nginx/nginx.conf > /etc/nginx/nginx.conf.tmp && mv /etc/nginx/nginx.conf.tmp /etc/nginx/nginx.conf
        fi
    fi
elif [ "$OS_TYPE" == "freebsd" ]; then
    SITES_AVAIL="/usr/local/etc/nginx/conf.d"
    mkdir -p "$SITES_AVAIL"
    CONF_PATH="$SITES_AVAIL/$DOMAIN.conf"
    # Ensure nginx.conf includes conf.d
    if ! grep -q "include $SITES_AVAIL/*.conf;" /usr/local/etc/nginx/nginx.conf; then
        sed -i '' "s|http {|http {\n    include $SITES_AVAIL/*.conf;|" /usr/local/etc/nginx/nginx.conf
    else
        include_count=$(grep -c "include $SITES_AVAIL/*.conf;" /usr/local/etc/nginx/nginx.conf || true)
        if [ "${include_count:-0}" -gt 1 ]; then
            awk '
                $0 ~ /include \/usr\/local\/etc\/nginx\/conf\.d\/\*\.conf;/ {
                    if (seen++) next
                }
                { print }
            ' /usr/local/etc/nginx/nginx.conf > /usr/local/etc/nginx/nginx.conf.tmp && mv /usr/local/etc/nginx/nginx.conf.tmp /usr/local/etc/nginx/nginx.conf
        fi
    fi
fi

# Global upload size limit (applies inside http{} context via conf.d include)
NGINX_CONF_D="$NGINX_CONF_DIR/conf.d"
mkdir -p "$NGINX_CONF_D"
UPLOAD_CONF="$NGINX_CONF_D/squirrel_uploads.conf"
cat > "$UPLOAD_CONF" <<EOF
# Allow large uploads for media capture.
client_max_body_size $NGINX_CLIENT_MAX_BODY_SIZE;
EOF

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
        if certbot --nginx -d "$DOMAIN" -d "$WWW_DOMAIN" --non-interactive --agree-tos --email "${CERTBOT_EMAIL:-admin@$DOMAIN}" --redirect 2>/dev/null; then
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
After=network.target

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=$APP_DIR
ExecStart=$NODE_EXEC $APP_DIR/server/server.js
Restart=always
RestartSec=5
EnvironmentFile=$ENV_FILE
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
