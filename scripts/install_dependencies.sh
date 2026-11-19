#!/bin/bash

# 📦 Node dependencies of the client and its build tools (the server is atome-server, Rust)
# Author: Squirrel Framework Team
# Date: $(date '+%Y-%m-%d')
# Enhanced: Smart version checking and updating

echo "📦 Installing Node dependencies for the Squirrel Framework client"
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
    print_warning "The client build tools need Node.js 18+"
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
echo "🛠️ DEVELOPMENT DEPENDENCIES (optional):"
echo "========================================"
echo "  🧪 ws@^8.18.2                  - WebSocket client for testing"
echo ""

echo "📚 EXISTING DEPENDENCIES (preserved):"
echo "===================================="
echo "  🔐 jsonwebtoken@^9.0.2         - JWT authentication (Android tooling, probes)"
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

# In non-interactive mode (production), skip clean install if dependencies exist
if [ "$INTERACTIVE" = false ] && [ -d "node_modules" ] && [ -f "node_modules/.package-lock.json" ]; then
    print_status "✅ Dependencies already installed, skipping clean install in production mode"
    print_status "Use --force to reinstall dependencies"
else
    # Clean npm cache (optional)
    print_status "Cleaning npm cache..."
    npm cache clean --force 2>/dev/null || true

    # Remove node_modules and package-lock.json for clean installation
    if [ -d "node_modules" ]; then
        print_status "Removing existing node_modules..."
        rm -rf node_modules || {
            print_warning "Could not remove node_modules (permission issue?)"
            print_status "Continuing with existing node_modules..."
        }
    fi

    if [ -f "package-lock.json" ]; then
        print_status "Removing existing package-lock.json..."
        rm -f package-lock.json || true
    fi
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

npm i -g terser

echo ""
print_success "🎉 Installation completed!"
echo ""
echo "📋 NEXT STEP: ./run.sh (atome-server on 3001 + Tauri)"
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
    if [ -d "platforms/desktop-tauri" ]; then
        print_status "Updating Rust dependencies..."
        cd platforms/desktop-tauri && cargo update && cd .. || print_warning "Cargo update failed"
    fi
else
    print_warning "⚠️ Rust/Cargo not installed. For desktop apps with Tauri:"
    echo "   Install Rust: https://rustup.rs/"
    echo "   Then run: cargo update in platforms/desktop-tauri/ folder"
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
echo "🏗️ BUILD TOOLS:"
show_version "rollup"
show_version "@rollup/plugin-node-resolve"

echo ""
echo "🖥️ DESKTOP:"
show_version "@tauri-apps/cli"

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
echo "    npm run build         - Production build (npm + CDN outputs)"
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
        ./scripts/run_fastify.sh
    fi
else
    print_status "🚀 Run 'npm run start:server' to start atome-server"
fi
