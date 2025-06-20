#!/bin/zsh
# Publie les fichiers CDN sur GitHub et affiche l'URL jsDelivr

set -e

cd "$(dirname "$0")"

# Vérifier la présence des fichiers
if [ ! -f squirrel.js ]; then
  echo "❌ squirrel.js introuvable dans $(pwd)"
  exit 1
fi

# Lire la version depuis src/version.json
VERSION=$(jq -r .version ../src/version.json 2>/dev/null || echo "")

# Ajouter et commit automatiquement
cd .. # remonter à la racine du projet
git add dist/squirrel.js dist/squirrel.min.js 2>/dev/null || true
if [ -f dist/publish-to-github.sh ]; then
  git add dist/publish-to-github.sh 2>/dev/null || true
fi
git status

MSG="CDN update"
git commit -m "$MSG" || echo "Aucun changement à commiter."
git push

# Créer un tag si version trouvée
if [ -n "$VERSION" ]; then
  git tag "$VERSION" || true
  git push origin "$VERSION" || true
  REF="$VERSION"
else
  # Déterminer la branche courante
  REF=$(git rev-parse --abbrev-ref HEAD)
fi

# Récupérer l'URL du repo
REPO_URL=$(git config --get remote.origin.url)
REPO_URL=${REPO_URL%.git}
REPO_URL=${REPO_URL#*github.com[:/]}

# Afficher les liens jsDelivr
CDN_URL="https://cdn.jsdelivr.net/gh/$REPO_URL@$REF/dist/squirrel.js"
CDN_URL_MIN="https://cdn.jsdelivr.net/gh/$REPO_URL@$REF/dist/squirrel.min.js"
echo "\nCDN jsDelivr prêt :"
echo "$CDN_URL"
echo "$CDN_URL_MIN"
