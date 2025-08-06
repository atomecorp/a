#!/bin/bash

# =============================================================================
# Script AUv3 - Compile, Déploie et Lance AUm
# =============================================================================
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
        -h|--help)
            echo "🎵 Script AUv3 - Compile, Déploie et Lance"
            echo ""
            echo "Usage:"
            echo "  $0                         # Compile + déploie + lance AUm"
            echo "  $0 --build-only            # Juste compiler (rapide)"
            echo "  $0 --app NanoStudio        # Lance app spécifique"
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

# Vérifications
if ! command -v xcodebuild &> /dev/null; then
    error "Xcode command line tools requis"
fi

if [ ! -d "$PROJECT_PATH" ]; then
    error "Projet non trouvé: $PROJECT_PATH"
fi

cd "$(dirname "$0")"

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
log "✨ Ready to make music!"
