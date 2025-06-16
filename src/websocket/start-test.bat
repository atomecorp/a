@echo off
REM 🔌 WebSocket Test Quick Start Script (Windows)

echo 🚀 Starting WebSocket Test Environment...

REM Check if we're in the right directory
if not exist "websocket" (
    echo ❌ Error: Please run this script from the project root directory
    exit /b 1
)

REM Start WebSocket server
echo 🔌 Starting WebSocket server...
cd websocket\server
start "WebSocket Server" node server.js
cd ..\..
timeout /t 2 /nobreak >nul

REM Start HTTP server
echo 🌐 Starting HTTP server...
start "HTTP Server" python -m http.server 8000
timeout /t 2 /nobreak >nul

echo.
echo 🎉 Environment ready!
echo.
echo 📋 Available test pages:
echo   • Full Test:    http://localhost:8000/websocket/tests/websocket-test.html
echo   • Simple Test:  http://localhost:8000/websocket/tests/websocket-test-simple.html
echo   • Minimal Test: http://localhost:8000/websocket/tests/minimal-websocket-test.html
echo   • Basic Test:   http://localhost:8000/websocket/tests/basic-test.html
echo.
echo 🔧 To stop servers, close the opened terminal windows
echo.
echo 📖 For more info, see: websocket\README.md

pause
