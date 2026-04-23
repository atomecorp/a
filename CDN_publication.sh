#!/bin/zsh
# Wrapper script to run both CDN and NPM publication flows

set -e

ROOT_DIR=$(cd "$(dirname "$0")" && pwd)

"$ROOT_DIR/scripts/publish-cdn.sh"
"$ROOT_DIR/scripts/publish-npm.sh"
"$ROOT_DIR/scripts/publish-to-github.sh"
