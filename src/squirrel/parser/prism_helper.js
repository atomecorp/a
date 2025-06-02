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
