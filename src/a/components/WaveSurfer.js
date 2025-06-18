/**
 * 🎵 WaveSurfer Web Component - Squirrel Framework
 * 
 * Component for creating interactive audio waveform visualizations
 * with playback controls, regions, and intelligent region looping.
 * Compatible with WaveSurfer.js v7.x for complete offline functionality.
 * 
 * Enhanced with intelligent region loop functionality inspired by official examples.
 * Now uses modern particle system via BaseComponent.
 * 
 * @version 5.0.0 - Modern Particle System Edition
 * @author Squirrel Framework Team
 */

import { BaseComponent } from './BaseComponent.js';

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
 * Now extends BaseComponent for modern particle system architecture
 * Enhanced with intelligent region looping based on official wavesurfer.js examples
 */
class WaveSurfer extends BaseComponent {
    static instances = new Map(); // Registry of all WaveSurfer instances
    
    constructor(config = {}) {
        super(); // Appeler le constructeur de BaseComponent
        
        // Traiter d'abord la configuration commune via BaseComponent
        this.processCommonConfig(config);
        
        // Generate unique ID
        this.id = config.id || `wavesurfer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Merge configuration with defaults
        this.config = this.mergeConfig(config);
        
        // Internal state
        this.wavesurfer = null;
        this.isReady = false;
        this.isPlaying = false;
        this.currentTime = 0;
        this.regions = new Map();
        this.plugins = new Map();
        this.currentMode = this.config.interactionMode || 'scrub';
        
        // Enhanced loop and region management
        this.isLooping = false;
        this.loopRegion = null; // Track region to loop (null = loop entire track)
        this.activeRegion = null; // Track current active region during playback
        this._dragSelectionDestroy = null;
        this._originalDragSelection = null;
        
        // Create Shadow DOM
        this.attachShadow({ mode: 'open' });
        this.initialized = false;
    }
    
    connectedCallback() {
        if (!this.initialized) {
            this.init();
            this.initialized = true;
        }
    }
    
    mergeConfig(config) {
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
                modeToggle: true,
                loop: true,
                clearRegions: true
            },
            
            // Regions support
            regions: {
                enabled: true,
                dragSelection: true,
                snapToGridPercentage: null
            },
            
            // Interaction modes
            interactionMode: 'scrub',
            
            // Plugins configuration
            plugins: [],
            enabledPlugins: ['regions', 'timeline', 'zoom'],
            autoLoadPlugins: true,
            
            // Plugin-specific configurations
            timeline: { enabled: true, height: 25, insertPosition: 'beforebegin' },
            minimap: { enabled: false, height: 50 },
            zoom: { enabled: true, scale: 0.5, wheelZoom: true },
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
        
        // Safe merge
        const mergedConfig = { ...defaultConfig };
        
        if (config) {
            // Direct properties
            const safeDirectProps = ['attach', 'x', 'y', 'width', 'height', 'url', 'peaks', 
                'waveColor', 'progressColor', 'cursorColor', 'barWidth', 'barRadius', 
                'responsive', 'interact', 'dragToSeek', 'hideScrollbar', 'normalize', 
                'backend', 'mediaControls', 'plugins', 'enabledPlugins', 'autoLoadPlugins',
                'interactionMode'];
            
            safeDirectProps.forEach(prop => {
                if (config.hasOwnProperty(prop)) {
                    mergedConfig[prop] = config[prop];
                }
            });
            
            // Nested objects
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
            
            // Callbacks
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
            await loadWaveSurfer();
            this.createShadowStructure();
            this.applyPositioning();
            await this.initWaveSurfer();
            
            if (this.config.controls.enabled) {
                this.createControls();
            }
            
            this.setupEventHandlers();
            this.setInteractionMode(this.config.interactionMode);
            
            if (this.config.url) {
                await this.loadAudio(this.config.url);
            }
            
            setTimeout(() => {
                this.updatePluginLayout();
            }, 500);
            
            WaveSurfer.instances.set(this.id, this);
            
        } catch (error) {
            console.error('❌ WaveSurfer initialization failed:', error);
            this.config.callbacks.onError(error);
        }
    }
    
    createShadowStructure() {
        const styles = this.createStyles();
        
        this.container = document.createElement('div');
        this.container.className = 'wavesurfer-container';
        
        this.waveformContainer = document.createElement('div');
        this.waveformContainer.className = 'waveform-container';
        
        this.container.appendChild(this.waveformContainer);
        
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
                display: flex;
                flex-direction: column;
            }
            
            .waveform-container {
                width: 100%;
                flex: 1;
                position: relative;
                z-index: 1;
                overflow: visible;
                min-height: 100px;
                box-sizing: border-box;
            }
            
            .waveform-container > div {
                position: relative !important;
                z-index: 1 !important;
                overflow: visible !important;
            }
            
            .waveform-container div[class*="timeline"],
            div[class*="timeline"] {
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
            
            .controls-container {
                position: relative;
                width: 100%;
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
                flex-shrink: 0;
                box-sizing: border-box;
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
    
    applyPositioning() {
        // Utiliser le système de positionnement de BaseComponent
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
        
        if (this.config.autoLoadPlugins && PluginLoader) {
            await this._loadRequiredPlugins();
        }
        
        const plugins = [...(this.config.plugins || [])];
        await this._addEnabledPlugins(plugins);
        
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
        
        this.wavesurfer = WaveSurferLib.create(options);
        this.currentMode = this.config.interactionMode;
        
        console.log(`🎵 WaveSurfer Web Component "${this.id}" created`);
        console.log(`🎯 Initial mode set to: ${this.currentMode}`);
    }
    
    async _loadRequiredPlugins() {
        const pluginsToLoad = new Set();
        
        if (this.config.regions.enabled) pluginsToLoad.add('regions');
        if (this.config.timeline.enabled) pluginsToLoad.add('timeline');
        if (this.config.minimap.enabled) pluginsToLoad.add('minimap');
        if (this.config.zoom.enabled) pluginsToLoad.add('zoom');
        if (this.config.hover.enabled) pluginsToLoad.add('spectrogram');
        if (this.config.record.enabled) pluginsToLoad.add('record');
        if (this.config.envelope.enabled) pluginsToLoad.add('envelope');
        
        this.config.enabledPlugins.forEach(name => pluginsToLoad.add(name));
        
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
                const regionsConfig = {
                    regionLabelFormatter: (region, index) => `Region ${index + 1}`
                };
                
                plugins.push(RegionsPlugin.create(regionsConfig));
                console.log('🎯 Regions plugin added (v7)');
            }
        }
        
        // Add timeline plugin (ruler)
        if (this.config.timeline.enabled && this.plugins.has('timeline')) {
            const TimelinePlugin = this.plugins.get('timeline');
            if (TimelinePlugin) {
                const timelineConfig = {
                    height: this.config.timeline.height,
                    insertPosition: this.config.timeline.insertPosition || 'beforebegin',
                    timeInterval: 0.2,
                    primaryLabelInterval: 5,
                    secondaryLabelInterval: 1,
                    style: {
                        fontSize: '10px',
                        color: '#2D3748'
                    }
                };
                
                plugins.push(TimelinePlugin.create(timelineConfig));
                console.log('⏰ Timeline ruler plugin added (v7)');
            }
        }
        
        // Add other plugins...
        if (this.config.zoom.enabled && this.plugins.has('zoom')) {
            const ZoomPlugin = this.plugins.get('zoom');
            if (ZoomPlugin) {
                const zoomConfig = {
                    scale: this.config.zoom.scale
                };
                
                if (this.config.zoom.wheelZoom) {
                    zoomConfig.wheel = true;
                }
                
                plugins.push(ZoomPlugin.create(zoomConfig));
                console.log('🔍 Zoom plugin added (v7)');
            }
        }
    }
    
    createControls() {
        const controls = this.config.controls;
        
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
        
        // Loop button
        if (controls.loop) {
            this.loopBtn = this.createButton('🔁', 'Toggle Loop', () => {
                this.toggleLoop();
            });
            this.controlsContainer.appendChild(this.loopBtn);
        }
        
        // Mode toggle button
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
            
            setTimeout(() => {
                console.log(`🎯 Applying initial mode: ${this.config.interactionMode}`);
                this.setInteractionMode(this.config.interactionMode);
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
        
        // Finish event - Enhanced for region looping
        this.wavesurfer.on('finish', () => {
            if (this.isLooping) {
                console.log('🔁 Loop enabled');
                
                if (this.loopRegion) {
                    // Loop the specific region
                    console.log(`🔁 Looping region "${this.loopRegion.id}": ${this.loopRegion.start.toFixed(2)}s - ${this.loopRegion.end.toFixed(2)}s`);
                    const startProgress = this.loopRegion.start / this.getDuration();
                    this.wavesurfer.seekTo(startProgress);
                } else {
                    // Loop entire track
                    console.log('🔁 Looping entire track');
                    this.wavesurfer.seekTo(0);
                }
                
                this.wavesurfer.play().then(() => {
                    console.log('🔁 Loop restarted successfully');
                }).catch(error => {
                    console.error('🔁 Loop restart failed:', error);
                    this.isPlaying = false;
                    if (this.playPauseBtn) {
                        this.playPauseBtn.textContent = '▶️';
                    }
                });
                return;
            }
            
            this.isPlaying = false;
            if (this.playPauseBtn) {
                this.playPauseBtn.textContent = '▶️';
            }
            
            this.config.callbacks.onFinish(this);
            this.dispatchEvent(new CustomEvent('finish', { detail: { wavesurfer: this } }));
        });
        
        // Time update event - Enhanced for region tracking
        this.wavesurfer.on('timeupdate', (currentTime) => {
            this.currentTime = currentTime;
            this.updateTimeDisplay();
            
            // Handle region-based looping during playback
            this.handleRegionLoop(currentTime);
            
            // Track active regions and emit events
            this.updateActiveRegion(currentTime);
            
            this.config.callbacks.onTimeUpdate(currentTime, this);
            this.dispatchEvent(new CustomEvent('timeupdate', { detail: { currentTime, wavesurfer: this } }));
        });
        
        // Error handling
        this.wavesurfer.on('error', (error) => {
            console.error(`❌ WaveSurfer Web Component "${this.id}" error:`, error);
            this.config.callbacks.onError(error);
            this.dispatchEvent(new CustomEvent('error', { detail: { error, wavesurfer: this } }));
        });
        
        // Region events
        if (this.config.regions.enabled) {
            this.setupRegionEvents();
        }
    }
    
    // =====================
    // ENHANCED REGION LOOP METHODS
    // Inspired by official wavesurfer.js examples
    // =====================
    
    /**
     * Handle region-based looping during playback
     * Based on official examples from wavesurfer.js
     */
    handleRegionLoop(currentTime) {
        if (!this.isLooping || !this.isPlaying) return;
        
        // If we have a specific region to loop
        if (this.loopRegion) {
            // Check if we've reached the end of the loop region
            if (currentTime >= this.loopRegion.end) {
                console.log(`🔁 Reached end of region "${this.loopRegion.id}" at ${currentTime.toFixed(2)}s, looping back to ${this.loopRegion.start.toFixed(2)}s`);
                
                // Seek back to the start of the region
                const startProgress = this.loopRegion.start / this.getDuration();
                this.wavesurfer.seekTo(startProgress);
                
                // Emit custom event for region loop
                this.dispatchEvent(new CustomEvent('region-looped', { 
                    detail: { region: this.loopRegion, wavesurfer: this } 
                }));
            }
        }
        // If no specific region is set, check if we're in a region and auto-set it
        else if (this.isLooping) {
            const currentRegion = this.getActiveRegionAt(currentTime);
            if (currentRegion && currentRegion !== this.activeRegion) {
                // Auto-set the loop region to the current region
                this.setLoopRegion(currentRegion);
                console.log(`🎯 Auto-detected region for looping: "${currentRegion.id}"`);
            }
        }
    }
    
    /**
     * Detect and track regions during playback
     * Emits region-in and region-out events similar to official examples
     */
    updateActiveRegion(currentTime) {
        const newActiveRegion = this.getActiveRegionAt(currentTime);
        
        // Region-in event (entering a new region)
        if (newActiveRegion && newActiveRegion !== this.activeRegion) {
            this.activeRegion = newActiveRegion;
            console.log(`🎯 Entering region "${newActiveRegion.id}": ${newActiveRegion.start.toFixed(2)}s - ${newActiveRegion.end.toFixed(2)}s`);
            
            // Emit region-in event
            this.dispatchEvent(new CustomEvent('region-in', { 
                detail: { region: newActiveRegion, wavesurfer: this } 
            }));
            
            // If looping is enabled and we enter a region, automatically set it as loop target
            if (this.isLooping && !this.loopRegion) {
                this.setLoopRegion(newActiveRegion);
                console.log(`🔁 Auto-set loop region: "${newActiveRegion.id}"`);
            }
        }
        
        // Region-out event (leaving the current region)
        if (this.activeRegion && (!newActiveRegion || newActiveRegion.id !== this.activeRegion.id)) {
            console.log(`🎯 Leaving region "${this.activeRegion.id}"`);
            const oldRegion = this.activeRegion;
            
            // Emit region-out event
            this.dispatchEvent(new CustomEvent('region-out', { 
                detail: { region: oldRegion, wavesurfer: this } 
            }));
            
            // Update active region
            this.activeRegion = newActiveRegion;
        }
    }
    
    /**
     * Find region at a specific time
     */
    getActiveRegionAt(time) {
        if (!this.regions || this.regions.size === 0) return null;
        
        for (const region of this.regions.values()) {
            if (region.start <= time && time < region.end) {
                return region;
            }
        }
        
        return null;
    }
    
    /**
     * Set a specific region for intelligent looping
     */
    setLoopRegion(region) {
        if (region) {
            this.loopRegion = {
                start: region.start,
                end: region.end,
                id: region.id
            };
            
            // Ensure loop is enabled
            this.isLooping = true;
            
            // Update loop button appearance
            if (this.loopBtn) {
                this.loopBtn.textContent = '🔂';
                this.loopBtn.style.background = 'rgba(46, 204, 113, 0.4)';
                this.loopBtn.title = `Looping region "${region.id}"`;
            }
            
            console.log(`🎯 Loop region set to "${region.id}": ${region.start.toFixed(2)}s - ${region.end.toFixed(2)}s`);
        } else {
            this.loopRegion = null;
            console.log('🔁 Loop region cleared - will loop entire track if loop is enabled');
        }
        
        return this;
    }
    
    /**
     * Clear loop region (revert to full track loop)
     */
    clearLoopRegion() {
        this.loopRegion = null;
        
        if (this.loopBtn && this.isLooping) {
            this.loopBtn.textContent = '🔂';
            this.loopBtn.style.background = 'rgba(46, 204, 113, 0.4)';
            this.loopBtn.title = 'Looping entire track';
        }
        
        console.log('🔁 Loop region cleared - looping entire track');
        return this;
    }
    
    /**
     * Loop the region at current position
     */
    loopCurrentRegion() {
        if (!this.wavesurfer || !this.isReady) return this;
        
        const currentTime = this.wavesurfer.getCurrentTime();
        const activeRegion = this.getActiveRegionAt(currentTime);
        
        if (activeRegion) {
            this.setLoopRegion(activeRegion);
            console.log(`🎯 Now looping region "${activeRegion.id}": ${activeRegion.start.toFixed(2)}s - ${activeRegion.end.toFixed(2)}s`);
        } else {
            console.warn('🎯 No region found at current position');
        }
        
        return this;
    }
    
    // =====================
    // REGION EVENTS SETUP
    // =====================
    
    setupRegionEvents() {
        if (!this.wavesurfer) return;
        
        try {
            const plugins = this.wavesurfer.getActivePlugins ? this.wavesurfer.getActivePlugins() : [];
            const regionsPlugin = plugins.find(plugin => 
                plugin.constructor?.name === 'RegionsPlugin' || 
                plugin.name === 'regions' ||
                typeof plugin.addRegion === 'function'
            );
            
            if (regionsPlugin) {
                console.log('🎯 Setting up region events for RegionsPlugin');
                
                regionsPlugin.on('region-created', (region) => {
                    this.regions.set(region.id, region);
                    console.log(`🎯 Region created: ${region.id}`, region);
                    this.config.callbacks.onRegionCreate(region, this);
                    this.dispatchEvent(new CustomEvent('region-created', { detail: { region, wavesurfer: this } }));
                });
                
                regionsPlugin.on('region-updated', (region) => {
                    console.log(`🎯 Region updated: ${region.id}`, region);
                    this.config.callbacks.onRegionUpdate(region, this);
                    this.dispatchEvent(new CustomEvent('region-updated', { detail: { region, wavesurfer: this } }));
                });
                
                regionsPlugin.on('region-removed', (region) => {
                    this.regions.delete(region.id);
                    console.log(`🎯 Region removed: ${region.id}`);
                    this.config.callbacks.onRegionRemove(region, this);
                    this.dispatchEvent(new CustomEvent('region-removed', { detail: { region, wavesurfer: this } }));
                });
                
                regionsPlugin.on('region-clicked', (region, e) => {
                    console.log(`🎯 Region clicked: ${region.id}`);
                    this.dispatchEvent(new CustomEvent('region-clicked', { detail: { region, event: e, wavesurfer: this } }));
                });
                
            } else {
                console.warn('🎯 No regions plugin found - region events not available');
            }
            
        } catch (error) {
            console.error('🎯 Error setting up region events:', error);
        }
    }
    
    // =====================
    // BASIC PLAYBACK METHODS
    // =====================
    
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
    
    // Enhanced loop management
    toggleLoop() {
        if (this.wavesurfer && this.isReady) {
            this.isLooping = !this.isLooping;
            
            console.log(`🔁 Loop ${this.isLooping ? 'enabled' : 'disabled'}`);
            
            if (this.loopBtn) {
                this.loopBtn.textContent = this.isLooping ? '🔂' : '🔁';
                this.loopBtn.style.background = this.isLooping ? 'rgba(46, 204, 113, 0.4)' : 'rgba(255,255,255,0.2)';
                this.loopBtn.title = this.isLooping ? 'Loop enabled - Click to disable' : 'Loop disabled - Click to enable';
            }
            
            if (this.isLooping) {
                this.updateLoopTarget();
            }
        }
        return this;
    }
    
    updateLoopTarget() {
        if (!this.wavesurfer || !this.isReady) return;
        
        const currentTime = this.wavesurfer.getCurrentTime();
        const activeRegion = this.getActiveRegionAt(currentTime);
        
        if (activeRegion) {
            this.setLoopRegion(activeRegion);
        } else {
            this.loopRegion = null;
            console.log('🔁 No region at current position - looping entire track');
        }
        
        return this;
    }
    
    getDuration() {
        return this.wavesurfer && this.isReady ? this.wavesurfer.getDuration() : 0;
    }
    
    ensureLoopConfiguration() {
        if (!this.wavesurfer || !this.isReady) return;
        console.log('🔁 Loop configuration ensured');
        this.dispatchEvent(new CustomEvent('loop-configured', { 
            detail: { wavesurfer: this } 
        }));
    }
    
    // =====================
    // INTERACTION MODE MANAGEMENT
    // =====================
    
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
        
        if (this.modeToggleBtn) {
            this.modeToggleBtn.textContent = this.currentMode === 'scrub' ? '🎯' : '✋';
            this.modeToggleBtn.title = `Current: ${this.currentMode.toUpperCase()} mode - Click to toggle`;
        }
        
        console.log(`🎯 Interaction mode changed: ${oldMode} → ${this.currentMode}`);
        this.dispatchEvent(new CustomEvent('mode-changed', {
            detail: { oldMode, newMode: this.currentMode, wavesurfer: this }
        }));
        
        return this;
    }
    
    /**
     * Get current interaction mode
     */
    getInteractionMode() {
        return this.currentMode;
    }
    
    updateWaveSurferInteraction() {
        if (!this.wavesurfer || !this.isReady) return;
        
        const plugins = this.wavesurfer.getActivePlugins ? this.wavesurfer.getActivePlugins() : [];
        const regionsPlugin = plugins.find(plugin => 
            plugin.constructor?.name === 'RegionsPlugin' || 
            plugin.name === 'regions' ||
            typeof plugin.addRegion === 'function'
        );
        
        if (regionsPlugin && typeof regionsPlugin.enableDragSelection === 'function') {
            try {
                if (this.currentMode === 'selection') {
                    // Enable drag selection for creating regions
                    if (this._dragSelectionDestroy) {
                        this._dragSelectionDestroy();
                    }
                    
                    this._dragSelectionDestroy = regionsPlugin.enableDragSelection({
                        color: 'rgba(255, 0, 0, 0.1)',
                    });
                    
                    console.log('🎯 Drag selection enabled (selection mode)');
                } else {
                    // Disable drag selection for scrubbing
                    if (this._dragSelectionDestroy) {
                        this._dragSelectionDestroy();
                        this._dragSelectionDestroy = null;
                    }
                    
                    console.log('🎯 Drag selection disabled (scrub mode)');
                }
            } catch (error) {
                console.warn('🎯 Error managing drag selection:', error);
            }
        }
        
        // Update wavesurfer interaction settings
        if (this.wavesurfer.setOptions) {
            this.wavesurfer.setOptions({
                interact: this.currentMode === 'scrub',
                dragToSeek: this.currentMode === 'scrub'
            });
        }
    }
    
    // =====================
    // REGION MANAGEMENT
    // =====================
    
    addRegion(options) {
        if (!this.config.regions.enabled || !this.wavesurfer) {
            console.warn('🎯 Regions not enabled or WaveSurfer not ready');
            return null;
        }
        
        try {
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
            
            console.error('🎯 No method found to add regions');
            return null;
            
        } catch (error) {
            console.error('🎯 Error adding region:', error);
            return null;
        }
    }
    
    clearRegions() {
        if (!this.config.regions.enabled || !this.wavesurfer) {
            console.warn('🎯 Regions not enabled or WaveSurfer not ready');
            return this;
        }
        
        try {
            const plugins = this.wavesurfer.getActivePlugins ? this.wavesurfer.getActivePlugins() : [];
            const regionsPlugin = plugins.find(plugin => 
                plugin.constructor?.name === 'RegionsPlugin' || 
                plugin.name === 'regions' ||
                typeof plugin.addRegion === 'function'
            );
            
            if (regionsPlugin) {
                if (typeof regionsPlugin.clearRegions === 'function') {
                    regionsPlugin.clearRegions();
                    console.log('🗑️ ✅ All regions cleared via RegionsPlugin.clearRegions()');
                } else {
                    const allRegions = Array.from(this.regions.values());
                    allRegions.forEach(region => {
                        if (region && typeof region.remove === 'function') {
                            region.remove();
                        }
                    });
                    console.log(`🗑️ ✅ Cleared ${allRegions.length} regions individually`);
                }
                
                this.regions.clear();
                
                // Clear loop region if it was set
                if (this.loopRegion) {
                    this.clearLoopRegion();
                }
            }
            
        } catch (error) {
            console.error('🗑️ ❌ Error clearing regions:', error);
        }
        
        return this;
    }
    
    getRegions() {
        if (this.wavesurfer) {
            const plugins = this.wavesurfer.getActivePlugins ? this.wavesurfer.getActivePlugins() : [];
            const regionsPlugin = plugins.find(plugin => 
                plugin.constructor?.name === 'RegionsPlugin' || 
                plugin.name === 'regions' ||
                typeof plugin.addRegion === 'function'
            );
            
            if (regionsPlugin && typeof regionsPlugin.getRegions === 'function') {
                return regionsPlugin.getRegions();
            }
        }
        
        return Array.from(this.regions.values());
    }
    
    // =====================
    // UTILITY METHODS
    // =====================
    
    updatePluginLayout() {
        // Force plugin layout update
        setTimeout(() => {
            const waveformHeight = this.calculateWaveformHeight();
            if (this.waveformContainer) {
                this.waveformContainer.style.height = `${waveformHeight}px`;
            }
        }, 100);
    }
    
    calculateWaveformHeight() {
        let minHeight = 80;
        
        if (this.config.timeline.enabled) {
            minHeight += this.config.timeline.height + 5;
        }
        
        if (this.config.minimap.enabled) {
            minHeight += this.config.minimap.height + 5;
        }
        
        if (this.config.zoom.enabled) {
            minHeight += 20;
        }
        
        return minHeight;
    }
    
    destroy() {
        if (this.wavesurfer) {
            this.wavesurfer.stop();
            this.wavesurfer.destroy();
        }
        
        WaveSurfer.instances.delete(this.id);
        
        this.wavesurfer = null;
        this.container = null;
        this.waveformContainer = null;
        this.controlsContainer = null;
        this.regions.clear();
    }
}

// Register the Web Component
customElements.define('squirrel-wavesurfer', WaveSurfer);

/**
 * Compatibility function for legacy API syntax
 */
function WaveSurferCompatible(config = {}) {
    const wavesurferElement = new WaveSurfer();
    wavesurferElement.config = wavesurferElement.mergeConfig(config);
    
    const parent = typeof config.attach === 'string' 
        ? document.querySelector(config.attach)
        : config.attach;
        
    if (!parent) {
        throw new Error(`Container not found: ${config.attach}`);
    }
    
    parent.appendChild(wavesurferElement);
    return wavesurferElement;
}

export default WaveSurferCompatible;
