// Audio management for Lyrix application
import { CONSTANTS } from './constants.js';

// iOS-compatible logging function with clear prefix for filtering
function iosLog(message) {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    
    // Add distinctive prefix to filter app logs from iOS system errors
    const prefixedMessage = `⚛️ ATOME-APP: ${message}`;
    
    if (isIOS) {
        // For iOS AUv3 apps - send to Xcode console via WebKit message handler
        try {
            if (window.webkit?.messageHandlers?.console) {
                window.webkit.messageHandlers.console.postMessage(prefixedMessage);
            } else {
                // Fallback for development
                console.log('[iOS]', prefixedMessage);
            }
        } catch (e) {
            console.log('[iOS-fallback]', prefixedMessage);
        }
    } else {
        // Standard console.log for desktop
        console.log(prefixedMessage);
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
                console.warn('⚠️ Corrupted audio metadata:', e);
                return null;
            }
        }
        
        // Already formed complete URL - return as is
        if (audioPath.startsWith(CONSTANTS.AUDIO.BASE_URL)) {
            debugLog('NORMALIZE', 'Path already has BASE_URL, returning as-is');
            return audioPath;
        }
        if (audioPath.startsWith('http://') || audioPath.startsWith('https://')) {
            debugLog('NORMALIZE', 'Path is HTTP URL, returning as-is');
            return audioPath;
        }
        
        // Relative path with BASE_PATH
        if (audioPath.startsWith(CONSTANTS.AUDIO.BASE_PATH)) {
            debugLog('NORMALIZE', 'Path has BASE_PATH, processing...');
            return this.createUrl(audioPath.replace(CONSTANTS.AUDIO.BASE_PATH, ''));
        }
        
        // Extract filename from path and handle iOS-specific encoding issues
        const fileName = audioPath.split(/[/\\]/).pop();
        debugLog('NORMALIZE', 'Extracted fileName', fileName);
        
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
        
        // Desktop handling - decode then re-encode
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
        // Check if running on iOS
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        
        if (isIOS) {
            debugLog('iOS-CREATE', 'Input fileName', fileName);
            debugLog('iOS-CREATE', 'Contains %20', fileName.includes('%20'));
            debugLog('iOS-CREATE', 'Contains spaces', fileName.includes(' '));
            
            let finalFileName;
            
            // If filename already has %20 (from .lrx files), don't re-encode
            if (fileName.includes('%20')) {
                finalFileName = fileName;
                debugLog('iOS-CREATE', 'Using pre-encoded filename from .lrx');
            } else if (fileName.includes(' ')) {
                // Replace spaces with %20 for iOS (for drag&drop files)
                finalFileName = fileName.replace(/\s+/g, '%20');
                debugLog('iOS-CREATE', 'Replaced spaces with %20', finalFileName);
            } else {
                // Encode normally for files without spaces
                finalFileName = encodeURIComponent(fileName);
                debugLog('iOS-CREATE', 'Normal encoding applied');
            }
            
            // Use local bundle path instead of localhost for iOS
            const finalUrl = `./assets/audios/${finalFileName}`;
            debugLog('iOS-CREATE', 'Final URL (iOS local)', finalUrl);
            return finalUrl;
        } else {
            // Standard encoding for desktop
            return CONSTANTS.AUDIO.BASE_URL + encodeURIComponent(fileName);
        }
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
            // Log the original audio path for debugging
            debugLog('LOAD-AUDIO', 'Called with audioPath', audioPath);
            
            this.audioPath = audioPath;
            const normalizedPath = AudioManager.normalize(audioPath);
            
            debugLog('LOAD-AUDIO', 'Normalized path result', normalizedPath);
            
            if (!normalizedPath) {
                debugLog('LOAD-AUDIO', 'Failed to normalize audio path', audioPath);
                console.error('❌ Failed to normalize audio path:', audioPath);
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
            console.error('❌ Error loading audio:', error);
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
                    console.error('❌ iOS audio reload failed:', reloadError);
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
        iosLog(`⚠️ Showing missing audio dialog for: ${fileName}`);
        
        // Don't show multiple dialogs
        if (document.getElementById('ios-audio-missing-dialog')) {
            return;
        }
        
        // Create modal explaining the issue
        const modal = document.createElement('div');
        modal.id = 'ios-audio-missing-dialog';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;

        const content = document.createElement('div');
        content.style.cssText = `
            background: white;
            padding: 30px;
            border-radius: 10px;
            max-width: 400px;
            text-align: center;
            margin: 20px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        `;

        content.innerHTML = `
            <h3 style="color: #e74c3c; margin-top: 0;">🎵 Audio File Missing</h3>
            <p><strong>File:</strong> ${fileName}</p>
            <p style="color: #666;">This audio file is not available in the iOS app.</p>
            <div style="text-align: left; margin: 20px 0; background: #f8f9fa; padding: 15px; border-radius: 8px;">
                <strong>📱 iPhone/iOS limitations:</strong>
                <ul style="margin: 10px 0; padding-left: 20px;">
                    <li>Audio files must be in the app bundle</li>
                    <li>Network audio may be restricted</li>
                    <li>File access is sandboxed</li>
                </ul>
            </div>
            <div style="text-align: left; margin: 20px 0;">
                <strong>✅ You can still:</strong>
                <ul style="margin: 10px 0; padding-left: 20px;">
                    <li>View and edit lyrics</li>
                    <li>Use MIDI learn functions</li>
                    <li>Export to other formats</li>
                </ul>
            </div>
            <button id="dismissAudioError" style="
                background: #3498db;
                color: white;
                border: none;
                padding: 12px 24px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 16px;
                font-weight: bold;
                margin-top: 10px;
            ">Continue without audio</button>
        `;

        modal.appendChild(content);
        document.body.appendChild(modal);

        // Handle dismiss
        document.getElementById('dismissAudioError').onclick = () => {
            document.body.removeChild(modal);
        };

        // Close on modal background click
        modal.onclick = (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        };

        // Auto-dismiss after 15 seconds
        setTimeout(() => {
            if (document.body.contains(modal)) {
                document.body.removeChild(modal);
            }
        }, 15000);
    }

    // Standard audio event listeners (desktop)
    setupAudioListeners(fileName) {
        if (!this.audioPlayer) return;
        
        this.audioPlayer.addEventListener('timeupdate', () => {
            this.emit('timeupdate', this.audioPlayer.currentTime);
        });
        
        // Emit 'loaded' when metadata (including duration) is available
        this.audioPlayer.addEventListener('loadedmetadata', () => {
            console.log('✅ Audio metadata loaded successfully:', fileName);
            debugLog('DESKTOP-AUDIO', 'loadedmetadata event - duration', this.audioPlayer.duration);
            this.emit('loaded', this.audioPlayer.duration);
        });
        
        this.audioPlayer.addEventListener('loadeddata', () => {
            console.log('✅ Audio data loaded successfully:', fileName);
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
                    // Check if platform supports volume control
                    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
                    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
                    const volumeControlDisabled = isIOS || (isSafari && navigator.vendor === 'Apple Computer, Inc.');
                    
                    if (volumeControlDisabled) {
                        console.log('🔊 Volume control disabled on iOS/Safari - use device volume buttons');
                        // Store the value but don't apply it
                        localStorage.setItem('lyrix_audio_volume', (value * 100).toString());
                        return false;
                    }
                    
                    try {
                        this.audioPlayer.volume = Math.max(0, Math.min(1, value));
                        console.log('🔊 Volume:', (value * 100) + '%');
                    } catch (error) {
                        console.log('🔊 Volume control not supported:', error.message);
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
