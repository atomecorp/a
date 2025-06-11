/**
 * 🎵 WaveSurfer Web Component - Squirrel Framework
 * 
 * Component for creating interactive audio waveform visualizations
 * with playback controls, regions, and audio analysis features.
 * Compatible with WaveSurfer.js v7.x for complete offline functionality.
 * 
 * @version 4.0.0 - Web Component Architecture
 * @author Squirrel Framework Team
 */

// Global variables for WaveSurfer library and plugin loader
let WaveSurferLib = null;
let PluginLoader = null;

// Load WaveSurfer.js library and plugin loader
async function loadWaveSurfer() {
    if (WaveSurferLib) return WaveSurferLib;
    
    try {
        // Load WaveSurfer v7 ES module
        const WaveSurferModule = await import('../../js/wavesurfer-v7/core/wavesurfer.esm.js');
        WaveSurferLib = WaveSurferModule.default;
        
        // Load plugin loader for v7
        try {
            const LoaderModule = await import('../../js/wavesurfer-v7/wavesurfer-v7-loader.js');
            PluginLoader = LoaderModule.default || LoaderModule.WaveSurferV7Loader;
            if (PluginLoader && typeof PluginLoader === 'function') {
                PluginLoader = new PluginLoader();
            }
        } catch (loaderError) {
            console.warn('⚠️ Plugin loader not available, using basic WaveSurfer:', loaderError);
            PluginLoader = null;
        }
        
        console.log('🎵 WaveSurfer.js v7.9.5 loaded successfully (ES modules)');
        return WaveSurferLib;
        
    } catch (error) {
        console.error('❌ Failed to load WaveSurfer.js v7:', error);
        throw new Error('WaveSurfer.js v7 could not be loaded. Ensure wavesurfer files are available in ./js/wavesurfer-v7/ directory');
    }
}

/**
 * 🎵 WaveSurfer Web Component Class
 * 
 * Creates interactive audio waveform visualizations with full plugin support
 * Now extends HTMLElement for true Web Component architecture
 */
class WaveSurfer extends HTMLElement {
    static instances = new Map(); // Registry of all WaveSurfer instances
    
    constructor(config = {}) {
        super();
        
        // Generate unique ID
        this.id = config.id || `wavesurfer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // La config peut être fournie via le constructeur ou sera fournie plus tard
        this.config = this.mergeConfig(config);
        
        // Internal state
        this.wavesurfer = null;
        this.isReady = false;
        this.isPlaying = false;
        this.currentTime = 0;
        this.regions = new Map();
        this.plugins = new Map();
        this.currentMode = this.config.interactionMode || 'scrub'; // Track current interaction mode
        this.isLooping = false; // Track loop state
        this._dragSelectionDestroy = null; // Store drag selection cleanup function
        this._originalDragSelection = null; // Store original dragSelection setting
        
        // Create Shadow DOM
        this.attachShadow({ mode: 'open' });
        
        // Initialize flag
        this.initialized = false;
    }
    
    connectedCallback() {
        if (!this.initialized) {
            this.init();
            this.initialized = true;
        }
    }
    
    mergeConfig(config) {
        // Default configuration - same as before but simplified
        const defaultConfig = {
            // Container and positioning
            attach: 'body',
            x: 100, y: 100,
            width: 800, height: 120,
            
            // Audio source
            url: null,
            peaks: null,
            
            // Visual styling
            waveColor: '#4A90E2',
            progressColor: '#2ECC71',
            cursorColor: '#E74C3C',
            barWidth: 2,
            barRadius: 1,
            responsive: true,
            interact: true,
            dragToSeek: true,
            hideScrollbar: true,
            normalize: false,
            backend: 'WebAudio',
            mediaControls: false,
            
            // Visual styling
            style: {
                backgroundColor: '#FFFFFF',
                border: '1px solid rgba(0,0,0,0.1)',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                overflow: 'hidden'
            },
            
            // Control buttons
            controls: {
                enabled: true,
                play: true,
                pause: true,
                stop: true,
                mute: true,
                volume: true,
                download: false,
                modeToggle: true, // Add mode toggle control
                loop: true, // Add loop control
                clearRegions: true // Add clear regions control
            },
            
            // Regions support
            regions: {
                enabled: true, // Activer par défaut
                dragSelection: true,
                snapToGridPercentage: null
            },
            
            // Interaction modes
            interactionMode: 'scrub', // 'scrub' or 'selection'
            
            // Plugins configuration
            plugins: [],
            enabledPlugins: ['regions', 'timeline'], // Include timeline by default
            autoLoadPlugins: true, // Auto-load recommended plugins
            
            // Plugin-specific configurations
            timeline: { enabled: true, height: 25 }, // Enable timeline by default with increased height
            minimap: { enabled: false, height: 50 },
            zoom: { enabled: false, scale: 1 },
            hover: { enabled: false, formatTimeCallback: null },
            spectrogram: { enabled: false, height: 200 },
            record: { enabled: false },
            envelope: { enabled: false },
            
            // Callbacks
            callbacks: {
                onReady: () => {},
                onPlay: () => {},
                onPause: () => {},
                onFinish: () => {},
                onSeek: () => {},
                onTimeUpdate: () => {},
                onRegionCreate: () => {},
                onRegionUpdate: () => {},
                onRegionRemove: () => {},
                onError: (error) => console.error('WaveSurfer error:', error)
            }
        };
        
        // Safer merge using Object.assign for shallow merge of top-level properties
        // and manual merge for known safe nested objects
        const mergedConfig = { ...defaultConfig };
        
        // Safely merge known safe properties
        if (config) {
            // Direct properties (no recursion risk)
            const safeDirectProps = ['attach', 'x', 'y', 'width', 'height', 'url', 'peaks', 
                'waveColor', 'progressColor', 'cursorColor', 'barWidth', 'barRadius', 
                'responsive', 'interact', 'dragToSeek', 'hideScrollbar', 'normalize', 
                'backend', 'mediaControls', 'plugins', 'enabledPlugins', 'autoLoadPlugins',
                'interactionMode']; // ← AJOUT DE interactionMode !
            
            safeDirectProps.forEach(prop => {
                if (config.hasOwnProperty(prop)) {
                    mergedConfig[prop] = config[prop];
                }
            });
            
            // Manually merge nested objects (safer than deep merge)
            if (config.style && typeof config.style === 'object') {
                mergedConfig.style = { ...defaultConfig.style, ...config.style };
            }
            
            if (config.controls && typeof config.controls === 'object') {
                mergedConfig.controls = { ...defaultConfig.controls, ...config.controls };
            }
            
            if (config.regions && typeof config.regions === 'object') {
                mergedConfig.regions = { ...defaultConfig.regions, ...config.regions };
            }
            
            // Plugin configurations
            const pluginConfigs = ['timeline', 'minimap', 'zoom', 'hover', 'spectrogram', 'record', 'envelope'];
            pluginConfigs.forEach(plugin => {
                if (config[plugin] && typeof config[plugin] === 'object') {
                    mergedConfig[plugin] = { ...defaultConfig[plugin], ...config[plugin] };
                }
            });
            
            // Callbacks - handle carefully to avoid circular references
            if (config.callbacks && typeof config.callbacks === 'object') {
                mergedConfig.callbacks = { ...defaultConfig.callbacks };
                Object.keys(config.callbacks).forEach(callbackName => {
                    if (typeof config.callbacks[callbackName] === 'function') {
                        mergedConfig.callbacks[callbackName] = config.callbacks[callbackName];
                    }
                });
            }
        }
        
        return mergedConfig;
    }
    
    init() {
        this.initializeComponent();
    }
    
    async initializeComponent() {
        try {
            // Load WaveSurfer.js library
            await loadWaveSurfer();
            
            // Create Shadow DOM structure
            this.createShadowStructure();
            
            // Apply positioning if specified
            this.applyPositioning();
            
            // Initialize WaveSurfer
            await this.initWaveSurfer();
            
            // Setup controls if enabled
            if (this.config.controls.enabled) {
                this.createControls();
            }
                 // Setup event handlers
        this.setupEventHandlers();
        
        // Initialize interaction mode
        this.setInteractionMode(this.config.interactionMode);
        
        // Load audio if URL provided
        if (this.config.url) {
            await this.loadAudio(this.config.url);
        }
            
            // Force layout update after plugins are loaded
            setTimeout(() => {
                this.updatePluginLayout();
            }, 500);
            
            // Register instance
            WaveSurfer.instances.set(this.id, this);
            
        } catch (error) {
            console.error('❌ WaveSurfer initialization failed:', error);
            this.config.callbacks.onError(error);
        }
    }
    
    createShadowStructure() {
        // Create CSS styles
        const styles = this.createStyles();
        
        // Create main container
        this.container = document.createElement('div');
        this.container.className = 'wavesurfer-container';
        
        // Create waveform container
        this.waveformContainer = document.createElement('div');
        this.waveformContainer.className = 'waveform-container';
        
        this.container.appendChild(this.waveformContainer);
        
        // Add to Shadow DOM
        this.shadowRoot.appendChild(styles);
        this.shadowRoot.appendChild(this.container);
    }
    
    createStyles() {
        const style = document.createElement('style');
        style.textContent = `
            :host {
                display: block;
                width: ${this.config.width}px;
                height: ${this.config.height}px;
                font-family: 'Roboto', Arial, sans-serif;
                box-sizing: border-box;
                outline: none;
            }
            
            .wavesurfer-container {
                position: relative;
                width: 100%;
                height: 100%;
                background: var(--bg-color, ${this.config.style.backgroundColor});
                border: var(--border, ${this.config.style.border});
                border-radius: var(--border-radius, ${this.config.style.borderRadius});
                box-shadow: var(--box-shadow, ${this.config.style.boxShadow});
                overflow: var(--overflow, ${this.config.style.overflow});
                box-sizing: border-box;
            }
            
            .waveform-container {
                width: 100%;
                height: ${this.calculateWaveformHeight()}px;
                position: relative;
                z-index: 1;
                overflow: visible; /* Permettre aux plugins de s'afficher */
                min-height: 100px; /* Hauteur minimale pour les plugins */
            }
            
            /* Allow WaveSurfer plugins to show properly */
            .waveform-container > div {
                position: relative !important;
                z-index: 1 !important;
                overflow: visible !important;
            }
            
            /* Enhanced styles for WaveSurfer plugins */
            .waveform-container div[data-id*="timeline"],
            .waveform-container div[id*="timeline"],
            .waveform-container .wavesurfer-timeline,
            :host div[class*="timeline"],
            div[class*="timeline"],
            [class*="timeline"] {
                display: block !important;
                position: relative !important;
                z-index: 15 !important;
                margin-bottom: 5px !important;
                height: ${this.config.timeline.height}px !important;
                min-height: ${this.config.timeline.height}px !important;
                overflow: visible !important;
                background: rgba(255,255,255,0.95) !important;
                border-bottom: 1px solid #ccc !important;
                font-size: 10px !important;
                line-height: ${this.config.timeline.height}px !important;
                visibility: visible !important;
                opacity: 1 !important;
                width: 100% !important;
            }
            
            /* Force visibility for any timeline content */
            .waveform-container * {
                overflow: visible !important;
            }
            
            /* Timeline labels and markers */
            .waveform-container div[class*="timeline"] > *,
            div[class*="timeline"] > * {
                display: block !important;
                visibility: visible !important;
                opacity: 1 !important;
                font-size: 10px !important;
                color: #666 !important;
            }
            
            .waveform-container div[data-id*="minimap"],
            .waveform-container div[id*="minimap"],
            .waveform-container .wavesurfer-minimap {
                position: relative !important;
                z-index: 10 !important;
                margin-top: 5px !important;
                height: ${this.config.minimap.height}px !important;
                overflow: visible !important;
                border-top: 1px solid #ccc !important;
            }
            
            /* General plugin visibility fixes */
            .waveform-container > div:not([class*="control"]) {
                position: relative !important;
                overflow: visible !important;
            }
            
            /* Ensure main waveform area is properly sized */
            .waveform-container canvas,
            .waveform-container svg {
                max-width: 100% !important;
                position: relative !important;
                z-index: 1 !important;
            }
            
            .controls-container {
                position: absolute;
                bottom: 0;
                left: 0;
                right: 0;
                height: 50px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                border-top: 1px solid rgba(255,255,255,0.1);
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 10px;
                padding: 0 15px;
                border-radius: 0 0 8px 8px;
                z-index: 100;
                pointer-events: auto;
            }
            
            .control-button {
                background: rgba(255,255,255,0.2);
                border: 1px solid rgba(255,255,255,0.3);
                color: white;
                padding: 8px 12px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
                transition: all 0.2s ease;
                backdrop-filter: blur(10px);
                z-index: 101;
                position: relative;
                pointer-events: auto;
            }
            
            .control-button:hover {
                background: rgba(255,255,255,0.3);
                transform: scale(1.05);
            }
            
            .mode-toggle-btn {
                font-weight: bold;
                border: 2px solid rgba(255,255,255,0.4) !important;
                min-width: 60px;
            }
            
            .mode-toggle-btn:hover {
                border-color: rgba(255,255,255,0.6) !important;
                transform: scale(1.1);
            }
            
            .clear-regions-btn {
                background: rgba(231, 76, 60, 0.3) !important;
                border: 1px solid rgba(231, 76, 60, 0.5) !important;
                font-weight: bold;
            }
            
            .clear-regions-btn:hover {
                background: rgba(231, 76, 60, 0.5) !important;
                border-color: rgba(231, 76, 60, 0.7) !important;
                transform: scale(1.1);
            }
            
            .time-display {
                color: white;
                font-family: 'Roboto Mono', monospace;
                font-size: 12px;
                margin: 0 10px;
                min-width: 80px;
                text-align: center;
            }
            
            .volume-container {
                display: flex;
                align-items: center;
                gap: 5px;
                margin-left: 15px;
                z-index: 101;
                position: relative;
            }
            
            .volume-slider {
                width: 80px;
                height: 4px;
                background: rgba(255,255,255,0.3);
                outline: none;
                border-radius: 2px;
                z-index: 102;
                position: relative;
                pointer-events: auto;
            }
        `;
        return style;
    }
    
    calculateWaveformHeight() {
        let baseHeight = 80; // Hauteur de base pour la waveform
        let additionalHeight = 0;
        
        // Ajouter de l'espace pour les plugins
        if (this.config.timeline.enabled) {
            additionalHeight += this.config.timeline.height + 15; // +15 pour les marges et bordures
        }
        
        if (this.config.minimap.enabled) {
            additionalHeight += this.config.minimap.height + 15; // +15 pour les marges et bordures
        }
        
        if (this.config.zoom.enabled) {
            additionalHeight += 35; // Espace pour le zoom
        }
        
        if (this.config.spectrogram.enabled) {
            additionalHeight += this.config.spectrogram.height + 10;
        }
        
        // Calculer la hauteur finale en fonction de la hauteur totale disponible
        const totalAvailableHeight = this.config.height - (this.config.controls.enabled ? 50 : 0);
        const calculatedHeight = Math.min(baseHeight + additionalHeight, totalAvailableHeight - 20);
        
        return Math.max(calculatedHeight, baseHeight); // Minimum hauteur de base
    }
    
    applyPositioning() {
        // Apply positioning if x and y are specified
        if (this.config.x !== undefined && this.config.y !== undefined) {
            this.style.position = 'absolute';
            this.style.left = `${this.config.x}px`;
            this.style.top = `${this.config.y}px`;
        }
    }
    
    async initWaveSurfer() {
        if (!WaveSurferLib) {
            throw new Error('WaveSurfer.js library not loaded');
        }
        
        // Load plugins automatically if enabled
        if (this.config.autoLoadPlugins && PluginLoader) {
            await this._loadRequiredPlugins();
        }
        
        // Prepare plugins array
        const plugins = [...(this.config.plugins || [])];
        
        // Add enabled plugins
        await this._addEnabledPlugins(plugins);
        
        // Prepare WaveSurfer options
        const options = {
            container: this.waveformContainer,
            waveColor: this.config.waveColor,
            progressColor: this.config.progressColor,
            cursorColor: this.config.cursorColor,
            barWidth: this.config.barWidth,
            barRadius: this.config.barRadius,
            responsive: this.config.responsive,
            interact: this.config.interact,
            dragToSeek: this.config.dragToSeek,
            hideScrollbar: this.config.hideScrollbar,
            normalize: this.config.normalize,
            backend: this.config.backend,
            mediaControls: this.config.mediaControls,
            plugins: plugins
        };
        
        // Initialize WaveSurfer instance
        this.wavesurfer = WaveSurferLib.create(options);
        
        // Force initial mode setup after creation but before ready
        this.currentMode = this.config.interactionMode;
        
        console.log(`🎵 WaveSurfer Web Component "${this.id}" created`);
        console.log(`🎯 Initial mode set to: ${this.currentMode}`);
        console.log(`🔌 Plugins actifs: ${plugins.length}`);
        console.log(`📋 Plugins array:`, plugins.map(p => p.constructor?.name || 'Unknown'));
        console.log(`📋 Configuration plugins:`, {
            regions: this.config.regions.enabled,
            timeline: this.config.timeline.enabled,
            minimap: this.config.minimap.enabled,
            zoom: this.config.zoom.enabled,
            hover: this.config.hover.enabled
        });
    }
    
    async _loadRequiredPlugins() {
        // Determine which plugins to load based on configuration
        const pluginsToLoad = new Set();
        
        // Add plugins based on enabled features
        if (this.config.regions.enabled) pluginsToLoad.add('regions');
        if (this.config.timeline.enabled) pluginsToLoad.add('timeline');
        if (this.config.minimap.enabled) pluginsToLoad.add('minimap');
        if (this.config.zoom.enabled) pluginsToLoad.add('zoom');
        if (this.config.hover.enabled) pluginsToLoad.add('spectrogram');
        if (this.config.record.enabled) pluginsToLoad.add('record');
        if (this.config.envelope.enabled) pluginsToLoad.add('envelope');
        
        // Add explicitly enabled plugins
        this.config.enabledPlugins.forEach(name => pluginsToLoad.add(name));
        
        // Load all required plugins for v7
        for (const pluginName of pluginsToLoad) {
            try {
                const pluginModule = await import(`../../js/wavesurfer-v7/plugins/${pluginName}.esm.js`);
                this.plugins.set(pluginName, pluginModule.default);
                console.log(`✅ Plugin ${pluginName} loaded for v7`);
            } catch (error) {
                console.warn(`⚠️ Failed to load plugin ${pluginName}:`, error);
            }
        }
    }
    
    async _addEnabledPlugins(plugins) {
        // Add regions plugin
        if (this.config.regions.enabled && this.plugins.has('regions')) {
            const RegionsPlugin = this.plugins.get('regions');
            if (RegionsPlugin) {
                // Configuration simple SANS dragSelection qui ne marche pas
                const regionsConfig = {
                    regionLabelFormatter: (region, index) => `Region ${index + 1}`
                };
                
                plugins.push(RegionsPlugin.create(regionsConfig));
                console.log('🎯 Regions plugin ajouté (v7) - dragSelection sera contrôlé manuellement');
            }
        }
        
        // Add timeline plugin
        if (this.config.timeline.enabled && this.plugins.has('timeline')) {
            const TimelinePlugin = this.plugins.get('timeline');
            if (TimelinePlugin) {
                // Configuration complète comme dans l'exemple avec ruler
                const timelineConfig = {
                    height: this.config.timeline.height,
                    timeInterval: 0.2,
                    primaryLabelInterval: 5,
                    style: {
                        fontSize: '10px',
                        color: '#666'
                    }
                };
                
                console.log('⏰ Creating timeline plugin with config:', timelineConfig);
                const timelineInstance = TimelinePlugin.create(timelineConfig);
                console.log('⏰ Timeline plugin instance created:', timelineInstance);
                
                plugins.push(timelineInstance);
                console.log('⏰ Timeline plugin ajouté (v7) avec config complète:', timelineConfig);
            } else {
                console.warn('⏰ Timeline plugin class not found');
            }
        } else {
            console.log('⏰ Timeline plugin skipped - enabled:', this.config.timeline.enabled, 'loaded:', this.plugins.has('timeline'));
        }
        
        // Add minimap plugin
        if (this.config.minimap.enabled && this.plugins.has('minimap')) {
            const MinimapPlugin = this.plugins.get('minimap');
            if (MinimapPlugin) {
                plugins.push(MinimapPlugin.create({
                    height: this.config.minimap.height
                }));
                console.log('🗺️ Minimap plugin ajouté (v7)');
            }
        }
        
        // Add zoom plugin
        if (this.config.zoom.enabled && this.plugins.has('zoom')) {
            const ZoomPlugin = this.plugins.get('zoom');
            if (ZoomPlugin) {
                plugins.push(ZoomPlugin.create({
                    scale: this.config.zoom.scale
                }));
                console.log('🔍 Zoom plugin ajouté (v7)');
            }
        }
        
        // Add hover plugin
        if (this.config.hover.enabled && this.plugins.has('hover')) {
            const HoverPlugin = this.plugins.get('hover');
            if (HoverPlugin) {
                plugins.push(HoverPlugin.create({
                    formatTimeCallback: this.config.hover.formatTimeCallback
                }));
                console.log('👆 Hover plugin ajouté (v7)');
            }
        }
        
        // Add spectrogram plugin
        if (this.config.spectrogram.enabled && this.plugins.has('spectrogram')) {
            const SpectrogramPlugin = this.plugins.get('spectrogram');
            if (SpectrogramPlugin) {
                plugins.push(SpectrogramPlugin.create({
                    height: this.config.spectrogram.height
                }));
                console.log('📊 Spectrogram plugin ajouté (v7)');
            }
        }
        
        // Add record plugin
        if (this.config.record.enabled && this.plugins.has('record')) {
            const RecordPlugin = this.plugins.get('record');
            if (RecordPlugin) {
                plugins.push(RecordPlugin.create(this.config.record));
                console.log('🎙️ Record plugin ajouté (v7)');
            }
        }
        
        // Add envelope plugin
        if (this.config.envelope.enabled && this.plugins.has('envelope')) {
            const EnvelopePlugin = this.plugins.get('envelope');
            if (EnvelopePlugin) {
                plugins.push(EnvelopePlugin.create(this.config.envelope));
                console.log('📈 Envelope plugin ajouté (v7)');
            }
        }
    }
    
    createControls() {
        const controls = this.config.controls;
        
        // Create controls container
        this.controlsContainer = document.createElement('div');
        this.controlsContainer.className = 'controls-container';
        
        // Play/Pause button
        if (controls.play || controls.pause) {
            this.playPauseBtn = this.createButton('▶️', 'Play/Pause', () => {
                this.isPlaying ? this.pause() : this.play();
            });
            this.controlsContainer.appendChild(this.playPauseBtn);
        }
        
        // Stop button
        if (controls.stop) {
            this.stopBtn = this.createButton('⏹️', 'Stop', () => {
                this.stop();
            });
            this.controlsContainer.appendChild(this.stopBtn);
        }
        
        // Time display
        this.timeDisplay = document.createElement('span');
        this.timeDisplay.className = 'time-display';
        this.timeDisplay.textContent = '00:00 / 00:00';
        this.controlsContainer.appendChild(this.timeDisplay);
        
        // Volume control
        if (controls.volume) {
            this.volumeContainer = document.createElement('div');
            this.volumeContainer.className = 'volume-container';
            
            // Mute button
            if (controls.mute) {
                this.muteBtn = this.createButton('🔊', 'Mute', () => {
                    this.toggleMute();
                });
                this.volumeContainer.appendChild(this.muteBtn);
            }
            
            // Volume slider
            this.volumeSlider = document.createElement('input');
            this.volumeSlider.type = 'range';
            this.volumeSlider.min = '0';
            this.volumeSlider.max = '100';
            this.volumeSlider.value = '100';
            this.volumeSlider.className = 'volume-slider';
            
            this.volumeSlider.addEventListener('input', (e) => {
                this.setVolume(parseInt(e.target.value) / 100);
            });
            
            this.volumeContainer.appendChild(this.volumeSlider);
            this.controlsContainer.appendChild(this.volumeContainer);
        }
        
        // Download button
        if (controls.download) {
            this.downloadBtn = this.createButton('💾', 'Download', () => {
                this.downloadAudio();
            });
            this.controlsContainer.appendChild(this.downloadBtn);
        }
        
        // Mode toggle button (scrub vs selection)
        if (controls.modeToggle) {
            this.modeToggleBtn = this.createButton(
                this.currentMode === 'scrub' ? '🎯' : '✋', 
                `Current: ${this.currentMode.toUpperCase()} mode - Click to toggle`, 
                () => {
                    this.toggleInteractionMode();
                }
            );
            this.modeToggleBtn.className = 'control-button mode-toggle-btn';
            this.controlsContainer.appendChild(this.modeToggleBtn);
        }

        // Loop button
        if (controls.loop) {
            this.loopBtn = this.createButton('🔁', 'Toggle Loop', () => {
                this.toggleLoop();
            });
            this.controlsContainer.appendChild(this.loopBtn);
        }

        // Clear Regions button
        if (controls.clearRegions) {
            this.clearRegionsBtn = this.createButton('🗑️', 'Clear All Regions', () => {
                this.clearRegions();
            });
            this.clearRegionsBtn.className = 'control-button clear-regions-btn';
            this.controlsContainer.appendChild(this.clearRegionsBtn);
        }

        this.container.appendChild(this.controlsContainer);
    }
    
    createButton(text, title, onClick) {
        const button = document.createElement('button');
        button.textContent = text;
        button.title = title;
        button.className = 'control-button';
        button.addEventListener('click', onClick);
        return button;
    }
    
    setupEventHandlers() {
        if (!this.wavesurfer) return;
        
        // Ready event
        this.wavesurfer.on('ready', () => {
            this.isReady = true;
            this.updateTimeDisplay();
            this.updatePluginLayout(); // Forcer la mise à jour de la mise en page des plugins
            
            // DIAGNOSTIC TIMELINE - Vérifier si le timeline est présent
            this.diagnosticTimeline();
            
            // Try to force timeline visibility after ready
            setTimeout(() => {
                this.forceTimelineVisibility();
                // Additional timeline rendering attempt
                this.renderTimelineManually();
            }, 200);
            
            // Apply the initial interaction mode from config with delay to ensure plugins are ready
            setTimeout(() => {
                console.log(`🎯 Applying initial mode: ${this.config.interactionMode}`);
                
                // Store original dragSelection setting before applying mode
                const plugins = this.wavesurfer.getActivePlugins ? this.wavesurfer.getActivePlugins() : [];
                const regionsPlugin = plugins.find(plugin => 
                    plugin.constructor?.name === 'RegionsPlugin' || 
                    plugin.name === 'regions' ||
                    typeof plugin.addRegion === 'function' ||
                    plugin._name === 'regions'
                );
                
                if (regionsPlugin) {
                    // Check for enableDragSelection first, then dragSelection
                    this._originalDragSelection = regionsPlugin.options?.enableDragSelection !== undefined ? 
                        regionsPlugin.options.enableDragSelection : 
                        (regionsPlugin.options?.dragSelection !== undefined ? 
                            regionsPlugin.options.dragSelection : true);
                    console.log(`🎯 Stored original dragSelection: ${this._originalDragSelection}`);
                }
                
                this.setInteractionMode(this.config.interactionMode);
                
                // Ensure loop is properly configured
                this.ensureLoopConfiguration();
            }, 100);
            
            console.log(`🎵 WaveSurfer Web Component "${this.id}" is ready`);
            this.config.callbacks.onReady(this);
            this.dispatchEvent(new CustomEvent('ready', { detail: { wavesurfer: this } }));
        });
        
        // Play event
        this.wavesurfer.on('play', () => {
            this.isPlaying = true;
            if (this.playPauseBtn) {
                this.playPauseBtn.textContent = '⏸️';
            }
            this.config.callbacks.onPlay(this);
            this.dispatchEvent(new CustomEvent('play', { detail: { wavesurfer: this } }));
        });
        
        // Pause event
        this.wavesurfer.on('pause', () => {
            this.isPlaying = false;
            if (this.playPauseBtn) {
                this.playPauseBtn.textContent = '▶️';
            }
            this.config.callbacks.onPause(this);
            this.dispatchEvent(new CustomEvent('pause', { detail: { wavesurfer: this } }));
        });
        
        // Finish event
        this.wavesurfer.on('finish', () => {
            // Handle looping BEFORE setting isPlaying to false
            if (this.isLooping) {
                console.log('🔁 Loop enabled - restarting playback');
                // Restart immediately without delay
                this.wavesurfer.seekTo(0);
                this.wavesurfer.play().then(() => {
                    console.log('🔁 Loop restarted successfully');
                }).catch(error => {
                    console.error('🔁 Loop restart failed:', error);
                    this.isPlaying = false;
                    if (this.playPauseBtn) {
                        this.playPauseBtn.textContent = '▶️';
                    }
                });
                // Don't execute the rest if looping
                return;
            }
            
            // Only execute finish logic if not looping
            this.isPlaying = false;
            if (this.playPauseBtn) {
                this.playPauseBtn.textContent = '▶️';
            }
            
            this.config.callbacks.onFinish(this);
            this.dispatchEvent(new CustomEvent('finish', { detail: { wavesurfer: this } }));
        });
        
        // Seek event
        this.wavesurfer.on('seeking', (currentTime) => {
            this.currentTime = currentTime;
            this.updateTimeDisplay();
            this.config.callbacks.onSeek(currentTime, this);
            this.dispatchEvent(new CustomEvent('seek', { detail: { currentTime, wavesurfer: this } }));
        });
        
        // Time update event
        this.wavesurfer.on('timeupdate', (currentTime) => {
            this.currentTime = currentTime;
            this.updateTimeDisplay();
            this.config.callbacks.onTimeUpdate(currentTime, this);
            this.dispatchEvent(new CustomEvent('timeupdate', { detail: { currentTime, wavesurfer: this } }));
        });
        
        // Error handling
        this.wavesurfer.on('error', (error) => {
            console.error(`❌ WaveSurfer Web Component "${this.id}" error:`, error);
            this.config.callbacks.onError(error);
            this.dispatchEvent(new CustomEvent('error', { detail: { error, wavesurfer: this } }));
        });
        
        // Region events (if regions plugin is enabled)
        if (this.config.regions.enabled) {
            this.setupRegionEvents();
        }
    }
    
    setupRegionEvents() {
        if (!this.wavesurfer) return;
        
        // For WaveSurfer v7+, we need to listen to region events from the regions plugin
        try {
            // Get regions plugin instance with better detection
            const plugins = this.wavesurfer.getActivePlugins ? this.wavesurfer.getActivePlugins() : [];
            const regionsPlugin = plugins.find(plugin => 
                plugin.constructor?.name === 'RegionsPlugin' || 
                plugin.name === 'regions' ||
                typeof plugin.addRegion === 'function' ||
                plugin._name === 'regions'
            );
            
            if (regionsPlugin) {
                console.log('🎯 Setting up region events for RegionsPlugin');
                
                // Region creation via drag selection or addRegion
                regionsPlugin.on('region-created', (region) => {
                    this.regions.set(region.id, region);
                    console.log(`🎯 Region created: ${region.id}`, region);
                    this.config.callbacks.onRegionCreate(region, this);
                    this.dispatchEvent(new CustomEvent('region-created', { detail: { region, wavesurfer: this } }));
                });
                
                // Region update (drag/resize)
                regionsPlugin.on('region-updated', (region) => {
                    console.log(`🎯 Region updated: ${region.id}`, region);
                    this.config.callbacks.onRegionUpdate(region, this);
                    this.dispatchEvent(new CustomEvent('region-updated', { detail: { region, wavesurfer: this } }));
                });
                
                // Region removal
                regionsPlugin.on('region-removed', (region) => {
                    this.regions.delete(region.id);
                    console.log(`🎯 Region removed: ${region.id}`);
                    this.config.callbacks.onRegionRemove(region, this);
                    this.dispatchEvent(new CustomEvent('region-removed', { detail: { region, wavesurfer: this } }));
                });
                
                // Region click/select
                regionsPlugin.on('region-clicked', (region, e) => {
                    console.log(`🎯 Region clicked: ${region.id}`);
                    this.dispatchEvent(new CustomEvent('region-clicked', { detail: { region, event: e, wavesurfer: this } }));
                });
                
                // Double click on region
                regionsPlugin.on('region-double-clicked', (region, e) => {
                    console.log(`🎯 Region double-clicked: ${region.id}`);
                    this.dispatchEvent(new CustomEvent('region-double-clicked', { detail: { region, event: e, wavesurfer: this } }));
                });
                
            } else {
                console.warn('🎯 No regions plugin found - region events not available');
            }
            
        } catch (error) {
            console.error('🎯 Error setting up region events:', error);
        }
    }
    
    updateTimeDisplay() {
        if (!this.timeDisplay || !this.wavesurfer) return;
        
        const current = this.formatTime(this.currentTime);
        const total = this.formatTime(this.wavesurfer.getDuration() || 0);
        this.timeDisplay.textContent = `${current} / ${total}`;
    }
    
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    
    // Public API Methods
    
    async loadAudio(url, peaks = null) {
        if (!this.wavesurfer) {
            throw new Error('WaveSurfer not initialized');
        }
        
        try {
            if (peaks) {
                await this.wavesurfer.load(url, peaks);
            } else {
                await this.wavesurfer.load(url);
            }
            
            this.config.url = url;
            this.config.peaks = peaks;
            
            // Ensure loop configuration is applied after loading
            setTimeout(() => {
                this.ensureLoopConfiguration();
            }, 100);
            
            console.log(`🎵 Audio loaded: ${url}`);
            return this;
        } catch (error) {
            console.error('❌ Failed to load audio:', error);
            this.config.callbacks.onError(error);
            throw error;
        }
    }
    
    play() {
        if (this.wavesurfer && this.isReady) {
            this.wavesurfer.play();
        }
        return this;
    }
    
    pause() {
        if (this.wavesurfer && this.isReady) {
            this.wavesurfer.pause();
        }
        return this;
    }
    
    stop() {
        if (this.wavesurfer && this.isReady) {
            this.wavesurfer.stop();
        }
        return this;
    }
    
    seekTo(progress) {
        if (this.wavesurfer && this.isReady) {
            this.wavesurfer.seekTo(progress);
        }
        return this;
    }
    
    setVolume(volume) {
        if (this.wavesurfer && this.isReady) {
            this.wavesurfer.setVolume(volume);
            if (this.volumeSlider) {
                this.volumeSlider.value = volume * 100;
            }
        }
        return this;
    }
    
    toggleMute() {
        if (this.wavesurfer && this.isReady) {
            const isMuted = this.wavesurfer.getMuted();
            this.wavesurfer.setMuted(!isMuted);
            
            if (this.muteBtn) {
                this.muteBtn.textContent = isMuted ? '🔊' : '🔇';
            }
        }
        return this;
    }
    
    toggleLoop() {
        if (this.wavesurfer && this.isReady) {
            // Toggle internal loop state
            this.isLooping = !this.isLooping;
            
            console.log(`🔁 Loop ${this.isLooping ? 'enabled' : 'disabled'}`);
            
            // Update button appearance
            if (this.loopBtn) {
                this.loopBtn.textContent = this.isLooping ? '🔂' : '🔁';
                this.loopBtn.style.background = this.isLooping ? 'rgba(46, 204, 113, 0.4)' : 'rgba(255,255,255,0.2)';
                this.loopBtn.title = this.isLooping ? 'Loop enabled - Click to disable' : 'Loop disabled - Click to enable';
            }
        }
        return this;
    }
    
    ensureLoopConfiguration() {
        // WaveSurfer v7 doesn't have built-in loop support
        // Loop is handled manually in the 'finish' event
        console.log(`🔁 Loop state: ${this.isLooping ? 'enabled' : 'disabled'} (manual implementation)`);
    }
    
    getCurrentTime() {
        return this.wavesurfer ? this.wavesurfer.getCurrentTime() : 0;
    }
    
    getDuration() {
        return this.wavesurfer ? this.wavesurfer.getDuration() : 0;
    }
    
    getPlaybackRate() {
        return this.wavesurfer ? this.wavesurfer.getPlaybackRate() : 1;
    }
    
    setPlaybackRate(rate) {
        if (this.wavesurfer && this.isReady) {
            this.wavesurfer.setPlaybackRate(rate);
        }
        return this;
    }
    
    // Region management (requires regions plugin)
    addRegion(options) {
        if (!this.config.regions.enabled || !this.wavesurfer) {
            console.warn('🎯 Regions not enabled or WaveSurfer not ready');
            return null;
        }
        
        try {
            // For WaveSurfer v7+, check if regions plugin is available
            const plugins = this.wavesurfer.getActivePlugins ? this.wavesurfer.getActivePlugins() : [];
            const regionsPlugin = plugins.find(plugin => 
                plugin.constructor.name === 'RegionsPlugin' || 
                plugin.name === 'regions' ||
                typeof plugin.addRegion === 'function'
            );
            
            if (regionsPlugin && typeof regionsPlugin.addRegion === 'function') {
                const region = regionsPlugin.addRegion(options);
                console.log(`🎯 Region created: ${options.start?.toFixed(2)}s - ${options.end?.toFixed(2)}s`);
                return region;
            }
            
            // Fallback: try direct method if available
            if (this.wavesurfer.addRegion && typeof this.wavesurfer.addRegion === 'function') {
                const region = this.wavesurfer.addRegion(options);
                console.log(`🎯 Region created (fallback): ${options.start?.toFixed(2)}s - ${options.end?.toFixed(2)}s`);
                return region;
            }
            
            console.warn('🎯 No regions functionality available - regions plugin may not be loaded');
            return null;
            
        } catch (error) {
            console.error('🎯 Error creating region:', error);
            return null;
        }
    }
    
    removeRegion(regionId) {
        const region = this.regions.get(regionId);
        if (region) {
            region.remove();
        }
        return this;
    }
    
    clearRegions() {
        if (!this.wavesurfer || !this.config.regions.enabled) {
            console.warn('🗑️ WaveSurfer not ready or regions not enabled');
            return this;
        }

        try {
            // For WaveSurfer v7+, get the regions plugin
            const plugins = this.wavesurfer.getActivePlugins ? this.wavesurfer.getActivePlugins() : [];
            const regionsPlugin = plugins.find(plugin => 
                plugin.constructor?.name === 'RegionsPlugin' || 
                plugin.name === 'regions' ||
                typeof plugin.addRegion === 'function' ||
                plugin._name === 'regions'
            );

            if (regionsPlugin) {
                // Clear all regions through the plugin
                if (typeof regionsPlugin.clearRegions === 'function') {
                    regionsPlugin.clearRegions();
                    console.log('🗑️ ✅ All regions cleared via RegionsPlugin.clearRegions()');
                } else {
                    // Alternative: remove all regions individually
                    const allRegions = Array.from(this.regions.values());
                    allRegions.forEach(region => {
                        if (region && typeof region.remove === 'function') {
                            region.remove();
                        }
                    });
                    console.log(`🗑️ ✅ Cleared ${allRegions.length} regions individually`);
                }
                
                // Clear our internal regions map
                this.regions.clear();
                
            } else {
                // Fallback: try direct WaveSurfer method
                if (this.wavesurfer.clearRegions && typeof this.wavesurfer.clearRegions === 'function') {
                    this.wavesurfer.clearRegions();
                    this.regions.clear();
                    console.log('🗑️ ✅ All regions cleared via WaveSurfer.clearRegions() fallback');
                } else {
                    console.warn('🗑️ No clearRegions method available - regions plugin may not be loaded');
                }
            }

        } catch (error) {
            console.error('🗑️ Error clearing regions:', error);
        }

        return this;
    }
    
    getRegions() {
        return Array.from(this.regions.values());
    }
    
    // Export/download functionality
    downloadAudio() {
        if (!this.config.url) {
            console.warn('No audio URL to download');
            return;
        }
        
        const link = document.createElement('a');
        link.href = this.config.url;
        link.download = this.config.url.split('/').pop() || 'audio.wav';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    
    exportImage() {
        if (this.wavesurfer && this.isReady) {
            return this.wavesurfer.exportImage();
        }
        return null;
    }
    
    // Positioning and styling
    setPosition(x, y) {
        this.config.x = x;
        this.config.y = y;
        
        this.style.left = `${x}px`;
        this.style.top = `${y}px`;
        
        return this;
    }
    
    setSize(width, height) {
        this.config.width = width;
        this.config.height = height;
        
        this.style.width = `${width}px`;
        this.style.height = `${height}px`;
        
        return this;
    }
    
    setColors(colors) {
        Object.assign(this.config, colors);
        
        if (this.wavesurfer && this.isReady) {
            if (colors.waveColor) this.wavesurfer.setOptions({ waveColor: colors.waveColor });
            if (colors.progressColor) this.wavesurfer.setOptions({ progressColor: colors.progressColor });
            if (colors.cursorColor) this.wavesurfer.setOptions({ cursorColor: colors.cursorColor });
        }
        return this;
    }
    
    // Cleanup
    destroy() {
        console.log(`🗑️ Destroying WaveSurfer Web Component "${this.id}"`);
        
        // Stop playback
        if (this.wavesurfer) {
            this.wavesurfer.stop();
            this.wavesurfer.destroy();
        }
        
        // Remove from registry
        WaveSurfer.instances.delete(this.id);
        
        // Clear references
        this.wavesurfer = null;
        this.container = null;
        this.waveformContainer = null;
        this.controlsContainer = null;
        this.regions.clear();
    }
    
    // Interaction Mode Management
    toggleInteractionMode() {
        const newMode = this.currentMode === 'scrub' ? 'selection' : 'scrub';
        this.setInteractionMode(newMode);
        return this;
    }
    
    setInteractionMode(mode) {
        if (!['scrub', 'selection'].includes(mode)) {
            console.warn(`Invalid interaction mode: ${mode}. Use 'scrub' or 'selection'.`);
            return this;
        }
        
        const oldMode = this.currentMode;
        this.currentMode = mode;
        
        if (this.wavesurfer && this.isReady) {
            this.updateWaveSurferInteraction();
        }
        
        // Update mode toggle button
        if (this.modeToggleBtn) {
            this.modeToggleBtn.textContent = mode === 'scrub' ? '🎯' : '✋';
            this.modeToggleBtn.title = `Current: ${mode.toUpperCase()} mode - Click to toggle`;
            this.modeToggleBtn.style.background = mode === 'scrub' ? 
                'rgba(46, 204, 113, 0.3)' : 'rgba(231, 76, 60, 0.3)';
        }
        
        console.log(`🔄 Interaction mode changed: ${oldMode} → ${mode}`);
        
        // Dispatch mode change event
        this.dispatchEvent(new CustomEvent('mode-changed', { 
            detail: { oldMode, newMode: mode, wavesurfer: this } 
        }));
        
        return this;
    }
    
    getInteractionMode() {
        return this.currentMode;
    }
    
    updateWaveSurferInteraction() {
        if (!this.wavesurfer || !this.isReady) return;
        
        console.log(`🎯 === UPDATING INTERACTION MODE TO: ${this.currentMode.toUpperCase()} ===`);
        
        // Get regions plugin with better detection
        const plugins = this.wavesurfer.getActivePlugins ? this.wavesurfer.getActivePlugins() : [];
        const regionsPlugin = plugins.find(plugin => 
            plugin.constructor?.name === 'RegionsPlugin' || 
            plugin.name === 'regions' ||
            typeof plugin.addRegion === 'function' ||
            plugin._name === 'regions'
        );
        
        if (this.currentMode === 'scrub') {
            // Enable seeking mode - wavesurfer handles clicks for seeking
            this.wavesurfer.setOptions({ 
                interact: true,
                dragToSeek: true 
            });
            
            // Disable region drag selection by calling the destroy function
            if (this._dragSelectionDestroy && typeof this._dragSelectionDestroy === 'function') {
                try {
                    this._dragSelectionDestroy();
                    this._dragSelectionDestroy = null;
                    console.log('🎯 ✅ Scrub mode: Region drag selection DISABLED');
                } catch (error) {
                    console.warn('🎯 Error disabling drag selection:', error);
                }
            }
            
            console.log('🎯 Scrub mode: Click to seek, drag to scrub through audio');
            
        } else if (this.currentMode === 'selection') {
            // Enable region creation mode - disable seeking temporarily
            this.wavesurfer.setOptions({ 
                interact: true,
                dragToSeek: false 
            });
            
            // Enable region drag selection
            if (regionsPlugin && typeof regionsPlugin.enableDragSelection === 'function') {
                try {
                    // The enableDragSelection method returns a cleanup function
                    this._dragSelectionDestroy = regionsPlugin.enableDragSelection({
                        color: 'rgba(231, 76, 60, 0.3)'
                    });
                    console.log('🎯 ✅ Selection mode: Region drag selection ENABLED');
                } catch (error) {
                    console.warn('🎯 Error enabling drag selection:', error);
                }
            } else {
                console.warn('🎯 RegionsPlugin not found or enableDragSelection not available');
            }
            
            console.log('🎯 Selection mode: Click to position, drag to create regions');
        }
        
        // Force layout update to ensure proper interaction
        setTimeout(() => {
            this.updatePluginLayout();
        }, 100);
    }
    
    // Plugin layout management
    updatePluginLayout() {
        if (!this.wavesurfer || !this.isReady) return;
        
        // Force une mise à jour de la mise en page
        setTimeout(() => {
            // Recalculer les dimensions du container
            const waveformHeight = this.calculateWaveformHeight();
            if (this.waveformContainer) {
                this.waveformContainer.style.height = `${waveformHeight}px`;
                this.waveformContainer.style.overflow = 'visible';
            }
            
            // Forcer la re-render des plugins
            if (this.wavesurfer.drawer && typeof this.wavesurfer.drawer.fireEvent === 'function') {
                this.wavesurfer.drawer.fireEvent('redraw');
            }
            
            // Ajuster le z-index des éléments plugins
            const pluginElements = this.waveformContainer.querySelectorAll('[data-plugin]');
            pluginElements.forEach((element, index) => {
                element.style.position = 'relative';
                element.style.zIndex = `${10 + index}`;
                element.style.overflow = 'visible';
            });
            
            // Vérifier et diagnostiquer les régions
            this.checkRegionsStatus();
            
            console.log(`🎨 Layout des plugins mis à jour pour ${this.id}`);
        }, 100);
    }
    
    // Méthode pour diagnostiquer les problèmes de régions
    checkRegionsStatus() {
        if (!this.config.regions.enabled) {
            console.log('🎯 Regions disabled in config');
            return;
        }
        
        if (!this.wavesurfer) {
            console.warn('🎯 WaveSurfer not initialized');
            return;
        }
        
        // Vérifier les plugins actifs
        const plugins = this.wavesurfer.getActivePlugins ? this.wavesurfer.getActivePlugins() : [];
        console.log('🔌 Active plugins:', plugins.map(p => p.constructor?.name || p.name || 'Unknown'));
        
        const regionsPlugin = plugins.find(plugin => 
            plugin.constructor?.name === 'RegionsPlugin' || 
            plugin.name === 'regions' ||
            typeof plugin.addRegion === 'function' ||
            plugin._name === 'regions'
        );
        
        if (regionsPlugin) {
            console.log('🎯 RegionsPlugin found and active');
            console.log('🎯 Drag selection enabled:', regionsPlugin.options?.dragSelection || regionsPlugin.dragSelection);
            
            // Forcer l'activation de la sélection par glisser-déposer
            if (this.config.regions.dragSelection && regionsPlugin.options) {
                regionsPlugin.options.dragSelection = true;
                regionsPlugin.options.enableDragSelection = true;
                console.log('🎯 Forced enable drag selection');
            }
            
            // Vérifier que le conteneur du plugin est bien configuré
            const regionsContainer = this.waveformContainer.querySelector('[data-plugin="regions"]') ||
                                   this.waveformContainer.querySelector('.wavesurfer-regions');
            
            if (regionsContainer) {
                regionsContainer.style.pointerEvents = 'auto';
                regionsContainer.style.position = 'relative';
                regionsContainer.style.zIndex = '20';
                console.log('🎯 Regions container configured for interaction');
            }
            
            // Ajouter des instructions pour l'utilisateur
            console.log('🎯 ✅ Drag selection is ready! Click and drag on the waveform to create regions.');
            
        } else {
            console.warn('🎯 ❌ RegionsPlugin not found! Regions will not work.');
            console.log('🎯 Available plugins:', plugins.length);
            
            // Essayer de recharger le plugin regions si pas trouvé
            if (this.plugins.has('regions')) {
                console.log('🎯 Attempting to reload regions plugin...');
                this.forceEnableRegions();
            }
        }
    }
    
    // Méthode pour forcer l'activation des régions si elles ne marchent pas
    async forceEnableRegions() {
        try {
            const RegionsPlugin = this.plugins.get('regions');
            if (RegionsPlugin && this.wavesurfer) {
                // Ajouter le plugin manuellement si ce n'est pas fait
                const regionsInstance = RegionsPlugin.create({
                    dragSelection: true,
                    enableDragSelection: true,
                    regionLabelFormatter: (region, index) => `Region ${index + 1}`
                });
                
                this.wavesurfer.registerPlugin(regionsInstance);
                
                // Reconfigurer les événements
                this.setupRegionEvents();
                
                console.log('🎯 ✅ Regions plugin force-enabled!');
                return true;
            }
        } catch (error) {
            console.error('🎯 ❌ Failed to force enable regions:', error);
        }
        return false;
   }

    // Debug method to inspect plugins
    debugPlugins() {
        if (!this.wavesurfer) {
            console.log('🔌 No WaveSurfer instance');
            return;
        }
        
        const plugins = this.wavesurfer.getActivePlugins ? this.wavesurfer.getActivePlugins() : [];
        console.log('🔌 === PLUGIN DIAGNOSIS ===');
        console.log('🔌 Total active plugins:', plugins.length);
        
        plugins.forEach((plugin, index) => {
            console.log(`🔌 Plugin ${index}:`, {
                constructor: plugin.constructor?.name,
                name: plugin.name,
                _name: plugin._name,
                type: typeof plugin,
                hasAddRegion: typeof plugin.addRegion === 'function',
                hasDragSelection: 'dragSelection' in plugin,
                hasOptions: !!plugin.options,
                optionsDragSelection: plugin.options?.dragSelection,
                directDragSelection: plugin.dragSelection,
                keys: Object.keys(plugin).slice(0, 10) // First 10 keys
            });
        });
        
        // Try to find regions plugin with all possible methods
        const regionsPlugin = plugins.find(plugin => 
            plugin.constructor?.name === 'RegionsPlugin' || 
            plugin.name === 'regions' ||
            typeof plugin.addRegion === 'function' ||
            plugin._name === 'regions'
        );
        
        console.log('🎯 Regions plugin found:', !!regionsPlugin);
        if (regionsPlugin) {
            console.log('🎯 Regions plugin details:', {
                dragSelection: regionsPlugin.options?.dragSelection || regionsPlugin.dragSelection,
                enableDragSelection: regionsPlugin.options?.enableDragSelection || regionsPlugin.enableDragSelection,
                hasAddRegion: typeof regionsPlugin.addRegion === 'function'
            });
        }
    }

    // DIAGNOSTIC method for timeline
    diagnosticTimeline() {
        console.log('⏰ === TIMELINE DIAGNOSTIC ===');
        
        const results = {
            enabled: this.config.timeline.enabled,
            pluginFound: false,
            domElementsCount: 0,
            containerInfo: {},
            timelineElements: [],
            activePlugins: []
        };
        
        if (!this.config.timeline.enabled) {
            console.log('⏰ Timeline disabled in config');
            results.enabled = false;
            return results;
        }

        // Check if timeline plugin is loaded
        const plugins = this.wavesurfer.getActivePlugins ? this.wavesurfer.getActivePlugins() : [];
        const timelinePlugin = plugins.find(plugin => 
            plugin.constructor?.name === 'TimelinePlugin' || 
            plugin.name === 'timeline' ||
            plugin._name === 'timeline'
        );

        results.pluginFound = !!timelinePlugin;
        results.activePlugins = plugins.map(p => p.constructor?.name || p.name || 'Unknown');
        
        // Add detailed plugin information
        if (timelinePlugin) {
            results.timelinePluginDetails = {
                constructorName: timelinePlugin.constructor?.name,
                name: timelinePlugin.name,
                _name: timelinePlugin._name,
                options: timelinePlugin.options,
                keys: Object.keys(timelinePlugin).slice(0, 15)
            };
        }
        
        console.log('⏰ Timeline plugin found:', !!timelinePlugin);
        console.log('⏰ Active plugins:', results.activePlugins);
        
        if (timelinePlugin) {
            console.log('⏰ Timeline plugin details:', results.timelinePluginDetails);
        }

        // Check DOM elements with more comprehensive selectors
        const timelineElements = this.waveformContainer.querySelectorAll(
            '[data-id*="timeline"], [id*="timeline"], .wavesurfer-timeline, [class*="timeline"], div[style*="timeline"]'
        );
        
        // Also check the shadow root and any nested containers
        const allTimelineElements = [
            ...timelineElements,
            ...this.shadowRoot.querySelectorAll('[data-id*="timeline"], [id*="timeline"], .wavesurfer-timeline, [class*="timeline"]'),
            ...this.waveformContainer.querySelectorAll('div'), // Check all divs for timeline content
        ].filter((el, index, arr) => arr.indexOf(el) === index); // Remove duplicates
        results.domElementsCount = allTimelineElements.length;
        
        console.log('⏰ Timeline DOM elements found:', allTimelineElements.length);
        
        if (allTimelineElements.length > 0) {
            allTimelineElements.forEach((el, idx) => {
                const elementInfo = {
                    tagName: el.tagName,
                    className: el.className,
                    style: el.style.cssText,
                    visible: el.offsetHeight > 0,
                    height: el.offsetHeight,
                    width: el.offsetWidth
                };
                
                results.timelineElements.push(elementInfo);
                console.log(`⏰ Timeline element ${idx}:`, elementInfo);
            });
        }

        // Check container dimensions
        results.containerInfo = {
            waveformHeight: this.calculateWaveformHeight(),
            containerHeight: this.config.height,
            timelineConfigHeight: this.config.timeline.height,
            waveformContainerHeight: this.waveformContainer.offsetHeight
        };
        
        console.log('⏰ Container info:', results.containerInfo);
        
        return results;
    }
    
    // Method to force timeline visibility
    forceTimelineVisibility() {
        console.log('⏰ === FORCING TIMELINE VISIBILITY ===');
        
        // Look for all possible timeline elements
        const allContainers = [
            this.waveformContainer,
            this.shadowRoot,
            this.container
        ];
        
        let timelineFound = false;
        
        allContainers.forEach(container => {
            if (!container) return;
            
            // Search for timeline elements with various selectors
            const timelineSelectors = [
                'div[class*="timeline"]',
                'div[id*="timeline"]', 
                '.wavesurfer-timeline',
                'div[style*="timeline"]',
                'div', // Check all divs as fallback
            ];
            
            timelineSelectors.forEach(selector => {
                const elements = container.querySelectorAll(selector);
                elements.forEach(el => {
                    // Check if this looks like a timeline element
                    if (this.isTimelineElement(el)) {
                        console.log('⏰ Found potential timeline element:', el);
                        this.makeTimelineVisible(el);
                        timelineFound = true;
                    }
                });
            });
        });
        
        if (!timelineFound) {
            console.warn('⏰ No timeline elements found to make visible');
            // Try to force timeline creation
            this.attemptTimelineRecreation();
        }
    }
    
    // Check if an element looks like a timeline
    isTimelineElement(el) {
        const text = el.textContent || '';
        const className = el.className || '';
        const style = el.style.cssText || '';
        
        // Timeline elements typically contain time markers or have timeline-related classes/styles
        return (
            text.match(/\d+:\d+/) || // Contains time format
            text.match(/\d+\.\d+s/) || // Contains seconds format
            className.includes('timeline') ||
            style.includes('timeline') ||
            (el.children.length > 5 && text.match(/\d/)) // Many children with numbers (time markers)
        );
    }
    
    // Make timeline element visible
    makeTimelineVisible(el) {
        console.log('⏰ Making timeline element visible:', el);
        
        // Apply visibility styles
        el.style.display = 'block';
        el.style.visibility = 'visible';
        el.style.opacity = '1';
        el.style.position = 'relative';
        el.style.zIndex = '15';
        el.style.height = `${this.config.timeline.height}px`;
        el.style.minHeight = `${this.config.timeline.height}px`;
        el.style.overflow = 'visible';
        el.style.background = 'rgba(255,255,255,0.9)';
        el.style.borderBottom = '1px solid #ccc';
        el.style.fontSize = '10px';
        el.style.color = '#666';
        
        // Ensure parent containers are also visible
        let parent = el.parentElement;
        while (parent && parent !== this.shadowRoot) {
            parent.style.overflow = 'visible';
            parent = parent.parentElement;
        }
    }
    
    // Attempt to recreate timeline if not found
    attemptTimelineRecreation() {
        console.log('⏰ Attempting timeline recreation...');
        
        // This is a last resort - try to reinitialize just the timeline plugin
        if (this.plugins.has('timeline') && this.wavesurfer && this.isReady) {
            try {
                const TimelinePlugin = this.plugins.get('timeline');
                const timelineConfig = {
                    height: this.config.timeline.height,
                    timeInterval: 0.2,
                    primaryLabelInterval: 5,
                    style: {
                        fontSize: '10px',
                        color: '#666'
                    }
                };
                
                // Try to add timeline plugin dynamically
                const timelineInstance = TimelinePlugin.create(timelineConfig);
                if (this.wavesurfer.registerPlugin) {
                    this.wavesurfer.registerPlugin(timelineInstance);
                    console.log('⏰ Timeline plugin recreated successfully');
                }
            } catch (error) {
                console.error('⏰ Failed to recreate timeline:', error);
            }
        }
    }
    
    // Manual timeline rendering as last resort
    renderTimelineManually() {
        console.log('⏰ === MANUAL TIMELINE RENDERING ===');
        
        if (!this.wavesurfer || !this.isReady) {
            console.warn('⏰ WaveSurfer not ready for manual timeline rendering');
            return;
        }
        
        const duration = this.wavesurfer.getDuration();
        if (!duration || duration <= 0) {
            console.warn('⏰ No audio duration available for timeline');
            return;
        }
        
        // Create a manual timeline element if none exists
        const existingTimeline = this.waveformContainer.querySelector('[class*="timeline"]');
        if (!existingTimeline) {
            console.log('⏰ Creating manual timeline element');
            
            const timelineContainer = document.createElement('div');
            timelineContainer.className = 'manual-timeline-container';
            timelineContainer.style.cssText = `
                position: relative;
                width: 100%;
                height: ${this.config.timeline.height}px;
                background: rgba(255,255,255,0.95);
                border-bottom: 1px solid #ccc;
                font-size: 10px;
                color: #666;
                z-index: 15;
                overflow: visible;
                display: flex;
                align-items: center;
                margin-bottom: 5px;
            `;
            
            // Add time markers
            const timeInterval = 0.2; // Every 0.2 seconds
            const primaryInterval = 5; // Major markers every 5 seconds
            const containerWidth = this.waveformContainer.offsetWidth;
            
            for (let time = 0; time <= duration; time += timeInterval) {
                const position = (time / duration) * containerWidth;
                const isPrimary = time % primaryInterval === 0;
                
                if (isPrimary) {
                    const marker = document.createElement('span');
                    marker.style.cssText = `
                        position: absolute;
                        left: ${position}px;
                        font-size: 10px;
                        color: #666;
                        background: rgba(255,255,255,0.9);
                        padding: 1px 3px;
                        border-radius: 2px;
                    `;
                    marker.textContent = this.formatTime(time);
                    timelineContainer.appendChild(marker);
                }
            }
            
            // Insert timeline at the top of the waveform container
            this.waveformContainer.insertBefore(timelineContainer, this.waveformContainer.firstChild);
            console.log('⏰ Manual timeline created and inserted');
        }
    }
}

// Register the Web Component
customElements.define('squirrel-wavesurfer', WaveSurfer);

/**
 * Compatibility function for classe A syntax
 * Permet d'utiliser l'ancienne syntaxe: new WaveSurferCompatible({ attach: 'body', ... })
 */
function WaveSurferCompatible(config = {}) {
    // Créer le Web Component
    const wavesurferElement = new WaveSurfer();
    
    // Merger la configuration
    wavesurferElement.config = wavesurferElement.mergeConfig(config);
    
    // Attacher au parent spécifié
    const parent = typeof config.attach === 'string' 
        ? document.querySelector(config.attach)
        : config.attach;
        
    if (!parent) {
        throw new Error(`Container not found: ${config.attach}`);
    }
    
    // Ajouter au DOM
    parent.appendChild(wavesurferElement);
    
    return wavesurferElement;
}

export default WaveSurferCompatible;