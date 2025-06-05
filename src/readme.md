# 🐿️ Squirrel - Ruby to JavaScript Transpiler

## 🚀 Quick Start

```bash
# Start the Squirrel system
./start-squirrel.sh

# Open http://localhost:3001 in your browser
# Your Ruby code from application/index.sqr will be automatically transpiled and saved
```

## 🎯 Features

- **Ruby → JavaScript Transpilation** using Prism WASM
- **Automatic file saving** of transpiled code to disk
- **Real-time execution** in the browser
- **Framework A** for DOM manipulation
- **Modern ES6 modules** architecture

## 💾 Auto-Save System

The transpiled JavaScript code is automatically saved to the `output/` directory with:
- **JavaScript files** (`.js`) - Transpiled code ready to run
- **Ruby source files** (`.sqr`) - Original Ruby code backup  
- **Metadata files** (`.meta.json`) - Transpilation details and timestamps

## 📁 Project Structure

```
checkapp/
├── index.html                    # Main HTML entry point
├── start-squirrel.sh             # Main startup script
├── clean-output.sh               # Output cleanup script
├── css/
│   └── styles.css               # Styles
├── application/
│   └── index.sqr                # Ruby source code entry point
├── server/
│   └── squirrel-server.js       # Fastify server with auto-save
├── output/                      # Auto-saved transpiled files
├── a/                           # A Framework
│   ├── a.js
│   ├── apis.js
│   └── particles/
├── squirrel/                    # Squirrel transpiler
│   ├── parser/                  # Prism WASM files
│   ├── squirrel_orchestrator.js # Main transpiler
│   ├── squirrel_runner.js       # Auto-execution
│   ├── squirrel_saver.js        # Auto-save client
│   └── ...                     # Other transpiler modules
└── assets/                     # Resources (fonts, images, etc.)
```

## 🔧 Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Install Prism WASM

```bash
chmod +x install_prism.sh
./install_prism.sh
```

### 3. Start the System

```bash
./start-squirrel.sh
```

This will:
- Start the Fastify server with auto-save functionality
- Serve the application at http://localhost:3001
- Automatically transpile and save Ruby code from `application/index.sqr`

## 🚀 How It Works

1. **HTML loads scripts** in correct order
2. **WASI wrapper** provides minimal WASI implementation
3. **Prism helper** manages WASM memory and parsing
4. **Prism parser** provides high-level Ruby parsing interface
5. **Squirrel runner** auto-starts after 500ms delay
6. **Orchestrator** transpiles Ruby to JavaScript using Prism AST
7. **A Framework** maps methods and provides DOM manipulation
8. **Generated JavaScript** executes via eval()

## ⚡ Performance Requirements

The transpiled JavaScript must:
- Match vanilla JavaScript performance
- Use only native JS types and operations
- No runtime overhead or abstraction layers
- Be indistinguishable from hand-written JS

## 🔍 Debugging

To check if everything is working:

1. Open browser developer tools
2. Look for initialization messages:
   ```
   ✅ WASI wrapper ready
   ✅ Prism Helper ready!
   ✅ Prism Parser initialized successfully
   🧪 Testing with Ruby code: ...
   ```

3. Check available WASM exports:
   ```javascript
   console.log(window.prismParser.getDiagnostics());
   ```

## 📚 Key Files

- **`index.html`**: Entry point with correct script loading order
- **`squirrel/wasi_wrapper.js`**: WASI implementation for Prism WASM
- **`squirrel/prism_helper.js`**: Low-level WASM memory management
- **`squirrel/prism_parser.js`**: High-level Ruby parsing interface
- **`application/index.sqr`**: Ruby source code to be transpiled

## 🐛 Troubleshooting

**WASM loading issues:**
- Ensure `prism.wasm` exists in `squirrel/parser/`
- Check Tauri serves WASM files with correct MIME type

**Parser initialization fails:**
- Check browser console for WASI errors
- Verify all script files load in correct order

**Ruby parsing fails:**
- Test with simple Ruby code first
- Check that Prism WASM exports are available