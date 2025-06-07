# 🐿️ Squirrel Framework - Development Guide

## 🚀 Quick Start

```bash
# Complete development launch
./dev.sh

# Or step by step:
npm run build:svelte    # Compile Svelte components
npm run start:server    # Web server (port 3001)
npm run tauri dev       # Desktop application
```

## 🎯 Access Points

- **Web Interface**: http://localhost:3001
- **Rust API**: http://localhost:3000  
- **Desktop Application**: Automatically launched with Tauri

## 🏗️ Architecture

```
🐿️ Squirrel Framework
├── 📱 Frontend (ES6 + Svelte)
│   ├── Dynamic modules
│   ├── Reactive components
│   └── Conditional loading
├── 🦀 Backend (Rust + Tauri)
│   ├── Axum server (API)
│   ├── Fastify server (Static)
│   └── Desktop runtime
└── 🔧 Build System
    ├── Rollup (Svelte)
    ├── Cargo (Rust)
    └── Integrated scripts
```

## 📝 Development

### Create a new Svelte component

1. Add to `src/svelte/components/MyComponent.svelte`
2. Import in `src/svelte/index.js`
3. Use via `window.createMyComponent()`

### Add a Squirrel module

1. Create in `src/a/myModule.js`
2. Add import in `src/js/app.js`
3. Use via `squirrel.getModule('myModule')`

### Modify Rust API

1. Edit `src-tauri/src/server/mod.rs`
2. Hot-reload is automatic in dev mode

## 🛠️ Available Scripts

```bash
npm run dev             # Complete development
npm run build:svelte    # Build Svelte only
npm run watch:svelte    # Watch Svelte
npm run start:server    # Web server
npm run tauri dev       # Tauri development mode
npm run tauri build     # Production build
```

## 🎨 Features

✅ **Dynamic ES6 modules**  
✅ **Reactive Svelte components**  
✅ **High-performance Rust API**  
✅ **Native desktop application**  
✅ **Complete hot-reload**  
✅ **Optimized build**  

## 🐛 Troubleshooting

**Svelte compilation error?**
```bash
rm -rf src/svelte/build/ && npm run build:svelte
```

**Port busy?**
```bash
lsof -ti:3001 | xargs kill -9
lsof -ti:3000 | xargs kill -9
```

**Modules not found?**
- Check paths in `src/js/app.js`
- Check browser console

---
*🐿️ Framework created with ❤️ for modern development*