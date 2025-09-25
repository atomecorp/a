#!/bin/zsh
# Wrapper script to run both CDN and NPM publication flows

set -e

ROOT_DIR=$(cd "$(dirname "$0")" && pwd)

"$ROOT_DIR/scripts_utils/publish-cdn.sh"
"$ROOT_DIR/scripts_utils/publish-npm.sh"
"$ROOT_DIR/scripts_utils/publish-to-github.sh"
