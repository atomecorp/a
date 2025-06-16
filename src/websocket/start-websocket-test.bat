@echo off
echo Starting WebSocket Test Environment...
echo.

echo 1. Starting WebSocket Server...
start /b cmd /c "cd server && node server.js"

echo 2. Starting Fastify HTTP Server...
start /b cmd /c "cd .. && node fastify-server.mjs"

echo.
echo Servers starting...
timeout /t 3 /nobreak > nul

echo.
echo WebSocket Server: http://localhost:3001
echo HTTP Server: http://localhost:7001
echo.
echo Test pages available at:
echo - http://localhost:7001/websocket/tests/websocket-test.html
echo - http://localhost:7001/websocket/tests/minimal-websocket-test.html
echo - http://localhost:7001/websocket/tests/websocket-test-simple.html
echo - http://localhost:7001/websocket/tests/basic-test.html
echo.
echo Press any key to open the main test page...
pause > nul
start http://localhost:7001/websocket/tests/websocket-test.html
