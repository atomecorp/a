#!/bin/bash

# 🚀 WebSocket Test Startup Script
# This script starts the WebSocket server and opens the test page

echo "🔌 Starting WebSocket Test Environment"
echo "======================================"

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

echo ""
echo "🚀 Starting WebSocket server on port 3000..."
echo "📱 Open websocket-test.html in your browser to test"
echo "🛑 Press Ctrl+C to stop the server"
echo ""

# Start the WebSocket server
node src/server/server.js
