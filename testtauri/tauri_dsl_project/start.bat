@echo off
setlocal enabledelayedexpansion

echo =============================================
echo      TAURI DSL APPLICATION LAUNCHER
echo =============================================
echo.

cd tauri_app

REM Use the full path to node.exe if needed
set NODE_CMD=node
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    if exist "C:\Program Files\nodejs\node.exe" (
        set NODE_CMD="C:\Program Files\nodejs\node.exe"
    ) else if exist "C:\Program Files (x86)\nodejs\node.exe" (
        set NODE_CMD="C:\Program Files (x86)\nodejs\node.exe"
    ) else (
        echo ERROR: Node.js command not found in PATH.
        echo Please ensure Node.js is installed and in your PATH.
        goto :error
    )
)

REM Compile DSL files
echo Compiling DSL files...
%NODE_CMD% ..\dsl_compiler\src\cli.js
if %ERRORLEVEL% neq 0 (
    echo ERROR: DSL compiler failed!
    goto :error
)
echo DSL compilation successful.
echo.

REM Start the application using 2 separate windows
echo Starting Tauri DSL application...
echo.
echo Step 1: Starting frontend server...
start "Frontend Server" cmd /k "npx serve src -p 3500"

REM Wait a bit for the server to start
echo Waiting for frontend server to start...
timeout /t 3 /nobreak > nul

echo Step 2: Starting Tauri application...
echo.
echo If you see "Waiting for your frontend dev server" message:
echo 1. Check that the frontend server is running on port 3500
echo 2. Make sure "devPath" in tauri.conf.json is set to "http://localhost:3500"
echo.

cd src-tauri
start "Tauri Application" cmd /k "cargo run"
cd ..

echo.
echo Application started successfully!
echo.
echo Two windows have been opened:
echo - Frontend Server (must stay open)
echo - Tauri Application
echo.
echo You can close this window now.
goto :end

:error
echo.
echo ERROR: Application failed to start.
echo.
pause

:end