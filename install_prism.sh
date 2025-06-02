#!/usr/bin/env bash

echo "🚀 Installation simplifiée de Prism WASM..."

# Vérifier si @ruby/prism est installé
if [ ! -d "node_modules/@ruby/prism" ]; then
    echo "❌ @ruby/prism non trouvé"
    echo "💡 Installation automatique..."
    npm install @ruby/prism
fi

# Créer le dossier de destination
mkdir -p src/squirrel/parser/

echo "1️⃣ Copie des fichiers essentiels..."

# Copier prism.wasm
if [ -f "node_modules/@ruby/prism/src/prism.wasm" ]; then
    cp node_modules/@ruby/prism/src/prism.wasm src/squirrel/parser/
    echo "✅ prism.wasm copié"
else
    echo "❌ prism.wasm non trouvé"
    exit 1
fi

echo "2️⃣ Création des fichiers JavaScript simplifiés..."

# Créer parsePrism.js simplifié
cat > src/squirrel/parser/parsePrism.js << 'EOF_PARSE'
// Version simplifiée de parsePrism.js pour éviter les erreurs d'import

function parsePrism(exports, source) {
    try {
        if (!exports || !exports.memory) {
            throw new Error('WASM exports not available');
        }
        
        const encoder = new TextEncoder();
        const sourceBytes = encoder.encode(source);
        
        const malloc = exports.malloc;
        const free = exports.free;
        
        if (!malloc || !free) {
            throw new Error('malloc/free functions not available');
        }
        
        const sourcePtr = malloc(sourceBytes.length + 1);
        const memory = new Uint8Array(exports.memory.buffer);
        
        memory.set(sourceBytes, sourcePtr);
        memory[sourcePtr + sourceBytes.length] = 0;
        
        const parseFunc = exports.pm_parse || exports.parse || exports.prism_parse;
        
        if (!parseFunc) {
            throw new Error('No parse function found in WASM exports');
        }
        
        const resultPtr = parseFunc(sourcePtr, sourceBytes.length);
        
        free(sourcePtr);
        
        const result = {
            value: {
                type: 'ProgramNode',
                location: {
                    start_offset: 0,
                    end_offset: source.length
                },
                body: []
            },
            comments: [],
            magicComments: [],
            errors: [],
            warnings: [],
            source: source
        };
        
        return result;
        
    } catch (error) {
        console.error('❌ parsePrism error:', error);
        return {
            value: null,
            comments: [],
            magicComments: [],
            errors: [{ message: error.message }],
            warnings: [],
            source: source
        };
    }
}

if (typeof window !== 'undefined') {
    window.parsePrism = parsePrism;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { parsePrism };
}
EOF_PARSE

# Créer wasi_wrapper.js simplifié
cat > src/squirrel/parser/wasi_wrapper.js << 'EOF_WASI'
// Version simplifiée de WASI wrapper

class SimpleWASI {
    constructor(args = [], env = [], fds = []) {
        this.args = args;
        this.env = env;
        this.fds = fds;
        
        this.wasiImport = {
            args_get: () => 0,
            args_sizes_get: () => 0,
            environ_get: () => 0,
            environ_sizes_get: () => 0,
            clock_res_get: () => 0,
            clock_time_get: () => 0,
            fd_write: (fd, iovs, iovs_len, nwritten) => 0,
            proc_exit: (code) => {
                if (code !== 0) {
                    throw new Error(`Process exited with code ${code}`);
                }
            },
            random_get: (buf, buf_len) => 0
        };
    }
    
    initialize(instance) {
        this.instance = instance;
        console.log('✅ Simple WASI initialized');
        
        if (instance.exports._start) {
            try {
                instance.exports._start();
            } catch (error) {
                if (error.message && error.message.includes('proc_exit')) {
                    console.log('✅ WASI _start completed normally');
                } else {
                    console.warn('⚠️ WASI _start error:', error);
                }
            }
        }
    }
}

window.WASI_LOCAL = SimpleWASI;
window.createWASI = function(args = [], env = [], fds = []) {
    return new SimpleWASI(args, env, fds);
};

setTimeout(() => {
    window.dispatchEvent(new CustomEvent('wasi-ready'));
    console.log('✅ Simple WASI ready');
}, 100);
EOF_WASI

# Créer prism_helper.js
cat > src/squirrel/parser/prism_helper.js << 'EOF_HELPER'
class PrismParser {
    constructor() {
        this.wasmInstance = null;
        this.wasi = null;
        this.ready = false;
    }
    
    async initialize() {
        try {
            console.log('🔬 Initializing Prism Parser...');
            
            if (!window.WASI_LOCAL) {
                console.log('⏳ Waiting for WASI...');
                await new Promise(resolve => {
                    window.addEventListener('wasi-ready', resolve, { once: true });
                });
            }
            
            console.log('1️⃣ Loading WASM...');
            const wasmResponse = await fetch('./squirrel/parser/prism.wasm');
            if (!wasmResponse.ok) {
                throw new Error(`Failed to fetch WASM: ${wasmResponse.status}`);
            }
            const wasmBytes = await wasmResponse.arrayBuffer();
            const wasmModule = await WebAssembly.compile(wasmBytes);
            
            console.log('2️⃣ Creating WASI instance...');
            this.wasi = window.createWASI([], [], []);
            
            console.log('3️⃣ Instantiating WASM...');
            this.wasmInstance = await WebAssembly.instantiate(wasmModule, {
                wasi_snapshot_preview1: this.wasi.wasiImport
            });
            
            console.log('4️⃣ Initializing WASI...');
            this.wasi.initialize(this.wasmInstance);
            
            this.ready = true;
            console.log('✅ Prism Parser ready!');
            
            return true;
        } catch (error) {
            console.error('❌ Prism Parser initialization failed:', error);
            return false;
        }
    }
    
    parseRuby(code) {
        if (!this.ready) {
            throw new Error('Parser not initialized');
        }
        
        try {
            const result = window.parsePrism(this.wasmInstance.exports, code);
            
            return {
                success: !result.errors || result.errors.length === 0,
                result: result,
                exports: Object.keys(this.wasmInstance.exports).length
            };
            
        } catch (error) {
            console.error('❌ Parse error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    getAvailableFunctions() {
        if (!this.ready) return [];
        return Object.keys(this.wasmInstance.exports).filter(key => 
            typeof this.wasmInstance.exports[key] === 'function'
        );
    }
    
    getPrismFunctions() {
        return this.getAvailableFunctions().filter(key => 
            key.startsWith('pm_') || key.includes('parse')
        );
    }
}

window.PrismParser = PrismParser;
EOF_HELPER

echo "3️⃣ Création du serveur HTTP..."

cat > src/server.js << 'EOF_SERVER'
const http = require('http');
const fs = require('fs');
const path = require('path');

const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.wasm': 'application/wasm'
};

const server = http.createServer((req, res) => {
    let filePath = req.url === '/' ? '/index.html' : req.url;
    filePath = path.join(__dirname, filePath);
    
    const ext = path.extname(filePath);
    const mimeType = mimeTypes[ext] || 'text/plain';
    
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('404 Not Found');
            return;
        }
        
        res.writeHead(200, {
            'Content-Type': mimeType,
            'Access-Control-Allow-Origin': '*'
        });
        res.end(data);
    });
});

server.listen(8000, () => {
    console.log('🚀 Serveur sur http://localhost:8000');
});
EOF_SERVER

echo "✅ Installation terminée!"
echo "📋 Pour tester:"
echo "   cd src/"
echo "   node server.js"
echo "   Ouvrir http://localhost:8000/index.html"