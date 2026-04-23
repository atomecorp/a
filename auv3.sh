#!/bin/bash

# =============================================================================
# Script AUv3 - Compile, Déploie et Lance
# =============================================================================
# Usage:
#   ./auv3.sh                    # Par défaut: compile + déploie + lance AUm
#   ./auv3.sh --build-only       # Juste compiler (rapide)
#   ./auv3.sh --app NanoStudio    # Déploie et lance app spécifique
#   ./auv3.sh --app "Loopy Pro" --log  # Avec logs en temps réel
# =============================================================================

set -e

# Configuration
PROJECT_PATH="platforms/ios/atome-auv3/atome.xcodeproj"
SCHEME_NAME="atome"
DEFAULT_TARGET_APP="AUM"

# Fonction pour obtenir le bundle ID d'une app directement depuis l'iPad
get_real_bundle_id() {
    local app_name="$1"
    local device_id="$2"
    
    print_log "🔍 Recherche du bundle ID pour '$app_name' sur l'iPad..."
    
    # Utiliser devicectl pour lister les apps installées et chercher par nom
    if xcrun devicectl list devices &>/dev/null; then
        # Essayer de lister les apps installées
        local apps_output=$(xcrun devicectl device list apps --device "$device_id" 2>/dev/null || echo "")
        
        if [ ! -z "$apps_output" ]; then
            # Rechercher le bundle ID par nom d'app (insensible à la casse)
            local bundle_id=$(echo "$apps_output" | grep -i "$app_name" | head -1 | awk '{print $1}' || echo "")
            
            if [ ! -z "$bundle_id" ]; then
                print_log "✅ Bundle ID trouvé: $bundle_id"
                echo "$bundle_id"
                return 0
            fi
        fi
    fi
    
    # Fallback: utiliser la liste statique si disponible
    case "$app_name" in
        "AUM") echo "com.kymatica.AUM" ;;
        "NanoStudio") echo "com.blipinteractive.nanostudio" ;;
        "GarageBand") echo "com.apple.mobilegarageband" ;;
        "Cubasis") echo "com.steinberg.cubasis" ;;
        "BeatMaker") echo "com.intua.beatmaker3" ;;
        "Auria") echo "com.wavemachinelabs.auria-pro" ;;
        *) 
            warning "Bundle ID non trouvé pour '$app_name'"
            print_log "💡 L'app n'est peut-être pas installée ou le nom ne correspond pas exactement"
            echo ""
            ;;
    esac
}

# Fonction pour obtenir le bundle ID d'une app (OBSOLÈTE - gardée pour compatibilité)
get_bundle_id() {
    case "$1" in
        "AUM") echo "com.kymatica.AUM" ;;
        "NanoStudio") echo "co.uk.blipinteractive.NanoStudio2" ;;
        "GarageBand") echo "com.apple.mobilegarageband" ;;
        "Cubasis") echo "com.steinberg.cubasis" ;;
        "BeatMaker") echo "net.intua.beatmaker3" ;;
        "Auria") echo "com.wavemachinelabs.auria-pro" ;;
        "Loopy Pro") echo "com.atastypixel.Loopy-Pro" ;;
        "Logic Pro") echo "com.apple.mobilelogic" ;;
        *) echo "" ;;
    esac
}

# Liste des apps supportées
SUPPORTED_APPS="AUM NanoStudio GarageBand Cubasis BeatMaker Auria \"Loopy Pro\" \"Logic Pro\""

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
ENABLE_LOGS=false
LIST_APPS=false

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
        --log)
            ENABLE_LOGS=true
            shift
            ;;
        --list-apps)
            LIST_APPS=true
            shift
            ;;
        -h|--help)
            echo "🎵 Script AUv3 - Compile, Déploie et Lance"
            echo ""
            echo "Usage:"
            echo "  $0                         # Compile + déploie + lance AUm + logs"
            echo "  $0 --build-only            # Juste compiler (rapide)"
            echo "  $0 --app NanoStudio        # Lance app spécifique"
            echo "  $0 --app \"Loopy Pro\"       # Lance app avec espace (guillemets requis)"
            echo "  $0 --app \"Logic Pro\"       # Lance Logic Pro (guillemets requis)"
            echo "  $0 --app \"Loopy Pro\" --log # Lance Loopy Pro avec logs en temps réel"
            echo "  $0 --no-logs               # Sans affichage des logs iPad"
            echo "  $0 --all-logs              # Tous les logs iPad (non filtrés)"
            echo "  $0 --log                   # Active les logs Xcode en temps réel"
            echo "  $0 --list-apps             # Liste toutes les apps installées sur l'iPad"
            echo "  $0 --install-logs          # Installe les outils de logs (libimobiledevice)"
            echo ""
            echo "Apps supportées:"
            for app in $SUPPORTED_APPS; do
                echo "  - $app"
            done
            echo ""
            echo "💡 Pour les noms avec espaces, utilisez des guillemets :"
            echo "   ./auv3.sh --app \"Loopy Pro\""
            echo "   ./auv3.sh --app \"Logic Pro\""
            echo "   ./auv3.sh --app \"Loopy Pro\" --log  # Avec logs en temps réel"
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
print_log() {
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

# Fonction pour lister toutes les apps installées sur l'iPad
list_installed_apps() {
    local device_id="$1"
    
    print_log "📱 Liste de toutes les apps installées sur l'iPad:"
    echo ""
    
    # Méthode 1: Essayer avec devicectl
    if xcrun devicectl list devices &>/dev/null; then
        print_log "🔍 Essai avec devicectl..."
        
        local apps_output=$(xcrun devicectl device list apps --device "$device_id" 2>/dev/null)
        
        if [ ! -z "$apps_output" ]; then
            echo -e "${BLUE}==================== APPS INSTALLÉES (devicectl) ====================${NC}"
            echo "$apps_output" | head -50  # Limiter l'affichage
            echo ""
        else
            print_log "⚠️  devicectl list apps non disponible"
        fi
    fi
    
    # Méthode 2: Essayer avec libimobiledevice si installé
    if command -v ideviceinstaller &> /dev/null; then
        print_log "🔍 Utilisation de ideviceinstaller..."
        
        local apps_list=$(ideviceinstaller -u "$device_id" -l 2>/dev/null)
        
        if [ ! -z "$apps_list" ]; then
            echo -e "${BLUE}==================== APPS INSTALLÉES (ideviceinstaller) ====================${NC}"
            echo "Bundle ID                                    | Nom d'app"
            echo "============================================|=========================="
            
            echo "$apps_list" | grep -E "^[a-zA-Z0-9.-]+\.[a-zA-Z0-9.-]+" | while read line; do
                bundle_id=$(echo "$line" | awk '{print $1}')
                app_name=$(echo "$line" | cut -d' ' -f3- | sed 's/^[[:space:]]*//')
                
                # Montrer les apps qui pourraient être des apps musicales
                if [[ "$bundle_id" =~ (music|audio|sound|midi|synth|drum|loop|beat|mix|record|studio|aum|logic|garage|cubase|nano|auv3) ]] ||
                   [[ "$app_name" =~ (Music|Audio|Sound|MIDI|Synth|Drum|Loop|Beat|Mix|Record|Studio|AUM|Logic|Garage|Cubase|Nano|AUv3) ]]; then
                    printf "%-44s | %s\n" "$bundle_id" "$app_name"
                fi
            done
            echo ""
        else
            print_log "⚠️  ideviceinstaller non disponible ou échec"
        fi
    fi
    
    # Méthode 3: Essayer d'identifier les apps musicales courantes
    print_log "🔍 Test des apps musicales courantes..."
    echo -e "${BLUE}==================== APPS MUSICALES DÉTECTÉES ====================${NC}"
    
    local found_apps=false
    for test_app in "AUM" "GarageBand" "Logic" "Loopy" "Cubasis" "NanoStudio" "BeatMaker" "Auria Pro" "AudioBus" "Audiobus" "DJay" "Djay" "Music" "Audio" "Studio"; do
        print_log "   Recherche '$test_app'..."
        
        # Essayer de lancer l'app pour voir si elle existe (mode test)
        local test_result=$(xcrun devicectl device process launch --device "$device_id" --start-stopped --dry-run 2>/dev/null | grep -i "$test_app" || echo "")
        
        if [ ! -z "$test_result" ]; then
            print_log "   ✅ $test_app trouvé!"
            echo "$test_result"
            found_apps=true
        fi
    done
    
    if [ "$found_apps" = false ]; then
        print_log "❌ Aucune app musicale détectée automatiquement"
    fi
    
    echo ""
    print_log "💡 SOLUTIONS ALTERNATIVES:"
    print_log "1. Ouvrez Xcode → Window → Devices and Simulators"
    print_log "2. Sélectionnez votre iPad → Installed Apps"
    print_log "3. Cherchez les apps musicales et notez leurs noms exacts"
    echo ""
    print_log "🎵 Essayez avec des noms simples comme:"
    print_log "   ./auv3.sh --app \"AUM\""
    print_log "   ./auv3.sh --app \"GarageBand\""
    print_log "   ./auv3.sh --app \"Logic Pro\""
}

# Fonction pour démarrer les logs iPad
start_device_logs() {
    local device_id="$1"
    local device_name="$2"
    
    print_log "📱 Démarrage des logs iPad: $device_name"
    print_log "💡 Appuyez sur Ctrl+C pour arrêter les logs"
    
    # Méthode 1: libimobiledevice (la plus fiable)
    if command -v idevicesyslog &> /dev/null; then
        print_log "✅ Utilisation de idevicesyslog"
        
        if [ "$ALL_LOGS" = true ]; then
            print_log "🔍 Mode: TOUS les logs iPad"
            echo ""
            echo -e "${BLUE}==================== TOUS LES LOGS IPAD ====================${NC}"
            idevicesyslog -u "$device_id"
        else
            print_log "🔍 Filtrage AUv3 'atome' uniquement"
            echo ""
            echo -e "${BLUE}==================== LOGS AUv3 ATOME ====================${NC}"
            echo -e "${YELLOW}💡 Utilisez maintenant les boutons audio dans l'AUv3 pour voir les logs${NC}"
            echo ""
            idevicesyslog -u "$device_id" | grep --line-buffered -i -E "(atome|WebViewManager|AudioController|DebugLogger|🎵|📡|✅|❌|🔊)"
        fi
        return
    fi
    
    # Méthode 2: Installation automatique de libimobiledevice
    if command -v brew &> /dev/null; then
        print_log "🔧 Installation automatique de libimobiledevice..."
        print_log "💡 Cela peut prendre quelques minutes..."
        
        if brew install libimobiledevice &>/dev/null; then
            success "libimobiledevice installé avec succès!"
            print_log "🔄 Redémarrage des logs..."
            echo ""
            
            if [ "$ALL_LOGS" = true ]; then
                echo -e "${BLUE}==================== TOUS LES LOGS IPAD ====================${NC}"
                idevicesyslog -u "$device_id"
            else
                echo -e "${BLUE}==================== LOGS AUv3 ATOME ====================${NC}"
                echo -e "${YELLOW}💡 Utilisez maintenant les boutons audio dans l'AUv3 pour voir les logs${NC}"
                echo ""
                idevicesyslog -u "$device_id" | grep --line-buffered -i -E "(atome|WebViewManager|AudioController|DebugLogger|🎵|📡|✅|❌|🔊)"
            fi
            return
        else
            warning "Échec de l'installation automatique de libimobiledevice"
        fi
    fi
    
    # Méthode 3: Console système macOS (fallback)
    print_log "� Tentative d'utilisation de la Console système..."
    if command -v log &> /dev/null; then
        print_log "✅ Utilisation de la console système macOS"
        echo ""
        echo -e "${BLUE}==================== LOGS SYSTÈME (limités) ====================${NC}"
        echo -e "${YELLOW}💡 Ces logs peuvent être incomplets - utilisez Xcode Console pour plus de détails${NC}"
        echo ""
        
        # Utiliser log stream avec un filtre pour iOS
        log stream --predicate 'category CONTAINS "atome" OR subsystem CONTAINS "atome"' --style compact
        return
    fi
    
    # Méthode 4: Fallback - Instructions manuelles
    warning "Aucun outil de logs automatique disponible"
    echo ""
    print_log "📖 Pour voir les logs en temps réel, vous avez 3 options:"
    echo ""
    print_log "1️⃣  Installer libimobiledevice: ./auv3.sh --install-logs"
    print_log "2️⃣  Xcode → Window → Devices and Simulators → Console"
    print_log "3️⃣  Applications → Utilities → Console → Sélectionner iPad"
    echo ""
    print_log "💡 L'app est déployée et fonctionnelle, seuls les logs manquent"
}

# Fonction pour gérer l'arrêt propre
cleanup() {
    echo ""
    print_log "🛑 Arrêt des logs..."
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

# MODE LIST APPS - Lister toutes les apps installées
if [ "$LIST_APPS" = true ]; then
    print_log "📱 Recherche iPad pour lister les apps..."
    DEVICES=$(xcrun xctrace list devices | grep "iPad" | grep -v "Simulator" | grep -v "unavailable")
    
    if [ -z "$DEVICES" ]; then
        error "Aucun iPad connecté trouvé"
    fi
    
    DEVICE_ID=$(echo "$DEVICES" | head -1 | sed 's/.*(\([^)]*\)).*/\1/')
    DEVICE_NAME=$(echo "$DEVICES" | head -1 | sed 's/ (.*//')
    
    print_log "🎯 iPad trouvé: $DEVICE_NAME"
    
    # Lister toutes les apps
    list_installed_apps "$DEVICE_ID"
    exit 0
fi

# MODE INSTALL LOGS
if [ "$INSTALL_LOGS" = true ]; then
    print_log "🔧 Installation des outils de logs iPad..."
    
    if command -v brew &> /dev/null; then
        print_log "📦 Installation de libimobiledevice via Homebrew..."
        brew install libimobiledevice
        
        if [ $? -eq 0 ]; then
            success "Outils de logs installés!"
            print_log "💡 Vous pouvez maintenant utiliser: $0"
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
    print_log "🔨 Mode compilation seulement..."
    
    BUILD_OUTPUT=$(xcodebuild build -project "$PROJECT_PATH" -scheme "$SCHEME_NAME" -sdk iphonesimulator -configuration Debug 2>&1)
    
    if [ $? -eq 0 ]; then
        success "Compilation réussie!"
        print_log "💡 Pour déployer: $0"
    else
        error "Échec compilation:\n$BUILD_OUTPUT"
    fi
    exit 0
fi

# MODE COMPLET (par défaut)
print_log "🚀 Mode complet: Compile + Déploie + Lance $TARGET_APP"

# Trouver iPad
print_log "📱 Recherche iPad..."
DEVICES=$(xcrun xctrace list devices | grep "iPad" | grep -v "Simulator" | grep -v "unavailable")

if [ -z "$DEVICES" ]; then
    error "Aucun iPad connecté trouvé"
fi

DEVICE_ID=$(echo "$DEVICES" | head -1 | sed 's/.*(\([^)]*\)).*/\1/')
DEVICE_NAME=$(echo "$DEVICES" | head -1 | sed 's/ (.*//')

print_log "🎯 iPad trouvé: $DEVICE_NAME"

# Compilation et installation de l'app companion (obligatoire pour AUv3)
print_log "📲 Compilation et installation..."

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

print_log "📱 Installation sur iPad..."
INSTALL_OUTPUT=$(xcrun devicectl device install app --device "$DEVICE_ID" "$APP_PATH" 2>&1)

if [ $? -ne 0 ]; then
    error "Échec installation:\n$INSTALL_OUTPUT"
fi

print_log "✅ App companion 'atome' installée"
print_log "🔌 L'AUv3 est maintenant disponible dans les apps musicales"

# Nettoyer
rm -rf "/tmp/atome_build"

success "Installation complète (App + AUv3)"

# Lancement de l'app cible
print_log "🎵 Lancement de $TARGET_APP..."
sleep 2

# Utiliser la liste statique avec les vrais bundle IDs d'abord
TARGET_BUNDLE_ID=$(get_bundle_id "$TARGET_APP")

if [ -z "$TARGET_BUNDLE_ID" ]; then
    # Si pas trouvé dans la liste statique, essayer la recherche dynamique
    TARGET_BUNDLE_ID=$(get_real_bundle_id "$TARGET_APP" "$DEVICE_ID")
fi

if [ -z "$TARGET_BUNDLE_ID" ]; then
    warning "App '$TARGET_APP' non trouvée sur l'iPad"
    print_log "💡 Vérifiez que l'app est installée et que le nom est correct"
    print_log "📱 Apps musicales courantes : AUM, GarageBand, Cubasis, etc."
    print_log "🔍 Utilisez: ./auv3.sh --list-apps pour voir toutes les apps"
    exit 1
fi

# Essayer de lancer l'app
print_log "🔍 Tentative de lancement: $TARGET_BUNDLE_ID"
LAUNCH_OUTPUT=$(xcrun devicectl device process launch --device "$DEVICE_ID" "$TARGET_BUNDLE_ID" 2>&1)
if [ $? -eq 0 ]; then
    success "$TARGET_APP lancé!"
else
    warning "$TARGET_APP non installé ou impossible de lancer"
    print_log "💡 Installez $TARGET_APP depuis l'App Store"
    print_log "🔍 Erreur de lancement: $LAUNCH_OUTPUT"
fi

# Instructions
echo ""
success "🎉 Déploiement terminé!"
echo ""
print_log "📱 App 'atome' installée sur l'iPad (icône visible)"
print_log "🔌 AUv3 'atome' disponible dans les apps musicales"
echo ""
print_log "📋 Pour utiliser l'AUv3 dans $TARGET_APP:"
echo "   1. Ajoutez l'AUv3 'atome' (bouton +)"
echo "   2. L'interface web s'affiche automatiquement"
echo "   3. Utilisez le switch Local/AUv3 Mode"
echo ""
print_log "🎛️  Interface: audio_swift.js avec boutons C4, A4, E5, Chord"

# Démarrer les logs iPad si demandé
if [ "$ENABLE_LOGS" = true ]; then
    echo ""
    print_log "🎯 DÉMARRAGE DES LOGS EN TEMPS RÉEL"
    print_log "1. Ouvrez $TARGET_APP sur l'iPad"
    print_log "2. Ajoutez l'AUv3 'atome' (bouton +)"
    print_log "3. Chargez l'interface web de l'AUv3"
    echo ""
    print_log "📱 Logs en temps réel activés - appuyez sur Ctrl+C pour arrêter"
    echo ""
    
    # Démarrer les logs automatiquement
    start_device_logs "$DEVICE_ID" "$DEVICE_NAME"
    
elif [ "$NO_LOGS" != true ]; then
    echo ""
    print_log "🎯 ÉTAPE IMPORTANTE:"
    print_log "1. Ouvrez $TARGET_APP sur l'iPad"
    print_log "2. Ajoutez l'AUv3 'atome' (bouton +)"
    print_log "3. Chargez l'interface web de l'AUv3"
    echo ""
    print_log "📱 Pour voir les logs en temps réel, utilisez Xcode :"
    echo ""
    print_log "🔧 MÉTHODE XCODE (recommandée) :"
    print_log "   • Ouvrez Xcode"
    print_log "   • Window → Devices and Simulators"
    print_log "   • Sélectionnez votre iPad"
    print_log "   • Cliquez sur 'Open Console'"
    print_log "   • Dans la barre de recherche, tapez : atome"
    echo ""
    print_log "💡 Cette méthode Xcode filtre automatiquement et fonctionne parfaitement !"
    echo ""
    print_log "💡 Ou utilisez: ./auv3.sh --app \"$TARGET_APP\" --log pour les logs automatiques"
    echo ""
    print_log "✨ Ready to make music! Votre AUv3 est déployé et prêt."
else
    print_log "✨ Ready to make music!"
fi
