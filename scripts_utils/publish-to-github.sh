#!/bin/zsh
# Publishes CDN files to GitHub and displays the jsDelivr URL

set -e

cd "$(dirname "$0")"

# # Check for file presence
# if [ ! -f squirrel.js ]; then
#   echo "❌ squirrel.js not found in $(pwd)"
#   exit 1
# fi

# Read version from src/version.json
VERSION=$(jq -r .version ../src/version.json 2>/dev/null || echo "")

# Add and commit automatically
cd .. # go back to project root
git add dist/* 2>/dev/null || true
if [ -f scripts_utils/publish-to-github.sh ]; then
  git add scripts_utils/publish-to-github.sh 2>/dev/null || true
fi
git status

MSG="CDN update"
git commit -m "$MSG" || echo "No changes to commit."
git push

# Create a tag if version found
if [ -n "$VERSION" ]; then
  git tag "$VERSION" || true
  git push origin "$VERSION" || true
  REF="$VERSION"
else
  # Determine current branch
  REF=$(git rev-parse --abbrev-ref HEAD)
fi

# Get repo URL
REPO_URL=$(git config --get remote.origin.url)
REPO_URL=${REPO_URL%.git}
REPO_URL=${REPO_URL#*github.com[:/]}

# Display jsDelivr links
CDN_URL="https://cdn.jsdelivr.net/gh/$REPO_URL@$REF/dist/squirrel.js"
CDN_URL_MIN="https://cdn.jsdelivr.net/gh/$REPO_URL@$REF/dist/squirrel.min.js"
CDN_CSS="https://cdn.jsdelivr.net/gh/$REPO_URL@$REF/dist/squirrel.css"
echo "\nCDN jsDelivr ready:"
echo "$CDN_URL"
echo "$CDN_URL_MIN"
echo "$CDN_CSS"
