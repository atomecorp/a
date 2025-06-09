/**
 * WaveSurfer.js v7.9.5 ES6 Module Loader for Tauri
 * Compatible with modern ES6 imports and Tauri's server environment
 */

class WaveSurferV7Loader {
    constructor() {
        this.loadedPlugins = new Set();
        this.pluginCache = new Map();
        this.baseUrl = './js/';
    }

    /**
     * Load WaveSurfer.js main library
     */
    async loadWaveSurfer() {
        try {
            const module = await import(`${this.baseUrl}wavesurfer.esm.js`);
            window.WaveSurfer = module.default;
            console.log('✅ WaveSurfer.js v7.9.5 loaded successfully');
            return module.default;
        } catch (error) {
            console.error('❌ Failed to load WaveSurfer.js:', error);
            throw error;
        }
    }

    /**
     * Load a specific plugin
     */
    async loadPlugin(pluginName) {
        if (this.loadedPlugins.has(pluginName)) {
            return this.pluginCache.get(pluginName);
        }

        try {
            const module = await import(`${this.baseUrl}${pluginName}.esm.js`);
            this.loadedPlugins.add(pluginName);
            this.pluginCache.set(pluginName, module.default);
            console.log(`✅ Plugin ${pluginName} loaded successfully`);
            return module.default;
        } catch (error) {
            console.error(`❌ Failed to load plugin ${pluginName}:`, error);
            throw error;
        }
    }

    /**
     * Load multiple plugins
     */
    async loadPlugins(pluginNames = []) {
        const results = {};
        
        for (const pluginName of pluginNames) {
            try {
                results[pluginName] = await this.loadPlugin(pluginName);
            } catch (error) {
                console.warn(`⚠️ Could not load plugin ${pluginName}:`, error);
                results[pluginName] = null;
            }
        }
        
        return results;
    }

    /**
     * Initialize WaveSurfer with plugins
     */
    async initialize(requiredPlugins = []) {
        try {
            // Load main library
            const WaveSurfer = await this.loadWaveSurfer();
            
            // Load plugins if requested
            if (requiredPlugins.length > 0) {
                const plugins = await this.loadPlugins(requiredPlugins);
                
                // Attach plugins to WaveSurfer
                Object.entries(plugins).forEach(([name, plugin]) => {
                    if (plugin) {
                        WaveSurfer.registerPlugin(plugin);
                        console.log(`🔌 Plugin ${name} registered`);
                    }
                });
            }
            
            console.log('🚀 WaveSurfer.js v7.9.5 fully initialized with plugins');
            return WaveSurfer;
            
        } catch (error) {
            console.error('❌ Failed to initialize WaveSurfer:', error);
            throw error;
        }
    }

    /**
     * Get available plugins
     */
    getAvailablePlugins() {
        return [
            'regions',
            'timeline', 
            'minimap',
            'zoom',
            'hover',
            'spectrogram',
            'record',
            'envelope'
        ];
    }

    /**
     * Check if plugin is loaded
     */
    isPluginLoaded(pluginName) {
        return this.loadedPlugins.has(pluginName);
    }

    /**
     * Get loaded plugins
     */
    getLoadedPlugins() {
        return Array.from(this.loadedPlugins);
    }
}

// Export for ES6 modules
export default WaveSurferV7Loader;

// Global instance for compatibility
window.WaveSurferV7Loader = new WaveSurferV7Loader();
