// Audio management for Lyrix application
import { CONSTANTS } from '../../core/constants.js';

// iOS-compatible logging function with clear prefix for filtering
function iosLog(message) {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    
    // Add distinctive prefix to filter app logs from iOS system errors
    const prefixedMessage = `⚛️ ATOME-APP: ${message}`;
    
    if (isIOS) {
        // For iOS AUv3 apps - send to Xcode console via WebKit message handler
        try {
            if (window.webkit?.messageHandlers?.console) {
            } else {
                // Fallback for development
            }
        } catch (e) {
        }
    } else {
    }
}

// Enhanced logging for debugging .lrx file issues
export function debugLog(category, message, data = null) {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0]; // HH:MM:SS format
    let logMessage = `[${timestamp}] ${category}: ${message}`;
    
    if (data) {
        logMessage += ` | Data: ${JSON.stringify(data)}`;
    }
    
    iosLog(logMessage);
}

// Extract clean filename for .lrx storage (spaces, no %20, no URL)
export function extractCleanFileName(audioPath) {
    if (!audioPath) return null;
    
    // If it's a full URL, extract just the filename
    if (audioPath.startsWith('http://') || audioPath.startsWith('https://')) {
        const url = new URL(audioPath);
        const fileName = url.pathname.split('/').pop();
        // Decode %20 back to spaces
        return decodeURIComponent(fileName);
    }
    
    // If it's a path with BASE_PATH, extract the filename
    if (audioPath.includes('/assets/audios/')) {
        const fileName = audioPath.split('/').pop();
        return decodeURIComponent(fileName);
    }
    
    // If it contains %20, decode it to spaces
    if (audioPath.includes('%20')) {
        return decodeURIComponent(audioPath);
    }
    
    // Extract filename from any path
    const fileName = audioPath.split(/[/\\]/).pop();
    return fileName;
}

export class AudioManager {
    
    // Normalize audio paths
    static normalize(audioPath) {
        debugLog('NORMALIZE', 'Called with audioPath', audioPath);
        
        if (!audioPath) return null;
        
        // Handle JSON metadata
        if (audioPath.startsWith('{')) {
            try {
                const { fileName } = JSON.parse(audioPath);
                debugLog('NORMALIZE', 'JSON metadata parsed', { fileName });
                return fileName ? this.createUrl(fileName) : null;
            } catch (e) {
                debugLog('NORMALIZE', 'Corrupted audio metadata', e.message);
                return null;
            }
        }
        
        // If it's already a fully qualified dynamic server URL (/audio/), keep it
        if (/^https?:\/\/[^\s]+\/audio\//i.test(audioPath)) {
            debugLog('NORMALIZE', 'Already dynamic server /audio/ URL, returning as-is');
            return audioPath;
        }

        // Legacy absolute HTTP paths (old BASE_URL) -> extract filename
        if (audioPath.includes('/assets/audios/')) {
            const fname = audioPath.split('/').pop();
            debugLog('NORMALIZE', 'Legacy assets path detected, migrating', fname);
            return this.createUrl(fname);
        }
        
        // Extract filename from path and handle iOS-specific encoding issues
        const fileName = audioPath.split(/[/\\]/).pop();
        debugLog('NORMALIZE', 'Original audioPath', audioPath);
        debugLog('NORMALIZE', 'Extracted fileName', fileName);
        debugLog('NORMALIZE', 'fileName includes .m4a?', fileName.includes('.m4a'));
        
        // Debug logging for iOS audio paths
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        if (isIOS) {
            debugLog('iOS-AUDIO', 'Original fileName', fileName);
            debugLog('iOS-AUDIO', 'Has spaces', fileName.includes(' '));
            debugLog('iOS-AUDIO', 'Has %20', fileName.includes('%20'));
            
            // On iOS, handle spaces more aggressively
            let iosFileName = fileName;
            
            // If filename already contains %20 (from .lrx file), use it directly
            if (fileName.includes('%20')) {
                debugLog('iOS-AUDIO', 'File already encoded with %20, using directly');
                iosFileName = fileName;
            }
            // If the filename has spaces, encode them properly
            else if (fileName.includes(' ')) {
                // First, ensure we don't have mixed encoding
                try {
                    // Try to decode if already encoded
                    const decoded = decodeURIComponent(fileName);
                    iosFileName = decoded.replace(/\s+/g, '%20');
                    debugLog('iOS-AUDIO', 'Decoded and re-encoded', iosFileName);
                } catch (e) {
                    // If decode fails, just replace spaces
                    iosFileName = fileName.replace(/\s+/g, '%20');
                    debugLog('iOS-AUDIO', 'Direct space replacement', iosFileName);
                }
            }
            
            const finalUrl = this.createUrl(iosFileName);
            debugLog('iOS-AUDIO', 'Final URL', finalUrl);
            return finalUrl;
        }
        
        // Unified handling now: decode if possible then createUrl (which picks server/asset)
        try {
            const decodedFileName = decodeURIComponent(fileName);
            return this.createUrl(decodedFileName);
        } catch (decodeError) {
            return this.createUrl(fileName);
        }
    }
    
    // Create complete audio URL with fallback
    static createUrl(fileName) {
        debugLog('CREATE-URL', 'Input fileName', fileName);
        // Always work with a plain file name (strip any preceding audio/ or assets/audios/)
        let baseName = fileName.split(/[/\\]/).pop();
        if (!baseName) baseName = fileName; // safeguard
        // If it still contains assets/audios/ remove
        baseName = baseName.replace(/^assets%2Faudios%2F/i,'');

        // Normalise spaces / encoding: decode then re-encode for URL path
        try { baseName = decodeURIComponent(baseName); } catch(e) {}
        const encodedName = encodeURIComponent(baseName);

        // Dynamic local server port (injected by native Swift HTTP server)
        const port = window.ATOME_LOCAL_HTTP_PORT || window.__ATOME_LOCAL_HTTP_PORT__;
        if (port) {
            const serverUrl = `http://127.0.0.1:${port}/audio/${encodedName}`;
            debugLog('CREATE-URL', 'Using dynamic local server', serverUrl);
            return serverUrl;
        }

        // Fallback: keep previous platform distinction minimal (relative asset path)
        const fallbackUrl = `./assets/audios/${encodedName}`;
        debugLog('CREATE-URL', 'Fallback asset URL (no port yet)', fallbackUrl);
        return fallbackUrl;
    }
    
    // Create fallback relative URL (for when server is not available)
    static createFallbackUrl(fileName) {
        return CONSTANTS.AUDIO.BASE_PATH + encodeURIComponent(fileName);
    }
    
    // Get demo audio paths
    static getDemoPaths() {
        return Object.fromEntries(
            Object.entries(CONSTANTS.AUDIO.DEMO_FILES).map(([key, file]) => [key, this.createUrl(file)])
        );
    }
    
    // Debug audio path
    static debug(input) {
        const result = this.normalize(input);
        return result;
    }
    
    // Validate audio file
    static validateFile(file, expectedMetadata) {
        // Check filename
        if (file.name !== expectedMetadata.fileName) {
            return { isValid: false, reason: 'Different filename' };
        }
        
        // Check file size if available
        if (expectedMetadata.fileSize && Math.abs(file.size - expectedMetadata.fileSize) > 1024) {
            return { isValid: false, reason: 'Different file size' };
        }
        
        // Check modification date if available
        if (expectedMetadata.lastModified && file.lastModified !== expectedMetadata.lastModified) {
            return { isValid: false, reason: 'Different modification date' };
        }
        
        return { isValid: true, reason: 'File matches' };
    }
    
    // Create audio metadata
    static createMetadata(file) {
        return {
            fileName: file.name,
            fileSize: file.size,
            lastModified: file.lastModified,
            fileId: `${file.name}_${file.size}_${file.lastModified}`
        };
    }
    
    // Format time for display
    static formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    
    // Check if file is audio
    static isAudioFile(file) {
        // Check MIME type
        if (file.type.startsWith('audio/') || file.type.startsWith('video/')) {
            return true;
        }
        
        // Check extension
        return CONSTANTS.FILE_TYPES.AUDIO.test(file.name);
    }
}

// Audio controller for player control
export class AudioController {
    constructor() {
        this.audioPlayer = null;
        this.playing = false; // Renamed to avoid conflict
        this.audioPath = null;
        this.currentFileName = null;
        this.currentMetadata = null;
        this.eventListeners = {}; // Add event system
    }
    
    // Add event listener
    on(event, callback) {
        if (!this.eventListeners[event]) {
            this.eventListeners[event] = [];
        }
        this.eventListeners[event].push(callback);
    }
    
    // Remove event listener
    off(event, callback) {
        if (!this.eventListeners[event]) return;
        const index = this.eventListeners[event].indexOf(callback);
        if (index > -1) {
            this.eventListeners[event].splice(index, 1);
        }
    }
    
    // Emit event
    emit(event, ...args) {
        if (!this.eventListeners[event]) return;
        this.eventListeners[event].forEach(callback => {
            try {
                callback(...args);
            } catch (error) {
            }
        });
    }
    
    // Load audio file with enhanced iOS support
    loadAudio(audioPath) {
        try {
            // Log the original audio path for debugging
            debugLog('LOAD-AUDIO', 'Called with audioPath', audioPath);
            
            this.audioPath = audioPath;
            const normalizedPath = AudioManager.normalize(audioPath);
            
            debugLog('LOAD-AUDIO', 'Normalized path result', normalizedPath);
            
            if (!normalizedPath) {
                debugLog('LOAD-AUDIO', 'Failed to normalize audio path', audioPath);
                return false;
            }
            
            // Extract filename for cleaner console logging
            const fileName = audioPath.split(/[/\\]/).pop();
            
            debugLog('LOAD-AUDIO', 'Extracted fileName', fileName);
            
            // Enhanced iOS audio loading
            if (this.isIOS()) {
                debugLog('LOAD-AUDIO', 'Calling loadAudioIOS with path', normalizedPath);
                return this.loadAudioIOS(normalizedPath, fileName);
            } else {
                return this.loadAudioDesktop(normalizedPath, fileName);
            }
            
        } catch (error) {
            iosLog('❌ Error in loadAudio: ' + error);
            return false;
        }
    }

    // iOS-specific audio loading with enhanced error handling
    loadAudioIOS(normalizedPath, fileName) {
        try {
            iosLog('🍎 iOS audio loading for: ' + fileName);
            
            // Create audio element with iOS-specific attributes
            this.audioPlayer = new Audio();
            this.audioPlayer.preload = 'none'; // Don't preload on iOS to avoid memory issues
            this.audioPlayer.crossOrigin = 'anonymous';
            this.audioPlayer.controls = false;
            
            // iOS-specific properties to improve compatibility
            this.audioPlayer.setAttribute('webkit-playsinline', 'true');
            this.audioPlayer.setAttribute('playsinline', 'true');
            
            // Setup event listeners first, before setting src
            this.setupAudioListenersIOS(fileName);
            
            // Set source with delay for iOS
            setTimeout(() => {
                try {
                    iosLog('🍎 Setting audio.src to: ' + normalizedPath);
                    this.audioPlayer.src = normalizedPath;
                    iosLog('🍎 iOS audio source set successfully for: ' + fileName);
                } catch (srcError) {
                    iosLog('❌ iOS audio source error: ' + srcError);
                    this.handleIOSAudioError(srcError, fileName);
                }
            }, 100);
            
            return true;
            
        } catch (error) {
            this.handleIOSAudioError(error, fileName);
            return false;
        }
    }

    // Desktop audio loading
    loadAudioDesktop(normalizedPath, fileName) {
        debugLog('LOAD-AUDIO-DESKTOP', 'About to create Audio element with path', normalizedPath);
        debugLog('LOAD-AUDIO-DESKTOP', 'normalizedPath length', normalizedPath.length);
        debugLog('LOAD-AUDIO-DESKTOP', 'normalizedPath ends with .m4a?', normalizedPath.endsWith('.m4a'));
        
        this.audioPlayer = new Audio(normalizedPath);
        this.audioPlayer.preload = 'metadata';
        this.setupAudioListeners(fileName);
        return true;
    }

    // Enhanced iOS audio event listeners
    setupAudioListenersIOS(fileName) {
        if (!this.audioPlayer) return;
        
        this.audioPlayer.addEventListener('timeupdate', () => {
            // Validate time values on iOS
            const currentTime = this.audioPlayer.currentTime;
            if (isFinite(currentTime) && !isNaN(currentTime)) {
                this.emit('timeupdate', currentTime);
            }
        });
        
        this.audioPlayer.addEventListener('loadedmetadata', () => {
            iosLog('✅ iOS audio metadata loaded: ' + fileName);
            this.emit('loaded', this.audioPlayer.duration);
        });
        
        this.audioPlayer.addEventListener('loadeddata', () => {
            iosLog('✅ iOS audio data loaded: ' + fileName);
            this.emit('ready');
        });
        
        this.audioPlayer.addEventListener('canplay', () => {
            iosLog('✅ iOS audio can play: ' + fileName);
            this.emit('canplay');
        });
        
        this.audioPlayer.addEventListener('ended', () => {
            this.playing = false;
            this.emit('ended');
        });
        
        this.audioPlayer.addEventListener('play', () => {
            this.playing = true;
            this.emit('play');
        });
        
        this.audioPlayer.addEventListener('pause', () => {
            this.playing = false;
            this.emit('pause');
        });
        
        this.audioPlayer.addEventListener('error', (e) => {
            iosLog('❌ iOS audio error event fired for: ' + fileName);
            iosLog('❌ Error type: ' + (e.target.error ? e.target.error.code : 'unknown'));
            iosLog('❌ Error message: ' + (e.target.error ? e.target.error.message : 'no message'));
            iosLog('❌ Audio src was: ' + e.target.src);
            this.handleIOSAudioError(e.target.error, fileName);
        });
        
        this.audioPlayer.addEventListener('stalled', () => {
        });
        
        this.audioPlayer.addEventListener('waiting', () => {
        });
    }

    // Handle iOS audio errors with fallback strategies
    handleIOSAudioError(error, fileName) {
        iosLog('🍎 iOS audio error for ' + fileName + ': ' + error);
        
        // Check if this is an error code 4 (MEDIA_ELEMENT_ERROR_SRC_NOT_SUPPORTED)
        if (error && error.code === 4) {
            iosLog('⚠️ Audio file not supported or not found: ' + fileName);
            this.showIOSAudioMissingDialog(fileName);
            return;
        }
        
        // Try different loading strategies for iOS
        if (this.audioPlayer && this.audioPath && this.retryCount < 3) {
            this.retryCount = (this.retryCount || 0) + 1;
            setTimeout(() => {
                try {
                    // Strategy 1: Reload with different preload setting
                    this.audioPlayer.preload = 'auto';
                    this.audioPlayer.load();
                    iosLog('🔄 iOS audio reload attempt: ' + fileName);
                } catch (reloadError) {
                    this.emit('error', error);
                }
            }, 500);
        } else {
            // After 3 retries, show user-friendly message
            this.showIOSAudioMissingDialog(fileName);
            this.emit('error', error);
        }
    }

    // Show dialog for missing audio files on iOS
    showIOSAudioMissingDialog(fileName) {
    // Dialog intentionally disabled per user request
    iosLog(`⚠️ Suppressed missing audio dialog for: ${fileName}`);
    return; // no-op
    }

    // Standard audio event listeners (desktop)
    setupAudioListeners(fileName) {
        if (!this.audioPlayer) return;
        
        this.audioPlayer.addEventListener('timeupdate', () => {
            this.emit('timeupdate', this.audioPlayer.currentTime);
        });
        
        // Emit 'loaded' when metadata (including duration) is available
        this.audioPlayer.addEventListener('loadedmetadata', () => {
            debugLog('DESKTOP-AUDIO', 'loadedmetadata event - duration', this.audioPlayer.duration);
            this.emit('loaded', this.audioPlayer.duration);
        });
        
        this.audioPlayer.addEventListener('loadeddata', () => {
            this.emit('ready');
        });
        
        this.audioPlayer.addEventListener('ended', () => {
            this.playing = false;
            this.emit('ended');
        });
        
        this.audioPlayer.addEventListener('play', () => {
            this.playing = true;
            this.emit('play');
        });
        
        this.audioPlayer.addEventListener('pause', () => {
            this.playing = false;
            this.emit('pause');
        });
        
        this.audioPlayer.addEventListener('error', (e) => {
            this.emit('error', e.target.error);
        });
        
        this.audioPlayer.addEventListener('canplaythrough', () => {
            this.emit('ready');
        });
    }
    
    // Get current time with iOS validation
    getCurrentTime() {
        if (!this.audioPlayer) return 0;
        
        const currentTime = this.audioPlayer.currentTime;
        
        // iOS validation: ensure we return valid numbers
        if (this.isIOS() && (!isFinite(currentTime) || isNaN(currentTime))) {
            return 0;
        }
        
        return currentTime || 0;
    }

    // Set current time with iOS error handling
    setCurrentTime(time) {
        if (!this.audioPlayer) return;
        
        // Validate time value
        if (!isFinite(time) || isNaN(time) || time < 0) {
            return;
        }
        
        try {
            this.audioPlayer.currentTime = time;
        } catch (error) {
            if (this.isIOS()) {
                // iOS fallback: try again after a small delay
                setTimeout(() => {
                    try {
                        this.audioPlayer.currentTime = time;
                    } catch (retryError) {
                    }
                }, 100);
            }
        }
    }

    // Check if running on iOS
    isIOS() {
        return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    }

    // Prepare audio for iOS playback
    prepareIOSAudio() {
        if (!this.audioPlayer) return;
        
        // On iOS, we need user interaction before audio can play
        // This sets up a one-time listener for the first user interaction
        const enableAudio = () => {
            if (this.audioPlayer) {
                this.audioPlayer.muted = true;
                const playPromise = this.audioPlayer.play();
                if (playPromise !== undefined) {
                    playPromise.then(() => {
                        this.audioPlayer.pause();
                        this.audioPlayer.muted = false;
                        this.audioPlayer.currentTime = 0;
                    }).catch(() => {
                        // Silent fail - this is expected on first try
                    });
                }
            }
            
            // Remove the event listeners after first interaction
            document.removeEventListener('touchstart', enableAudio);
            document.removeEventListener('click', enableAudio);
        };
        
        // Add listeners for first user interaction
        document.addEventListener('touchstart', enableAudio, { once: true });
        document.addEventListener('click', enableAudio, { once: true });
    }    // Check if playing
    isPlaying() {
        return this.playing;
    }
    
    // Check if playing (alternative name)
    isAudioPlaying() {
        return this.playing;
    }
    
    // Play audio
    play() {
        if (this.audioPlayer) {
            // iOS requires user interaction for audio to play
            const playPromise = this.audioPlayer.play();
            
            if (playPromise !== undefined) {
                playPromise.then(() => {
                }).catch(error => {
                    // On iOS, user must interact with audio element first
                    if (error.name === 'NotAllowedError') {
                    }
                });
            }
        }
    }
    
    // Pause audio
    pause() {
        if (this.audioPlayer) {
            this.audioPlayer.pause();
        }
    }
    
    // Associate audio file with song
    associate(songIdentifier, audioPath) {
        const normalizedAudioPath = AudioManager.normalize(audioPath);
        return true;
    }
    
    // Remove audio association
    remove(songIdentifier) {
        return this.associate(songIdentifier, null);
    }
    
    // Control audio player
    control(action, value = null) {
        if (!this.audioPlayer) {
            return false;
        }
        
        switch (action.toLowerCase()) {
            case 'play':
                this.audioPlayer.play();
                this.playing = true;
                break;
                
            case 'pause':
                this.audioPlayer.pause();
                this.playing = false;
                break;
                
            case 'toggle':
                if (this.playing) {
                    this.control('pause');
                } else {
                    this.control('play');
                }
                return this.playing;
                
            case 'seek':
            case 'time':
                if (value !== null) {
                    this.audioPlayer.currentTime = value;
                }
                break;
                
            case 'volume':
                if (value !== null) {
                    // Check if platform supports volume control
                    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
                    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
                    const volumeControlDisabled = isIOS || (isSafari && navigator.vendor === 'Apple Computer, Inc.');
                    
                    if (volumeControlDisabled) {
                        // Store the value but don't apply it
                        localStorage.setItem('lyrix_audio_volume', (value * 100).toString());
                        return false;
                    }
                    
                    try {
                        this.audioPlayer.volume = Math.max(0, Math.min(1, value));
                    } catch (error) {
                        return false;
                    }
                }
                break;
                
            case 'currenttime':
                return this.audioPlayer ? this.audioPlayer.currentTime : 0;
                
            case 'duration':
                return this.audioPlayer ? this.audioPlayer.duration : 0;
                
            case 'isplaying':
                return this.playing;
                
            case 'hasaudio':
                return !!this.audioPlayer && !!this.audioPath;
                
            default:
                return false;
        }
        
        return true;
    }
    
    // Load audio file
    loadFile(file) {
        const metadata = AudioManager.createMetadata(file);
        const audioUrl = URL.createObjectURL(file);
        
        if (!this.audioPlayer) {
            this.audioPlayer = document.createElement('audio');
            this.audioPlayer.preload = 'metadata';
        }
        
        this.audioPlayer.src = audioUrl;
        this.audioPath = audioUrl;
        this.currentFileName = file.name;
        this.currentMetadata = metadata;
        
        return metadata;
    }
    
    // Load from URL with enhanced iOS support
    loadFromUrl(audioUrl) {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        
        try {
            
            // Create or reset audio player
            if (this.audioPlayer) {
                // Clean up existing player
                this.audioPlayer.pause();
                this.audioPlayer.src = '';
                if (this.audioPath && this.audioPath.startsWith('blob:')) {
                    URL.revokeObjectURL(this.audioPath);
                }
            }
            
            if (isIOS) {
                // iOS-specific audio creation
                this.audioPlayer = new Audio();
                this.audioPlayer.preload = 'none'; // Critical for iOS memory management
                this.audioPlayer.crossOrigin = 'anonymous';
                this.audioPlayer.setAttribute('webkit-playsinline', 'true');
                this.audioPlayer.setAttribute('playsinline', 'true');
                
                // Setup iOS-specific listeners before setting src
                this.setupIOSURLListeners(audioUrl);
                
                // Set source with delay for iOS
                setTimeout(() => {
                    try {
                        this.audioPlayer.src = audioUrl;
                        this.audioPath = audioUrl;
                    } catch (srcError) {
                        this.handleIOSAudioError(srcError, 'URL loading');
                    }
                }, 150);
                
            } else {
                // Desktop loading
                this.audioPlayer = new Audio();
                this.audioPlayer.preload = 'metadata';
                this.audioPlayer.crossOrigin = 'anonymous';
                this.audioPlayer.src = audioUrl;
                this.audioPath = audioUrl;
                
                // Setup standard listeners
                this.setupAudioListeners('URL Audio');
            }
            
            return true;
            
        } catch (error) {
            if (isIOS) {
                this.handleIOSAudioError(error, 'URL loading');
            }
            return false;
        }
    }

    // iOS-specific event listeners for URL loading
    setupIOSURLListeners(audioUrl) {
        if (!this.audioPlayer) return;
        
        this.audioPlayer.addEventListener('loadstart', () => {
        });
        
        this.audioPlayer.addEventListener('loadedmetadata', () => {
            this.emit('loaded', this.audioPlayer.duration);
        });
        
        this.audioPlayer.addEventListener('loadeddata', () => {
            this.emit('ready');
        });
        
        this.audioPlayer.addEventListener('canplay', () => {
            this.emit('canplay');
        });
        
        this.audioPlayer.addEventListener('canplaythrough', () => {
            this.emit('ready');
        });
        
        this.audioPlayer.addEventListener('timeupdate', () => {
            const currentTime = this.audioPlayer.currentTime;
            if (isFinite(currentTime) && !isNaN(currentTime)) {
                this.emit('timeupdate', currentTime);
            }
        });
        
        this.audioPlayer.addEventListener('ended', () => {
            this.playing = false;
            this.emit('ended');
        });
        
        this.audioPlayer.addEventListener('play', () => {
            this.playing = true;
            this.emit('play');
        });
        
        this.audioPlayer.addEventListener('pause', () => {
            this.playing = false;
            this.emit('pause');
        });
        
        this.audioPlayer.addEventListener('error', (e) => {
            this.handleIOSAudioError(e.target.error, 'URL playback');
        });
        
        this.audioPlayer.addEventListener('stalled', () => {
        });
        
        this.audioPlayer.addEventListener('waiting', () => {
        });
        
        this.audioPlayer.addEventListener('abort', () => {
        });
    }
    
    // Remove current audio
    removeAudio() {
        if (this.audioPlayer) {
            this.audioPlayer.pause();
            this.audioPlayer.src = '';
            if (this.audioPath && this.audioPath.startsWith('blob:')) {
                URL.revokeObjectURL(this.audioPath);
            }
        }
        
        this.audioPath = null;
        this.playing = false;
        this.currentFileName = null;
        this.currentMetadata = null;
        
    }
    
    // Clear current audio (alias for removeAudio)
    clearAudio() {
        this.removeAudio();
    }

    // iOS-specific memory cleanup
    forceMemoryCleanup() {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        
        if (isIOS) {
            
            // Stop and clear audio
            if (this.audioPlayer) {
                try {
                    this.audioPlayer.pause();
                    this.audioPlayer.currentTime = 0;
                    this.audioPlayer.src = '';
                    this.audioPlayer.load(); // Force reload to clear buffers
                } catch (error) {
                }
            }
            
            // Revoke object URLs
            if (this.audioPath && this.audioPath.startsWith('blob:')) {
                try {
                    URL.revokeObjectURL(this.audioPath);
                } catch (error) {
                }
            }
            
            // Force garbage collection hint
            if (window.gc) {
                window.gc();
            }
            
            // Reset references
            this.audioPath = null;
            this.currentFileName = null;
            this.currentMetadata = null;
            this.playing = false;
            
        }
    }

    // Check iOS memory status
    checkIOSMemory() {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        
        if (isIOS) {
            // Basic memory check for iOS
            const memoryInfo = performance.memory;
            if (memoryInfo) {
                const usedMB = Math.round(memoryInfo.usedJSHeapSize / 1024 / 1024);
                const totalMB = Math.round(memoryInfo.totalJSHeapSize / 1024 / 1024);
                const limitMB = Math.round(memoryInfo.jsHeapSizeLimit / 1024 / 1024);
                
                
                // Warning if memory usage is high
                if (usedMB > limitMB * 0.8) {
                    return false;
                }
            }
        }
        
        return true;
    }
}
