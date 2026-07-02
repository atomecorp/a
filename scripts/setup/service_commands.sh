#!/bin/bash

print_usage() {
    echo "Usage: $ENTRYPOINT_DISPLAY [OPTIONS|COMMAND]"
    echo ""
    echo "Development Options:"
    echo "  -f, --force-deps      Force update all dependencies before starting"
    echo "      --test            Launch local test mode and bypass pre-auth OTP verification"
    echo "      --prod            Build a production Tauri bundle and exit"
    echo "      --tauri           Launch only Tauri (no local Fastify server)"
    echo "      --tauri-prod      Build and launch the production Tauri app bundle"
    echo "      --server          Launch only Fastify server (HTTP, dev or prod foreground diagnostics)"
    echo "      --fastify-url URL Configure remote Fastify server URL for Tauri"
    echo ""
    echo "Production Options:"
    echo "      --https           Start production server via systemd/nginx (HTTPS)"
    echo ""
    echo "Service Commands (production):"
    echo "  start                 Start the production service"
    echo "  stop                  Stop the service"
    echo "  restart               Restart the production service"
    echo "  status                Show service status and recent logs"
    echo "  logs                  Follow service logs (Ctrl+C to exit)"
    echo "  update                Update code + reinstall deps + restart"
    echo "  check                 Run system diagnostics (Nginx, SSL, ports)"
    echo ""
    echo "  -h, --help            Show this help message"
    echo ""
    echo "Examples:"
    echo "  $ENTRYPOINT_DISPLAY                   # Dev: Start both Fastify + Tauri"
    echo "  $ENTRYPOINT_DISPLAY --server          # Start only Fastify (HTTP)"
    echo "  $ENTRYPOINT_DISPLAY --https           # Prod: Start via systemd/nginx (HTTPS)"
    echo "  $ENTRYPOINT_DISPLAY status            # Prod: Check service status"
    echo "  $ENTRYPOINT_DISPLAY logs              # Prod: View live logs"
    echo "  $ENTRYPOINT_DISPLAY restart           # Prod: Restart after update"
    echo "  $ENTRYPOINT_DISPLAY --prod            # Build Tauri production bundle"
    echo "  $ENTRYPOINT_DISPLAY --tauri --prod     # Build + launch Tauri production bundle"
    echo "  $ENTRYPOINT_DISPLAY --tauri-prod       # Same as above"
    echo ""
}
detect_service_system() {
    if [[ -f "/etc/systemd/system/$SERVICE_NAME.service" ]]; then
        echo "systemd"
    elif [[ -f "/usr/local/etc/rc.d/$SERVICE_NAME" ]]; then
        echo "rcd"
    else
        echo "none"
    fi
}

service_env_file_for_type() {
    local svc_type="$1"

    case "$svc_type" in
        systemd)
            echo "/etc/squirrel/squirrel.env"
            ;;
        rcd)
            echo "/usr/local/etc/squirrel/squirrel.env"
            ;;
        *)
            echo ""
            ;;
    esac
}

is_production_install() {
    local svc_type
    svc_type="$(detect_service_system)"

    [[ "$svc_type" != "none" ]] \
        || [[ -f "/etc/squirrel/squirrel.env" ]] \
        || [[ -f "/usr/local/etc/squirrel/squirrel.env" ]]
}

service_is_active() {
    local svc_type="$1"

    case "$svc_type" in
        systemd)
            systemctl is-active --quiet "$SERVICE_NAME"
            ;;
        rcd)
            service "$SERVICE_NAME" status &>/dev/null
            ;;
        *)
            return 1
            ;;
    esac
}

service_foreground_server() {
    local svc_type
    svc_type="$(detect_service_system)"

    if [[ "$svc_type" == "none" ]]; then
        echo "ERROR: Production server environment exists, but service '$SERVICE_NAME' is not installed."
        echo "Run first: sudo ./install_server.sh"
        exit 1
    fi

    if service_is_active "$svc_type"; then
        echo "ERROR: Service '$SERVICE_NAME' is already running."
        echo "Use './run.sh logs' or './run.sh status' for diagnostics."
        echo "For foreground server diagnostics, stop it first with: ./run.sh stop"
        exit 1
    fi

    local env_file
    env_file="$(service_env_file_for_type "$svc_type")"
    if [[ -z "$env_file" ]] || [[ ! -f "$env_file" ]]; then
        echo "ERROR: Missing production environment file: $env_file"
        exit 1
    fi

    set -a
    # shellcheck disable=SC1090
    source "$env_file"
    set +a

    export NODE_ENV=production
    cd "$PROJECT_ROOT"

    echo "Starting $SERVICE_NAME foreground server with $env_file"
    echo "Press Ctrl+C to stop."
    exec node "$PROJECT_ROOT/server/server.js"
}

service_start() {
    local svc_type
    svc_type=$(detect_service_system)

    case "$svc_type" in
        systemd)
            echo "Starting $SERVICE_NAME service (systemd)..."
            sudo systemctl start "$SERVICE_NAME"
            sudo systemctl status "$SERVICE_NAME" --no-pager -l
            ;;
        rcd)
            echo "Starting $SERVICE_NAME service (rc.d)..."
            sudo service "$SERVICE_NAME" start
            sudo service "$SERVICE_NAME" status
            ;;
        *)
            echo "ERROR: Service '$SERVICE_NAME' is not installed."
            echo "Run first: sudo ./install_server.sh"
            exit 1
            ;;
    esac
}
service_stop() {
    local svc_type
    svc_type=$(detect_service_system)

    case "$svc_type" in
        systemd)
            echo "Stopping $SERVICE_NAME service..."
            sudo systemctl stop "$SERVICE_NAME"
            echo "Service stopped"
            ;;
        rcd)
            echo "Stopping $SERVICE_NAME service..."
            sudo service "$SERVICE_NAME" stop
            echo "Service stopped"
            ;;
        *)
            echo "ERROR: Service '$SERVICE_NAME' is not installed."
            exit 1
            ;;
    esac
}
service_restart() {
    local svc_type
    svc_type=$(detect_service_system)

    case "$svc_type" in
        systemd)
            echo "Restarting $SERVICE_NAME service..."
            sudo systemctl restart "$SERVICE_NAME"
            sudo systemctl status "$SERVICE_NAME" --no-pager -l
            ;;
        rcd)
            echo "Restarting $SERVICE_NAME service..."
            sudo service "$SERVICE_NAME" restart
            sudo service "$SERVICE_NAME" status
            ;;
        *)
            echo "ERROR: Service '$SERVICE_NAME' is not installed."
            exit 1
            ;;
    esac
}
service_status() {
    local svc_type
    svc_type=$(detect_service_system)

    case "$svc_type" in
        systemd)
            sudo systemctl status "$SERVICE_NAME" --no-pager -l || true

            if ! systemctl is-active --quiet "$SERVICE_NAME"; then
                echo ""
                echo "WARNING: The server is stopped or restarting repeatedly."
                echo "Recent logs:"
                echo "----------------------------------------------------------------"
                sudo journalctl -u "$SERVICE_NAME" -n 30 --no-pager -l
                echo "----------------------------------------------------------------"
                echo "Tip: run './run.sh logs' to follow live logs."
            fi
            ;;
        rcd)
            sudo service "$SERVICE_NAME" status || true
            echo ""
            echo "Recent logs:"
            if [[ ! -f "/var/log/messages" ]]; then
                echo "ERROR: Expected FreeBSD log file not found: /var/log/messages"
                exit 1
            fi
            tail -20 /var/log/messages
            ;;
        *)
            echo "ERROR: Service '$SERVICE_NAME' is not installed."
            echo "For foreground development mode, use: ./run.sh --server"
            exit 1
            ;;
    esac
}

service_logs() {
    local svc_type
    svc_type=$(detect_service_system)

    echo "Following live logs. Press Ctrl+C to exit."

    case "$svc_type" in
        systemd)
            sudo journalctl -u "$SERVICE_NAME" -f -l
            ;;
        rcd)
            if [[ ! -f "/var/log/messages" ]]; then
                echo "ERROR: Expected FreeBSD log file not found: /var/log/messages"
                exit 1
            fi
            tail -f /var/log/messages
            ;;
        *)
            echo "ERROR: Service '$SERVICE_NAME' is not installed."
            exit 1
            ;;
    esac
}

service_check() {
    echo "Running system diagnostics..."
    echo ""

    echo -n "1. Nginx: "
    if command -v nginx &>/dev/null; then
        if sudo nginx -t &>/dev/null; then
            echo "configuration ok"
        else
            echo "configuration error"
            sudo nginx -t 2>&1 | head -5
        fi
    else
        echo "not installed"
    fi

    local svc_type
    svc_type=$(detect_service_system)
    echo -n "2. Service $SERVICE_NAME: "
    case "$svc_type" in
        systemd)
            if systemctl is-active --quiet "$SERVICE_NAME"; then
                echo "active"
            else
                echo "inactive"
            fi
            ;;
        rcd)
            if service "$SERVICE_NAME" status &>/dev/null; then
                echo "active"
            else
                echo "inactive"
            fi
            ;;
        *)
            echo "not installed"
            ;;
    esac

    echo -n "3. Port 3001: "
    if command -v lsof &>/dev/null && lsof -i :3001 &>/dev/null; then
        if lsof -i :3001 | grep -q "127.0.0.1"; then
            echo "listening on localhost only"
        else
            echo "publicly exposed"
        fi
    else
        echo "no process"
    fi

    echo -n "4. SSL certificate: "
    if [[ -d "/etc/letsencrypt/live" ]] && [[ -n "$(ls -A /etc/letsencrypt/live 2>/dev/null)" ]]; then
        echo "Let's Encrypt configured"
    else
        echo "not configured"
    fi

    echo -n "5. SQLite: "
    if [[ -f "${SQLITE_PATH:-$PROJECT_ROOT/$DEFAULT_SQLITE_PATH}" ]]; then
        echo "database present"
    else
        echo "database not created yet"
    fi

    echo ""
}

service_update() {
    echo "Updating server code and dependencies reproducibly"
    local updater="$SCRIPTS_DIR/server_update.js"
    if [[ ! -f "$updater" ]]; then
        echo "ERROR: Missing updater script: $updater"
        echo "Pull the latest code and try again."
        exit 1
    fi

    if [[ ${EUID:-$(id -u)} -eq 0 ]]; then
        node "$updater"
    else
        sudo node "$updater"
    fi
}

dispatch_service_command_if_requested() {
    local first_arg="${1:-}"

    case "$first_arg" in
        --help|-h)
            print_usage
            exit 0
            ;;
        --server)
            if is_production_install; then
                if [[ "$#" -gt 1 ]]; then
                    echo "ERROR: Production foreground server mode does not accept extra arguments."
                    exit 1
                fi
                service_foreground_server
                exit 0
            fi
            ;;
        --https)
            echo "Production HTTPS mode (systemd/nginx)"
            service_start
            exit 0
            ;;
        start)
            service_start
            exit 0
            ;;
        stop)
            service_stop
            exit 0
            ;;
        restart)
            service_restart
            exit 0
            ;;
        status)
            service_status
            exit 0
            ;;
        logs)
            service_logs
            exit 0
            ;;
        update)
            service_update
            exit 0
            ;;
        check)
            service_check
            exit 0
            ;;
    esac
}
