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
  load_env_file "$PROJECT_ROOT/.env"
  load_env_file "$PROJECT_ROOT/.env.local"

  if [[ -z "${ADOLE_PG_DSN:-}" && -z "${PG_CONNECTION_STRING:-}" && -z "${DATABASE_URL:-}" ]]; then
    local generated_dsn
    generated_dsn="$(compute_default_dsn)"
    if [[ -z "$generated_dsn" ]]; then
      generated_dsn="$DEFAULT_PG_DSN"
    fi

    log_info "ℹ️  No PostgreSQL DSN found. Writing default DSN to .env."
    if ! write_pg_dsn_to_env "$generated_dsn"; then
      log_error "❌ Failed to persist PostgreSQL DSN in .env."
      exit 1
    fi

    load_env_file "$PROJECT_ROOT/.env"
    load_env_file "$PROJECT_ROOT/.env.local"
  fi

  if [[ -z "${ADOLE_PG_DSN:-}" && -z "${PG_CONNECTION_STRING:-}" && -z "${DATABASE_URL:-}" ]]; then
    log_error "❌ PostgreSQL DSN still missing after attempting automatic configuration."
    exit 1
  fi
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
  local dsn
  dsn="${ADOLE_PG_DSN:-${PG_CONNECTION_STRING:-${DATABASE_URL:-}}}"

  if [[ -z "$dsn" ]]; then
    log_warn "⚠️  No PostgreSQL DSN available. Skipping database setup."
    return
  fi

  install_postgres_client

  if ! command -v psql >/dev/null 2>&1; then
    log_warn "⚠️  psql not available. Skipping automatic database setup."
    return
  fi

  if ! parse_dsn_components "$dsn"; then
    log_warn "⚠️  Unable to parse PostgreSQL DSN. Skipping automatic database setup."
    return
  fi

  local super_user super_password super_db
  super_user="${ADOLE_PG_SUPERUSER:-$USER}"
  super_password="${ADOLE_PG_SUPERUSER_PASSWORD:-}"
  super_db="${ADOLE_PG_SUPERUSER_DB:-postgres}"

  local original_pgpassword="${PGPASSWORD-}"
  if [[ -n "$super_password" ]]; then
    export PGPASSWORD="$super_password"
  else
    unset PGPASSWORD
  fi

  local psql_cmd=(psql -h "$DB_HOST" -p "$DB_PORT" -U "$super_user" "$super_db")

  if ! "${psql_cmd[@]}" -Atc "SELECT 1" >/dev/null 2>&1; then
    log_warn "⚠️  Unable to connect to PostgreSQL as '$super_user'. Skipping automatic database setup."
    if [[ -n "$original_pgpassword" ]]; then
      export PGPASSWORD="$original_pgpassword"
    else
      unset PGPASSWORD
    fi
    return
  fi

  local role_exists
  role_exists="$("${psql_cmd[@]}" -Atc "SELECT 1 FROM pg_roles WHERE rolname = '$(escape_sql_literal "$DB_USER")'")" || true
  if [[ "$role_exists" != "1" ]]; then
    log_info "👤 Creating PostgreSQL role '$DB_USER'"
    if ! "${psql_cmd[@]}" -c "CREATE ROLE \"$(escape_sql_identifier "$DB_USER")\" WITH LOGIN PASSWORD '$(escape_sql_literal "$DB_PASSWORD")';"; then
      log_warn "⚠️  Unable to create role '$DB_USER'."
    else
      log_ok "✅ Role '$DB_USER' created"
    fi
  else
    log_info "👤 Role '$DB_USER' already exists"
  fi

  "${psql_cmd[@]}" -c "ALTER ROLE \"$(escape_sql_identifier "$DB_USER")\" CREATEDB;" >/dev/null 2>&1 || true

  local db_exists
  db_exists="$("${psql_cmd[@]}" -Atc "SELECT 1 FROM pg_database WHERE datname = '$(escape_sql_literal "$DB_NAME")'")" || true
  if [[ "$db_exists" != "1" ]]; then
    log_info "🗄️  Creating database '$DB_NAME'"
    if ! "${psql_cmd[@]}" -c "CREATE DATABASE \"$(escape_sql_identifier "$DB_NAME")\" OWNER \"$(escape_sql_identifier "$DB_USER")\";"; then
      log_warn "⚠️  Unable to create database '$DB_NAME'."
    else
      log_ok "✅ Database '$DB_NAME' created"
    fi
  else
    log_info "🗄️  Database '$DB_NAME' already exists"
  fi

  if [[ -n "$original_pgpassword" ]]; then
    export PGPASSWORD="$original_pgpassword"
  else
    unset PGPASSWORD
  fi
}

# --- Main Execution --------------------------------------------------------

log_info "🚀 Starting Server Environment Setup..."

ensure_env_configured
update_fastify_stack
install_pg_module
setup_postgres_role_and_database

log_ok "✅ Server setup complete! You can now run the server."
