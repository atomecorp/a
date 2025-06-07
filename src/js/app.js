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
        
        // Load Svelte bundle as script (IIFE format)
        await this.loadSvelteBundle();
        
        // Initialiser Svelte si disponible
        await this.initSvelteIntegration();
    }

    async loadApplicationModules() {
        // Chargement conditionnel selon les besoins
        if (this.shouldLoadApplication()) {
            await this.loadModule('application', '../application/index.js');
        }
    }

    async loadModulesParallel(modules) {
        const promises = modules.map(module => 
            this.loadModule(module.name, module.path, module.optional)
        );
        
        const results = await Promise.allSettled(promises);
        
        // Log des résultats
        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                const isOptional = modules[index].optional;
                if (isOptional) {
                    console.info(`ℹ️ Optional module ${modules[index].name} not loaded:`, result.reason.message);
                } else {
                    console.warn(`⚠️ Module ${modules[index].name} failed to load:`, result.reason);
                }
            }
        });
    }

    async loadModule(name, path, optional = false) {
        try {
            console.log(`📦 Loading ${name} from ${path}...`);
            const module = await import(path);
            this.modules.set(name, module);
            console.log(`✅ ${name} loaded successfully:`, module);
            return module;
        } catch (error) {
            if (optional) {
                console.info(`ℹ️ Optional module ${name} not available:`, error.message);
            } else {
                console.warn(`⚠️ Failed to load ${name}:`, error.message);
                console.error('Full error:', error);
            }
            // Continuer sans ce module si non-critique
            return null;
        }
    }

    /**
     * Charge le bundle Svelte comme script (IIFE format)
     */
    async loadSvelteBundle() {
        return new Promise((resolve, reject) => {
            console.log('📦 Loading Svelte bundle as script...');
            
            const script = document.createElement('script');
            script.src = '../svelte/build/bundle.js';
            script.onload = () => {
                console.log('✅ Svelte bundle loaded successfully');
                
                // Vérifier si SquirrelSvelte global est disponible
                if (window.SquirrelSvelte) {
                    console.log('🎯 SquirrelSvelte global found:', window.SquirrelSvelte);
                    // Stocker comme module pour cohérence
                    this.modules.set('svelte', window.SquirrelSvelte);
                    resolve();
                } else {
                    console.warn('⚠️ SquirrelSvelte global not found after bundle load');
                    resolve(); // Continue anyway
                }
            };
            script.onerror = (error) => {
                console.error('❌ Failed to load Svelte bundle:', error);
                resolve(); // Continue anyway, Svelte is optional
            };
            
            document.head.appendChild(script);
        });
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
    
    /**
     * Initialise l'intégration Svelte si le module est disponible
     */
    async initSvelteIntegration() {
        console.log('🎯 Initializing Svelte integration...');
        const svelteModule = this.modules.get('svelte');
        console.log('📦 Svelte module found:', svelteModule);
        
        if (svelteModule && svelteModule.default) {
            try {
                console.log('🔧 Creating Svelte integration instance...');
                this.svelteIntegration = svelteModule.default(this);
                console.log('✅ Svelte integration initialized:', this.svelteIntegration);
                
                // API publique pour Svelte
                window.createSquirrelDashboard = (containerId) => {
                    console.log('📊 Creating dashboard for:', containerId);
                    return this.svelteIntegration?.createDashboard(containerId);
                };
                
                window.createSquirrelSettings = (containerId) => {
                    console.log('⚙️ Creating settings for:', containerId);
                    return this.svelteIntegration?.createSettingsPanel(containerId);
                };
                
                console.log('🌟 Global Svelte functions registered');
                
            } catch (error) {
                console.warn('⚠️ Svelte integration failed:', error);
                console.error('Full Svelte error:', error);
            }
        } else if (window.SquirrelSvelte) {
            // Fallback: Use global SquirrelSvelte directly
            console.log('🔄 Using global SquirrelSvelte fallback');
            try {
                if (window.SquirrelSvelte.default) {
                    this.svelteIntegration = window.SquirrelSvelte.default(this);
                    console.log('✅ Svelte integration initialized from global:', this.svelteIntegration);
                    
                    // API publique pour Svelte
                    window.createSquirrelDashboard = (containerId) => {
                        console.log('📊 Creating dashboard for:', containerId);
                        return this.svelteIntegration?.createDashboard(containerId);
                    };
                    
                    window.createSquirrelSettings = (containerId) => {
                        console.log('⚙️ Creating settings for:', containerId);
                        return this.svelteIntegration?.createSettingsPanel(containerId);
                    };
                    
                    console.log('🌟 Global Svelte functions registered from global');
                }
            } catch (error) {
                console.warn('⚠️ Global Svelte integration failed:', error);
            }
        } else {
            console.info('ℹ️ Svelte module not available');
        }
    }
    
    /**
     * API publique pour Svelte
     */
    getSvelteIntegration() {
        return this.svelteIntegration;
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

