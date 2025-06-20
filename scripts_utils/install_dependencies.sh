#!/bin/bash

# 🚀 Fastify v5 Server Dependencies Installation Script
# Author: Squirrel Framework Team
# Date: $(date '+%Y-%m-%d')
# Enhanced: Smart version checking and updating

echo "📦 Installing dependencies for Fastify v5 Server + Squirrel Framework"
echo "====================================================================="
echo ""

# Parse command line arguments
FORCE_UPDATE=false
INTERACTIVE=true

while [[ $# -gt 0 ]]; do
    case $1 in
        --force|-f)
            FORCE_UPDATE=true
            shift
            ;;
        --non-interactive|-n)
            INTERACTIVE=false
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  -f, --force            Force update all packages to latest versions"
            echo "  -n, --non-interactive  Run without prompts"
            echo "  -h, --help            Show this help message"
            echo ""
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Colors for messages
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to display colored messages
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Prerequisites verification
print_status "Checking prerequisites..."

# Check Node.js
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed!"
    print_status "Please install Node.js version 18+ from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node --version)
print_success "Node.js found: $NODE_VERSION"

# Check npm
if ! command -v npm &> /dev/null; then
    print_error "npm is not installed!"
    exit 1
fi

NPM_VERSION=$(npm --version)
print_success "npm found: $NPM_VERSION"

# Check minimum Node.js version (18+)
NODE_MAJOR_VERSION=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR_VERSION" -lt 18 ]; then
    print_warning "Node.js version $NODE_VERSION detected"
    print_warning "Fastify v5 recommends Node.js 18+ for better performance"
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo ""
print_status "Working directory: $(pwd)"
echo ""

# Check if package.json exists
if [ ! -f "package.json" ]; then
    print_error "package.json not found!"
    print_status "Make sure you're in the project root directory."
    exit 1
fi

# Display dependencies to be installed
echo "🔧 PRODUCTION DEPENDENCIES (required):"
echo "======================================"
echo "  ✅ fastify@^5.4.0              - Ultra-fast web framework"
echo "  ✅ @fastify/cors@^11.0.1       - CORS management"
echo "  ✅ @fastify/static@^8.0.1      - Static file server"
echo "  ✅ @fastify/websocket@^11.0.0  - Native WebSocket"
echo ""

echo "🛠️ DEVELOPMENT DEPENDENCIES (optional):"
echo "========================================"
echo "  📋 pino-pretty@^13.0.0         - Formatted logs (recommended)"
echo "  🧪 ws@^8.18.2                  - WebSocket client for testing"
echo ""

echo "📚 EXISTING DEPENDENCIES (preserved):"
echo "===================================="
echo "  🔐 jsonwebtoken@^9.0.2         - JWT authentication"
echo "  🗄️ sequelize@^6.37.1           - Database ORM"
echo "  💾 sqlite3@^5.1.6              - SQLite driver"
echo "  🎵 wavesurfer.js@^7.9.5        - Audio visualization"
echo ""

# Ask for confirmation
if [ "$INTERACTIVE" = true ]; then
    read -p "📥 Install dependencies? (Y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Nn]$ ]]; then
        print_warning "Installation cancelled."
        exit 0
    fi
else
    print_status "📥 Running in non-interactive mode, proceeding with installation..."
fi

# Clean npm cache (optional)
print_status "Cleaning npm cache..."
npm cache clean --force 2>/dev/null || true

# Remove node_modules and package-lock.json for clean installation
if [ -d "node_modules" ]; then
    print_status "Removing existing node_modules..."
    rm -rf node_modules
fi

if [ -f "package-lock.json" ]; then
    print_status "Removing existing package-lock.json..."
    rm -f package-lock.json
fi

# Install dependencies
print_status "Installing npm dependencies..."
echo ""

# Install with npm install
if npm install; then
    print_success "✅ Installation successful!"
else
    print_error "❌ Installation failed!"
    print_status "Trying with --legacy-peer-deps..."
    
    if npm install --legacy-peer-deps; then
        print_success "✅ Installation successful with --legacy-peer-deps"
    else
        print_error "❌ Complete installation failure!"
        exit 1
    fi
fi

echo ""

# Check that critical dependencies are installed
print_status "Checking critical dependencies..."

CRITICAL_DEPS=("fastify" "@fastify/cors" "@fastify/static" "@fastify/websocket")
MISSING_DEPS=()

for dep in "${CRITICAL_DEPS[@]}"; do
    if [ ! -d "node_modules/$dep" ]; then
        MISSING_DEPS+=("$dep")
    fi
done

if [ ${#MISSING_DEPS[@]} -eq 0 ]; then
    print_success "✅ All critical dependencies are installed!"
else
    print_error "❌ Missing dependencies: ${MISSING_DEPS[*]}"
    exit 1
fi

# Display information about installed packages
echo ""
print_status "📊 Installed packages information:"
echo ""

echo "🚀 SERVER:"
npm list fastify 2>/dev/null | head -2 || echo "  fastify: ❌ Not installed"

echo ""
echo "🔌 FASTIFY PLUGINS:"
npm list @fastify/cors @fastify/static @fastify/websocket 2>/dev/null | head -4 || echo "  Plugins: ❌ Installation problem"

echo ""
echo "🛠️ DEVELOPMENT:"
npm list pino-pretty ws 2>/dev/null | head -3 || echo "  Dev deps: ⚠️ Partially installed"

npm i -g terser

# Test module import capability
echo ""
print_status "🧪 Testing critical module imports..."

# Test Fastify
if node -e "import('fastify').then(() => console.log('✅ Fastify importable')).catch(() => console.log('❌ Fastify import error'))" 2>/dev/null; then
    true
else
    print_warning "Potential problem with Fastify import"
fi

# Test plugins
for plugin in "@fastify/cors" "@fastify/static" "@fastify/websocket"; do
    if node -e "import('$plugin').then(() => console.log('✅ $plugin importable')).catch(() => console.log('❌ $plugin import error'))" 2>/dev/null; then
        true
    else
        print_warning "Potential problem with $plugin"
    fi
done

echo ""
print_success "🎉 Installation completed!"
echo ""

# Final instructions
echo "📋 NEXT STEPS:"
echo "=============="
echo ""
echo "1️⃣  Start the server:"
echo "    cd server && node server.js"
echo "    # or"
echo "    ./run_fastify.sh"
echo ""
echo "2️⃣  Test endpoints:"
echo "    🌐 Frontend:     http://localhost:3000/"
echo "    ❤️  Health:      http://localhost:3000/health"
echo "    🧪 API Test:     http://localhost:3000/api/test"
echo "    🎮 Demo WS:      http://localhost:3000/server/websocket-demo.html"
echo ""
echo "3️⃣  Native WebSocket:"
echo "    🔌 Echo:         ws://localhost:3000/ws"
echo "    📡 Events:       ws://localhost:3000/ws/events"
echo ""
echo "4️⃣  Test WebSocket Node.js:"
echo "    cd server && node test-websocket.js"
echo ""

print_success "🚀 Fastify v5 Server ready to start!"
echo ""

# AJOUT: Installation des dépendances manquantes pour Squirrel Framework complet
echo ""
print_status "🐿️ Checking and updating Squirrel Framework dependencies..."
echo ""

# Fonction pour vérifier et installer/mettre à jour une dépendance
check_and_install() {
    local package=$1
    local dev_flag=$2
    
    # Récupérer la version installée
    local installed_version=""
    if [ -d "node_modules/$package" ]; then
        installed_version=$(npm list "$package" --depth=0 2>/dev/null | grep "$package" | sed -n 's/.*@\([^[:space:]]*\).*/\1/p' | head -1)
    fi
    
    # Récupérer la dernière version disponible
    local latest_version=$(npm view "$package" version 2>/dev/null)
    
    if [ -z "$installed_version" ]; then
        print_status "📦 Installing $package@$latest_version..."
        if [ "$dev_flag" = "--save-dev" ]; then
            npm install --save-dev "$package@$latest_version" 2>/dev/null || print_warning "Failed to install $package"
        else
            npm install "$package@$latest_version" 2>/dev/null || print_warning "Failed to install $package"
        fi
    elif [ "$FORCE_UPDATE" = true ] || [ "$installed_version" != "$latest_version" ]; then
        if [ "$FORCE_UPDATE" = true ]; then
            print_status "🔄 Force updating $package: $installed_version → $latest_version"
        else
            print_status "🔄 Updating $package: $installed_version → $latest_version"
        fi
        if [ "$dev_flag" = "--save-dev" ]; then
            npm install --save-dev "$package@$latest_version" 2>/dev/null || print_warning "Failed to update $package"
        else
            npm install "$package@$latest_version" 2>/dev/null || print_warning "Failed to update $package"
        fi
    else
        print_success "✅ $package@$installed_version (up to date)"
    fi
}

# Fonction pour vérifier et installer plusieurs packages
install_packages() {
    local dev_flag=$1
    shift
    local packages=("$@")
    
    for package in "${packages[@]}"; do
        check_and_install "$package" "$dev_flag"
    done
}

print_status "🗄️ Checking database dependencies..."
PRODUCTION_DB_DEPS=("knex" "objection")
install_packages "" "${PRODUCTION_DB_DEPS[@]}"

print_status "🏗️ Checking build tools..."
BUILD_DEPS=("rollup" "@rollup/plugin-node-resolve")
install_packages "--save-dev" "${BUILD_DEPS[@]}"

print_status "🖥️ Checking desktop app dependencies..."
DESKTOP_DEPS=("@tauri-apps/cli")
install_packages "--save-dev" "${DESKTOP_DEPS[@]}"

# Vérifier les dépendances optionnelles manquantes
if [ "$INTERACTIVE" = true ]; then
    print_status "🔍 Checking optional dependencies..."
    OPTIONAL_DEPS=("nodemon" "concurrently" "cross-env")
    for dep in "${OPTIONAL_DEPS[@]}"; do
        if ! npm list "$dep" --depth=0 &>/dev/null; then
            read -p "📦 Install optional $dep? (y/N): " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                check_and_install "$dep" "--save-dev"
            fi
        else
            check_and_install "$dep" "--save-dev"
        fi
    done
else
    print_status "🔍 Checking optional dependencies (non-interactive mode)..."
    OPTIONAL_DEPS=("nodemon" "concurrently" "cross-env")
    for dep in "${OPTIONAL_DEPS[@]}"; do
        if npm list "$dep" --depth=0 &>/dev/null; then
            check_and_install "$dep" "--save-dev"
        else
            print_status "⏭️ Skipping optional dependency: $dep"
        fi
    done
fi

echo ""
print_status "🦀 Checking Rust/Cargo for Tauri desktop apps..."
if command -v cargo &> /dev/null; then
    print_success "✅ Rust/Cargo is installed"
    if [ -d "src-tauri" ]; then
        print_status "Updating Rust dependencies..."
        cd src-tauri && cargo update && cd .. || print_warning "Cargo update failed"
    fi
else
    print_warning "⚠️ Rust/Cargo not installed. For desktop apps with Tauri:"
    echo "   Install Rust: https://rustup.rs/"
    echo "   Then run: cargo update in src-tauri/ folder"
fi

echo ""
print_status "🐍 Checking Python for development server..."
if command -v python3 &> /dev/null; then
    print_success "✅ Python3 installed (for local dev server)"
elif command -v python &> /dev/null; then
    print_success "✅ Python installed (for local dev server)"
else
    print_warning "⚠️ Python not installed. Some dev scripts won't work."
fi

echo ""
print_success "🎉 Complete Squirrel Framework installation finished!"

# Afficher un résumé des versions installées
echo ""
print_status "📊 INSTALLED VERSIONS SUMMARY:"
echo "==============================="

# Fonction pour afficher la version d'un package
show_version() {
    local package=$1
    local version=$(npm list "$package" --depth=0 2>/dev/null | grep "$package" | sed -n 's/.*@\([^[:space:]]*\).*/\1/p' | head -1)
    if [ -n "$version" ]; then
        echo "  ✅ $package@$version"
    else
        echo "  ❌ $package (not installed)"
    fi
}

echo ""
echo "🚀 SERVER & API:"
show_version "fastify"
show_version "@fastify/cors"
show_version "@fastify/static"
show_version "@fastify/websocket"

echo ""
echo "🗄️ DATABASE:"
show_version "knex"
show_version "objection"
show_version "sequelize"
show_version "sqlite3"

echo ""
echo "🏗️ BUILD TOOLS:"
show_version "rollup"
show_version "@rollup/plugin-node-resolve"

echo ""
echo "🖥️ DESKTOP:"
show_version "@tauri-apps/cli"

echo ""
echo "🎵 MEDIA:"
show_version "wavesurfer.js"

echo ""
echo "🔐 SECURITY:"
show_version "jsonwebtoken"

# Vérifier les versions Node.js et npm
echo ""
echo "🔧 ENVIRONMENT:"
echo "  ✅ Node.js: $(node --version)"
echo "  ✅ npm: $(npm --version)"
if command -v cargo &> /dev/null; then
    echo "  ✅ Rust: $(rustc --version 2>/dev/null | cut -d' ' -f2)"
else
    echo "  ⚠️ Rust: Not installed"
fi
echo ""
echo "📋 ADDITIONAL SQUIRREL COMMANDS:"
echo "==============================="
echo ""
echo "🏗️  Build commands:"
echo "    npm run build         - Production build"
echo "    npm run build:cdn     - CDN bundle"
echo "    npm run build:npm     - NPM package"
echo ""
echo "🚀 Development:"
echo "    npm run dev           - Development mode"
echo "    npm run serve         - Local static server"
echo "    npm run tauri:dev     - Desktop app (requires Rust)"
echo ""
echo "🎮 Testing:"
echo "    npm run start:server  - API server only"
echo "    npm run perf          - Performance testing"
echo ""

# Offer to start the server
if [ "$INTERACTIVE" = true ]; then
    read -p "🚀 Start the server now? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_status "Starting server..."
        echo ""
        cd server && node server.js
    fi
else
    print_status "🚀 Run 'cd server && node server.js' to start the server"
fi