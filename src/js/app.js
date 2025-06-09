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
            // Phase 1: Core essentials
            await this.loadCoreModules();
            
            // Phase 2: Framework (lazy)
            await this.loadFrameworkModules();
            
            // Phase 3: Application (on demand)
            await this.loadApplicationModules();
            
            this.initialized = true;
            
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
            { name: 'apis', path: '../a/apis.js', optional: true },
            { name: 'particles', path: '../a/particles/all.js', optional: true }
        ];

        await this.loadModulesParallel(frameworkModules);
    }

    async loadApplicationModules() {
        // Chargement conditionnel selon les besoins
        if (this.shouldLoadApplication()) {
            await this.loadModule('application', '../application/index.js', true);
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
            const module = await import(path);
            this.modules.set(name, module);
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

    shouldLoadApplication() {
        // Ne pas charger l'application en mode debug core uniquement
        if (window.location.search.includes('debug=core')) {
            return false;
        }
        
        // Ne pas charger si on est dans un contexte de test spécifique
        if (window.location.pathname.includes('test-') && 
            !window.location.search.includes('app=true')) {
            return false;
        }
        
        // Ne pas charger si explicitement désactivé
        if (window.location.search.includes('app=false')) {
            return false;
        }
        
        // ARCHITECTURE SQUIRREL: Par défaut, charger l'application systématiquement
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

import Module from '../a/components/Module.js';
import Slider from '../a/components/Slider.js';
import Matrix from '../a/components/Matrix.js';
import WaveSurfer from '../a/components/WaveSurfer.js';

