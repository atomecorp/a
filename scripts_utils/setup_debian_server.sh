#!/bin/bash
#
# setup_debian_server.sh
# ----------------------
# Script d'installation automatique pour serveur Debian/Ubuntu.
# Installe SQLite3, configure la base de données ADOLE pour Atome,
# installe Node.js et les dépendances du projet.
#
# Usage: sudo ./setup_debian_server.sh

set -e

# Couleurs pour les logs
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_ok() { echo -e "${GREEN}✅ $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

# Vérification root
if [ "$EUID" -ne 0 ]; then
  log_error "Ce script doit être exécuté en tant que root (utilisez sudo)."
  exit 1
fi

# --- 1. Mise à jour du système ---
log_info "Mise à jour des paquets système..."
apt-get update && apt-get upgrade -y
apt-get install -y curl build-essential git sqlite3

# --- 2. Vérification de SQLite ---
if command -v sqlite3 >/dev/null 2>&1; then
  log_ok "SQLite3 installé: $(sqlite3 --version | head -1)"
else
  log_error "Échec de l'installation de SQLite3"
  exit 1
fi

# --- 3. Installation de Node.js (LTS) ---
if ! command -v node >/dev/null 2>&1; then
  log_info "Installation de Node.js LTS..."
  # Utilisation du script officiel NodeSource
  curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
  apt-get install -y nodejs
  log_ok "Node.js installé: $(node -v)"
else
  log_ok "Node.js est déjà installé: $(node -v)"
fi

# --- 4. Installation des dépendances du projet ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Si le script est dans scripts_utils/, on remonte d'un cran. Sinon on assume être à la racine.
if [[ "$(basename "$SCRIPT_DIR")" == "scripts_utils" ]]; then
    PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
else
    PROJECT_ROOT="$SCRIPT_DIR"
fi

log_info "Installation des dépendances du projet dans $PROJECT_ROOT..."

if [ -f "$PROJECT_ROOT/package.json" ]; then
  cd "$PROJECT_ROOT"
  
  # MODIFICATION : Utilisation du script dédié 'install_server.sh' s'il existe
  # Cela permet d'installer uniquement la stack serveur et de configurer la DB automatiquement
  if [ -f "install_server.sh" ]; then
      log_info "🚀 Détection de install_server.sh : Installation de la version Server Only..."
      chmod +x install_server.sh
      # Le script install_server.sh gère les dépendances NPM et la config .env/DB
      ./install_server.sh
  else
      log_info "⚠️ install_server.sh non trouvé. Installation standard NPM..."
      npm install --unsafe-perm
  fi
  
  log_ok "Dépendances NPM installées."
  
  # Création du fichier .env si nécessaire avec le chemin SQLite
  if [ ! -f ".env" ]; then
      log_info "Création du fichier .env..."
      echo "SQLITE_PATH=$PROJECT_ROOT/database_storage/adole.db" > .env
      chmod 600 .env
      log_ok "Fichier .env créé."
  fi
else
  log_error "Fichier package.json introuvable dans $PROJECT_ROOT."
fi

log_ok "✅ Installation terminée avec succès !"
echo "-----------------------------------------------------"
echo "Serveur prêt."
echo "Base de données : SQLite ($PROJECT_ROOT/database_storage/adole.db)"
echo "-----------------------------------------------------"
echo ""
echo "Pour utiliser libSQL/Turso en production, ajoutez à .env:"
echo "  LIBSQL_URL=libsql://your-database.turso.io"
echo "  LIBSQL_AUTH_TOKEN=your_auth_token"
echo ""
echo "Pour lancer le serveur :"
echo "cd $PROJECT_ROOT"
echo "npm start (ou la commande de démarrage appropriée)"
