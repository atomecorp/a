// Audio management for Lyrix application
import { CONSTANTS } from '../../core/constants.js';

// iOS-compatible logging function with clear prefix for filtering
function iosLog(message) {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

    const prefixedMessage = `ATOME-APP: ${message}`;

    if (isIOS) {
        try {
            if (window.webkit?.messageHandlers?.console) {
                // AUv3 console bridge available
            }
        } catch (e) {
            // Ignore bridge errors
        }
    }
}

// Enhanced logging for debugging .lrx file issues
export function debugLog(category, message, data = null) {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    let logMessage = `[${timestamp}] ${category}: ${message}`;

    if (data) {
        logMessage += ` | Data: ${JSON.stringify(data)}`;
    }

    iosLog(logMessage);
}

// Extract clean filename for .lrx storage (spaces, no %20, no URL)
export function extractCleanFileName(audioPath) {
    if (!audioPath) return null;

    if (audioPath.startsWith('http://') || audioPath.startsWith('https://')) {
        const url = new URL(audioPath);
        const fileName = url.pathname.split('/').pop();
        return decodeURIComponent(fileName);
    }

    if (audioPath.includes('/assets/audios/')) {
        const fileName = audioPath.split('/').pop();
        return decodeURIComponent(fileName);
    }

    if (audioPath.includes('%20')) {
        return decodeURIComponent(audioPath);
    }

    const fileName = audioPath.split(/[/\\]/).pop();
    return fileName;
}

export class AudioManager {

    static normalize(audioPath) {
        debugLog('NORMALIZE', 'Called with audioPath', audioPath);

        if (!audioPath) return null;

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

        if (/^https?:\/\/[^\s]+\/audio\//i.test(audioPath)) {
            debugLog('NORMALIZE', 'Already dynamic server /audio/ URL, returning as-is');
            return audioPath;
        }

        if (audioPath.includes('/assets/audios/')) {
            const fname = audioPath.split('/').pop();
            debugLog('NORMALIZE', 'Legacy assets path detected, migrating', fname);
            return this.createUrl(fname);
        }

        const fileName = audioPath.split(/[/\\]/).pop();
        debugLog('NORMALIZE', 'Original audioPath', audioPath);
        debugLog('NORMALIZE', 'Extracted fileName', fileName);
        debugLog('NORMALIZE', 'fileName includes .m4a?', fileName.includes('.m4a'));

        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        if (isIOS) {
            debugLog('iOS-AUDIO', 'Original fileName', fileName);
            debugLog('iOS-AUDIO', 'Has spaces', fileName.includes(' '));
            debugLog('iOS-AUDIO', 'Has %20', fileName.includes('%20'));

            let iosFileName = fileName;

            if (fileName.includes('%20')) {
                debugLog('iOS-AUDIO', 'File already encoded with %20, using directly');
                iosFileName = fileName;
            } else if (fileName.includes(' ')) {
                try {
                    const decoded = decodeURIComponent(fileName);
                    iosFileName = decoded.replace(/\s+/g, '%20');
                    debugLog('iOS-AUDIO', 'Decoded and re-encoded', iosFileName);
                } catch (e) {
                    iosFileName = fileName.replace(/\s+/g, '%20');
                    debugLog('iOS-AUDIO', 'Direct space replacement', iosFileName);
                }
            }

            const finalUrl = this.createUrl(iosFileName);
            debugLog('iOS-AUDIO', 'Final URL', finalUrl);
            return finalUrl;
        }

        try {
            const decodedFileName = decodeURIComponent(fileName);
            return this.createUrl(decodedFileName);
        } catch (decodeError) {
            return this.createUrl(fileName);
        }
    }

    static createUrl(fileName) {
        debugLog('CREATE-URL', 'Input fileName', fileName);
        let baseName = fileName.split(/[/\\]/).pop();
        if (!baseName) baseName = fileName;
        baseName = baseName.replace(/^assets%2Faudios%2F/i,'');

        try { baseName = decodeURIComponent(baseName); } catch(e) {}
        const encodedName = encodeURIComponent(baseName);

        const port = window.ATOME_LOCAL_HTTP_PORT || window.__ATOME_LOCAL_HTTP_PORT__;
        if (port) {
            const serverUrl = `http://127.0.0.1:${port}/audio/${encodedName}`;
            debugLog('CREATE-URL', 'Using dynamic local server', serverUrl);
            return serverUrl;
        }

        const fallbackUrl = `./assets/audios/${encodedName}`;
        debugLog('CREATE-URL', 'Fallback asset URL (no port yet)', fallbackUrl);
        return fallbackUrl;
    }

    static createFallbackUrl(fileName) {
        return CONSTANTS.AUDIO.BASE_PATH + encodeURIComponent(fileName);
    }

    static getDemoPaths() {
        return Object.fromEntries(
            Object.entries(CONSTANTS.AUDIO.DEMO_FILES).map(([key, file]) => [key, this.createUrl(file)])
        );
    }

    static debug(input) {
        return this.normalize(input);
    }

    static validateFile(file, expectedMetadata) {
        if (file.name !== expectedMetadata.fileName) {
            return { isValid: false, reason: 'Different filename' };
        }
        if (expectedMetadata.fileSize && Math.abs(file.size - expectedMetadata.fileSize) > 1024) {
            return { isValid: false, reason: 'Different file size' };
        }
        if (expectedMetadata.lastModified && file.lastModified !== expectedMetadata.lastModified) {
            return { isValid: false, reason: 'Different modification date' };
        }
        return { isValid: true, reason: 'File matches' };
    }

    static createMetadata(file) {
        return {
            fileName: file.name,
            fileSize: file.size,
            lastModified: file.lastModified,
            fileId: `${file.name}_${file.size}_${file.lastModified}`
        };
    }

    static formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    static isAudioFile(file) {
        if (file.type.startsWith('audio/') || file.type.startsWith('video/')) {
            return true;
        }
        return CONSTANTS.FILE_TYPES.AUDIO.test(file.name);
    }
}

// ─── AudioController ─────────────────────────────────────────────────
// Fixes over previous version:
// - Proper event listener cleanup via AbortController (no more memory leaks)
// - retryCount initialized in constructor (was undefined → NaN)
// - play() always handles the promise (no unhandled rejections)
// - Blob URLs revoked on every source change (not just in removeAudio)
// - setTimeout IDs tracked and cleared on dispose
// - dispose() method for complete cleanup

export class AudioController {
    constructor() {
        this.audioPlayer = null;
        this.playing = false;
        this.audioPath = null;
        this.currentFileName = null;
        this.currentMetadata = null;
        this.eventListeners = {};
        this.retryCount = 0;
        // Track pending timeouts for cleanup
        this._pendingTimers = new Set();
        // AbortController for cleaning up DOM event listeners
        this._listenerAbort = null;
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
                console.warn('[AudioController] Event handler error (' + event + '):', error);
            }
        });
    }

    // ─── Timer management ──────────────────────────────────────────
    _setTimeout(fn, ms) {
        const id = setTimeout(() => {
            this._pendingTimers.delete(id);
            fn();
        }, ms);
        this._pendingTimers.add(id);
        return id;
    }

    _clearAllTimers() {
        for (const id of this._pendingTimers) {
            clearTimeout(id);
        }
        this._pendingTimers.clear();
    }

    // ─── Listener management ───────────────────────────────────────
    // Uses AbortController to remove ALL listeners in one call
    _abortListeners() {
        if (this._listenerAbort) {
            this._listenerAbort.abort();
            this._listenerAbort = null;
        }
    }

    _newListenerSignal() {
        this._abortListeners();
        this._listenerAbort = new AbortController();
        return this._listenerAbort.signal;
    }

    // Revoke any existing blob URL
    _revokeBlobUrl() {
        if (this.audioPath && this.audioPath.startsWith('blob:')) {
            try { URL.revokeObjectURL(this.audioPath); } catch (_) {}
            this.audioPath = null;
        }
    }

    // Load audio file with enhanced iOS support
    loadAudio(audioPath) {
        try {
            debugLog('LOAD-AUDIO', 'Called with audioPath', audioPath);

            this.audioPath = audioPath;
            const normalizedPath = AudioManager.normalize(audioPath);

            debugLog('LOAD-AUDIO', 'Normalized path result', normalizedPath);

            if (!normalizedPath) {
                debugLog('LOAD-AUDIO', 'Failed to normalize audio path', audioPath);
                return false;
            }

            const fileName = audioPath.split(/[/\\]/).pop();
            debugLog('LOAD-AUDIO', 'Extracted fileName', fileName);

            // Reset retry count for new audio load
            this.retryCount = 0;

            if (this.isIOS()) {
                debugLog('LOAD-AUDIO', 'Calling loadAudioIOS with path', normalizedPath);
                return this.loadAudioIOS(normalizedPath, fileName);
            } else {
                return this.loadAudioDesktop(normalizedPath, fileName);
            }

        } catch (error) {
            iosLog('Error in loadAudio: ' + error);
            return false;
        }
    }

    // iOS-specific audio loading with enhanced error handling
    loadAudioIOS(normalizedPath, fileName) {
        try {
            iosLog('iOS audio loading for: ' + fileName);

            this.audioPlayer = new Audio();
            this.audioPlayer.preload = 'none';
            this.audioPlayer.crossOrigin = 'anonymous';
            this.audioPlayer.controls = false;

            this.audioPlayer.setAttribute('webkit-playsinline', 'true');
            this.audioPlayer.setAttribute('playsinline', 'true');

            this.setupAudioListenersIOS(fileName);

            this._setTimeout(() => {
                try {
                    if (!this.audioPlayer) return; // Guard against disposed controller
                    iosLog('Setting audio.src to: ' + normalizedPath);
                    this.audioPlayer.src = normalizedPath;
                    iosLog('iOS audio source set successfully for: ' + fileName);
                } catch (srcError) {
                    iosLog('iOS audio source error: ' + srcError);
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

        this.audioPlayer = new Audio(normalizedPath);
        this.audioPlayer.preload = 'metadata';
        this.setupAudioListeners(fileName);
        return true;
    }

    // Enhanced iOS audio event listeners — uses AbortController for cleanup
    setupAudioListenersIOS(fileName) {
        if (!this.audioPlayer) return;
        const signal = this._newListenerSignal();
        const player = this.audioPlayer;

        player.addEventListener('timeupdate', () => {
            const currentTime = player.currentTime;
            if (isFinite(currentTime) && !isNaN(currentTime)) {
                this.emit('timeupdate', currentTime);
            }
        }, { signal });

        player.addEventListener('loadedmetadata', () => {
            iosLog('iOS audio metadata loaded: ' + fileName);
            this.emit('loaded', player.duration);
        }, { signal });

        player.addEventListener('loadeddata', () => {
            iosLog('iOS audio data loaded: ' + fileName);
            this.emit('ready');
        }, { signal });

        player.addEventListener('canplay', () => {
            iosLog('iOS audio can play: ' + fileName);
            this.emit('canplay');
        }, { signal });

        player.addEventListener('ended', () => {
            this.playing = false;
            this.emit('ended');
        }, { signal });

        player.addEventListener('play', () => {
            this.playing = true;
            this.emit('play');
        }, { signal });

        player.addEventListener('pause', () => {
            this.playing = false;
            this.emit('pause');
        }, { signal });

        player.addEventListener('error', (e) => {
            const err = e.target.error;
            iosLog('iOS audio error for: ' + fileName + ' code=' + (err ? err.code : 'unknown'));
            this.handleIOSAudioError(err, fileName);
        }, { signal });

        player.addEventListener('stalled', () => {
            iosLog('iOS audio stalled: ' + fileName);
        }, { signal });

        player.addEventListener('waiting', () => {
            iosLog('iOS audio waiting: ' + fileName);
        }, { signal });
    }

    // Handle iOS audio errors with fallback strategies
    handleIOSAudioError(error, fileName) {
        iosLog('iOS audio error for ' + fileName + ': ' + error);

        if (error && error.code === 4) {
            iosLog('Audio file not supported or not found: ' + fileName);
            this.showIOSAudioMissingDialog(fileName);
            return;
        }

        if (this.audioPlayer && this.audioPath && this.retryCount < 3) {
            this.retryCount++;
            this._setTimeout(() => {
                try {
                    if (!this.audioPlayer) return;
                    this.audioPlayer.preload = 'auto';
                    this.audioPlayer.load();
                    iosLog('iOS audio reload attempt ' + this.retryCount + ' for: ' + fileName);
                } catch (reloadError) {
                    iosLog('iOS audio reload failed: ' + reloadError);
                    this.emit('error', error);
                }
            }, Math.min(500 * this.retryCount, 2000)); // Exponential-ish backoff
        } else {
            this.showIOSAudioMissingDialog(fileName);
            this.emit('error', error);
        }
    }

    // Show dialog for missing audio files on iOS
    showIOSAudioMissingDialog(fileName) {
        // Dialog intentionally disabled per user request
        iosLog(`Suppressed missing audio dialog for: ${fileName}`);
    }

    // Standard audio event listeners (desktop) — uses AbortController for cleanup
    setupAudioListeners(fileName) {
        if (!this.audioPlayer) return;
        const signal = this._newListenerSignal();
        const player = this.audioPlayer;

        player.addEventListener('timeupdate', () => {
            this.emit('timeupdate', player.currentTime);
        }, { signal });

        player.addEventListener('loadedmetadata', () => {
            debugLog('DESKTOP-AUDIO', 'loadedmetadata event - duration', player.duration);
            this.emit('loaded', player.duration);
        }, { signal });

        player.addEventListener('loadeddata', () => {
            this.emit('ready');
        }, { signal });

        player.addEventListener('ended', () => {
            this.playing = false;
            this.emit('ended');
        }, { signal });

        player.addEventListener('play', () => {
            this.playing = true;
            this.emit('play');
        }, { signal });

        player.addEventListener('pause', () => {
            this.playing = false;
            this.emit('pause');
        }, { signal });

        player.addEventListener('error', (e) => {
            const err = e.target.error;
            if (err) {
                console.warn('[AudioController] Media error:', err.code, err.message);
            }
            this.emit('error', err);
        }, { signal });

        player.addEventListener('canplaythrough', () => {
            this.emit('ready');
        }, { signal });
    }

    // Get current time with iOS validation
    getCurrentTime() {
        if (!this.audioPlayer) return 0;

        const currentTime = this.audioPlayer.currentTime;

        if (!isFinite(currentTime) || isNaN(currentTime)) {
            return 0;
        }

        return currentTime || 0;
    }

    // Set current time with iOS error handling
    setCurrentTime(time) {
        if (!this.audioPlayer) return;

        if (!isFinite(time) || isNaN(time) || time < 0) {
            return;
        }

        try {
            this.audioPlayer.currentTime = time;
        } catch (error) {
            if (this.isIOS()) {
                this._setTimeout(() => {
                    try {
                        if (this.audioPlayer) {
                            this.audioPlayer.currentTime = time;
                        }
                    } catch (retryError) {
                        console.warn('[AudioController] iOS seek retry failed:', retryError);
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
                        // Expected on first try before user interaction
                    });
                }
            }

            document.removeEventListener('touchstart', enableAudio);
            document.removeEventListener('click', enableAudio);
        };

        document.addEventListener('touchstart', enableAudio, { once: true });
        document.addEventListener('click', enableAudio, { once: true });
    }

    isPlaying() {
        return this.playing;
    }

    isAudioPlaying() {
        return this.playing;
    }

    // Play audio — always handles the promise to avoid unhandled rejections
    play() {
        if (!this.audioPlayer) return;
        const playPromise = this.audioPlayer.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                this.playing = true;
            }).catch(error => {
                if (error.name === 'NotAllowedError') {
                    iosLog('Autoplay blocked — user interaction required');
                } else if (error.name === 'AbortError') {
                    // play() interrupted by pause() or new load — not a real error
                } else {
                    console.warn('[AudioController] play() failed:', error.name, error.message);
                }
                this.emit('error', error);
            });
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
        AudioManager.normalize(audioPath);
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
                this.play(); // Use the safe play() method
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
                    this.setCurrentTime(value);
                }
                break;

            case 'volume':
                if (value !== null) {
                    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
                    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
                    const volumeControlDisabled = isIOS || (isSafari && navigator.vendor === 'Apple Computer, Inc.');

                    if (volumeControlDisabled) {
                        localStorage.setItem('lyrix_audio_volume', (value * 100).toString());
                        return false;
                    }

                    try {
                        this.audioPlayer.volume = Math.max(0, Math.min(1, value));
                    } catch (error) {
                        console.warn('[AudioController] volume set failed:', error);
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

    // Load audio file — revokes previous blob URL to prevent memory leaks
    loadFile(file) {
        const metadata = AudioManager.createMetadata(file);

        // Clean up previous blob URL if any
        this._revokeBlobUrl();

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
            // Clean up existing player
            if (this.audioPlayer) {
                this.audioPlayer.pause();
                this.audioPlayer.src = '';
                this._revokeBlobUrl();
            }

            // Reset retry count
            this.retryCount = 0;

            if (isIOS) {
                this.audioPlayer = new Audio();
                this.audioPlayer.preload = 'none';
                this.audioPlayer.crossOrigin = 'anonymous';
                this.audioPlayer.setAttribute('webkit-playsinline', 'true');
                this.audioPlayer.setAttribute('playsinline', 'true');

                this.setupIOSURLListeners(audioUrl);

                this._setTimeout(() => {
                    try {
                        if (!this.audioPlayer) return;
                        this.audioPlayer.src = audioUrl;
                        this.audioPath = audioUrl;
                    } catch (srcError) {
                        this.handleIOSAudioError(srcError, 'URL loading');
                    }
                }, 150);

            } else {
                this.audioPlayer = new Audio();
                this.audioPlayer.preload = 'metadata';
                this.audioPlayer.crossOrigin = 'anonymous';
                this.audioPlayer.src = audioUrl;
                this.audioPath = audioUrl;

                this.setupAudioListeners('URL Audio');
            }

            return true;

        } catch (error) {
            console.warn('[AudioController] loadFromUrl failed:', error);
            if (isIOS) {
                this.handleIOSAudioError(error, 'URL loading');
            }
            return false;
        }
    }

    // iOS-specific event listeners for URL loading — uses AbortController for cleanup
    setupIOSURLListeners(audioUrl) {
        if (!this.audioPlayer) return;
        const signal = this._newListenerSignal();
        const player = this.audioPlayer;

        player.addEventListener('loadstart', () => {
            iosLog('iOS URL loadstart');
        }, { signal });

        player.addEventListener('loadedmetadata', () => {
            this.emit('loaded', player.duration);
        }, { signal });

        player.addEventListener('loadeddata', () => {
            this.emit('ready');
        }, { signal });

        player.addEventListener('canplay', () => {
            this.emit('canplay');
        }, { signal });

        player.addEventListener('canplaythrough', () => {
            this.emit('ready');
        }, { signal });

        player.addEventListener('timeupdate', () => {
            const currentTime = player.currentTime;
            if (isFinite(currentTime) && !isNaN(currentTime)) {
                this.emit('timeupdate', currentTime);
            }
        }, { signal });

        player.addEventListener('ended', () => {
            this.playing = false;
            this.emit('ended');
        }, { signal });

        player.addEventListener('play', () => {
            this.playing = true;
            this.emit('play');
        }, { signal });

        player.addEventListener('pause', () => {
            this.playing = false;
            this.emit('pause');
        }, { signal });

        player.addEventListener('error', (e) => {
            this.handleIOSAudioError(e.target.error, 'URL playback');
        }, { signal });

        player.addEventListener('stalled', () => {
            iosLog('iOS URL audio stalled');
        }, { signal });

        player.addEventListener('waiting', () => {
            iosLog('iOS URL audio waiting (buffering)');
        }, { signal });

        player.addEventListener('abort', () => {
            iosLog('iOS URL audio aborted');
        }, { signal });
    }

    // Remove current audio — full cleanup
    removeAudio() {
        this._clearAllTimers();
        this._abortListeners();

        if (this.audioPlayer) {
            this.audioPlayer.pause();
            this.audioPlayer.src = '';
            this._revokeBlobUrl();
        }

        this.audioPath = null;
        this.playing = false;
        this.currentFileName = null;
        this.currentMetadata = null;
        this.retryCount = 0;
    }

    // Clear current audio (alias for removeAudio)
    clearAudio() {
        this.removeAudio();
    }

    // Complete disposal — call this when the controller is no longer needed
    dispose() {
        this.removeAudio();
        this.audioPlayer = null;
        this.eventListeners = {};
    }

    // iOS-specific memory cleanup
    forceMemoryCleanup() {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

        if (isIOS) {
            this._clearAllTimers();
            this._abortListeners();

            if (this.audioPlayer) {
                try {
                    this.audioPlayer.pause();
                    this.audioPlayer.currentTime = 0;
                    this.audioPlayer.src = '';
                    this.audioPlayer.load();
                } catch (error) {
                    console.warn('[AudioController] iOS cleanup error:', error);
                }
            }

            this._revokeBlobUrl();

            if (window.gc) {
                window.gc();
            }

            this.audioPath = null;
            this.currentFileName = null;
            this.currentMetadata = null;
            this.playing = false;
            this.retryCount = 0;
        }
    }

    // Check iOS memory status
    checkIOSMemory() {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

        if (isIOS && performance.memory) {
            const memoryInfo = performance.memory;
            const usedMB = Math.round(memoryInfo.usedJSHeapSize / 1024 / 1024);
            const limitMB = Math.round(memoryInfo.jsHeapSizeLimit / 1024 / 1024);

            if (usedMB > limitMB * 0.8) {
                console.warn('[AudioController] High memory usage:', usedMB + '/' + limitMB + ' MB');
                return false;
            }
        }

        return true;
    }
}
