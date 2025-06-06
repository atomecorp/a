/**
 * 🚀 SQUIRREL APPLICATION - OPTIMIZED ES6 MODULE ENTRY POINT
 * Version optimisée avec chargement conditionnel et gestion d'erreurs
 */

class SquirrelApp {
    constructor() {
        this.version = '1.0.0';
        this.modules = new Map();
        this.initialized = false;
    }

    async init() {
        try {
            console.log(`🐿️ Initializing Squirrel v${this.version}...`);
            
            // Phase 1: Core essentials
            await this.loadCoreModules();
            
            // Phase 2: Framework (lazy)
            await this.loadFrameworkModules();
            
            // Phase 3: Application (on demand)
            await this.loadApplicationModules();
            
            this.initialized = true;
            console.log('✅ Squirrel initialized successfully');
            
            // Rendre la version disponible globalement
            window.SQUIRREL_VERSION = this.version;
            window.squirrel = this;
            
        } catch (error) {
            console.error('❌ Squirrel initialization failed:', error);
            this.handleInitError(error);
        }
    }

    async loadCoreModules() {
        const coreModules = [
            { name: 'utils', path: '../native/utils.js' }
        ];

        await this.loadModulesParallel(coreModules);
    }

    async loadFrameworkModules() {
        const frameworkModules = [
            { name: 'core', path: '../a/a.js' },
            { name: 'apis', path: '../a/apis.js' },
            { name: 'identity', path: '../a/particles/identity.js' },
            { name: 'dimension', path: '../a/particles/dimension.js' }
        ];

        await this.loadModulesParallel(frameworkModules);
    }

    async loadApplicationModules() {
        // Chargement conditionnel selon les besoins
        if (this.shouldLoadApplication()) {
            await this.loadModule('application', '../application/index.js');
        }
    }

    async loadModulesParallel(modules) {
        const promises = modules.map(module => 
            this.loadModule(module.name, module.path)
        );
        
        const results = await Promise.allSettled(promises);
        
        // Log des résultats
        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                console.warn(`⚠️ Module ${modules[index].name} failed to load:`, result.reason);
            }
        });
    }

    async loadModule(name, path) {
        try {
            console.log(`📦 Loading ${name}...`);
            const module = await import(path);
            this.modules.set(name, module);
            console.log(`✅ ${name} loaded successfully`);
            return module;
        } catch (error) {
            console.warn(`⚠️ Failed to load ${name}:`, error.message);
            // Continuer sans ce module si non-critique
            return null;
        }
    }

    shouldLoadApplication() {
        // Ne pas charger l'application en mode debug core uniquement
        if (window.location.search.includes('debug=core')) {
            console.log('🔧 Debug mode: core only');
            return false;
        }
        
        // Charger l'application par défaut
        return true;
    }

    handleInitError(error) {
        // Mode dégradé avec interface d'erreur
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #ff4444;
            color: white;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
            z-index: 10000;
            font-family: Arial, sans-serif;
        `;
        
        errorDiv.innerHTML = `
            <h2>❌ Erreur d'initialisation Squirrel</h2>
            <p>${error.message}</p>
            <button onclick="location.reload()" style="
                background: white;
                color: #ff4444;
                border: none;
                padding: 10px 20px;
                border-radius: 4px;
                cursor: pointer;
                margin-top: 10px;
            ">Recharger</button>
        `;
        
        document.body.appendChild(errorDiv);
    }

    // API publique
    getModule(name) {
        return this.modules.get(name);
    }

    isReady() {
        return this.initialized;
    }

    getVersion() {
        return this.version;
    }

    listModules() {
        return Array.from(this.modules.keys());
    }
}

// Instance globale
const squirrel = new SquirrelApp();

// Auto-init selon l'état du DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => squirrel.init());
} else {
    squirrel.init();
}

// Export pour utilisation externe
export default squirrel;

