#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
THIRD_PARTY_DIR="$REPO_DIR/third_party"
IPLUG_DIR="$THIRD_PARTY_DIR/iPlug2"
VERSION_FILE="$THIRD_PARTY_DIR/iplug2.version"

REPO_URL=${IPLUG2_GIT_REPO:-https://github.com/iPlug2/iPlug2.git}
REF=${IPLUG2_GIT_TAG:-HEAD}

mkdir -p "$THIRD_PARTY_DIR"

if [ ! -d "$IPLUG_DIR/.git" ]; then
  echo "Cloning iPlug2..."
  git clone --depth=1 "$REPO_URL" "$IPLUG_DIR"
else
  echo "Updating iPlug2..."
  git -C "$IPLUG_DIR" fetch --tags --depth=1 origin
fi

git -C "$IPLUG_DIR" checkout -q "$REF"
SHA=$(git -C "$IPLUG_DIR" rev-parse HEAD)

echo "$SHA" > "$VERSION_FILE"

echo "iPlug2 at $SHA"
