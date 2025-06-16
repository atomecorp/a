@echo off
REM 🚀 WebSocket Test Startup Script for Windows
REM This script starts the WebSocket server and provides test instructions

echo 🔌 Starting WebSocket Test Environment
echo ======================================

REM Check if Node.js is available
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Node.js is not installed. Please install Node.js first.
    pause
    exit /b 1
)

REM Install dependencies if needed
if not exist "node_modules" (
    echo 📦 Installing dependencies...
    call npm install
)

echo.
echo 🚀 Starting WebSocket server on port 3000...
echo 📱 Open websocket-test.html in your browser to test
echo 🛑 Press Ctrl+C to stop the server
echo.

REM Start the WebSocket server
node src/server/server.js
