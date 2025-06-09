/**
 * 🎵 WaveSurfer.js v7.9.5 Plugin Loader - ES6 Modules
 * 
 * Gestionnaire de chargement dynamique de tous les plugins WaveSurfer.js v7.9.5
 * Compatible avec ES6 modules et Tauri
 * 
 * @version 2.0.0
 * @author Squirrel Framework Team
 */

// ES6 Import pour les plugins (pour Tauri)
const pluginModules = {
    regions: () => import('./regions.esm.js'),
    timeline: () => import('./timeline.esm.js'),
    minimap: () => import('./minimap.esm.js'),
    zoom: () => import('./zoom.esm.js'),
    hover: () => import('./hover.esm.js'),
    spectrogram: () => import('./spectrogram.esm.js'),
    record: () => import('./record.esm.js'),
    envelope: () => import('./envelope.esm.js')
};

class WaveSurferPluginLoader {
    constructor() {
        this.plugins = new Map();
        this.loadedPlugins = new Set();
        this.baseUrl = './js/';
        this.isES6Environment = true; // Tauri supporte ES6
        
        // Définition des plugins disponibles
        this.availablePlugins = {
            regions: {
                files: ['regions.js', 'regions.esm.js', 'regions.min.js'],
                description: 'Gestion des régions audio pour édition',
                features: ['Sélection de zones', 'Édition audio', 'Marqueurs']
            },
            timeline: {
                files: ['timeline.js', 'timeline.esm.js', 'timeline.min.js'],
                description: 'Affichage de la timeline temporelle',
                features: ['Timeline', 'Marqueurs temporels', 'Navigation']
            },
            minimap: {
                files: ['minimap.js', 'minimap.esm.js', 'minimap.min.js'],
                description: 'Vue miniature de la waveform',
                features: ['Minimap', 'Navigation rapide', 'Vue d\'ensemble']
            },
            zoom: {
                files: ['zoom.js', 'zoom.esm.js', 'zoom.min.js'],
                description: 'Contrôles de zoom sur la waveform',
                features: ['Zoom in/out', 'Navigation précise', 'Contrôles']
            },
            hover: {
                files: ['hover.js', 'hover.esm.js', 'hover.min.js'],
                description: 'Informations au survol de la waveform',
                features: ['Tooltips', 'Position temporelle', 'Infos survol']
            },
            spectrogram: {
                files: ['spectrogram.js', 'spectrogram.esm.js', 'spectrogram.min.js'],
                description: 'Visualisation spectrogramme audio',
                features: ['Analyse fréquentielle', 'Spectrogramme', 'Visualisation']
            },
            record: {
                files: ['record.js', 'record.esm.js', 'record.min.js'],
                description: 'Enregistrement audio intégré',
                features: ['Enregistrement', 'Microphone', 'Audio input']
            },
            envelope: {
                files: ['envelope.js', 'envelope.esm.js', 'envelope.min.js'],
                description: 'Contrôle d\'enveloppe audio',
                features: ['Enveloppe', 'Automation', 'Courbes audio']
            }
        };
    }
    
    async loadPlugin(pluginName) {
        if (this.loadedPlugins.has(pluginName)) {
            console.log(`🎵 Plugin ${pluginName} déjà chargé`);
            return this.plugins.get(pluginName);
        }
        
        const pluginInfo = this.availablePlugins[pluginName];
        if (!pluginInfo) {
            console.warn(`🎵 Plugin ${pluginName} non disponible`);
            return null;
        }
        
        try {
            // Utiliser ES6 import pour Tauri
            const moduleLoader = pluginModules[pluginName];
            if (moduleLoader) {
                const module = await moduleLoader();
                const plugin = module.default || module;
                
                this.plugins.set(pluginName, plugin);
                this.loadedPlugins.add(pluginName);
                console.log(`✅ Plugin ${pluginName} chargé avec ES6 modules`);
                return plugin;
            }
            
            // Fallback vers chargement de script traditionnel
            const localUrl = this.baseUrl + `${pluginName}.esm.js`;
            const plugin = await this._loadPluginScript(localUrl, pluginName);
            
            if (plugin) {
                this.plugins.set(pluginName, plugin);
                this.loadedPlugins.add(pluginName);
                console.log(`✅ Plugin ${pluginName} chargé localement`);
                return plugin;
            }
            
        } catch (error) {
            console.error(`❌ Impossible de charger le plugin ${pluginName}:`, error);
        }
        
        return null;
    }
    
    async _loadPluginScript(url, pluginName) {
        return new Promise((resolve, reject) => {
            // Vérifier si déjà chargé dans window
            if (window[`WaveSurfer${pluginName.charAt(0).toUpperCase() + pluginName.slice(1)}`]) {
                resolve(window[`WaveSurfer${pluginName.charAt(0).toUpperCase() + pluginName.slice(1)}`]);
                return;
            }
            
            const script = document.createElement('script');
            script.src = url;
            script.type = 'text/javascript';
            
            script.onload = () => {
                // Rechercher le plugin dans window
                const possibleNames = [
                    `WaveSurfer${pluginName.charAt(0).toUpperCase() + pluginName.slice(1)}`,
                    pluginName,
                    pluginName.toUpperCase(),
                    `${pluginName}Plugin`
                ];
                
                for (const name of possibleNames) {
                    if (window[name]) {
                        resolve(window[name]);
                        return;
                    }
                }
                
                // Si rien trouvé, chercher dans WaveSurfer.js
                if (window.WaveSurfer && window.WaveSurfer.plugins) {
                    const plugin = window.WaveSurfer.plugins[pluginName];
                    if (plugin) {
                        resolve(plugin);
                        return;
                    }
                }
                
                reject(new Error(`Plugin ${pluginName} non trouvé après chargement`));
            };
            
            script.onerror = () => {
                reject(new Error(`Erreur de chargement du script ${url}`));
            };
            
            document.head.appendChild(script);
        });
    }
    
    async loadAllPlugins() {
        console.log('🎵 Chargement de tous les plugins WaveSurfer.js...');
        
        const pluginNames = Object.keys(this.availablePlugins);
        const loadPromises = pluginNames.map(name => this.loadPlugin(name));
        
        const results = await Promise.allSettled(loadPromises);
        
        const loaded = [];
        const failed = [];
        
        results.forEach((result, index) => {
            const pluginName = pluginNames[index];
            if (result.status === 'fulfilled' && result.value) {
                loaded.push(pluginName);
            } else {
                failed.push(pluginName);
            }
        });
        
        console.log(`✅ Plugins chargés (${loaded.length}):`, loaded);
        if (failed.length > 0) {
            console.warn(`⚠️ Plugins échoués (${failed.length}):`, failed);
        }
        
        return {
            loaded,
            failed,
            plugins: this.plugins
        };
    }
    
    getLoadedPlugins() {
        return Array.from(this.loadedPlugins);
    }
    
    getPlugin(name) {
        return this.plugins.get(name);
    }
    
    isPluginLoaded(name) {
        return this.loadedPlugins.has(name);
    }
    
    getPluginInfo(name) {
        return this.availablePlugins[name];
    }
    
    getAllPluginInfo() {
        return this.availablePlugins;
    }
}

// Instance globale
window.WaveSurferPluginLoader = new WaveSurferPluginLoader();

// Export pour modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WaveSurferPluginLoader;
}

console.log('🎵 WaveSurfer Plugin Loader initialisé');
console.log(`📦 ${Object.keys(window.WaveSurferPluginLoader.availablePlugins).length} plugins disponibles:`, 
    Object.keys(window.WaveSurferPluginLoader.availablePlugins));
