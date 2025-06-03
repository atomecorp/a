#!/bin/sh

# watcher.sh — Watch ./src and copy any changed file to ./test_app/src

# Check if watchexec is installed
if ! command -v watchexec >/dev/null 2>&1; then
  echo "🔍 watchexec not found, installing via cargo..."
  if ! command -v cargo >/dev/null 2>&1; then
    echo "❌ cargo is not installed. Please install Rust from https://rustup.rs"
    exit 1
  fi
  echo "📦 Installing watchexec-cli..."
  cargo install watchexec-cli
  
  # Verify installation was successful
  if ! command -v watchexec >/dev/null 2>&1; then
    echo "❌ Installation failed. Please check your cargo setup."
    exit 1
  fi
fi

echo "✅ watchexec is available."

# Check if source directory exists
if [ ! -d "./src" ]; then
  echo "❌ Source directory ./src does not exist!"
  exit 1
fi

# Create destination directory if it doesn't exist
mkdir -p ./test_app/src

echo "👀 Watching ./src for file changes..."
echo "🎯 Files will be copied to ./test_app/src/"
echo "🛑 Press Ctrl+C to stop watching"

# Initial sync
echo "🔄 Initial sync..."
rsync -av --delete ./src/ ./test_app/src/

# Watch for changes and sync
watchexec --watch ./src --no-vcs-ignore --no-default-ignore -- \
  sh -c 'echo "🔄 Syncing changes..."; rsync -av --delete ./src/ ./test_app/src/ && echo "✅ Sync complete"'