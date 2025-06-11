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
                download: false
            },
            
            // Regions support
            regions: {
                enabled: false,
                dragSelection: true,
                snapToGridPercentage: null
            },
            
            // Plugins configuration
            plugins: [],
            enabledPlugins: ['regions'], // Default plugins to load
            autoLoadPlugins: true, // Auto-load recommended plugins
            
            // Plugin-specific configurations
            timeline: { enabled: false, height: 20 },
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
                'backend', 'mediaControls', 'plugins', 'enabledPlugins', 'autoLoadPlugins'];
            
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
            .waveform-container div[id*="timeline"] {
                position: relative !important;
                z-index: 10 !important;
                margin-bottom: 5px !important;
                height: ${this.config.timeline.height}px !important;
                overflow: visible !important;
            }
            
            .waveform-container div[data-id*="minimap"],
            .waveform-container div[id*="minimap"] {
                position: relative !important;
                z-index: 10 !important;
                margin-top: 5px !important;
                height: ${this.config.minimap.height}px !important;
                overflow: visible !important;
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
            additionalHeight += this.config.timeline.height + 10; // +10 pour les marges
        }
        
        if (this.config.minimap.enabled) {
            additionalHeight += this.config.minimap.height + 10; // +10 pour les marges
        }
        
        if (this.config.zoom.enabled) {
            additionalHeight += 30; // Espace pour le zoom
        }
        
        // Calculer la hauteur finale en fonction de la hauteur totale disponible
        const totalAvailableHeight = this.config.height - (this.config.controls.enabled ? 50 : 0);
        const calculatedHeight = Math.min(baseHeight + additionalHeight, totalAvailableHeight - 20);
        
        return Math.max(calculatedHeight, 80); // Minimum 80px
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
        
        console.log(`🎵 WaveSurfer Web Component "${this.id}" created`);
        console.log(`🔌 Plugins actifs: ${plugins.length}`);
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
        if (this.config.hover.enabled) pluginsToLoad.add('hover');
        if (this.config.spectrogram.enabled) pluginsToLoad.add('spectrogram');
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
                plugins.push(RegionsPlugin.create({
                    dragSelection: this.config.regions.dragSelection
                }));
                console.log('🎯 Regions plugin ajouté (v7)');
            }
        }
        
        // Add timeline plugin
        if (this.config.timeline.enabled && this.plugins.has('timeline')) {
            const TimelinePlugin = this.plugins.get('timeline');
            if (TimelinePlugin) {
                plugins.push(TimelinePlugin.create({
                    height: this.config.timeline.height
                }));
                console.log('⏰ Timeline plugin ajouté (v7)');
            }
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
        // Region creation
        this.wavesurfer.on('region-created', (region) => {
            this.regions.set(region.id, region);
            console.log(`🎯 Region created: ${region.id}`);
            this.config.callbacks.onRegionCreate(region, this);
            this.dispatchEvent(new CustomEvent('region-created', { detail: { region, wavesurfer: this } }));
        });
        
        // Region update
        this.wavesurfer.on('region-updated', (region) => {
            console.log(`🎯 Region updated: ${region.id}`);
            this.config.callbacks.onRegionUpdate(region, this);
            this.dispatchEvent(new CustomEvent('region-updated', { detail: { region, wavesurfer: this } }));
        });
        
        // Region removal
        this.wavesurfer.on('region-removed', (region) => {
            this.regions.delete(region.id);
            console.log(`🎯 Region removed: ${region.id}`);
            this.config.callbacks.onRegionRemove(region, this);
            this.dispatchEvent(new CustomEvent('region-removed', { detail: { region, wavesurfer: this } }));
        });
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
        if (this.wavesurfer && this.config.regions.enabled) {
            this.wavesurfer.clearRegions();
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
            
            console.log(`🎨 Layout des plugins mis à jour pour ${this.id}`);
        }, 100);
    }
    
    // Static methods
    static getInstance(id) {
        return WaveSurfer.instances.get(id);
    }
    
    static getAllInstances() {
        return Array.from(WaveSurfer.instances.values());
    }
    
    static destroyAll() {
        WaveSurfer.instances.forEach(instance => instance.destroy());
        WaveSurfer.instances.clear();
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