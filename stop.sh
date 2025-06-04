#!/bin/bash

# stop_services.sh - Arrête proprement tous les services lancés par install.sh

# Couleurs pour les messages
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# Fonction pour afficher les messages
print_msg() {
    local color=$1
    local message=$2
    local timestamp=$(date '+%H:%M:%S')
    echo -e "[$timestamp] ${color}$message${NC}"
}

# Fonction pour tuer les processus sur un port donné
kill_port() {
    local port=$1
    local service_name=$2
    
    if command -v lsof >/dev/null 2>&1; then
        PIDS=$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
        if [ -n "$PIDS" ]; then
            print_msg "$YELLOW" "🛑 Arrêt de $service_name (port $port, PIDs: $PIDS)..."
            kill $PIDS 2>/dev/null || true
            sleep 1
            
            # Vérifier si les processus sont bien arrêtés
            REMAINING=$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
            if [ -n "$REMAINING" ]; then
                print_msg "$YELLOW" "⚡ Force kill de $service_name..."
                kill -9 $REMAINING 2>/dev/null || true
            fi
            print_msg "$GREEN" "✅ $service_name arrêté"
        else
            print_msg "$YELLOW" "ℹ️  Aucun processus sur le port $port ($service_name)"
        fi
    else
        print_msg "$YELLOW" "⚠️  lsof non disponible, utilisation de pkill pour $service_name"
        pkill -f "$service_name" 2>/dev/null || true
    fi
}

# Fonction pour arrêter le watcher
stop_watcher() {
    print_msg "$YELLOW" "🔍 Recherche du watcher..."
    
    # Méthode 1: Via le fichier PID
    if [ -f ".watcher.pid" ]; then
        WATCHER_PID=$(cat .watcher.pid)
        if kill -0 $WATCHER_PID 2>/dev/null; then
            print_msg "$YELLOW" "🛑 Arrêt du watcher (PID: $WATCHER_PID)..."
            kill $WATCHER_PID 2>/dev/null || true
            sleep 1
            
            # Vérifier si le processus est bien arrêté
            if kill -0 $WATCHER_PID 2>/dev/null; then
                print_msg "$YELLOW" "⚡ Force kill du watcher..."
                kill -9 $WATCHER_PID 2>/dev/null || true
            fi
            print_msg "$GREEN" "✅ Watcher arrêté"
        else
            print_msg "$YELLOW" "ℹ️  PID du watcher non actif"
        fi
        rm -f .watcher.pid
    else
        print_msg "$YELLOW" "ℹ️  Fichier .watcher.pid non trouvé"
    fi
    
    # Méthode 2: Via le nom du processus
    WATCHER_PIDS=$(pgrep -f "watchexec.*src" 2>/dev/null || true)
    if [ -n "$WATCHER_PIDS" ]; then
        print_msg "$YELLOW" "🛑 Arrêt des processus watchexec restants (PIDs: $WATCHER_PIDS)..."
        kill $WATCHER_PIDS 2>/dev/null || true
        sleep 1
        print_msg "$GREEN" "✅ Processus watchexec arrêtés"
    fi
    
    # Méthode 3: killall en dernier recours
    if pgrep watchexec >/dev/null 2>&1; then
        print_msg "$YELLOW" "🛑 Arrêt de tous les processus watchexec..."
        killall watchexec 2>/dev/null || true
        print_msg "$GREEN" "✅ Tous les watchexec arrêtés"
    fi
}

# Fonction pour arrêter les applications Tauri
stop_tauri_apps() {
    print_msg "$YELLOW" "🔍 Recherche des applications Tauri..."
    
    # Chercher les processus Tauri
    TAURI_PIDS=$(pgrep -f "tauri|test_app" 2>/dev/null || true)
    if [ -n "$TAURI_PIDS" ]; then
        print_msg "$YELLOW" "🛑 Arrêt des applications Tauri (PIDs: $TAURI_PIDS)..."
        kill $TAURI_PIDS 2>/dev/null || true
        sleep 2
        
        # Force kill si nécessaire
        REMAINING=$(pgrep -f "tauri|test_app" 2>/dev/null || true)
        if [ -n "$REMAINING" ]; then
            print_msg "$YELLOW" "⚡ Force kill des applications Tauri..."
            kill -9 $REMAINING 2>/dev/null || true
        fi
        print_msg "$GREEN" "✅ Applications Tauri arrêtées"
    else
        print_msg "$YELLOW" "ℹ️  Aucune application Tauri en cours"
    fi
}

# Fonction pour arrêter les processus Node.js suspects
stop_nodejs_processes() {
    print_msg "$YELLOW" "🔍 Recherche des processus Node.js suspects..."
    
    # Chercher les serveurs Node.js (fastify, etc.)
    NODE_PIDS=$(pgrep -f "fastify-server|node.*server" 2>/dev/null || true)
    if [ -n "$NODE_PIDS" ]; then
        print_msg "$YELLOW" "🛑 Arrêt des serveurs Node.js (PIDs: $NODE_PIDS)..."
        kill $NODE_PIDS 2>/dev/null || true
        sleep 1
        print_msg "$GREEN" "✅ Serveurs Node.js arrêtés"
    else
        print_msg "$YELLOW" "ℹ️  Aucun serveur Node.js suspect trouvé"
    fi
}

# Fonction pour nettoyer les fichiers temporaires
cleanup_files() {
    print_msg "$YELLOW" "🧹 Nettoyage des fichiers temporaires..."
    
    # Supprimer les fichiers PID
    rm -f .watcher.pid 2>/dev/null || true
    rm -f .install.pid 2>/dev/null || true
    
    # Nettoyer les logs temporaires si ils existent
    rm -f /tmp/tauri_install.log 2>/dev/null || true
    rm -f /tmp/watcher.log 2>/dev/null || true
    
    print_msg "$GREEN" "✅ Fichiers temporaires nettoyés"
}

# Fonction pour afficher un résumé des ports utilisés
show_port_status() {
    print_msg "$YELLOW" "📊 État des ports après nettoyage:"
    
    for port in 3000 3001 8080; do
        if command -v lsof >/dev/null 2>&1; then
            if lsof -tiTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
                print_msg "$RED" "❌ Port $port encore utilisé"
            else
                print_msg "$GREEN" "✅ Port $port libre"
            fi
        else
            print_msg "$YELLOW" "❓ Port $port (lsof non disponible)"
        fi
    done
}

# Fonction principale
main() {
    print_msg "$GREEN" "🛑 === ARRÊT DES SERVICES TAURI ==="
    
    # Arrêter les services dans l'ordre
    stop_watcher
    
    print_msg "$YELLOW" "🛑 Arrêt des serveurs sur les ports..."
    kill_port 3001 "Serveur Fastify"
    kill_port 3000 "Serveur Axum"
    kill_port 8080 "Serveur de développement"
    
    stop_tauri_apps
    stop_nodejs_processes
    cleanup_files
    
    # Attendre un peu pour que tout se stabilise
    print_msg "$YELLOW" "⏳ Attente de la stabilisation..."
    sleep 2
    
    show_port_status
    
    print_msg "$GREEN" "🏁 === ARRÊT TERMINÉ ==="
    print_msg "$YELLOW" "💡 Conseil: Attendez quelques secondes avant de relancer install.sh"
}

# Gestion des arguments
if [ "$1" = "--force" ]; then
    print_msg "$YELLOW" "⚡ Mode force activé - arrêt brutal"
    killall -9 watchexec 2>/dev/null || true
    killall -9 tauri 2>/dev/null || true
    killall -9 node 2>/dev/null || true
    for port in 3000 3001 8080; do
        lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | xargs kill -9 2>/dev/null || true
    done
    print_msg "$GREEN" "🏁 Arrêt brutal terminé"
    exit 0
fi

if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --force    Arrêt brutal de tous les processus"
    echo "  --help     Affiche cette aide"
    echo ""
    echo "Arrête proprement tous les services lancés par install.sh:"
    echo "  - Watcher (watchexec)"
    echo "  - Serveur Fastify (port 3001)"
    echo "  - Serveur Axum (port 3000)"
    echo "  - Applications Tauri"
    echo "  - Nettoie les fichiers temporaires"
    exit 0
fi

# Exécuter le script principal
main