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

// Import des composants essentiels
import Module from '../a/components/Module.js';
import Slider from '../a/components/Slider.js';
import Matrix from '../a/components/Matrix.js';
import List from '../a/components/List.js';
import Table from '../a/components/Table.js';
import SquirrelWaveSurfer from '../a/components/WaveSurfer.js';

// Import de WaveSurfer.js v7.9.5 et tous les plugins
import WaveSurferLib from './wavesurfer-v7/core/wavesurfer.esm.js';
import RegionsPlugin from './wavesurfer-v7/plugins/regions.esm.js';
import TimelinePlugin from './wavesurfer-v7/plugins/timeline.esm.js';
import MinimapPlugin from './wavesurfer-v7/plugins/minimap.esm.js';
import ZoomPlugin from './wavesurfer-v7/plugins/zoom.esm.js';
import HoverPlugin from './wavesurfer-v7/plugins/hover.esm.js';
import SpectrogramPlugin from './wavesurfer-v7/plugins/spectrogram.esm.js';
import RecordPlugin from './wavesurfer-v7/plugins/record.esm.js';
import EnvelopePlugin from './wavesurfer-v7/plugins/envelope.esm.js';

// Exposer les composants dans le scope global pour éviter les imports manuels
window.Module = Module;
window.Slider = Slider;
window.Matrix = Matrix;
window.List = List;
window.Table = Table;
window.SquirrelWaveSurfer = SquirrelWaveSurfer; // Composant Squirrel pour WaveSurfer

// Exposer WaveSurfer et ses plugins globalement avec les noms standards
window.WaveSurfer = WaveSurferLib; // Core WaveSurfer

// Noms standards pour compatibilité avec le code existant
window.RegionsPlugin = RegionsPlugin;
window.TimelinePlugin = TimelinePlugin;
window.MinimapPlugin = MinimapPlugin;
window.ZoomPlugin = ZoomPlugin;
window.HoverPlugin = HoverPlugin;
window.SpectrogramPlugin = SpectrogramPlugin;
window.RecordPlugin = RecordPlugin;
window.EnvelopePlugin = EnvelopePlugin;

// Alias préfixés pour éviter les conflits (optionnel)
window.WaveSurferRegions = RegionsPlugin;
window.WaveSurferTimeline = TimelinePlugin;
window.WaveSurferMinimap = MinimapPlugin;
window.WaveSurferZoom = ZoomPlugin;
window.WaveSurferHover = HoverPlugin;
window.WaveSurferSpectrogram = SpectrogramPlugin;
window.WaveSurferRecord = RecordPlugin;
window.WaveSurferEnvelope = EnvelopePlugin;

// Objet groupé pour faciliter l'utilisation
window.WaveSurferPlugins = {
    Regions: RegionsPlugin,
    Timeline: TimelinePlugin,
    Minimap: MinimapPlugin,
    Zoom: ZoomPlugin,
    Hover: HoverPlugin,
    Spectrogram: SpectrogramPlugin,
    Record: RecordPlugin,
    Envelope: EnvelopePlugin
};

console.log('🎵 WaveSurfer.js v7.9.5 + ALL PLUGINS loaded globally!');
console.log('📦 Available as: WaveSurfer, RegionsPlugin, TimelinePlugin, etc.');
console.log('📦 Also available as: WaveSurferPlugins.Regions, etc.');


