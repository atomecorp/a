#!/bin/zsh
# Helper wrapper for the Node-based package builder

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
NODE_BIN=${NODE_BIN:-node}

"$NODE_BIN" "$SCRIPT_DIR/scripts_utils/package-app.js"
