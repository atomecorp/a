#!/usr/bin/env bash
#
# run_production_server.sh
# ------------------------
# Helper script to manage the production server lifecycle.
# This is a wrapper around systemctl commands for convenience.

set -e

SERVICE_NAME="squirrel"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

show_help() {
    echo "Usage: ./run_production_server.sh [command]"
    echo ""
    echo "Commands:"
    echo "  start    - Start the server service"
    echo "  stop     - Stop the server service"
    echo "  restart  - Restart the server service"
    echo "  status   - Show service status"
    echo "  logs     - Follow service logs"
    echo "  kill     - Force kill all node processes (emergency)"
    echo "  check    - Run system checks (Nginx, SSL, Service)"
    echo ""
}

if [ $# -eq 0 ]; then
    echo -e "${BLUE}ℹ️  Aucune commande fournie. Affichage du statut...${NC}"
    CMD="status"
else
    CMD=$1
fi

# Check if service is installed
if [ ! -f "/etc/systemd/system/$SERVICE_NAME.service" ]; then
     echo -e "${RED}❌ Le service '$SERVICE_NAME' n'est pas installé.${NC}"
     echo -e "${YELLOW}👉 C'est normal si l'installation a planté avant la fin.${NC}"
     echo -e "${YELLOW}👉 Veuillez relancer l'installation complète :${NC}"
     echo -e "   sudo ./install_production_server.sh"
     exit 1
fi

case "$CMD" in
    start)
        echo -e "${BLUE}Starting $SERVICE_NAME...${NC}"
        sudo systemctl start $SERVICE_NAME
        sudo systemctl status $SERVICE_NAME --no-pager
        ;;
    stop)
        echo -e "${BLUE}Stopping $SERVICE_NAME...${NC}"
        sudo systemctl stop $SERVICE_NAME
        ;;
    restart)
        echo -e "${BLUE}Restarting $SERVICE_NAME...${NC}"
        sudo systemctl restart $SERVICE_NAME
        sudo systemctl status $SERVICE_NAME --no-pager
        ;;
    status)
        sudo systemctl status $SERVICE_NAME

        # Auto-diagnostic if service is not active
        if ! systemctl is-active --quiet $SERVICE_NAME; then
            echo ""
            echo -e "${RED}⚠️  ALERTE : Le serveur plante ou redémarre en boucle.${NC}"
            echo -e "${YELLOW}🔍 Analyse des logs récents (30 dernières lignes) :${NC}"
            echo "----------------------------------------------------------------"
            sudo journalctl -u $SERVICE_NAME -n 30 --no-pager
            echo "----------------------------------------------------------------"
            echo -e "${BLUE}👉 Astuce : Lancez './run_production_server.sh logs' pour voir le direct.${NC}"
        fi
        ;;
    logs)
        echo -e "${BLUE}Following logs (Ctrl+C to exit)...${NC}"
        sudo journalctl -u $SERVICE_NAME -f
        ;;
    kill)
        echo -e "${RED}⚠️  Force killing all Node.js processes...${NC}"
        sudo pkill -f node || true
        echo "Done."
        ;;
    check)
        echo -e "${BLUE}🔍 Running System Checks...${NC}"
        
        echo -n "1. Nginx Syntax: "
        if sudo nginx -t >/dev/null 2>&1; then echo -e "${GREEN}OK${NC}"; else echo -e "${RED}FAIL${NC}"; fi
        
        echo -n "2. Service Status: "
        if systemctl is-active --quiet $SERVICE_NAME; then echo -e "${GREEN}ACTIVE${NC}"; else echo -e "${RED}INACTIVE${NC}"; fi
        
        echo -n "3. Port 3001 (Should be hidden): "
        if sudo lsof -i :3001 | grep -q "127.0.0.1"; then echo -e "${GREEN}OK (Localhost only)${NC}"; else echo -e "${YELLOW}WARNING (Might be exposed)${NC}"; fi
        
        echo -n "4. SSL Certificate: "
        if [ -d "/etc/letsencrypt/live" ]; then echo -e "${GREEN}FOUND${NC}"; else echo -e "${YELLOW}MISSING${NC}"; fi
        ;;
    *)
        show_help
        exit 1
        ;;
esac
