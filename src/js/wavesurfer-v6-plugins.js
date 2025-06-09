/*!
 * WaveSurfer.js v6.x Plugin Loader - Offline Compatible
 * Loads all WaveSurfer.js v6.x plugins for offline use
 */

(function() {
    'use strict';

    // Available plugins in v6.x format
    const AVAILABLE_PLUGINS = {
        regions: 'wavesurfer.regions.js',
        timeline: 'wavesurfer.timeline.js',
        minimap: 'wavesurfer.minimap.js',
        cursor: 'wavesurfer.cursor.js',
        markers: 'wavesurfer.markers.js',
        spectrogram: 'wavesurfer.spectrogram.js',
        microphone: 'wavesurfer.microphone.js',
        playhead: 'wavesurfer.playhead.js',
        elan: 'wavesurfer.elan.js',
        mediasession: 'wavesurfer.mediasession.js'
    };

    // Plugin loading utilities
    window.WaveSurferPluginLoader = {
        loadedPlugins: new Set(),
        
        /**
         * Load a single plugin
         * @param {string} pluginName - Name of the plugin to load
         * @returns {Promise} Promise that resolves when plugin is loaded
         */
        loadPlugin: function(pluginName) {
            return new Promise((resolve, reject) => {
                if (this.loadedPlugins.has(pluginName)) {
                    resolve();
                    return;
                }

                const fileName = AVAILABLE_PLUGINS[pluginName];
                if (!fileName) {
                    reject(new Error(`Plugin '${pluginName}' is not available`));
                    return;
                }

                const script = document.createElement('script');
                script.src = `./js/plugins/${fileName}`;
                script.onload = () => {
                    this.loadedPlugins.add(pluginName);
                    console.log(`WaveSurfer plugin '${pluginName}' loaded successfully`);
                    resolve();
                };
                script.onerror = () => {
                    reject(new Error(`Failed to load WaveSurfer plugin: ${pluginName}`));
                };

                document.head.appendChild(script);
            });
        },

        /**
         * Load multiple plugins
         * @param {string[]} pluginNames - Array of plugin names to load
         * @returns {Promise} Promise that resolves when all plugins are loaded
         */
        loadPlugins: function(pluginNames) {
            const loadPromises = pluginNames.map(name => this.loadPlugin(name));
            return Promise.all(loadPromises);
        },

        /**
         * Load all available plugins
         * @returns {Promise} Promise that resolves when all plugins are loaded
         */
        loadAllPlugins: function() {
            return this.loadPlugins(Object.keys(AVAILABLE_PLUGINS));
        },

        /**
         * Get list of available plugins
         * @returns {string[]} Array of available plugin names
         */
        getAvailablePlugins: function() {
            return Object.keys(AVAILABLE_PLUGINS);
        },

        /**
         * Check if a plugin is loaded
         * @param {string} pluginName - Name of the plugin to check
         * @returns {boolean} True if plugin is loaded
         */
        isPluginLoaded: function(pluginName) {
            return this.loadedPlugins.has(pluginName);
        },

        /**
         * Get plugin constructor from WaveSurfer object
         * @param {string} pluginName - Name of the plugin
         * @returns {Function|null} Plugin constructor or null if not found
         */
        getPluginConstructor: function(pluginName) {
            if (!window.WaveSurfer || !window.WaveSurfer[pluginName]) {
                return null;
            }
            return window.WaveSurfer[pluginName];
        },

        /**
         * Create plugin configuration for WaveSurfer initialization
         * @param {string[]} pluginNames - Array of plugin names to enable
         * @param {Object} pluginOptions - Optional plugin-specific options
         * @returns {Object[]} Array of plugin configurations
         */
        createPluginConfig: function(pluginNames, pluginOptions = {}) {
            const plugins = [];
            
            pluginNames.forEach(name => {
                const PluginConstructor = this.getPluginConstructor(name);
                if (PluginConstructor) {
                    const options = pluginOptions[name] || {};
                    plugins.push(PluginConstructor.create(options));
                } else {
                    console.warn(`Plugin '${name}' constructor not found. Make sure it's loaded.`);
                }
            });

            return plugins;
        }
    };

    // Auto-load essential plugins on script load
    document.addEventListener('DOMContentLoaded', function() {
        // Load the most commonly used plugins automatically
        const essentialPlugins = ['regions', 'timeline', 'cursor'];
        window.WaveSurferPluginLoader.loadPlugins(essentialPlugins).catch(error => {
            console.warn('Failed to auto-load essential WaveSurfer plugins:', error);
        });
    });

})();
