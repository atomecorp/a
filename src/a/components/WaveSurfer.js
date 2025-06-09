/**
 * 🎵 WaveSurfer Component - Squirrel Framework
 * 
 * Component for creating interactive audio waveform visualizations
 * with playback controls, regions, and audio analysis features.
 * Compatible with WaveSurfer.js v6.x for complete offline functionality.
 * 
 * @version 3.0.0 - Offline Compatible
 * @author Squirrel Framework Team
 */

// Global variables for WaveSurfer library and plugin loader
let WaveSurferLib = null;
let PluginLoader = null;

// Load WaveSurfer.js library and plugin loader
async function loadWaveSurfer() {
    if (WaveSurferLib) return WaveSurferLib;
    
    try {
        // Load v6.x plugin loader first
        if (!PluginLoader && !window.WaveSurferPluginLoader) {
            const loaderScript = document.createElement('script');
            loaderScript.src = './js/wavesurfer-v6-plugins.js';
            loaderScript.type = 'text/javascript';
            document.head.appendChild(loaderScript);
            
            await new Promise((resolve, reject) => {
                loaderScript.onload = resolve;
                loaderScript.onerror = reject;
            });
        }
        
        PluginLoader = window.WaveSurferPluginLoader;
        
        // Load WaveSurfer v6.x from local file (UMD format)
        const script = document.createElement('script');
        script.src = './js/wavesurfer.min.js';
        script.type = 'text/javascript';
        document.head.appendChild(script);
        
        await new Promise((resolve, reject) => {
            script.onload = () => {
                WaveSurferLib = window.WaveSurfer;
                resolve(WaveSurferLib);
            };
            script.onerror = reject;
        });
        
        console.log('🎵 WaveSurfer.js v6.6.4 loaded successfully from local file (offline compatible)');
        return WaveSurferLib;
        
    } catch (error) {
        console.error('❌ Failed to load WaveSurfer.js locally (offline mode):', error);
        throw new Error('WaveSurfer.js could not be loaded. Ensure wavesurfer.min.js is available in ./js/ directory');
    }
}

/**
 * 🎵 WaveSurfer Component Class
 * 
 * Creates interactive audio waveform visualizations with full plugin support
 */
class WaveSurfer extends EventTarget {
    static instances = new Map(); // Registry of all WaveSurfer instances
    
    constructor(config = {}) {
        super();
        
        // Generate unique ID
        this.id = config.id || `wavesurfer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Default configuration
        this.config = {
            // Container and positioning
            attach: config.attach || 'body',
            x: config.x || 100,
            y: config.y || 100,
            width: config.width || 800,
            height: config.height || 120,
            
            // Audio source
            url: config.url || null,
            peaks: config.peaks || null,
            
            // Visual styling
            waveColor: config.waveColor || '#4A90E2',
            progressColor: config.progressColor || '#2ECC71',
            cursorColor: config.cursorColor || '#E74C3C',
            barWidth: config.barWidth || 2,
            barRadius: config.barRadius || 1,
            responsive: config.responsive !== false,
            interact: config.interact !== false,
            dragToSeek: config.dragToSeek !== false,
            hideScrollbar: config.hideScrollbar !== false,
            normalize: config.normalize !== false,
            backend: config.backend || 'WebAudio',
            mediaControls: config.mediaControls || false,
            
            // Visual styling
            style: {
                backgroundColor: '#FFFFFF',
                border: '1px solid rgba(0,0,0,0.1)',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                overflow: 'hidden',
                ...config.style
            },
            
            // Control buttons
            controls: {
                enabled: config.controls?.enabled !== false,
                play: config.controls?.play !== false,
                pause: config.controls?.pause !== false,
                stop: config.controls?.stop !== false,
                mute: config.controls?.mute !== false,
                volume: config.controls?.volume !== false,
                download: config.controls?.download || false,
                ...config.controls
            },
            
            // Regions support
            regions: {
                enabled: config.regions?.enabled || false,
                dragSelection: config.regions?.dragSelection !== false,
                snapToGridPercentage: config.regions?.snapToGridPercentage || null,
                ...config.regions
            },
            
            // Plugins configuration
            plugins: config.plugins || [],
            enabledPlugins: config.enabledPlugins || ['regions'], // Default plugins to load
            autoLoadPlugins: config.autoLoadPlugins !== false, // Auto-load recommended plugins
            
            // Plugin-specific configurations
            timeline: {
                enabled: config.timeline?.enabled || false,
                height: config.timeline?.height || 20,
                ...config.timeline
            },
            
            minimap: {
                enabled: config.minimap?.enabled || false,
                height: config.minimap?.height || 50,
                ...config.minimap
            },
            
            zoom: {
                enabled: config.zoom?.enabled || false,
                scale: config.zoom?.scale || 1,
                ...config.zoom
            },
            
            hover: {
                enabled: config.hover?.enabled || false,
                formatTimeCallback: config.hover?.formatTimeCallback || null,
                ...config.hover
            },
            
            spectrogram: {
                enabled: config.spectrogram?.enabled || false,
                height: config.spectrogram?.height || 200,
                ...config.spectrogram
            },
            
            record: {
                enabled: config.record?.enabled || false,
                ...config.record
            },
            
            envelope: {
                enabled: config.envelope?.enabled || false,
                ...config.envelope
            },
            
            // Callbacks
            callbacks: {
                onReady: config.callbacks?.onReady || (() => {}),
                onPlay: config.callbacks?.onPlay || (() => {}),
                onPause: config.callbacks?.onPause || (() => {}),
                onFinish: config.callbacks?.onFinish || (() => {}),
                onSeek: config.callbacks?.onSeek || (() => {}),
                onTimeUpdate: config.callbacks?.onTimeUpdate || (() => {}),
                onRegionCreate: config.callbacks?.onRegionCreate || (() => {}),
                onRegionUpdate: config.callbacks?.onRegionUpdate || (() => {}),
                onRegionRemove: config.callbacks?.onRegionRemove || (() => {}),
                onError: config.callbacks?.onError || ((error) => console.error('WaveSurfer error:', error)),
                ...config.callbacks
            }
        };
        
        // Internal state
        this.wavesurfer = null;
        this.isReady = false;
        this.isPlaying = false;
        this.currentTime = 0;
        this.regions = new Map();
        this.plugins = new Map();
        
        // Initialize
        this._init();
        
        // Register instance
        WaveSurfer.instances.set(this.id, this);
    }
    
    async _init() {
        try {
            // Load WaveSurfer.js library
            await loadWaveSurfer();
            
            // Create container
            this._createContainer();
            
            // Initialize WaveSurfer
            await this._initWaveSurfer();
            
            // Setup controls if enabled
            if (this.config.controls.enabled) {
                this._createControls();
            }
            
            // Setup event handlers
            this._setupEventHandlers();
            
            // Load audio if URL provided
            if (this.config.url) {
                await this.loadAudio(this.config.url);
            }
            
        } catch (error) {
            console.error('❌ WaveSurfer initialization failed:', error);
            this.config.callbacks.onError(error);
        }
    }
    
    _createContainer() {
        // Get parent element
        const parent = typeof this.config.attach === 'string' 
            ? document.querySelector(this.config.attach)
            : this.config.attach;
            
        if (!parent) {
            throw new Error(`Container not found: ${this.config.attach}`);
        }
        
        // Create main container
        this.container = document.createElement('div');
        this.container.className = 'squirrel-wavesurfer';
        this.container.id = this.id;
        
        // Apply styling
        Object.assign(this.container.style, {
            position: 'absolute',
            left: `${this.config.x}px`,
            top: `${this.config.y}px`,
            width: `${this.config.width}px`,
            height: `${this.config.height}px`,
            zIndex: '1000',
            ...this.config.style
        });
        
        // Create waveform container
        this.waveformContainer = document.createElement('div');
        this.waveformContainer.className = 'wavesurfer-waveform';
        this.waveformContainer.style.cssText = `
            width: 100%;
            height: ${this.config.controls.enabled ? 'calc(100% - 50px)' : '100%'};
            position: relative;
        `;
        
        this.container.appendChild(this.waveformContainer);
        parent.appendChild(this.container);
    }
    
    async _initWaveSurfer() {
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
        
        console.log(`🎵 WaveSurfer instance "${this.id}" created`);
        console.log(`🔌 Plugins actifs: ${plugins.length}`);
    }
    
    async _loadRequiredPlugins() {
        if (!PluginLoader) return;
        
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
        
        // Load all required plugins
        for (const pluginName of pluginsToLoad) {
            try {
                await PluginLoader.loadPlugin(pluginName);
            } catch (error) {
                console.warn(`⚠️ Failed to load plugin ${pluginName}:`, error);
            }
        }
    }
    
    async _addEnabledPlugins(plugins) {
        if (!PluginLoader) return;
        
        // Add regions plugin
        if (this.config.regions.enabled && PluginLoader.isPluginLoaded('regions')) {
            const RegionsPlugin = PluginLoader.getPlugin('regions');
            if (RegionsPlugin) {
                plugins.push(RegionsPlugin.create({
                    dragSelection: this.config.regions.dragSelection
                }));
                console.log('🎯 Regions plugin ajouté');
            }
        }
        
        // Add timeline plugin
        if (this.config.timeline.enabled && PluginLoader.isPluginLoaded('timeline')) {
            const TimelinePlugin = PluginLoader.getPlugin('timeline');
            if (TimelinePlugin) {
                plugins.push(TimelinePlugin.create({
                    height: this.config.timeline.height
                }));
                console.log('⏰ Timeline plugin ajouté');
            }
        }
        
        // Add minimap plugin
        if (this.config.minimap.enabled && PluginLoader.isPluginLoaded('minimap')) {
            const MinimapPlugin = PluginLoader.getPlugin('minimap');
            if (MinimapPlugin) {
                plugins.push(MinimapPlugin.create({
                    height: this.config.minimap.height
                }));
                console.log('🗺️ Minimap plugin ajouté');
            }
        }
        
        // Add zoom plugin
        if (this.config.zoom.enabled && PluginLoader.isPluginLoaded('zoom')) {
            const ZoomPlugin = PluginLoader.getPlugin('zoom');
            if (ZoomPlugin) {
                plugins.push(ZoomPlugin.create({
                    scale: this.config.zoom.scale
                }));
                console.log('🔍 Zoom plugin ajouté');
            }
        }
        
        // Add hover plugin
        if (this.config.hover.enabled && PluginLoader.isPluginLoaded('hover')) {
            const HoverPlugin = PluginLoader.getPlugin('hover');
            if (HoverPlugin) {
                plugins.push(HoverPlugin.create({
                    formatTimeCallback: this.config.hover.formatTimeCallback
                }));
                console.log('👆 Hover plugin ajouté');
            }
        }
        
        // Add spectrogram plugin
        if (this.config.spectrogram.enabled && PluginLoader.isPluginLoaded('spectrogram')) {
            const SpectrogramPlugin = PluginLoader.getPlugin('spectrogram');
            if (SpectrogramPlugin) {
                plugins.push(SpectrogramPlugin.create({
                    height: this.config.spectrogram.height
                }));
                console.log('📊 Spectrogram plugin ajouté');
            }
        }
        
        // Add record plugin
        if (this.config.record.enabled && PluginLoader.isPluginLoaded('record')) {
            const RecordPlugin = PluginLoader.getPlugin('record');
            if (RecordPlugin) {
                plugins.push(RecordPlugin.create(this.config.record));
                console.log('🎙️ Record plugin ajouté');
            }
        }
        
        // Add envelope plugin
        if (this.config.envelope.enabled && PluginLoader.isPluginLoaded('envelope')) {
            const EnvelopePlugin = PluginLoader.getPlugin('envelope');
            if (EnvelopePlugin) {
                plugins.push(EnvelopePlugin.create(this.config.envelope));
                console.log('📈 Envelope plugin ajouté');
            }
        }
    }
    
    _createControls() {
        const controls = this.config.controls;
        
        // Create controls container
        this.controlsContainer = document.createElement('div');
        this.controlsContainer.className = 'wavesurfer-controls';
        this.controlsContainer.style.cssText = `
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
        `;
        
        // Play/Pause button
        if (controls.play || controls.pause) {
            this.playPauseBtn = this._createButton('▶️', 'Play/Pause', () => {
                this.isPlaying ? this.pause() : this.play();
            });
            this.controlsContainer.appendChild(this.playPauseBtn);
        }
        
        // Stop button
        if (controls.stop) {
            this.stopBtn = this._createButton('⏹️', 'Stop', () => {
                this.stop();
            });
            this.controlsContainer.appendChild(this.stopBtn);
        }
        
        // Time display
        this.timeDisplay = document.createElement('span');
        this.timeDisplay.className = 'time-display';
        this.timeDisplay.style.cssText = `
            color: white;
            font-family: 'Roboto Mono', monospace;
            font-size: 12px;
            margin: 0 10px;
            min-width: 80px;
            text-align: center;
        `;
        this.timeDisplay.textContent = '00:00 / 00:00';
        this.controlsContainer.appendChild(this.timeDisplay);
        
        // Volume control
        if (controls.volume) {
            this.volumeContainer = document.createElement('div');
            this.volumeContainer.style.cssText = `
                display: flex;
                align-items: center;
                gap: 5px;
                margin-left: 15px;
            `;
            
            // Mute button
            if (controls.mute) {
                this.muteBtn = this._createButton('🔊', 'Mute', () => {
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
            this.volumeSlider.style.cssText = `
                width: 80px;
                height: 4px;
                background: rgba(255,255,255,0.3);
                outline: none;
                border-radius: 2px;
            `;
            
            this.volumeSlider.addEventListener('input', (e) => {
                this.setVolume(parseInt(e.target.value) / 100);
            });
            
            this.volumeContainer.appendChild(this.volumeSlider);
            this.controlsContainer.appendChild(this.volumeContainer);
        }
        
        // Download button
        if (controls.download) {
            this.downloadBtn = this._createButton('💾', 'Download', () => {
                this.downloadAudio();
            });
            this.controlsContainer.appendChild(this.downloadBtn);
        }
        
        this.container.appendChild(this.controlsContainer);
    }
    
    _createButton(text, title, onClick) {
        const button = document.createElement('button');
        button.textContent = text;
        button.title = title;
        button.style.cssText = `
            background: rgba(255,255,255,0.2);
            border: 1px solid rgba(255,255,255,0.3);
            color: white;
            padding: 8px 12px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.2s ease;
            backdrop-filter: blur(10px);
        `;
        
        button.addEventListener('mouseenter', () => {
            button.style.background = 'rgba(255,255,255,0.3)';
            button.style.transform = 'scale(1.05)';
        });
        
        button.addEventListener('mouseleave', () => {
            button.style.background = 'rgba(255,255,255,0.2)';
            button.style.transform = 'scale(1)';
        });
        
        button.addEventListener('click', onClick);
        return button;
    }
    
    _setupEventHandlers() {
        if (!this.wavesurfer) return;
        
        // Ready event
        this.wavesurfer.on('ready', () => {
            this.isReady = true;
            this._updateTimeDisplay();
            console.log(`🎵 WaveSurfer "${this.id}" is ready`);
            this.config.callbacks.onReady(this);
        });
        
        // Play event
        this.wavesurfer.on('play', () => {
            this.isPlaying = true;
            if (this.playPauseBtn) {
                this.playPauseBtn.textContent = '⏸️';
            }
            this.config.callbacks.onPlay(this);
        });
        
        // Pause event
        this.wavesurfer.on('pause', () => {
            this.isPlaying = false;
            if (this.playPauseBtn) {
                this.playPauseBtn.textContent = '▶️';
            }
            this.config.callbacks.onPause(this);
        });
        
        // Finish event
        this.wavesurfer.on('finish', () => {
            this.isPlaying = false;
            if (this.playPauseBtn) {
                this.playPauseBtn.textContent = '▶️';
            }
            this.config.callbacks.onFinish(this);
        });
        
        // Seek event
        this.wavesurfer.on('seeking', (currentTime) => {
            this.currentTime = currentTime;
            this._updateTimeDisplay();
            this.config.callbacks.onSeek(currentTime, this);
        });
        
        // Time update event
        this.wavesurfer.on('timeupdate', (currentTime) => {
            this.currentTime = currentTime;
            this._updateTimeDisplay();
            this.config.callbacks.onTimeUpdate(currentTime, this);
        });
        
        // Error handling
        this.wavesurfer.on('error', (error) => {
            console.error(`❌ WaveSurfer "${this.id}" error:`, error);
            this.config.callbacks.onError(error);
        });
        
        // Region events (if regions plugin is enabled)
        if (this.config.regions.enabled) {
            this._setupRegionEvents();
        }
    }
    
    _setupRegionEvents() {
        // Region creation
        this.wavesurfer.on('region-created', (region) => {
            this.regions.set(region.id, region);
            console.log(`🎯 Region created: ${region.id}`);
            this.config.callbacks.onRegionCreate(region, this);
        });
        
        // Region update
        this.wavesurfer.on('region-updated', (region) => {
            console.log(`🎯 Region updated: ${region.id}`);
            this.config.callbacks.onRegionUpdate(region, this);
        });
        
        // Region removal
        this.wavesurfer.on('region-removed', (region) => {
            this.regions.delete(region.id);
            console.log(`🎯 Region removed: ${region.id}`);
            this.config.callbacks.onRegionRemove(region, this);
        });
    }
    
    _updateTimeDisplay() {
        if (!this.timeDisplay || !this.wavesurfer) return;
        
        const current = this._formatTime(this.currentTime);
        const total = this._formatTime(this.wavesurfer.getDuration() || 0);
        this.timeDisplay.textContent = `${current} / ${total}`;
    }
    
    _formatTime(seconds) {
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
        
        if (this.container) {
            this.container.style.left = `${x}px`;
            this.container.style.top = `${y}px`;
        }
        return this;
    }
    
    setSize(width, height) {
        this.config.width = width;
        this.config.height = height;
        
        if (this.container) {
            this.container.style.width = `${width}px`;
            this.container.style.height = `${height}px`;
        }
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
        console.log(`🗑️ Destroying WaveSurfer instance "${this.id}"`);
        
        // Stop playback
        if (this.wavesurfer) {
            this.wavesurfer.stop();
            this.wavesurfer.destroy();
        }
        
        // Remove from DOM
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
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

export default WaveSurfer;