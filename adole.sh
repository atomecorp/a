#!/bin/bash
set -euo pipefail

show_help() {
    cat <<'EOF'
Usage: ./adole.sh [options]

Options:
  --dsn <url>           Full PostgreSQL connection string (takes precedence).
  --host <host>         PostgreSQL host (default: localhost).
  --port <port>         PostgreSQL port (default: 5432).
  --user <user>         PostgreSQL user (default: postgres).
  --password <pass>     PostgreSQL password (default: postgres).
  --database <name>     PostgreSQL database name (default: squirrel).
  --force               Overwrite existing values without prompt.
  -h, --help            Show this help message.

If no --dsn is provided, the script composes one from the other flags or their defaults.
The resulting DSN is written to .env as ADOLE_PG_DSN.
EOF
}

SOURCE="${BASH_SOURCE[0]:-$0}"
while [ -h "$SOURCE" ]; do
    DIR="$(cd -P "$(dirname "$SOURCE")" >/dev/null 2>&1 && pwd)"
    SOURCE="$(readlink "$SOURCE")"
    [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE"
done
SCRIPT_DIR="$(cd -P "$(dirname "$SOURCE")" >/dev/null 2>&1 && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"
ENV_FILE="$PROJECT_ROOT/.env"

FORCE=false
DSN=""
HOST="localhost"
PORT="5432"
USER="postgres"
PASSWORD="postgres"
DATABASE="squirrel"

while [[ $# -gt 0 ]]; do
    case $1 in
        --dsn)
            shift || { echo "ERROR: --dsn requires a value." >&2; exit 1; }
            DSN="$1"
            ;;
        --host)
            shift || { echo "ERROR: --host requires a value." >&2; exit 1; }
            HOST="$1"
            ;;
        --port)
            shift || { echo "ERROR: --port requires a value." >&2; exit 1; }
            PORT="$1"
            ;;
        --user)
            shift || { echo "ERROR: --user requires a value." >&2; exit 1; }
            USER="$1"
            ;;
        --password)
            shift || { echo "ERROR: --password requires a value." >&2; exit 1; }
            PASSWORD="$1"
            ;;
        --database)
            shift || { echo "ERROR: --database requires a value." >&2; exit 1; }
            DATABASE="$1"
            ;;
        --force)
            FORCE=true
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            echo "ERROR: Unknown option: $1" >&2
            show_help
            exit 1
            ;;
    esac
    shift
done

if [[ -z "$DSN" ]]; then
    DSN="postgres://${USER}:${PASSWORD}@${HOST}:${PORT}/${DATABASE}"
fi

if [[ -f "$ENV_FILE" && $FORCE = false ]]; then
    if grep -q '^ADOLE_PG_DSN=' "$ENV_FILE"; then
        echo "ERROR: ADOLE_PG_DSN already exists in .env. Use --force to overwrite." >&2
        exit 1
    fi
fi

TMP_FILE="$(mktemp)"
trap 'rm -f "$TMP_FILE"' EXIT

if [[ -f "$ENV_FILE" ]]; then
    grep -v '^ADOLE_PG_DSN=' "$ENV_FILE" > "$TMP_FILE"
else
    : > "$TMP_FILE"
fi

echo "ADOLE_PG_DSN=$DSN" >> "$TMP_FILE"

mv "$TMP_FILE" "$ENV_FILE"
trap - EXIT

if chmod 600 "$ENV_FILE" 2>/dev/null; then
    :
fi

echo "INFO: Updated $ENV_FILE with ADOLE_PG_DSN=${DSN}"
