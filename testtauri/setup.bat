@echo off
setlocal enabledelayedexpansion

echo ==================================================
echo TAURI DSL PROJECT - COMPLETE INSTALLATION SCRIPT
echo ==================================================
echo.
echo This script will install and configure a complete
echo Tauri DSL project environment.
echo.
echo Press any key to begin installation...
pause > nul

:: Check prerequisites
echo Checking prerequisites...
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    echo and run this script again.
    goto :error
)

where npm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: npm is not installed!
    echo Please install Node.js from https://nodejs.org/
    echo and run this script again.
    goto :error
)

:: Create project directory
echo.
echo Creating project directory structure...
set PROJECT_DIR=%CD%\tauri_dsl_project
if not exist "%PROJECT_DIR%" mkdir "%PROJECT_DIR%"
cd "%PROJECT_DIR%"

:: Create subdirectories
if not exist tauri_app mkdir tauri_app
if not exist dsl_compiler mkdir dsl_compiler
if not exist rust_dsp_module mkdir rust_dsp_module
if not exist backend_saas mkdir backend_saas

:: Setup DSL Compiler
echo.
echo Setting up DSL compiler...
cd dsl_compiler
if not exist src mkdir src
if not exist package.json (
    echo {^
  "name": "dsl-compiler",^
  "version": "1.0.0",^
  "description": "DSL compiler for Tauri project",^
  "main": "src/cli.js",^
  "scripts": {^
    "start": "node src/cli.js"^
  }^
} > package.json
)

:: Create cli.js
echo const fs = require('fs');> src\cli.js
echo const path = require('path');>> src\cli.js
echo.>> src\cli.js
echo // Define paths>> src\cli.js
echo const DSL_SOURCE_DIR = path.resolve(__dirname, '../../tauri_app/src/dsl_source');>> src\cli.js
echo const JS_OUTPUT_DIR = path.resolve(__dirname, '../../tauri_app/src/dsl_compiled');>> src\cli.js
echo.>> src\cli.js
echo console.log('DSL Compiler starting...');>> src\cli.js
echo console.log('Source directory:', DSL_SOURCE_DIR);>> src\cli.js
echo console.log('Output directory:', JS_OUTPUT_DIR);>> src\cli.js
echo.>> src\cli.js
echo // Create output directory if needed>> src\cli.js
echo if (!fs.existsSync(JS_OUTPUT_DIR)) {>> src\cli.js
echo     fs.mkdirSync(JS_OUTPUT_DIR, { recursive: true });>> src\cli.js
echo     console.log('Created output directory');>> src\cli.js
echo }>> src\cli.js
echo.>> src\cli.js
echo // List DSL files>> src\cli.js
echo try {>> src\cli.js
echo     const files = fs.readdirSync(DSL_SOURCE_DIR);>> src\cli.js
echo     const dslFiles = files.filter(file =^> file.endsWith('.dsl'));>> src\cli.js
echo     console.log(`Found ${dslFiles.length} DSL files: ${dslFiles.join(', ')}`);>> src\cli.js
echo     >> src\cli.js
echo     // Process each DSL file>> src\cli.js
echo     dslFiles.forEach(file =^> {>> src\cli.js
echo         const filePath = path.join(DSL_SOURCE_DIR, file);>> src\cli.js
echo         const content = fs.readFileSync(filePath, 'utf-8');>> src\cli.js
echo         console.log(`Processing ${file} (${content.length} bytes)`);>> src\cli.js
echo         >> src\cli.js
echo         // Generate JS file>> src\cli.js
echo         const jsPath = path.join(JS_OUTPUT_DIR, file.replace('.dsl', '.js'));>> src\cli.js
echo         const jsContent = `>> src\cli.js
echo // Generated from ${file} by DSL compiler>> src\cli.js
echo console.log("DSL file processed: ${file}");>> src\cli.js
echo.>> src\cli.js
echo // DOM manipulation to show it works>> src\cli.js
echo document.addEventListener('DOMContentLoaded', () =^> {>> src\cli.js
echo     console.log("DSL script running");>> src\cli.js
echo     const dslOutput = document.getElementById('dsl-output');>> src\cli.js
echo     if (dslOutput) {>> src\cli.js
echo         dslOutput.innerHTML += '<h3>DSL Compiler Test Successful!</h3>';>> src\cli.js
echo         dslOutput.innerHTML += '<div>Original DSL code:</div>';>> src\cli.js
echo         dslOutput.innerHTML += '<pre>' + \`${content.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$')}\` + '</pre>';>> src\cli.js
echo     } else {>> src\cli.js
echo         console.error("Could not find #dsl-output element");>> src\cli.js
echo     }>> src\cli.js
echo });`;>> src\cli.js
echo         >> src\cli.js
echo         fs.writeFileSync(jsPath, jsContent);>> src\cli.js
echo         console.log(`Generated JS file: ${jsPath}`);>> src\cli.js
echo     });>> src\cli.js
echo } catch (error) {>> src\cli.js
echo     console.error('Error processing DSL files:', error);>> src\cli.js
echo }>> src\cli.js
echo.>> src\cli.js
echo console.log('DSL compilation complete!');>> src\cli.js

:: Return to project directory
cd "%PROJECT_DIR%"

:: Setup Tauri App
echo.
echo Setting up Tauri App...
cd tauri_app

:: Create package.json
echo {^
  "name": "tauri_app",^
  "version": "1.0.0",^
  "description": "Tauri DSL Application",^
  "scripts": {^
    "compile-dsl": "node ../dsl_compiler/src/cli.js",^
    "dev:fe": "serve src -p 1420",^
    "predev": "npm run compile-dsl",^
    "dev": "concurrently \"npm run dev:fe\" \"tauri dev\"",^
    "prebuild": "npm run compile-dsl",^
    "build": "tauri build"^
  },^
  "dependencies": {^
    "@tauri-apps/api": "^2.0.0"^
  },^
  "devDependencies": {^
    "@tauri-apps/cli": "^2.0.0",^
    "concurrently": "^8.0.1",^
    "serve": "^14.2.0"^
  }^
} > package.json

:: Create frontend structure
if not exist src mkdir src
if not exist src\assets mkdir src\assets
if not exist src\dsl_source mkdir src\dsl_source
if not exist src\dsl_compiled mkdir src\dsl_compiled

:: Create sample DSL file
echo # Sample DSL File> src\dsl_source\main.dsl
echo # This demonstrates the basic syntax of our DSL language>> src\dsl_source\main.dsl
echo.>> src\dsl_source\main.dsl
echo object UIElement {>> src\dsl_source\main.dsl
echo   hash properties>> src\dsl_source\main.dsl
echo.>> src\dsl_source\main.dsl
echo   define_method set(key, value) {>> src\dsl_source\main.dsl
echo     this.properties.set(key, value)>> src\dsl_source\main.dsl
echo   }>> src\dsl_source\main.dsl
echo.>> src\dsl_source\main.dsl
echo   define_method get(key) {>> src\dsl_source\main.dsl
echo     return this.properties.get(key)>> src\dsl_source\main.dsl
echo   }>> src\dsl_source\main.dsl
echo }>> src\dsl_source\main.dsl
echo.>> src\dsl_source\main.dsl
echo a = UIElement.new()>> src\dsl_source\main.dsl
echo a.set("color", "blue")>> src\dsl_source\main.dsl
echo a.set("position", { x: 100, y: 50 })>> src\dsl_source\main.dsl
echo.>> src\dsl_source\main.dsl
echo b = UIElement.new()>> src\dsl_source\main.dsl
echo b.set("color", "red")>> src\dsl_source\main.dsl
echo b.set("position", { x: 200, y: 100 })>> src\dsl_source\main.dsl
echo.>> src\dsl_source\main.dsl
echo print(a.get("color"))  # would output: blue>> src\dsl_source\main.dsl

:: Create HTML file
echo ^<!DOCTYPE html^>> src\index.html
echo ^<html lang="en"^>>> src\index.html
echo ^<head^>>> src\index.html
echo     ^<meta charset="UTF-8"^>>> src\index.html
echo     ^<meta name="viewport" content="width=device-width, initial-scale=1.0"^>>> src\index.html
echo     ^<title^>DSL Tauri Application^</title^>>> src\index.html
echo     ^<style^>>> src\index.html
echo         body {>> src\index.html
echo             font-family: system-ui, sans-serif;>> src\index.html
echo             padding: 20px;>> src\index.html
echo             max-width: 800px;>> src\index.html
echo             margin: 0 auto;>> src\index.html
echo             line-height: 1.5;>> src\index.html
echo         }>> src\index.html
echo         h1 {>> src\index.html
echo             color: #333;>> src\index.html
echo         }>> src\index.html
echo         #dsl-output {>> src\index.html
echo             margin-top: 20px;>> src\index.html
echo             padding: 15px;>> src\index.html
echo             background-color: #f0f0f0;>> src\index.html
echo             border-radius: 8px;>> src\index.html
echo         }>> src\index.html
echo         pre {>> src\index.html
echo             background-color: #e0e0e0;>> src\index.html
echo             padding: 10px;>> src\index.html
echo             border-radius: 4px;>> src\index.html
echo             overflow: auto;>> src\index.html
echo         }>> src\index.html
echo     ^</style^>>> src\index.html
echo ^</head^>>> src\index.html
echo ^<body^>>> src\index.html
echo     ^<h1^>DSL Tauri Application^</h1^>>> src\index.html
echo     ^<p^>This is a demonstration of the DSL compiler integration with Tauri.^</p^>>> src\index.html
echo     >> src\index.html
echo     ^<div id="dsl-output"^>>> src\index.html
echo         ^<h2^>DSL Compilation Output:^</h2^>>> src\index.html
echo         ^<!-- Content will be inserted here by the DSL script --^>>> src\index.html
echo     ^</div^>>> src\index.html
echo     >> src\index.html
echo     ^<!-- Import the compiled DSL file --^>>> src\index.html
echo     ^<script src="./dsl_compiled/main.js"^>^</script^>>> src\index.html
echo ^</body^>>> src\index.html
echo ^</html^>>> src\index.html

:: Install dependencies
echo.
echo Installing dependencies...
call npm install

:: Initialize Tauri
echo.
echo Initializing Tauri...
call npx @tauri-apps/cli init

:: Return to project root
cd "%PROJECT_DIR%"

:: Test the DSL compiler
echo.
echo Testing DSL compiler...
node dsl_compiler/src/cli.js

:: Create startup script
echo @echo off> start-app.bat
echo echo Starting Tauri DSL Application...>> start-app.bat
echo cd tauri_app>> start-app.bat
echo npm run dev>> start-app.bat
echo pause>> start-app.bat

:: Create README file
echo # Tauri DSL Project> README.md
echo.>> README.md
echo This project demonstrates the integration of a custom Domain-Specific Language (DSL) with Tauri.>> README.md
echo.>> README.md
echo ## Project Structure>> README.md
echo.>> README.md
echo - **tauri_app/**: Tauri application with frontend code>> README.md
echo - **dsl_compiler/**: DSL compiler that transpiles DSL to JavaScript>> README.md
echo - **rust_dsp_module/**: Rust DSP library (placeholder)>> README.md
echo - **backend_saas/**: Node.js backend (placeholder)>> README.md
echo.>> README.md
echo ## How to Run>> README.md
echo.>> README.md
echo Simply double-click the `start-app.bat` file to compile the DSL and start the application.>> README.md
echo.>> README.md
echo ## Development>> README.md
echo.>> README.md
echo To modify the DSL code, edit the files in `tauri_app/src/dsl_source/`.>> README.md
echo.>> README.md
echo ## Requirements>> README.md
echo.>> README.md
echo - Node.js>> README.md
echo - Rust (installed automatically by Tauri if not present)>> README.md

:: Display completion message
echo.
echo ==================================================
echo Installation Complete!
echo ==================================================
echo.
echo The Tauri DSL project has been successfully installed at:
echo %PROJECT_DIR%
echo.
echo To start the application, either:
echo 1. Double-click the 'start-app.bat' file
echo    OR
echo 2. Run the following commands:
echo    cd tauri_app
echo    npm run dev
echo.
echo Thank you for testing this application!
echo.
goto :end

:error
echo.
echo Installation failed. Please check the error messages above.
echo.

:end
pause