#!/usr/bin/env bash
# filepath: run_server_only.sh
set -e

BLUE='\033[0;34m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}🌱 Loading environment variables...${NC}"
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

# Ensure SQUIRREL_UPLOADS_DIR is set
if [ -z "$SQUIRREL_UPLOADS_DIR" ]; then
  # Default path matching run.sh configuration
  export SQUIRREL_UPLOADS_DIR="$(pwd)/src/assets/uploads"
  echo -e "${BLUE}ℹ️  SQUIRREL_UPLOADS_DIR not set. Defaulting to: $SQUIRREL_UPLOADS_DIR${NC}"
  mkdir -p "$SQUIRREL_UPLOADS_DIR"
fi

# Ensure SQUIRREL_MONITORED_DIR is set (to silence warnings)
if [ -z "$SQUIRREL_MONITORED_DIR" ]; then
  # Default path matching run.sh configuration
  export SQUIRREL_MONITORED_DIR="/Users/Shared/monitored"
  # On Linux server, adapt if needed, or just keep it to silence the warning
  if [[ "$OSTYPE" == "linux-gnu"* ]]; then
     export SQUIRREL_MONITORED_DIR="/tmp/monitored"
  fi
  mkdir -p "$SQUIRREL_MONITORED_DIR"
fi

# HTTPS Setup
if [ -f "scripts_utils/certs/key.pem" ] && [ -f "scripts_utils/certs/cert.pem" ]; then
  echo -e "${GREEN}✅ Using production certificates from scripts_utils/certs/${NC}"
elif [ -f "certs/key.pem" ] && [ -f "certs/cert.pem" ]; then
  echo -e "${GREEN}✅ Using existing certificates from certs/${NC}"
else
  echo -e "${BLUE}🔐 No certificates found. Generating self-signed SSL certificates...${NC}"
  ./scripts_utils/generate_cert.sh
fi
export USE_HTTPS=true

echo -e "${BLUE}🚀 Starting Fastify Server (Node.js only)...${NC}"

# Détection du point d'entrée du serveur avec plus de chemins possibles
if [ -f "server.js" ]; then
  echo -e "${GREEN}✅ Found server.js${NC}"
  node server.js
elif [ -f "src/server.js" ]; then
  echo -e "${GREEN}✅ Found src/server.js${NC}"
  node src/server.js
elif [ -f "server/server.js" ]; then
  echo -e "${GREEN}✅ Found server/server.js${NC}"
  node server/server.js
elif [ -f "src/server/index.js" ]; then
  echo -e "${GREEN}✅ Found src/server/index.js${NC}"
  node src/server/index.js
elif [ -f "server/index.js" ]; then
  echo -e "${GREEN}✅ Found server/index.js${NC}"
  node server/index.js
elif [ -f "app.js" ]; then
  echo -e "${GREEN}✅ Found app.js${NC}"
  node app.js
else
  echo -e "${BLUE}⚠️  Fichier serveur principal non trouvé via les chemins standards.${NC}"
  echo -e "${BLUE}Tentative via npm scripts...${NC}"

  # Vérifie les scripts disponibles avant de lancer
  # On utilise || true pour éviter que le script s'arrête si grep ne trouve rien
  if npm run 2>/dev/null | grep -q "server"; then
    echo -e "${GREEN}✅ Running 'npm run server'${NC}"
    npm run server
  elif npm run 2>/dev/null | grep -q "start"; then
    echo -e "${GREEN}✅ Running 'npm start'${NC}"
    npm start
  elif npm run 2>/dev/null | grep -q "dev"; then
    echo -e "${GREEN}✅ Running 'npm run dev'${NC}"
    npm run dev
  else
    echo -e "${RED}❌ Erreur : Impossible de trouver le fichier serveur.${NC}"
    echo "   Veuillez vérifier que votre code serveur est bien dans 'server/server.js', 'src/server.js' ou 'server.js'."
    exit 1
  fi
fi
