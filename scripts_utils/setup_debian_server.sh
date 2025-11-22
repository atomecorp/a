#!/bin/bash
#
# setup_debian_server.sh
# ----------------------
# Script d'installation automatique pour serveur Debian/Ubuntu.
# Installe PostgreSQL, configure la base de données 'squirrel' pour Atome,
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
apt-get install -y curl build-essential git

# --- 2. Installation de PostgreSQL ---
if ! command -v psql >/dev/null 2>&1; then
  log_info "Installation de PostgreSQL..."
  apt-get install -y postgresql postgresql-contrib
  systemctl enable postgresql
  systemctl start postgresql
  log_ok "PostgreSQL installé."
else
  log_ok "PostgreSQL est déjà installé."
fi

# --- 3. Configuration de la Base de Données Atome ---
DB_NAME="squirrel"
DB_USER="postgres"
DB_PASS="postgres" # Mot de passe par défaut défini dans server_install.sh

log_info "Configuration de PostgreSQL pour Atome..."

# On s'assure que le service tourne
systemctl start postgresql

# Configuration du mot de passe de l'utilisateur postgres
# Note: Sur une install par défaut Debian, l'utilisateur système 'postgres' peut se connecter sans mot de passe via socket peer.
# Nous forçons le mot de passe pour permettre la connexion via TCP/IP (localhost) si nécessaire par l'app.
log_info "Configuration du mot de passe utilisateur '$DB_USER'..."
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD '$DB_PASS';"

# Création de la base de données si elle n'existe pas
if sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
    log_info "La base de données '$DB_NAME' existe déjà."
else
    log_info "Création de la base de données '$DB_NAME'..."
    sudo -u postgres createdb "$DB_NAME"
    log_ok "Base de données '$DB_NAME' créée."
fi

# --- 4. Installation de Node.js (LTS) ---
if ! command -v node >/dev/null 2>&1; then
  log_info "Installation de Node.js LTS..."
  # Utilisation du script officiel NodeSource
  curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
  apt-get install -y nodejs
  log_ok "Node.js installé: $(node -v)"
else
  log_ok "Node.js est déjà installé: $(node -v)"
fi

# --- 5. Installation des dépendances du projet ---
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
  
  # Création du fichier .env si nécessaire avec les infos de la DB locale
  if [ ! -f ".env" ]; then
      log_info "Création du fichier .env..."
      echo "ADOLE_PG_DSN=postgres://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME" > .env
      chmod 600 .env
      log_ok "Fichier .env créé."
  fi
else
  log_error "Fichier package.json introuvable dans $PROJECT_ROOT."
fi

log_ok "✅ Installation terminée avec succès !"
echo "-----------------------------------------------------"
echo "Serveur prêt."
echo "Base de données : $DB_NAME"
echo "Utilisateur     : $DB_USER"
echo "Mot de passe    : $DB_PASS"
echo "-----------------------------------------------------"
echo "Pour lancer le serveur :"
echo "cd $PROJECT_ROOT"
echo "npm start (ou la commande de démarrage appropriée)"
