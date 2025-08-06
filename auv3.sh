#!/bin/bash

# =============================================================================
# Script AUv3 - Compile, Déploie et Lance AUm
# ==============================    # Méthode 3: Fallback - Installation automatique ou instructions manuelles
    warning "Aucun outil de logs en temps réel trouvé"
    echo ""
    
    if command -v brew &> /dev/null; then
        log "🔧 Installation automatique de libimobiledevice..."
        
        # Installation silencieuse
        if brew install libimobiledevice &>/dev/null; then
            success "libimobiledevice installé!"
            log "🔄 Redémarrage des logs..."
            
            # Relancer les logs avec libimobiledevice
            if [ "$ALL_LOGS" = true ]; then
                log "🔍 Mode: TOUS les logs iPad"
                echo ""
                echo -e "${BLUE}==================== TOUS LES LOGS IPAD ====================${NC}"
                
                idevicesyslog -u "$device_id"
            else
                log "🔍 Filtrage AUv3 'atome' uniquement"
                echo ""
                echo -e "${BLUE}==================== LOGS AUv3 ATOME ====================${NC}"
                echo -e "${YELLOW}💡 Utilisez maintenant les boutons audio dans l'AUv3 pour voir les logs${NC}"
                echo ""
                
                idevicesyslog -u "$device_id" | \
                grep -i --line-buffered -E "(atome|WebViewManager|AudioController|🎵|📡|✅|❌|🔊)" | \
                grep -v -i -E "(wifid|bluetoothd|spotlightknowledged|springboard|backboard|kernel|assertiond|passd|locationd|mediaserverd|BLE Scanner|WiFiPolicy|CoreUtils)"
            fi
            return
        else
            warning "Échec installation automatique de libimobiledevice"
        fi
    fi
    
    log "📖 Pour voir les logs en temps réel, vous avez 3 options:"
    echo ""
    log "1️⃣  Installer manuellement libimobiledevice:"
    log "   $0 --install-logs"
    echo ""
    log "2️⃣  Utiliser Xcode:"
    log "   Xcode → Window → Devices and Simulators → Sélectionner iPad → View Device Logs"
    echo ""
    log "3️⃣  Utiliser Console.app:"
    log "   Applications → Utilities → Console → Sélectionner iPad"
    echo ""
    log "💡 L'app est déployée et fonctionnelle, seuls les logs manquent"================================
# Usage:
#   ./auv3_fixed.sh                    # Par défaut: compile + déploie + lance AUm
#   ./auv3_fixed.sh --build-only       # Juste compiler (rapide)
#   ./auv3_fixed.sh --app NanoStudio    # Déploie et lance app spécifique
# =============================================================================

set -e

# Configuration
PROJECT_PATH="src-Auv3/atome.xcodeproj"
SCHEME_NAME="atome"
DEFAULT_TARGET_APP="AUM"

# Fonction pour obtenir le bundle ID d'une app
get_bundle_id() {
    case "$1" in
        "AUM") echo "com.kymatica.AUM" ;;
        "NanoStudio") echo "com.blipinteractive.nanostudio" ;;
        "GarageBand") echo "com.apple.mobilegarageband" ;;
        "Cubasis") echo "com.steinberg.cubasis" ;;
        "BeatMaker") echo "com.intua.beatmaker3" ;;
        "Auria") echo "com.wavemachinelabs.auria-pro" ;;
        *) echo "" ;;
    esac
}

# Liste des apps supportées
SUPPORTED_APPS="AUM NanoStudio GarageBand Cubasis BeatMaker Auria"

# Couleurs
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Variables
BUILD_ONLY=false
TARGET_APP="$DEFAULT_TARGET_APP"
NO_LOGS=false
ALL_LOGS=false
INSTALL_LOGS=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --build-only)
            BUILD_ONLY=true
            shift
            ;;
        --app)
            TARGET_APP="$2"
            shift 2
            ;;
        --no-logs)
            NO_LOGS=true
            shift
            ;;
        --all-logs)
            ALL_LOGS=true
            shift
            ;;
        --install-logs)
            INSTALL_LOGS=true
            shift
            ;;
        -h|--help)
            echo "🎵 Script AUv3 - Compile, Déploie et Lance"
            echo ""
            echo "Usage:"
            echo "  $0                         # Compile + déploie + lance AUm + logs"
            echo "  $0 --build-only            # Juste compiler (rapide)"
            echo "  $0 --app NanoStudio        # Lance app spécifique"
            echo "  $0 --no-logs               # Sans affichage des logs iPad"
            echo "  $0 --all-logs              # Tous les logs iPad (non filtrés)"
            echo "  $0 --install-logs          # Installe les outils de logs (libimobiledevice)"
            echo ""
            echo "Apps supportées:"
            for app in $SUPPORTED_APPS; do
                echo "  - $app"
            done
            echo ""
            exit 0
            ;;
        *)
            echo "❌ Option inconnue: $1"
            echo "Utilisez -h pour l'aide"
            exit 1
            ;;
    esac
done

# Fonctions
log() {
    echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}✅${NC} $1"
}

error() {
    echo -e "${RED}❌${NC} $1"
    exit 1
}

warning() {
    echo -e "${YELLOW}⚠️${NC} $1"
}

# Fonction pour démarrer les logs iPad
start_device_logs() {
    local device_id="$1"
    local device_name="$2"
    
    log "📱 Démarrage des logs iPad: $device_name"
    log "💡 Appuyez sur Ctrl+C pour arrêter les logs"
    
    # Méthode 1: Essayer la bonne syntaxe devicectl
    if xcrun devicectl list devices &>/dev/null; then
        log "🔍 Essai avec devicectl..."
        
        # Tester d'abord si la commande log stream existe
        if xcrun devicectl device log stream --help &>/dev/null; then
            if [ "$ALL_LOGS" = true ]; then
                log "🔍 Mode: TOUS les logs iPad"
                echo ""
                echo -e "${BLUE}==================== TOUS LES LOGS IPAD ====================${NC}"
                
                # Syntaxe correcte pour devicectl
                xcrun devicectl device log stream --device "$device_id"
            else
                log "🔍 Filtrage AUv3 'atome' uniquement"
                echo ""
                echo -e "${BLUE}==================== LOGS AUv3 ATOME ====================${NC}"
                echo -e "${YELLOW}💡 Utilisez maintenant les boutons audio dans l'AUv3 pour voir les logs${NC}"
                echo ""
                
                xcrun devicectl device log stream --device "$device_id" | \
                grep -i --line-buffered -E "(atome|WebViewManager|AudioController|🎵|📡|✅|❌|🔊)" | \
                grep -v -i -E "(wifid|bluetoothd|spotlightknowledged|springboard|backboard|kernel|assertiond|passd|locationd|mediaserverd|BLE Scanner|WiFiPolicy|CoreUtils)"
            fi
            return
        else
            log "⚠️  devicectl log stream non disponible sur cette version"
        fi
    fi
    
    # Méthode 2: libimobiledevice (si installé)
    if command -v idevicesyslog &> /dev/null; then
        log "🔍 Utilisation de idevicesyslog..."
        
        if [ "$ALL_LOGS" = true ]; then
            log "🔍 Mode: TOUS les logs iPad"
            echo ""
            echo -e "${BLUE}==================== TOUS LES LOGS IPAD ====================${NC}"
            
            idevicesyslog -u "$device_id"
        else
            log "🔍 Filtrage AUv3 'atome' uniquement"
            echo ""
            echo -e "${BLUE}==================== LOGS AUv3 ATOME ====================${NC}"
            echo -e "${YELLOW}💡 Utilisez maintenant les boutons audio dans l'AUv3 pour voir les logs${NC}"
            echo ""
            
            idevicesyslog -u "$device_id" | \
            grep --line-buffered "atome" | \
            grep -v -i -E "(bluetoothd|spotlightknowledged|BLE Scanner|HomePod)"
        fi
        return
    fi
    
    # Méthode 3: Fallback - Instructions manuelles
    warning "Aucun outil de logs trouvé"
    echo ""
    log "� Pour voir les logs en temps réel, vous avez 3 options:"
    echo ""
    log "1️⃣  Installer libimobiledevice:"
    log "   $0 --install-logs"
    echo ""
    log "2️⃣  Utiliser Xcode:"
    log "   Xcode → Window → Devices and Simulators → Sélectionner iPad → View Device Logs"
    echo ""
    log "3️⃣  Utiliser Console.app:"
    log "   Applications → Utilities → Console → Sélectionner iPad"
    echo ""
    log "💡 L'app est déployée et fonctionnelle, seuls les logs manquent"
}

# Fonction pour gérer l'arrêt propre
cleanup() {
    echo ""
    log "🛑 Arrêt des logs..."
    exit 0
}

# Trap pour gérer Ctrl+C
trap cleanup SIGINT SIGTERM

# Vérifications
if ! command -v xcodebuild &> /dev/null; then
    error "Xcode command line tools requis"
fi

if [ ! -d "$PROJECT_PATH" ]; then
    error "Projet non trouvé: $PROJECT_PATH"
fi

cd "$(dirname "$0")"

# MODE INSTALL LOGS
if [ "$INSTALL_LOGS" = true ]; then
    log "🔧 Installation des outils de logs iPad..."
    
    if command -v brew &> /dev/null; then
        log "📦 Installation de libimobiledevice via Homebrew..."
        brew install libimobiledevice
        
        if [ $? -eq 0 ]; then
            success "Outils de logs installés!"
            log "💡 Vous pouvez maintenant utiliser: $0"
        else
            error "Échec installation libimobiledevice"
        fi
    else
        error "Homebrew requis. Installez-le d'abord: /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
    fi
    exit 0
fi

# MODE BUILD ONLY
if [ "$BUILD_ONLY" = true ]; then
    log "🔨 Mode compilation seulement..."
    
    BUILD_OUTPUT=$(xcodebuild build -project "$PROJECT_PATH" -scheme "$SCHEME_NAME" -sdk iphonesimulator -configuration Debug 2>&1)
    
    if [ $? -eq 0 ]; then
        success "Compilation réussie!"
        log "💡 Pour déployer: $0"
    else
        error "Échec compilation:\n$BUILD_OUTPUT"
    fi
    exit 0
fi

# MODE COMPLET (par défaut)
log "🚀 Mode complet: Compile + Déploie + Lance $TARGET_APP"

# Trouver iPad
log "📱 Recherche iPad..."
DEVICES=$(xcrun xctrace list devices | grep "iPad" | grep -v "Simulator" | grep -v "unavailable")

if [ -z "$DEVICES" ]; then
    error "Aucun iPad connecté trouvé"
fi

DEVICE_ID=$(echo "$DEVICES" | head -1 | sed 's/.*(\([^)]*\)).*/\1/')
DEVICE_NAME=$(echo "$DEVICES" | head -1 | sed 's/ (.*//')

log "🎯 iPad trouvé: $DEVICE_NAME"

# Compilation et installation de l'app companion (obligatoire pour AUv3)
log "📲 Compilation et installation..."

# Méthode directe : construire et installer comme Xcode le fait
BUILD_OUTPUT=$(xcodebuild build -project "$PROJECT_PATH" -scheme "$SCHEME_NAME" -destination "id=$DEVICE_ID" -configuration Release -derivedDataPath "/tmp/atome_build" 2>&1)

if [ $? -ne 0 ]; then
    error "Échec construction:\n$BUILD_OUTPUT"
fi

success "Compilation OK"

# Trouver l'app construite
APP_PATH=$(find "/tmp/atome_build" -name "atome.app" -type d | head -1)

if [ -z "$APP_PATH" ]; then
    error "App atome.app non trouvée après construction"
fi

log "📱 Installation sur iPad..."
INSTALL_OUTPUT=$(xcrun devicectl device install app --device "$DEVICE_ID" "$APP_PATH" 2>&1)

if [ $? -ne 0 ]; then
    error "Échec installation:\n$INSTALL_OUTPUT"
fi

log "✅ App companion 'atome' installée"
log "🔌 L'AUv3 est maintenant disponible dans les apps musicales"

# Nettoyer
rm -rf "/tmp/atome_build"

success "Installation complète (App + AUv3)"

# Lancement de l'app cible
log "🎵 Lancement de $TARGET_APP..."
sleep 2

TARGET_BUNDLE_ID=$(get_bundle_id "$TARGET_APP")

if [ -z "$TARGET_BUNDLE_ID" ]; then
    warning "App '$TARGET_APP' inconnue. Apps supportées:"
    for app in $SUPPORTED_APPS; do
        echo "  - $app"
    done
    exit 1
fi

# Essayer de lancer l'app
xcrun devicectl device process launch --device "$DEVICE_ID" "$TARGET_BUNDLE_ID" > /dev/null 2>&1
if [ $? -eq 0 ]; then
    success "$TARGET_APP lancé!"
else
    warning "$TARGET_APP non installé ou impossible de lancer"
    log "💡 Installez $TARGET_APP depuis l'App Store"
fi

# Instructions
echo ""
success "🎉 Déploiement terminé!"
echo ""
log "📱 App 'atome' installée sur l'iPad (icône visible)"
log "🔌 AUv3 'atome' disponible dans les apps musicales"
echo ""
log "📋 Pour utiliser l'AUv3 dans $TARGET_APP:"
echo "   1. Ajoutez l'AUv3 'atome' (bouton +)"
echo "   2. L'interface web s'affiche automatiquement"
echo "   3. Utilisez le switch Local/AUv3 Mode"
echo ""
log "🎛️  Interface: audio_swift.js avec boutons C4, A4, E5, Chord"

# Démarrer les logs iPad si demandé
if [ "$NO_LOGS" != true ]; then
    echo ""
    log "🎯 ÉTAPE IMPORTANTE:"
    log "1. Ouvrez $TARGET_APP sur l'iPad"
    log "2. Ajoutez l'AUv3 'atome' (bouton +)"
    log "3. Chargez l'interface web de l'AUv3"
    echo ""
    log "📱 Pour voir les logs en temps réel, utilisez Xcode :"
    echo ""
    log "🔧 MÉTHODE XCODE (recommandée) :"
    log "   • Ouvrez Xcode"
    log "   • Window → Devices and Simulators"
    log "   • Sélectionnez votre iPad"
    log "   • Cliquez sur 'Open Console'"
    log "   • Dans la barre de recherche, tapez : atome"
    echo ""
    log "💡 Cette méthode Xcode filtre automatiquement et fonctionne parfaitement !"
    echo ""
    log "✨ Ready to make music! Votre AUv3 est déployé et prêt."
else
    log "✨ Ready to make music!"
fi
