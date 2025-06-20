#!/bin/zsh
# Publie les fichiers CDN sur GitHub et affiche l'URL jsDelivr

set -e

cd "$(dirname "$0")"

# Vérifier la présence des fichiers
if [ ! -f squirrel.js ]; then
  echo "❌ squirrel.js introuvable dans $(pwd)"
  exit 1
fi

# Vérifier si --no-confirm est passé
NO_CONFIRM=false
for arg in "$@"; do
  if [[ "$arg" == "--no-confirm" ]]; then
    NO_CONFIRM=true
  fi
done

# Ajouter et commit automatiquement
cd .. # remonter à la racine du projet
git add dist/squirrel.js dist/squirrel.min.js 2>/dev/null || true
# Ajoute aussi le script de publication s'il est nouveau
if [ -f dist/publish-to-github.sh ]; then
    exit 0
  fi
fi

# Ajouter et commit
cd .. # remonter à la racine du projet
git add dist/squirrel.js dist/squirrel.min.js 2>/dev/null || true
git status
read "MSG?Message de commit (défaut: 'CDN update'): "
MSG=${MSG:-CDN update}
git commit -m "$MSG" || echo "Aucun changement à commiter."
git push

# Proposer un tag
read "TAG?Créer un tag pour jsDelivr (ex: v1.0.0) ? (laisser vide pour ignorer): "
if [ -n "$TAG" ]; then
  git tag "$TAG"
  git push origin "$TAG"
fi

# Demander l'utilisateur et le repo
read "GHUSER?Nom GitHub (user ou org): "
read "GHREPO?Nom du repo: "

if [ -n "$TAG" ]; then
  CDN_URL="https://cdn.jsdelivr.net/gh/$GHUSER/$GHREPO@$TAG/dist/squirrel.js"
  CDN_URL_MIN="https://cdn.jsdelivr.net/gh/$GHUSER/$GHREPO@$TAG/dist/squirrel.min.js"
else
  CDN_URL="https://cdn.jsdelivr.net/gh/$GHUSER/$GHREPO@main/dist/squirrel.js"
  CDN_URL_MIN="https://cdn.jsdelivr.net/gh/$GHUSER/$GHREPO@main/dist/squirrel.min.js"
fi

echo "\nCDN jsDelivr prêt :"
echo "$CDN_URL"
echo "$CDN_URL_MIN"
