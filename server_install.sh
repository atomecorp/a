#!/usr/bin/env bash
#
# server_install.sh
# -----------------
# Minimal script to install server dependencies (Fastify, DB) without GUI/Tauri/Mac deps.

set -euo pipefail

# --- Resolve directories ---------------------------------------------------
SOURCE="${BASH_SOURCE[0]:-$0}"
while [ -h "$SOURCE" ]; do
  DIR="$(cd -P "$(dirname "$SOURCE")" >/dev/null 2>&1 && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE"
done
SCRIPT_DIR="$(cd -P "$(dirname "$SOURCE")" >/dev/null 2>&1 && pwd)"
if [[ -f "$SCRIPT_DIR/package.json" ]]; then
  PROJECT_ROOT="$SCRIPT_DIR"
else
  PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
fi

# --- Logging helpers -------------------------------------------------------
BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info()  { printf "${BLUE}%s${NC}\n" "$1"; }
log_ok()    { printf "${GREEN}%s${NC}\n" "$1"; }
log_warn()  { printf "${YELLOW}%s${NC}\n" "$1"; }
log_error() { printf "${RED}%s${NC}\n" "$1"; }

# --- Database Configuration ------------------------------------------------
DEFAULT_PG_DSN="postgres://postgres:postgres@localhost:5432/squirrel"

compute_default_dsn() {
  local host="${ADOLE_PG_HOST:-${PGHOST:-localhost}}"
  local port="${ADOLE_PG_PORT:-${PGPORT:-5432}}"
  local user="${ADOLE_PG_USER:-${PGUSER:-postgres}}"
  local password="${ADOLE_PG_PASSWORD:-${PGPASSWORD:-postgres}}"
  local database="${ADOLE_PG_DATABASE:-${PGDATABASE:-squirrel}}"

  printf 'postgres://%s:%s@%s:%s/%s' "$user" "$password" "$host" "$port" "$database"
}

write_pg_dsn_to_env() {
  local dsn="$1"
  local env_file="$PROJECT_ROOT/.env"
  local tmp

  tmp="$(mktemp)"
  trap 'rm -f "$tmp"' RETURN

  if [[ -f "$env_file" ]]; then
    grep -v '^ADOLE_PG_DSN=' "$env_file" >"$tmp" || true
  else
    : >"$tmp"
  fi

  printf 'ADOLE_PG_DSN=%s\n' "$dsn" >>"$tmp"
  mv "$tmp" "$env_file"
  trap - RETURN

  chmod 600 "$env_file" 2>/dev/null || true
  log_ok "✅ PostgreSQL DSN stored in $(basename "$env_file")"
}

load_env_file() {
  local env_file="$1"
  if [ -f "$env_file" ]; then
    log_info "🌱 Loading variables from $(basename "$env_file")"
    set -a
    # shellcheck disable=SC1090
    source "$env_file"
    set +a
  fi
}

ensure_env_configured() {
  log_info "⚙️  Configuring environment variables..."

  export ADOLE_PG_SUPERUSER="postgres"
  export ADOLE_PG_SUPERUSER_PASSWORD=""
  export ADOLE_PG_SUPERUSER_DB="postgres"

  # Force DSN expected by the server (no interaction)
  export ADOLE_PG_DSN="postgres://postgres:postgres@localhost:5432/squirrel"

  write_pg_dsn_to_env "$ADOLE_PG_DSN"
  load_env_file "$PROJECT_ROOT/.env"
  load_env_file "$PROJECT_ROOT/.env.local"

  log_ok "✅ Environment configured with DSN: $ADOLE_PG_DSN"
}

# --- Install Functions -----------------------------------------------------

update_fastify_stack() {
  log_info "🛠  Installing/Updating Fastify stack..."
  (
    cd "$PROJECT_ROOT" &&
    npm install \
      fastify@latest \
      @fastify/static@latest \
      @fastify/websocket@latest \
      @fastify/cors@latest
  )
  log_ok "✅ Fastify stack installed"
}

install_pg_module() {
  log_info "🧩 Ensuring pg driver is installed"
  (cd "$PROJECT_ROOT" && npm install pg@latest)
  log_ok "✅ pg driver installed"
}

# --- Database Setup Helpers ------------------------------------------------

escape_sql_literal() {
  local value="$1"
  value="${value//\'/''}"
  printf "%s" "$value"
}

escape_sql_identifier() {
  local value="$1"
  value="${value//\"/""}"
  printf "%s" "$value"
}

parse_dsn_components() {
  local dsn="$1"
  local remainder="${dsn#*://}"

  if [[ "$remainder" == "$dsn" ]]; then
    return 1
  fi

  local credentials host_and_path user password host_with_port path host port database

  if [[ "$remainder" == *@* ]]; then
    credentials="${remainder%@*}"
    host_and_path="${remainder#*@}"
  else
    credentials=""
    host_and_path="$remainder"
  fi

  user="${credentials%%:*}"
  if [[ "$credentials" == *:* ]]; then
    password="${credentials#*:}"
  else
    password=""
  fi

  host_with_port="${host_and_path%%/*}"
  path="${host_and_path#*/}"

  if [[ "$host_with_port" == *:* ]]; then
    host="${host_with_port%%:*}"
    port="${host_with_port#*:}"
  else
    host="$host_with_port"
    port=""
  fi

  database="${path%%\?*}"
  database="${database%%#*}"

  DB_USER="${user:-postgres}"
  DB_PASSWORD="$password"
  DB_HOST="${host:-localhost}"
  DB_PORT="${port:-5432}"
  DB_NAME="${database:-squirrel}"
  return 0
}

install_postgres_client() {
  if command -v psql >/dev/null 2>&1; then
    return
  fi

  log_info "🔍 psql not found. Attempting to install PostgreSQL client..."

  if [[ "$OSTYPE" == "darwin"* ]]; then
    if command -v brew >/dev/null 2>&1; then
      log_info "🍺 Installing postgresql via Homebrew..."
      brew install postgresql || log_warn "⚠️  Brew install failed"
    else
      log_warn "⚠️  Homebrew not found. Cannot install postgresql automatically."
    fi
  elif [ -f /etc/debian_version ]; then
    log_info "🐧 Installing postgresql-client via apt-get..."
    # Check for sudo, use it if available, otherwise try direct
    if command -v sudo >/dev/null 2>&1; then
      sudo apt-get update && sudo apt-get install -y postgresql-client
    else
      apt-get update && apt-get install -y postgresql-client
    fi
  elif [ -f /etc/alpine-release ]; then
    log_info "🏔 Installing postgresql-client via apk..."
    apk add --no-cache postgresql-client
  else
    log_warn "⚠️  Unsupported OS for auto-install. Please install 'psql' manually."
  fi
}

setup_postgres_role_and_database() {
  log_info "🗄️  Auto-configuring PostgreSQL role + database..."

  # 1. Check psql presence
  if ! command -v psql >/dev/null 2>&1; then
    log_error "❌ psql not installed. Install PostgreSQL first."
    exit 1
  fi

  # 2. Try to connect as the real system superuser
  if ! sudo -u postgres psql -Atc "SELECT 1" >/dev/null 2>&1; then
    log_error "❌ Could not connect as system user 'postgres' (Debian default)"
    exit 1
  fi

  # 3. Create postgres role (if not exists)
  sudo -u postgres psql -c "DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'postgres') THEN
      CREATE ROLE postgres WITH LOGIN SUPERUSER PASSWORD 'postgres';
    END IF;
  END
  \$\$;" && log_ok "✅ Role 'postgres' OK"

  # 4. Create database squirrel
  sudo -u postgres psql -c "CREATE DATABASE squirrel OWNER postgres;" 2>/dev/null \
    && log_ok "✅ Database 'squirrel' created" \
    || log_info "ℹ️  Database 'squirrel' already exists"

  log_ok "✅ PostgreSQL setup complete"
}

# --- Main Execution --------------------------------------------------------

log_info "🚀 Starting Server Environment Setup..."

ensure_env_configured
update_fastify_stack
install_pg_module
setup_postgres_role_and_database

log_ok "✅ Server setup complete! You can now run the server."
