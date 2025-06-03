# 🔄 Ruby to JavaScript Transpiler (Prism WASM)

## 📁 Project Structure

```
src/
├── index.html                    # Main HTML entry point
├── css/
│   └── styles.css               # Styles
├── application/
│   └── index.sqr                # Ruby source code entry point
├── a/                           # A Framework
│   ├── a.js
│   ├── apis.js
│   └── particles/
│       ├── identity.js
│       └── dimension.js
├── utils.js                     # Utility functions
└── squirrel/                    # Squirrel transpiler
    ├── parser/                  # Downloaded Prism files
    │   ├── prism.wasm          # Prism WASM binary
    │   ├── nodes.js            # Prism node definitions
    │   ├── visitor.js          # AST visitor
    │   └── deserialize.js      # WASM deserializer
    ├── wasi_wrapper.js         # WASI implementation (manual)
    ├── prism_helper.js         # Prism WASM helper (manual)
    ├── prism_parser.js         # Main parser interface (manual)
    ├── squirrel_orchestrator.js # Transpiler orchestrator
    └── squirrel_runner.js      # Squirrel runner
```

## 🔧 Setup Instructions

### 1. Install Prism WASM

```bash
chmod +x install_prism.sh
./install_prism.sh
```

This will:
- Download `@ruby/prism` via npm
- Copy `prism.wasm` to `squirrel/parser/`
- Copy optional Prism JS files to `squirrel/parser/`

### 2. File Organization

**Downloaded files** (from Prism):
- `squirrel/parser/prism.wasm`
- `squirrel/parser/nodes.js`
- `squirrel/parser/visitor.js`
- `squirrel/parser/deserialize.js`

**Manually created files** (our code):
- `squirrel/wasi_wrapper.js`
- `squirrel/prism_helper.js`
- `squirrel/prism_parser.js`

### 3. Tauri Integration

Since this runs inside Tauri:
- No separate development server needed
- Uses Tauri's built-in file serving
- WASM files are served directly by Tauri
- All paths are relative to the web root

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