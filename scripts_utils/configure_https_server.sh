#!/bin/bash
#
# configure_https_server.sh
# -------------------------
# Automatise l'obtention d'un certificat Let's Encrypt pour atome.one
# et configure le projet pour l'utiliser.
#
# Usage: sudo ./scripts_utils/configure_https_server.sh

set -e

DOMAIN="atome.one"
PROJECT_ROOT="$(pwd)"
CERT_DIR="$PROJECT_ROOT/scripts_utils/certs"

# Couleurs
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_ok() { echo -e "${GREEN}✅ $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

# Vérification root
if [ "$EUID" -ne 0 ]; then
  log_error "Ce script doit être exécuté en tant que root (sudo)."
  exit 1
fi

# 1. Installation de Certbot
log_info "Installation de Certbot..."
if command -v apt-get >/dev/null; then
    apt-get update
    apt-get install -y certbot
elif command -v yum >/dev/null; then
    yum install -y certbot
else
    log_error "Gestionnaire de paquets non supporté (ni apt, ni yum)."
    exit 1
fi

# 2. Demande de l'email pour Let's Encrypt
read -p "Entrez votre email pour les notifications de renouvellement (ex: admin@atome.one): " EMAIL
if [ -z "$EMAIL" ]; then
    log_error "L'email est obligatoire."
    exit 1
fi

# 3. Génération du certificat
log_info "Génération du certificat pour $DOMAIN..."
# On utilise --standalone, ce qui nécessite que le port 80 soit libre.
# Si un serveur tourne déjà sur le 80, il faudra l'arrêter avant.
if lsof -Pi :80 -sTCP:LISTEN -t >/dev/null ; then
    log_info "⚠️  Le port 80 semble occupé. Tentative d'arrêt des services web standards..."
    systemctl stop nginx 2>/dev/null || true
    systemctl stop apache2 2>/dev/null || true
fi

certbot certonly --standalone \
  --non-interactive \
  --agree-tos \
  --email "$EMAIL" \
  -d "$DOMAIN"

LE_LIVE_DIR="/etc/letsencrypt/live/$DOMAIN"

if [ ! -d "$LE_LIVE_DIR" ]; then
    log_error "Échec de la génération du certificat."
    exit 1
fi

log_ok "Certificat généré avec succès dans $LE_LIVE_DIR"

# 4. Installation des certificats dans le projet
log_info "Configuration des certificats pour le serveur Node..."

mkdir -p "$CERT_DIR"

# Sauvegarde des anciens certificats (auto-signés) si présents
if [ -f "$CERT_DIR/key.pem" ] && [ ! -L "$CERT_DIR/key.pem" ]; then
    mv "$CERT_DIR/key.pem" "$CERT_DIR/key.pem.selfsigned.bak"
    mv "$CERT_DIR/cert.pem" "$CERT_DIR/cert.pem.selfsigned.bak"
    log_info "Anciens certificats auto-signés sauvegardés (.bak)"
fi

# Copie des certificats (pour éviter les problèmes de permissions avec les liens symboliques vers /etc/letsencrypt)
# Note: Idéalement, on utiliserait un hook de renouvellement pour recopier ces fichiers.
# On va créer le hook maintenant et l'utiliser pour la copie initiale.

# Ajustement des permissions pour que l'utilisateur non-root puisse les lire
# On suppose que l'utilisateur propriétaire du dossier courant est celui qui lance le serveur
OWNER_UID=$(stat -c '%u' "$PROJECT_ROOT")
OWNER_GID=$(stat -c '%g' "$PROJECT_ROOT")

# 5. Création d'un script de renouvellement automatique
HOOK_SCRIPT="/opt/a/scripts_utils/renew_cert_hook.sh"
cat > "$HOOK_SCRIPT" <<EOF
#!/bin/bash
# Hook exécuté après le renouvellement Certbot
cp "$LE_LIVE_DIR/privkey.pem" "$CERT_DIR/key.pem"
cp "$LE_LIVE_DIR/fullchain.pem" "$CERT_DIR/cert.pem"
chown $OWNER_UID:$OWNER_GID "$CERT_DIR/key.pem" "$CERT_DIR/cert.pem"
chmod 600 "$CERT_DIR/key.pem"
chmod 644 "$CERT_DIR/cert.pem"
# Redémarrage du serveur si nécessaire (à adapter selon votre gestionnaire de processus, ex: pm2)
# pm2 restart atome-server 2>/dev/null || true
EOF
chmod +x "$HOOK_SCRIPT"

log_info "Script de hook créé : $HOOK_SCRIPT"

# Exécution immédiate du hook pour installer les certificats
log_info "Exécution du hook pour installer les certificats..."
"$HOOK_SCRIPT"

log_ok "Certificats installés dans $CERT_DIR"
log_info "Pour automatiser le renouvellement, ajoutez ce hook à la configuration certbot ou cron."

log_ok "✅ Configuration HTTPS terminée pour $DOMAIN !"
echo "Vous pouvez maintenant lancer ./run_server_only.sh"
