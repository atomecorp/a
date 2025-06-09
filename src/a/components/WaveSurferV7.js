/**
 * WaveSurfer Component v7.9.5 for Squirrel Framework
 * Modern ES6 audio waveform visualization with latest plugins
 * Optimized for Tauri offline environment with ES6 module support
 * 
 * @version 4.0.0 - Latest WaveSurfer.js v7.9.5
 * @author Squirrel Framework Team
 */

import { Module } from '../Module.js';

/**
 * WaveSurfer v7.9.5 Component Class
 * Provides latest audio waveform functionality with modern plugin ecosystem
 */
export class WaveSurferV7 extends Module {
    
    constructor(config = {}) {
        super();
        
        // Generate unique ID
        this.id = config.id || `wavesurfer_v7_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Default configuration for v7.9.5
        this.config = {
            // Container and positioning (Squirrel Framework specific)
            attach: config.attach || 'body',
            x: config.x || 100,
            y: config.y || 100,
            width: config.width || 800,
            height: config.height || 120,
            
            // WaveSurfer v7.9.5 options
            container: null, // Will be set dynamically
            url: config.url || null,
            peaks: config.peaks || null,
            duration: config.duration || null,
            
            // Visual styling
            waveColor: config.waveColor || '#4A90E2',
            progressColor: config.progressColor || '#2ECC71',
            cursorColor: config.cursorColor || '#E74C3C',
            cursorWidth: config.cursorWidth || 2,
            barWidth: config.barWidth || null,
            barGap: config.barGap || null,
            barRadius: config.barRadius || null,
            barHeight: config.barHeight || null,
            minPxPerSec: config.minPxPerSec || 0,
            fillParent: config.fillParent !== false,
            normalize: config.normalize !== false,
            
            // Interaction
            interact: config.interact !== false,
            dragToSeek: config.dragToSeek !== false,
            autoScroll: config.autoScroll !== false,
            autoCenter: config.autoCenter !== false,
            
            // Audio
            sampleRate: config.sampleRate || 8000,
            mediaControls: config.mediaControls || false,
            
            // Styling
            style: {
                position: 'absolute',
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
            
            // Plugin configurations
            plugins: {
                regions: config.plugins?.regions || { enabled: false },
                timeline: config.plugins?.timeline || { enabled: false },
                minimap: config.plugins?.minimap || { enabled: false },
                zoom: config.plugins?.zoom || { enabled: false },
                hover: config.plugins?.hover || { enabled: false },
                spectrogram: config.plugins?.spectrogram || { enabled: false },
                record: config.plugins?.record || { enabled: false },
                envelope: config.plugins?.envelope || { enabled: false }
            },
            
            // Callbacks
            callbacks: {
                onReady: config.callbacks?.onReady || (() => {}),
                onPlay: config.callbacks?.onPlay || (() => {}),
                onPause: config.callbacks?.onPause || (() => {}),
                onFinish: config.callbacks?.onFinish || (() => {}),
                onSeek: config.callbacks?.onSeek || (() => {}),
                onTimeUpdate: config.callbacks?.onTimeUpdate || (() => {}),
                onError: config.callbacks?.onError || ((error) => console.error('WaveSurfer error:', error)),
                ...config.callbacks
            }
        };
        
        // Internal state
        this.wavesurfer = null;
        this.isReady = false;
        this.isPlaying = false;
        this.currentTime = 0;
        this.duration = 0;
        this.loadedPlugins = new Map();
        
        // Static registry
        if (!WaveSurferV7.instances) {
            WaveSurferV7.instances = new Map();
        }
        
        // Initialize
        this._init();
        
        // Register instance
        WaveSurferV7.instances.set(this.id, this);
    }
    
    async _init() {
        try {
            console.log(`🎵 Initializing WaveSurfer v7.9.5 instance "${this.id}"`);
            
            // Create container
            this._createContainer();
            
            // Load WaveSurfer and plugins
            await this._loadWaveSurfer();
            
            // Initialize WaveSurfer instance
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
            
            console.log(`✅ WaveSurfer v7.9.5 instance "${this.id}" ready`);
            
        } catch (error) {
            console.error(`❌ WaveSurfer v7.9.5 initialization failed:`, error);
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
        this.container.className = 'squirrel-wavesurfer-v7';
        this.container.id = this.id;
        
        // Apply styling
        Object.assign(this.container.style, {
            left: `${this.config.x}px`,
            top: `${this.config.y}px`,
            width: `${this.config.width}px`,
            height: `${this.config.height}px`,
            zIndex: '1000',
            ...this.config.style
        });
        
        // Create waveform container
        this.waveformContainer = document.createElement('div');
        this.waveformContainer.className = 'wavesurfer-v7-waveform';
        this.waveformContainer.style.cssText = `
            width: 100%;
            height: ${this.config.controls.enabled ? 'calc(100% - 50px)' : '100%'};
            position: relative;
        `;
        
        this.container.appendChild(this.waveformContainer);
        parent.appendChild(this.container);
        
        // Update config container
        this.config.container = this.waveformContainer;
    }
    
    async _loadWaveSurfer() {
        try {
            // Load main WaveSurfer library via ES6 import
            const WaveSurferModule = await import('./../../js/wavesurfer.esm.js');
            this.WaveSurfer = WaveSurferModule.default;
            
            console.log('✅ WaveSurfer.js v7.9.5 main library loaded');
            
            // Load enabled plugins
            await this._loadPlugins();
            
        } catch (error) {
            console.error('❌ Failed to load WaveSurfer.js v7.9.5:', error);
            throw error;
        }
    }
    
    async _loadPlugins() {
        const enabledPlugins = Object.entries(this.config.plugins)
            .filter(([name, config]) => config.enabled)
            .map(([name]) => name);
            
        console.log(`🔌 Loading plugins: ${enabledPlugins.join(', ')}`);
        
        for (const pluginName of enabledPlugins) {
            try {
                const pluginModule = await import(`./../../js/${pluginName}.esm.js`);
                this.loadedPlugins.set(pluginName, pluginModule.default);
                console.log(`✅ Plugin ${pluginName} loaded`);
            } catch (error) {
                console.warn(`⚠️ Failed to load plugin ${pluginName}:`, error);
            }
        }
    }
    
    async _initWaveSurfer() {
        if (!this.WaveSurfer) {
            throw new Error('WaveSurfer.js library not loaded');
        }
        
        // Prepare plugins array
        const plugins = [];
        
        // Add loaded plugins with their configurations
        for (const [pluginName, PluginClass] of this.loadedPlugins) {
            const pluginConfig = this.config.plugins[pluginName];
            if (pluginConfig.enabled) {
                try {
                    const pluginInstance = PluginClass.create(pluginConfig);
                    plugins.push(pluginInstance);
                    console.log(`🔌 Plugin ${pluginName} added to WaveSurfer`);
                } catch (error) {
                    console.warn(`⚠️ Failed to create plugin ${pluginName}:`, error);
                }
            }
        }
        
        // Prepare WaveSurfer options (v7.9.5 format)
        const options = {
            container: this.config.container,
            waveColor: this.config.waveColor,
            progressColor: this.config.progressColor,
            cursorColor: this.config.cursorColor,
            cursorWidth: this.config.cursorWidth,
            barWidth: this.config.barWidth,
            barGap: this.config.barGap,
            barRadius: this.config.barRadius,
            barHeight: this.config.barHeight,
            minPxPerSec: this.config.minPxPerSec,
            fillParent: this.config.fillParent,
            interact: this.config.interact,
            dragToSeek: this.config.dragToSeek,
            autoScroll: this.config.autoScroll,
            autoCenter: this.config.autoCenter,
            sampleRate: this.config.sampleRate,
            mediaControls: this.config.mediaControls,
            normalize: this.config.normalize,
            plugins: plugins
        };
        
        // Remove null/undefined values
        Object.keys(options).forEach(key => {
            if (options[key] === null || options[key] === undefined) {
                delete options[key];
            }
        });
        
        // Create WaveSurfer instance
        this.wavesurfer = this.WaveSurfer.create(options);
        
        console.log(`🎵 WaveSurfer v7.9.5 instance created with ${plugins.length} plugins`);
    }
    
    _createControls() {
        const controls = this.config.controls;
        
        // Create controls container
        this.controlsContainer = document.createElement('div');
        this.controlsContainer.className = 'wavesurfer-v7-controls';
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
            this.duration = this.wavesurfer.getDuration();
            this._updateTimeDisplay();
            console.log(`🎵 WaveSurfer v7.9.5 "${this.id}" is ready - Duration: ${this.duration?.toFixed(2)}s`);
            this.config.callbacks.onReady(this);
        });
        
        // Play event
        this.wavesurfer.on('play', () => {
            this.isPlaying = true;
            if (this.playPauseBtn) {
                this.playPauseBtn.textContent = '⏸️';
            }
            console.log(`▶️ Playing: ${this.id}`);
            this.config.callbacks.onPlay(this);
        });
        
        // Pause event
        this.wavesurfer.on('pause', () => {
            this.isPlaying = false;
            if (this.playPauseBtn) {
                this.playPauseBtn.textContent = '▶️';
            }
            console.log(`⏸️ Paused: ${this.id}`);
            this.config.callbacks.onPause(this);
        });
        
        // Finish event
        this.wavesurfer.on('finish', () => {
            this.isPlaying = false;
            if (this.playPauseBtn) {
                this.playPauseBtn.textContent = '▶️';
            }
            console.log(`🏁 Finished: ${this.id}`);
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
            console.error(`❌ WaveSurfer v7.9.5 "${this.id}" error:`, error);
            this.config.callbacks.onError(error);
        });
        
        // Plugin events
        this._setupPluginEvents();
    }
    
    _setupPluginEvents() {
        // Region events (if regions plugin is enabled)
        if (this.loadedPlugins.has('regions')) {
            this.wavesurfer.on('region-created', (region) => {
                console.log(`🎯 Region created: ${region.id} (${region.start?.toFixed(2)}s - ${region.end?.toFixed(2)}s)`);
                if (this.config.callbacks.onRegionCreate) {
                    this.config.callbacks.onRegionCreate(region, this);
                }
            });
            
            this.wavesurfer.on('region-updated', (region) => {
                console.log(`🎯 Region updated: ${region.id}`);
                if (this.config.callbacks.onRegionUpdate) {
                    this.config.callbacks.onRegionUpdate(region, this);
                }
            });
            
            this.wavesurfer.on('region-removed', (region) => {
                console.log(`🎯 Region removed: ${region.id}`);
                if (this.config.callbacks.onRegionRemove) {
                    this.config.callbacks.onRegionRemove(region, this);
                }
            });
            
            this.wavesurfer.on('region-clicked', (region, e) => {
                console.log(`🎯 Region clicked: ${region.id}`);
                if (this.config.callbacks.onRegionClick) {
                    this.config.callbacks.onRegionClick(region, e, this);
                }
            });
        }
    }
    
    _updateTimeDisplay() {
        if (!this.timeDisplay || !this.duration) return;
        
        const current = this._formatTime(this.currentTime);
        const total = this._formatTime(this.duration);
        this.timeDisplay.textContent = `${current} / ${total}`;
    }
    
    _formatTime(seconds) {
        if (isNaN(seconds) || seconds < 0) return '00:00';
        
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
            console.log(`🎵 Loading audio: ${url}`);
            
            if (peaks) {
                await this.wavesurfer.load(url, peaks);
            } else {
                await this.wavesurfer.load(url);
            }
            
            this.config.url = url;
            this.config.peaks = peaks;
            
            console.log(`✅ Audio loaded successfully: ${url}`);
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
            const isMuted = this.wavesurfer.getMuted && this.wavesurfer.getMuted();
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
        if (!this.loadedPlugins.has('regions') || !this.wavesurfer) {
            console.warn('🎯 Regions plugin not loaded or WaveSurfer not ready');
            return null;
        }
        
        try {
            // Get regions plugin instance
            const plugins = this.wavesurfer.getActivePlugins ? this.wavesurfer.getActivePlugins() : [];
            const regionsPlugin = plugins.find(plugin => 
                plugin.constructor.name.includes('Region') ||
                typeof plugin.addRegion === 'function'
            );
            
            if (regionsPlugin && typeof regionsPlugin.addRegion === 'function') {
                const region = regionsPlugin.addRegion(options);
                console.log(`🎯 Region created: ${options.start?.toFixed(2)}s - ${options.end?.toFixed(2)}s`);
                return region;
            } else {
                console.warn('🎯 Regions plugin not accessible');
                return null;
            }
        } catch (error) {
            console.error('🎯 Error creating region:', error);
            return null;
        }
    }
    
    clearRegions() {
        if (!this.loadedPlugins.has('regions') || !this.wavesurfer) {
            return this;
        }
        
        try {
            const plugins = this.wavesurfer.getActivePlugins ? this.wavesurfer.getActivePlugins() : [];
            const regionsPlugin = plugins.find(plugin => 
                plugin.constructor.name.includes('Region') ||
                typeof plugin.clearRegions === 'function'
            );
            
            if (regionsPlugin && typeof regionsPlugin.clearRegions === 'function') {
                regionsPlugin.clearRegions();
                console.log('🎯 All regions cleared');
            }
        } catch (error) {
            console.error('🎯 Error clearing regions:', error);
        }
        
        return this;
    }
    
    getRegions() {
        if (!this.loadedPlugins.has('regions') || !this.wavesurfer) {
            return [];
        }
        
        try {
            const plugins = this.wavesurfer.getActivePlugins ? this.wavesurfer.getActivePlugins() : [];
            const regionsPlugin = plugins.find(plugin => 
                plugin.constructor.name.includes('Region') ||
                typeof plugin.getRegions === 'function'
            );
            
            if (regionsPlugin && typeof regionsPlugin.getRegions === 'function') {
                return regionsPlugin.getRegions();
            }
        } catch (error) {
            console.error('🎯 Error getting regions:', error);
        }
        
        return [];
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
        if (this.wavesurfer && this.isReady && typeof this.wavesurfer.exportImage === 'function') {
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
            // v7.9.5 uses setOptions method
            const options = {};
            if (colors.waveColor) options.waveColor = colors.waveColor;
            if (colors.progressColor) options.progressColor = colors.progressColor;
            if (colors.cursorColor) options.cursorColor = colors.cursorColor;
            
            if (Object.keys(options).length > 0 && typeof this.wavesurfer.setOptions === 'function') {
                this.wavesurfer.setOptions(options);
            }
        }
        return this;
    }
    
    // Cleanup
    destroy() {
        console.log(`🗑️ Destroying WaveSurfer v7.9.5 instance "${this.id}"`);
        
        // Stop playback
        if (this.wavesurfer) {
            try {
                this.wavesurfer.stop();
                this.wavesurfer.destroy();
            } catch (error) {
                console.warn('Warning during WaveSurfer cleanup:', error);
            }
        }
        
        // Remove from DOM
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        
        // Remove from registry
        if (WaveSurferV7.instances) {
            WaveSurferV7.instances.delete(this.id);
        }
        
        // Clear references
        this.wavesurfer = null;
        this.container = null;
        this.waveformContainer = null;
        this.controlsContainer = null;
        this.loadedPlugins.clear();
    }
    
    // Static methods
    static getInstance(id) {
        return WaveSurferV7.instances ? WaveSurferV7.instances.get(id) : null;
    }
    
    static getAllInstances() {
        return WaveSurferV7.instances ? Array.from(WaveSurferV7.instances.values()) : [];
    }
    
    static destroyAll() {
        if (WaveSurferV7.instances) {
            WaveSurferV7.instances.forEach(instance => instance.destroy());
            WaveSurferV7.instances.clear();
        }
    }
    
    static getVersion() {
        return '7.9.5';
    }
}

// Export for ES6 modules
export default WaveSurferV7;

// Global access for compatibility
if (typeof window !== 'undefined') {
    window.WaveSurferV7 = WaveSurferV7;
}
