#!/bin/bash

# 🔌 WebSocket Test Quick Start Script

echo "🚀 Starting WebSocket Test Environment..."

# Check if we're in the right directory
if [ ! -d "websocket" ]; then
    echo "❌ Error: Please run this script from the project root directory"
    exit 1
fi

# Function to check if a port is in use
check_port() {
    if netstat -tuln | grep -q ":$1 "; then
        return 0  # Port is in use
    else
        return 1  # Port is free
    fi
}

# Start WebSocket server if not already running
if check_port 3001; then
    echo "✅ WebSocket server already running on port 3001"
else
    echo "🔌 Starting WebSocket server..."
    cd websocket/server
    node server.js &
    WEBSOCKET_PID=$!
    cd ../..
    echo "✅ WebSocket server started (PID: $WEBSOCKET_PID)"
    sleep 2
fi

# Start HTTP server if not already running
if check_port 8000; then
    echo "✅ HTTP server already running on port 8000"
else
    echo "🌐 Starting HTTP server..."
    python -m http.server 8000 &
    HTTP_PID=$!
    echo "✅ HTTP server started (PID: $HTTP_PID)"
    sleep 2
fi

echo ""
echo "🎉 Environment ready!"
echo ""
echo "📋 Available test pages:"
echo "  • Full Test:    http://localhost:8000/websocket/tests/websocket-test.html"
echo "  • Simple Test:  http://localhost:8000/websocket/tests/websocket-test-simple.html"
echo "  • Minimal Test: http://localhost:8000/websocket/tests/minimal-websocket-test.html"
echo "  • Basic Test:   http://localhost:8000/websocket/tests/basic-test.html"
echo ""
echo "🔧 To stop servers:"
echo "  pkill -f 'python -m http.server'"
echo "  pkill -f 'node server.js'"
echo ""
echo "📖 For more info, see: websocket/README.md"
