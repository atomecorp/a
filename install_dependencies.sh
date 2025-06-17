#!/bin/bash

# 🚀 Fastify v5 Server Dependencies Installation Script
# Author: Squirrel Framework Team
# Date: $(date '+%Y-%m-%d')

echo "📦 Installing dependencies for Fastify v5 Server"
echo "================================================"
echo ""

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
read -p "📥 Install dependencies? (Y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Nn]$ ]]; then
    print_warning "Installation cancelled."
    exit 0
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

# Offer to start the server
read -p "🚀 Start the server now? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_status "Starting server..."
    echo ""
    cd server && node server.js
fi
npm install knex objection