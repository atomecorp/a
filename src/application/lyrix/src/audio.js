// Audio management for Lyrix application
import { CONSTANTS } from './constants.js';

export class AudioManager {
    
    // Normalize audio paths
    static normalize(audioPath) {
        if (!audioPath) return null;
        
        // Handle JSON metadata
        if (audioPath.startsWith('{')) {
            try {
                const { fileName } = JSON.parse(audioPath);
                return fileName ? this.createUrl(fileName) : null;
            } catch (e) {
                console.warn('⚠️ Corrupted audio metadata:', e);
                return null;
            }
        }
        
        // Already formed complete URL - return as is
        if (audioPath.startsWith(CONSTANTS.AUDIO.BASE_URL)) return audioPath;
        if (audioPath.startsWith('http://') || audioPath.startsWith('https://')) return audioPath;
        
        // Relative path with BASE_PATH
        if (audioPath.startsWith(CONSTANTS.AUDIO.BASE_PATH)) {
            return this.createUrl(audioPath.replace(CONSTANTS.AUDIO.BASE_PATH, ''));
        }
        
        // Extract filename from path and decode it to avoid double encoding
        const fileName = audioPath.split(/[/\\]/).pop();
        try {
            const decodedFileName = decodeURIComponent(fileName);
            return this.createUrl(decodedFileName);
        } catch (decodeError) {
            // If decoding fails, use the original filename
            console.warn('⚠️ Audio path decode error, using original:', fileName);
            return this.createUrl(fileName);
        }
    }
    
    // Create complete audio URL with fallback
    static createUrl(fileName) {
        // Primary URL with server
        return CONSTANTS.AUDIO.BASE_URL + encodeURIComponent(fileName);
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
        console.log('🔍 Debug audio path:', { input, result });
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
                console.error('❌ Error in event callback:', error);
            }
        });
    }
    
    // Load audio file with enhanced iOS support
    loadAudio(audioPath) {
        try {
            this.audioPath = audioPath;
            const normalizedPath = AudioManager.normalize(audioPath);
            
            if (!normalizedPath) {
                console.error('❌ Failed to normalize audio path:', audioPath);
                return false;
            }
            
            // Extract filename for cleaner console logging
            const fileName = audioPath.split(/[/\\]/).pop();
            
            // console.log('🎵 Loading audio from:', fileName);
            
            // Enhanced iOS audio loading
            if (this.isIOS()) {
                return this.loadAudioIOS(normalizedPath, fileName);
            } else {
                return this.loadAudioDesktop(normalizedPath, fileName);
            }
            
        } catch (error) {
            console.error('❌ Error loading audio:', error);
            return false;
        }
    }

    // iOS-specific audio loading with enhanced error handling
    loadAudioIOS(normalizedPath, fileName) {
        try {
            console.log('🍎 iOS audio loading for:', fileName);
            
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
                    this.audioPlayer.src = normalizedPath;
                    console.log('🍎 iOS audio source set:', fileName);
                } catch (srcError) {
                    console.error('❌ iOS audio source error:', srcError);
                    this.handleIOSAudioError(srcError, fileName);
                }
            }, 100);
            
            return true;
            
        } catch (error) {
            console.error('❌ iOS audio loading error:', error);
            this.handleIOSAudioError(error, fileName);
            return false;
        }
    }

    // Desktop audio loading
    loadAudioDesktop(normalizedPath, fileName) {
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
            console.log('✅ iOS audio metadata loaded:', fileName);
            this.emit('loaded', this.audioPlayer.duration);
        });
        
        this.audioPlayer.addEventListener('loadeddata', () => {
            console.log('✅ iOS audio data loaded:', fileName);
            this.emit('ready');
        });
        
        this.audioPlayer.addEventListener('canplay', () => {
            console.log('✅ iOS audio can play:', fileName);
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
            console.error('❌ iOS audio error:', e.target.error);
            this.handleIOSAudioError(e.target.error, fileName);
        });
        
        this.audioPlayer.addEventListener('stalled', () => {
            console.warn('⚠️ iOS audio stalled:', fileName);
        });
        
        this.audioPlayer.addEventListener('waiting', () => {
            console.warn('⚠️ iOS audio waiting:', fileName);
        });
    }

    // Handle iOS audio errors with fallback strategies
    handleIOSAudioError(error, fileName) {
        console.error('🍎 iOS audio error for', fileName, ':', error);
        
        // Try different loading strategies for iOS
        if (this.audioPlayer && this.audioPath) {
            setTimeout(() => {
                try {
                    // Strategy 1: Reload with different preload setting
                    this.audioPlayer.preload = 'auto';
                    this.audioPlayer.load();
                    console.log('🔄 iOS audio reload attempt:', fileName);
                } catch (reloadError) {
                    console.error('❌ iOS audio reload failed:', reloadError);
                    this.emit('error', error);
                }
            }, 500);
        } else {
            this.emit('error', error);
        }
    }

    // Standard audio event listeners (desktop)
    setupAudioListeners(fileName) {
        if (!this.audioPlayer) return;
        
        this.audioPlayer.addEventListener('timeupdate', () => {
            this.emit('timeupdate', this.audioPlayer.currentTime);
        });
        
        this.audioPlayer.addEventListener('loadeddata', () => {
            console.log('✅ Audio loaded successfully:', fileName);
            this.emit('loaded', this.audioPlayer.duration);
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
            console.error('❌ Audio loading error:', e.target.error, 'for file:', fileName);
            
            // Try fallback if primary URL failed and it was using server URL
            if (this.audioPlayer.src.startsWith(CONSTANTS.AUDIO.BASE_URL)) {
                const fallbackFileName = this.audioPath.split(/[/\\]/).pop();
                const fallbackPath = AudioManager.createFallbackUrl(fallbackFileName);
                console.log('🔄 Trying fallback path for:', fallbackFileName);
                
                // Create new audio element with fallback
                this.audioPlayer = new Audio(fallbackPath);
                this.setupAudioListeners(fileName); // Re-setup listeners
            }
            
            this.emit('error', e.target.error);
        });
        
        this.audioPlayer.addEventListener('canplaythrough', () => {
            console.log('✅ Audio ready to play:', fileName);
            this.emit('ready');
        });
    }
    
    // Get current time with iOS validation
    getCurrentTime() {
        if (!this.audioPlayer) return 0;
        
        const currentTime = this.audioPlayer.currentTime;
        
        // iOS validation: ensure we return valid numbers
        if (this.isIOS() && (!isFinite(currentTime) || isNaN(currentTime))) {
            console.warn('⚠️ iOS returned invalid currentTime, using 0');
            return 0;
        }
        
        return currentTime || 0;
    }

    // Set current time with iOS error handling
    setCurrentTime(time) {
        if (!this.audioPlayer) return;
        
        // Validate time value
        if (!isFinite(time) || isNaN(time) || time < 0) {
            console.warn('⚠️ Invalid time value:', time);
            return;
        }
        
        try {
            this.audioPlayer.currentTime = time;
        } catch (error) {
            console.error('❌ Error setting current time:', error);
            if (this.isIOS()) {
                // iOS fallback: try again after a small delay
                setTimeout(() => {
                    try {
                        this.audioPlayer.currentTime = time;
                    } catch (retryError) {
                        console.error('❌ iOS time set retry failed:', retryError);
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
                        console.log('📱 iOS audio unlocked');
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
                    console.log('▶️ Audio playing successfully');
                }).catch(error => {
                    console.warn('⚠️ Audio play failed (likely iOS/mobile restrictions):', error.message);
                    // On iOS, user must interact with audio element first
                    if (error.name === 'NotAllowedError') {
                        console.log('💡 Audio blocked by browser - user interaction required');
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
        console.log('✅ Audio associated with song:', songIdentifier, '→', normalizedAudioPath);
        return true;
    }
    
    // Remove audio association
    remove(songIdentifier) {
        return this.associate(songIdentifier, null);
    }
    
    // Control audio player
    control(action, value = null) {
        if (!this.audioPlayer) {
            console.log('❌ Audio player not initialized');
            return false;
        }
        
        switch (action.toLowerCase()) {
            case 'play':
                this.audioPlayer.play();
                this.playing = true;
                console.log('▶️ Audio playing');
                break;
                
            case 'pause':
                this.audioPlayer.pause();
                this.playing = false;
                console.log('⏸️ Audio paused');
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
                    console.log('⏩ Seeking to', value + 's');
                }
                break;
                
            case 'volume':
                if (value !== null) {
                    this.audioPlayer.volume = Math.max(0, Math.min(1, value));
                    console.log('🔊 Volume:', (value * 100) + '%');
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
                console.log('❌ Unknown audio action:', action);
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
        
        console.log('✅ Audio file loaded:', file.name);
        return metadata;
    }
    
    // Load from URL with enhanced iOS support
    loadFromUrl(audioUrl) {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        
        try {
            console.log('🎵 Loading audio from URL:', audioUrl.substring(0, 50) + '...');
            
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
                        console.log('🍎 iOS audio URL set successfully');
                    } catch (srcError) {
                        console.error('❌ iOS audio URL error:', srcError);
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
            
            console.log('✅ Audio URL loading initiated');
            return true;
            
        } catch (error) {
            console.error('❌ Error loading audio from URL:', error);
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
            console.log('🍎 iOS audio load started');
        });
        
        this.audioPlayer.addEventListener('loadedmetadata', () => {
            console.log('🍎 iOS audio metadata loaded from URL');
            this.emit('loaded', this.audioPlayer.duration);
        });
        
        this.audioPlayer.addEventListener('loadeddata', () => {
            console.log('🍎 iOS audio data loaded from URL');
            this.emit('ready');
        });
        
        this.audioPlayer.addEventListener('canplay', () => {
            console.log('🍎 iOS audio can play from URL');
            this.emit('canplay');
        });
        
        this.audioPlayer.addEventListener('canplaythrough', () => {
            console.log('🍎 iOS audio can play through from URL');
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
            console.error('❌ iOS URL audio error:', e.target.error);
            this.handleIOSAudioError(e.target.error, 'URL playback');
        });
        
        this.audioPlayer.addEventListener('stalled', () => {
            console.warn('⚠️ iOS URL audio stalled');
        });
        
        this.audioPlayer.addEventListener('waiting', () => {
            console.warn('⚠️ iOS URL audio waiting');
        });
        
        this.audioPlayer.addEventListener('abort', () => {
            console.warn('⚠️ iOS URL audio loading aborted');
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
        
        console.log('✅ Audio removed');
    }
    
    // Clear current audio (alias for removeAudio)
    clearAudio() {
        this.removeAudio();
    }

    // iOS-specific memory cleanup
    forceMemoryCleanup() {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        
        if (isIOS) {
            console.log('🍎 Performing iOS memory cleanup...');
            
            // Stop and clear audio
            if (this.audioPlayer) {
                try {
                    this.audioPlayer.pause();
                    this.audioPlayer.currentTime = 0;
                    this.audioPlayer.src = '';
                    this.audioPlayer.load(); // Force reload to clear buffers
                } catch (error) {
                    console.warn('⚠️ Audio cleanup warning:', error);
                }
            }
            
            // Revoke object URLs
            if (this.audioPath && this.audioPath.startsWith('blob:')) {
                try {
                    URL.revokeObjectURL(this.audioPath);
                    console.log('🍎 Object URL revoked');
                } catch (error) {
                    console.warn('⚠️ URL revoke warning:', error);
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
            
            console.log('🍎 iOS memory cleanup completed');
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
                
                console.log(`🍎 iOS Memory: ${usedMB}MB used / ${totalMB}MB total / ${limitMB}MB limit`);
                
                // Warning if memory usage is high
                if (usedMB > limitMB * 0.8) {
                    console.warn('⚠️ High memory usage detected on iOS');
                    return false;
                }
            }
        }
        
        return true;
    }
}
