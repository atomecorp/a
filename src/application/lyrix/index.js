// Lyrix Application - New Entry Point
// This is the new modular entry point for the Lyrix application

// Import modal modules
import { showSongLibrary } from './song_list.js';
import { showSettingsModal, toggleAudioPlayerControls, toggleAudioSync, toggleMidiInspector } from './settings.js';

// iOS-compatible logging function (duplicate from audio.js for startup logging)
function startupLog(message) {
    const prefixedMessage = `⚛️ ATOME-APP: ${message}`;
    console.log(prefixedMessage);
}

// Utility function to check if volume control is supported on the current platform
function isVolumeControlSupported() {
    return true; // Always allow volume control on all platforms
}

// Utility function to safely apply volume with platform detection
function safeApplyVolume(audioPlayer, volumePercent, context = '') {
    try {
        const volumeValue = volumePercent / 100;
        
        // Check that we can actually set the volume property
        if (audioPlayer && typeof audioPlayer.volume !== 'undefined') {
            audioPlayer.volume = volumeValue;
            console.log(`🔊 Volume applied${context ? ' (' + context + ')' : ''}: ${volumePercent}%`);
            return true;
        } else {
            console.log(`🔊 Audio player does not support volume control${context ? ' (' + context + ')' : ''}`);
            return false;
        }
    } catch (error) {
        console.log(`🔊 Volume application failed${context ? ' (' + context + ')' : ''}:`, error.message);
        return false;
    }
}

// Application startup message
startupLog('===============================================');
startupLog('🚀 ATOME APPLICATION STARTING...');
startupLog('📱 Platform: ' + ((/iPad|iPhone|iPod/.test(navigator.userAgent)) ? 'iOS' : 'Desktop'));
startupLog('🕐 Time: ' + new Date().toISOString());
startupLog('===============================================');

// Force immediate test log for debugging
if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
    // Multiple attempts to ensure logging works
    setTimeout(() => startupLog('🔥 TEST 1: Atome app loaded successfully!'), 100);
    setTimeout(() => startupLog('🔥 TEST 2: iOS logging system working!'), 500);
    setTimeout(() => startupLog('🔥 TEST 3: Ready for .lrx import!'), 1000);
    
    // Also try direct console.log fallback
    setTimeout(() => console.log('⚛️ ATOME-APP: 🔥 FALLBACK TEST: Direct console log'), 200);
}

// Import all modules
import { CONSTANTS } from './src/constants.js';
import { StorageManager } from './src/storage.js';
import { AudioManager, AudioController } from './src/audio.js';
import { UIManager } from './src/ui.js';
import { SongManager } from './src/songs.js';
import { SyncedLyrics } from './src/syncedLyrics.js';
import { LyricsLibrary } from './src/library.js';
import { LyricsDisplay } from './src/display.js';
import { DragDropManager } from './src/dragDrop.js';
window.dragDropManager = new DragDropManager();
import { Modal, InputModal, FormModal, SelectModal, ConfirmModal } from './src/modal.js';
import { MidiUtilities } from '././src/midi_utilities.js';
import { exportSongsToLRX } from './src/SongUtils.js';

// iOS Error Handling Setup
// Handle iOS thumbnail and view service termination errors globally
if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
   // console.log('🍎 iOS detected - Setting up global error handling for thumbnail/view service issues');
    
    // Function to check if error is related to iOS thumbnail/view service issues
    const isIOSSystemError = (error) => {
        const message = error?.message || error?.toString() || '';
        return message.includes('thumbnail') ||
               message.includes('view service') ||
               message.includes('QLThumbnailErrorDomain') ||
               message.includes('GSLibraryErrorDomain') ||
               message.includes('_UIViewServiceErrorDomain') ||
               message.includes('Generation not found') ||
               message.includes('Terminated=disconnect method');
    };
    
    // Handle unhandled promise rejections (iOS file picker errors)
    window.addEventListener('unhandledrejection', (event) => {
        if (isIOSSystemError(event.reason)) {
            event.preventDefault(); // Prevent the error from being logged
        }
    });
    
    // Handle global errors (iOS view service termination)
    window.addEventListener('error', (event) => {
        if (isIOSSystemError(event.error)) {
                    // Log metadata before saving
               
            event.preventDefault(); // Prevent the error from being logged
        }
    });
}

// Global state
let audioController = null;
let uiManager = null;
let lyricsLibrary = null;
let lyricsDisplay = null;
let currentSong = null;
let dragDropManager = null;
let midiUtilities = null;
let isUserScrubbing = false; // Track if user is actively scrubbing the audio slider
let scrubSliderRef = null; // Reference to the slider for direct updates
let isProgrammaticUpdate = false; // Prevent slider callback during programmatic updates
let lastSeekTime = 0; // Track when we last seeked to prevent immediate timeupdate conflicts
let pendingSeekTime = null; // Store the time to seek to when user releases slider

// Function to update display title with current song information
function updateAudioTitle() {
    if (currentSong) {
        let lyricsDisplayText = 'Lyrics Display';
        
        // For lyrics display title, prefer song title over audio filename
        if (currentSong.metadata && currentSong.metadata.title) {
            lyricsDisplayText = currentSong.metadata.title;
        }
        
        // Update lyrics display title with song title or fallback
        if (window.displayTitleElement) {
            window.displayTitleElement.textContent = lyricsDisplayText;
        }
    }
}

// Apply initial settings from localStorage
function applyInitialSettings() {
    try {
        // Apply audio player visibility
        const showAudioControls = localStorage.getItem('lyrix_show_audio_controls') === 'true';
        if (typeof toggleAudioPlayerControls === 'function') {
            toggleAudioPlayerControls();
        }
        
        // Apply audio sync setting
        const enableAudioSync = localStorage.getItem('lyrix_enable_audio_sync') === 'true';
        if (typeof toggleAudioSync === 'function') {
            toggleAudioSync();
        }
        
        // Apply MIDI inspector visibility
        const showMidiInspector = localStorage.getItem('lyrix_show_midi_inspector') === 'true';
        if (typeof toggleMidiInspector === 'function') {
            toggleMidiInspector();
        }
        
        // Apply font size
        const fontSize = localStorage.getItem('lyrix_font_size') || '16';
        const lyricsContainer = document.querySelector('.lyrics-container');
        if (lyricsContainer) {
            lyricsContainer.style.fontSize = `${fontSize}px`;
        }
        
        console.log('⚙️ Initial settings applied');
    } catch (error) {
        console.error('❌ Error applying initial settings:', error);
    }
}

// Initialize the application
function initializeLyrix() {
    try {
        // Initialize managers
        audioController = new AudioController();
        uiManager = new UIManager();
        lyricsLibrary = new LyricsLibrary();
        
        // Apply saved volume to audio controller
        const savedVolume = localStorage.getItem('lyrix_audio_volume') || '70';
        if (audioController && audioController.audioPlayer) {
            safeApplyVolume(audioController.audioPlayer, parseInt(savedVolume), 'startup');
        }
        
        // Create main UI
        createMainInterface();
        
        // Initialize display (no longer needs a container, will append to lyrix_app)
        lyricsDisplay = new LyricsDisplay(null, audioController);
            
        // Connect audio time updates to lyrics display
        if (audioController && audioController.on) {
            audioController.on('timeupdate', (currentTime) => {
                // Convert seconds to milliseconds for lyrics synchronization
                const timeMs = currentTime * 1000;
                lyricsDisplay.updateTime(timeMs);
            });
        }
        
        // Initialize MIDI utilities
        midiUtilities = new MidiUtilities();
        window.midiUtilities = midiUtilities;  // Expose globally
        
        // Export managers and modal functions to global scope
        window.UIManager = UIManager; // Export the class for static methods
        window.uiManager = uiManager; // Export the instance for instance methods
        window.lyricsLibrary = lyricsLibrary;
        window.audioController = audioController;
        window.lyricsDisplay = lyricsDisplay;
        window.currentSong = currentSong;
        window.Modal = Modal;
        window.ConfirmModal = ConfirmModal;
        window.InputModal = InputModal;
        window.FormModal = FormModal;
        window.$ = $;
        
        // Export imported modal functions to global scope
        window.showSongLibrary = showSongLibrary;
        window.showSettingsModal = showSettingsModal;
        window.toggleAudioPlayerControls = toggleAudioPlayerControls;
        window.toggleAudioSync = toggleAudioSync;
        window.toggleMidiInspector = toggleMidiInspector;
        // Ensure MIDI inspector is in the toolbar
        const appContainer = document.getElementById('lyrix_app');
        const toolbarRow = document.getElementById('main-toolbar-row');
        if (toolbarRow && midiUtilities && midiUtilities.midiContainer) {
            toolbarRow.appendChild(midiUtilities.midiContainer);
        } else if (appContainer && midiUtilities && midiUtilities.midiContainer) {
            // Fallback: append to appContainer if toolbar not found
            appContainer.appendChild(midiUtilities.midiContainer);
        }
        // Apply saved settings on startup
        applyInitialSettings();

        // Debug: Force MIDI inspector visible if enabled
        setTimeout(() => {
            const midiElement = document.getElementById('midi-logger-container');
            const isMidiInspectorEnabled = localStorage.getItem('lyrix_midi_inspector_enabled') === 'true';
            if (midiElement) {
                if (isMidiInspectorEnabled) {
                    midiElement.style.display = 'block';
                    midiElement.style.zIndex = '9999'; // Bring to front for debug
                    midiElement.style.position = 'relative';
                    midiElement.style.backgroundColor = ''; // Restore original background color
                    midiElement.style.border = '3px solid #f00'; // Red border for visibility
                    midiElement.style.color = '#000'; // Black text for contrast
                }
            } else {
                console.warn('⚠️ MIDI Inspector not found in DOM');
            }
        }, 500);
        
        // Initialize drag and drop for external files (.txt, .lrc, .lrx, music)
        if (appContainer) {
            dragDropManager = new DragDropManager(audioController, lyricsLibrary, lyricsDisplay);
            dragDropManager.onSongLoaded = (song) => {
                updateAudioTitle();
                resetAudioSlider();
            };
            dragDropManager.initialize(appContainer);

            // Add dragover and drop event listeners directly for robustness
            appContainer.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
                appContainer.style.backgroundColor = '#e0f7fa';
            });
            appContainer.addEventListener('dragleave', (e) => {
                e.preventDefault();
                e.stopPropagation();
                appContainer.style.backgroundColor = '';
            });
            appContainer.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                appContainer.style.backgroundColor = '';
                const files = e.dataTransfer.files;
                if (files && files.length > 0) {
                    dragDropManager.handleDroppedFiles(Array.from(files));
                }
            });
        }
        
        // Make drag-and-drop work for the entire window, not just #lyrix_app
        window.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            document.body.style.backgroundColor = '#e0f7fa';
        });
        window.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            document.body.style.backgroundColor = '';
        });
        window.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            document.body.style.backgroundColor = '';
            const files = e.dataTransfer.files;
            if (files && files.length > 0) {
                dragDropManager.handleDroppedFiles(Array.from(files));
            }
        });
        
        // Load any existing song
        loadLastSong();
        
        // Remove loading message
        const loadingDiv = document.getElementById('loading');
        if (loadingDiv) {
            loadingDiv.remove();
        }
        
    } catch (error) {
        console.error('❌ Error initializing Lyrix:', error);
    }
}

// Create a new song
function createNewSong() {
    // Use FormModal instead of prompts
    FormModal({
        title: '🎵 Create New Song',
        fields: [
            {
                name: 'title',
                label: 'Song Title',
                placeholder: 'Enter song title...',
                required: true
            },
            {
                name: 'artist',
                label: 'Artist Name',
                placeholder: 'Enter artist name...',
                defaultValue: 'Unknown Artist'
            },
            {
                name: 'album',
                label: 'Album (optional)',
                placeholder: 'Enter album name...'
            }
        ],
        onSubmit: (values) => {
            try {
                // Crée la chanson avec metadata uniquement
                const metadata = {
                    title: values.title || '',
                    artist: values.artist || 'Unknown Artist',
                    album: values.album || '',
                    duration: 0
                };
                const songId = lyricsLibrary.generateSongId(metadata.title, metadata.artist);
                const song = new SyncedLyrics(metadata.title, metadata.artist, metadata.album, metadata.duration, songId);
                song.metadata = metadata;
                song.songId = songId;
                song.lines = [];
                lyricsLibrary.saveSong(song);
                if (song) {
                    loadAndDisplaySong(song.songId);
                }
            } catch (error) {
                console.error('❌ ERREUR lors de la création:', error);
                Modal({
                    title: '❌ Error',
                    content: `<p>Error creating song: ${error.message}</p>`,
                    buttons: [{ text: 'OK' }],
                    size: 'small'
                });
            }
        },
        onCancel: () => {
            // User cancelled
        }
    });
}

// Export songs to LRX format
function exportAllSongsToLRX() {
    if (!lyricsLibrary) {
        console.error('❌ LyricsLibrary non disponible');
        return;
    }

    const songSummaries = lyricsLibrary.getAllSongs();
    if (songSummaries.length === 0) {
        console.warn('❌ No songs available to export');
        return;
    }

    // Utilise la fonction utilitaire pour garantir l'inclusion des paroles
    const exportData = exportSongsToLRX(songSummaries, lyricsLibrary);

    // Create download - iOS compatible version
    const dataStr = JSON.stringify(exportData, null, 2);
    const filename = `lyrix_library_${new Date().toISOString().split('T')[0]}.lrx`;
    
    // Check if we're on iOS/mobile
    const isIOSorMobile = /iPad|iPhone|iPod|Android/i.test(navigator.userAgent) || 
                         (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    
    if (isIOSorMobile) {
        // iOS/Mobile: Show modal with copy/share options
        showMobileExportModal(dataStr, filename, 'LRX');
    } else {
        // Desktop: Traditional download
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        
        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        downloadLink.download = filename;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        URL.revokeObjectURL(url);
    }
}

// Mobile-friendly export modal for iOS compatibility
function showMobileExportModal(dataString, filename, fileType) {
    const modalContainer = UIManager.createEnhancedModalOverlay();
    const modal = UIManager.createEnhancedModalContainer({
        css: { maxWidth: '500px', width: '90%' }
    });

    // Header
    const header = $('div', {
        css: {
            padding: UIManager.THEME.spacing.lg,
            backgroundColor: UIManager.THEME.colors.primary,
            borderRadius: `${UIManager.THEME.borderRadius.lg} ${UIManager.THEME.borderRadius.lg} 0 0`,
            color: 'white'
        }
    });

    const headerTitle = $('h3', {
        text: `📱 Export ${fileType} File`,
        css: { margin: '0', color: 'white' }
    });

    const instructions = $('div', {
        text: 'Choose how to save your file on mobile:',
        css: {
            fontSize: '14px',
            opacity: '0.9',
            marginTop: '10px'
        }
    });

    header.append(headerTitle, instructions);

    // Content
    const content = $('div', {
        css: {
            padding: UIManager.THEME.spacing.lg
        }
    });

    // Copy to clipboard button
    const copyButton = $('button', {
        text: '📋 Copy to Clipboard',
        css: {
            width: '100%',
            padding: '15px',
            marginBottom: '10px',
            backgroundColor: '#3498db',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '16px',
            cursor: 'pointer',
            fontWeight: 'bold'
        }
    });

    copyButton.addEventListener('click', async () => {
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(dataString);
                copyButton.textContent = '✅ Copied!';
                copyButton.style.backgroundColor = '#27ae60';
                setTimeout(() => {
                    copyButton.textContent = '📋 Copy to Clipboard';
                    copyButton.style.backgroundColor = '#3498db';
                }, 2000);
            } else {
                // Fallback for older browsers
                const textArea = document.createElement('textarea');
                textArea.value = dataString;
                textArea.style.position = 'fixed';
                textArea.style.left = '-999999px';
                textArea.style.top = '-999999px';
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                
                copyButton.textContent = '✅ Copied!';
                copyButton.style.backgroundColor = '#27ae60';
                setTimeout(() => {
                    copyButton.textContent = '📋 Copy to Clipboard';
                    copyButton.style.backgroundColor = '#3498db';
                }, 2000);
            }
        } catch (err) {
            console.error('Failed to copy to clipboard:', err);
            copyButton.textContent = '❌ Copy failed';
            copyButton.style.backgroundColor = '#e74c3c';
            setTimeout(() => {
                copyButton.textContent = '📋 Copy to Clipboard';
                copyButton.style.backgroundColor = '#3498db';
            }, 2000);
        }
    });

    // Share button (iOS native sharing)
    const shareButton = $('button', {
        text: '📤 Share File',
        css: {
            width: '100%',
            padding: '15px',
            marginBottom: '10px',
            backgroundColor: '#9b59b6',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '16px',
            cursor: 'pointer',
            fontWeight: 'bold'
        }
    });

    shareButton.addEventListener('click', async () => {
        try {
            if (navigator.share) {
                // Create a blob for sharing
                const blob = new Blob([dataString], { 
                    type: fileType === 'LRX' ? 'application/json' : 'text/plain' 
                });
                const file = new File([blob], filename, { 
                    type: fileType === 'LRX' ? 'application/json' : 'text/plain' 
                });
                
                await navigator.share({
                    title: `Lyrix ${fileType} Export`,
                    text: `Exported ${fileType} file from Lyrix`,
                    files: [file]
                });
            } else {
                // Fallback: create download link that might work better on some mobile browsers
                const blob = new Blob([dataString], { 
                    type: fileType === 'LRX' ? 'application/json' : 'text/plain' 
                });
                const url = URL.createObjectURL(blob);
                
                // Try to open in new tab/window for manual save
                const newWindow = window.open(url, '_blank');
                if (!newWindow) {
                    // If popup blocked, create download link
                    const downloadLink = document.createElement('a');
                    downloadLink.href = url;
                    downloadLink.download = filename;
                    downloadLink.click();
                }
                
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                
                shareButton.textContent = '✅ Opened in new tab';
                shareButton.style.backgroundColor = '#27ae60';
                setTimeout(() => {
                    shareButton.textContent = '📤 Share File';
                    shareButton.style.backgroundColor = '#9b59b6';
                }, 2000);
            }
        } catch (err) {
            console.error('Failed to share:', err);
            shareButton.textContent = '❌ Share failed';
            shareButton.style.backgroundColor = '#e74c3c';
            setTimeout(() => {
                shareButton.textContent = '📤 Share File';
                shareButton.style.backgroundColor = '#9b59b6';
            }, 2000);
        }
    });

    // View content button
    const viewButton = $('button', {
        text: '👁️ View Content',
        css: {
            width: '100%',
            padding: '15px',
            marginBottom: '20px',
            backgroundColor: '#f39c12',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '16px',
            cursor: 'pointer',
            fontWeight: 'bold'
        }
    });

    viewButton.addEventListener('click', () => {
        // Show content in a new modal
        showContentViewModal(dataString, filename, fileType);
    });

    // Instructions
    const instructionsText = $('div', {
        text: 'Instructions:\n• Copy to Clipboard: Copy the file content to paste in another app\n• Share File: Use iOS sharing to save to Files app or send to other apps\n• View Content: Preview the file content before saving',
        css: {
            fontSize: '14px',
            color: '#666',
            lineHeight: '1.4',
            backgroundColor: '#f8f9fa',
            padding: '15px',
            borderRadius: '8px',
            whiteSpace: 'pre-line',
            marginBottom: '15px'
        }
    });

    content.append(copyButton, shareButton, viewButton, instructionsText);

    // Footer
    const footer = $('div', {
        css: {
            padding: UIManager.THEME.spacing.lg,
            backgroundColor: UIManager.THEME.colors.background,
            borderTop: `1px solid ${UIManager.THEME.colors.border}`,
            borderRadius: `0 0 ${UIManager.THEME.borderRadius.lg} ${UIManager.THEME.borderRadius.lg}`,
            textAlign: 'center'
        }
    });

    const closeButton = $('button', {
        text: 'Close',
        css: {
            padding: '10px 20px',
            backgroundColor: '#95a5a6',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
        }
    });

    closeButton.addEventListener('click', () => {
        document.body.removeChild(modalContainer);
    });

    footer.appendChild(closeButton);

    // Assemble modal
    modal.append(header, content, footer);
    modalContainer.appendChild(modal);
    
    // Add to DOM
    document.body.appendChild(modalContainer);

    // Close on overlay click
    modalContainer.addEventListener('click', (e) => {
        if (e.target === modalContainer) {
            document.body.removeChild(modalContainer);
        }
    });
}

// Show content view modal
function showContentViewModal(dataString, filename, fileType) {
    const modalContainer = UIManager.createEnhancedModalOverlay();
    const modal = UIManager.createEnhancedModalContainer({
        css: { maxWidth: '800px', width: '95%', maxHeight: '90vh' }
    });

    // Header
    const header = $('div', {
        css: {
            padding: UIManager.THEME.spacing.md,
            backgroundColor: UIManager.THEME.colors.primary,
            borderRadius: `${UIManager.THEME.borderRadius.lg} ${UIManager.THEME.borderRadius.lg} 0 0`,
            color: 'white',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
        }
    });

    const headerTitle = $('h3', {
        text: `📄 ${filename}`,
        css: { margin: '0', color: 'white' }
    });

    const selectAllButton = $('button', {
        text: 'Select All',
        css: {
            padding: '5px 10px',
            backgroundColor: 'rgba(255,255,255,0.2)',
            color: 'white',
            border: '1px solid rgba(255,255,255,0.3)',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px'
        }
    });

    header.append(headerTitle, selectAllButton);

    // Content
    const content = $('div', {
        css: {
            padding: UIManager.THEME.spacing.md,
            maxHeight: '60vh',
            overflow: 'auto'
        }
    });

    const textArea = $('textarea', {
        value: dataString,
        css: {
            width: '100%',
            height: '50vh',
            padding: '10px',
            border: '1px solid #ddd',
            borderRadius: '4px',
            fontFamily: 'monospace',
            fontSize: '12px',
            resize: 'vertical',
            boxSizing: 'border-box'
        }
    });

    // Select all functionality
    selectAllButton.addEventListener('click', () => {
        textArea.select();
    });

    content.appendChild(textArea);

    // Footer
    const footer = $('div', {
        css: {
            padding: UIManager.THEME.spacing.md,
            backgroundColor: UIManager.THEME.colors.background,
            borderTop: `1px solid ${UIManager.THEME.colors.border}`,
            borderRadius: `0 0 ${UIManager.THEME.borderRadius.lg} ${UIManager.THEME.borderRadius.lg}`,
            display: 'flex',
            justifyContent: 'space-between',
            gap: '10px'
        }
    });

    const copyFromViewButton = $('button', {
        text: '📋 Copy',
        css: {
            padding: '10px 15px',
            backgroundColor: '#3498db',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
        }
    });

    copyFromViewButton.addEventListener('click', async () => {
        textArea.select();
        try {
            await navigator.clipboard.writeText(textArea.value);
            copyFromViewButton.textContent = '✅ Copied!';
            setTimeout(() => {
                copyFromViewButton.textContent = '📋 Copy';
            }, 2000);
        } catch (err) {
            document.execCommand('copy');
            copyFromViewButton.textContent = '✅ Copied!';
            setTimeout(() => {
                copyFromViewButton.textContent = '📋 Copy';
            }, 2000);
        }
    });

    const closeViewButton = $('button', {
        text: 'Close',
        css: {
            padding: '10px 15px',
            backgroundColor: '#95a5a6',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
        }
    });

    closeViewButton.addEventListener('click', () => {
        document.body.removeChild(modalContainer);
    });

    footer.append(copyFromViewButton, closeViewButton);

    // Assemble modal
    modal.append(header, content, footer);
    modalContainer.appendChild(modal);
    
    // Add to DOM
    document.body.appendChild(modalContainer);

    // Close on overlay click
    modalContainer.addEventListener('click', (e) => {
        if (e.target === modalContainer) {
            document.body.removeChild(modalContainer);
        }
    });

    // Focus textarea for easy selection
    setTimeout(() => textArea.focus(), 100);
}

// Export all songs to LRX format with folder dialog
function exportAllSongsToLRXWithFolderDialog(safariWin = null) {
    
    if (!lyricsLibrary) {
        console.error('❌ LyricsLibrary non disponible');
        return;
    }

    const songs = lyricsLibrary.getAllSongs();
   // console.log('🔍 Found songs:', songs.length);
    if (songs.length === 0) {
        console.warn('❌ No songs available to export');
        return;
    }

   // ('🔍 Creating export data...');
    // Create export data structure
    const exportData = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        totalSongs: songs.length,
        songs: songs.map(song => {
            // Log the audioPath format for debugging
            if (song.audioPath) {
                console.log(`📤 Exporting song "${song.metadata?.title || 'Unknown'}" with audioPath: "${song.audioPath}"`);
                
                // Verify that audioPath is just a filename (not a full URL)
                if (song.audioPath.startsWith('http://') || song.audioPath.startsWith('https://') || song.audioPath.includes('assets/audios/')) {
                    console.warn(`⚠️ Warning: audioPath contains full URL instead of just filename: ${song.audioPath}`);
                }
            }
            
            return {
                songId: song.songId,
                metadata: song.metadata || {},
                lyrics: song.lyrics || {},
                audioPath: song.audioPath,
                syncData: song.syncData,
                lines: song.lines || []
            };
        })
    };

    
    const jsonString = JSON.stringify(exportData, null, 2);
    
    // Detect Safari browser
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    const isWebKit = /webkit/i.test(navigator.userAgent) && !/chrome/i.test(navigator.userAgent);
    
    if (isSafari || isWebKit) {
        // Safari-specific method - utilise la fenêtre passée depuis le handler
        try {
            const newWindow = safariWin || window.open('', '_blank');
            if (newWindow) {
                newWindow.document.write(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>Download LRX File</title>
                        <style>
                            body { 
                                font-family: Arial, sans-serif; 
                                padding: 20px; 
                                background: #f5f5f5; 
                            }
                            .container { 
                                max-width: 600px; 
                                margin: 0 auto; 
                                background: white; 
                                padding: 30px; 
                                border-radius: 10px; 
                                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                            }
                            .download-btn { 
                                background: #007AFF; 
                                color: white; 
                                padding: 15px 30px; 
                                border: none; 
                                border-radius: 8px; 
                                font-size: 16px; 
                                cursor: pointer; 
                                display: block;
                                margin: 20px auto;
                                text-decoration: none;
                            }
                            .download-btn:hover { 
                                background: #005FCC; 
                            }
                            pre { 
                                background: #f8f8f8; 
                                padding: 15px; 
                                border-radius: 5px; 
                                max-height: 300px; 
                                overflow: auto; 
                                font-size: 12px;
                            }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <h2>📁 Save LRX File</h2>
                            <p>Click the button below to download your Lyrix library file:</p>
                            <a href="data:application/json;charset=utf-8,${encodeURIComponent(jsonString)}" 
                               download="lyrix_library_${new Date().toISOString().split('T')[0]}.lrx" 
                               class="download-btn">
                               💾 Download lyrix_library_${new Date().toISOString().split('T')[0]}.lrx
                            </a>
                            <p><strong>Instructions for Safari:</strong></p>
                            <ol>
                                <li>Click the download button above</li>
                                <li>Choose "Download Linked File" or "Save Link As..."</li>
                                <li>Select your desired save location</li>
                                <li>Click "Save"</li>
                            </ol>
                            <details>
                                <summary>Preview file content (click to expand)</summary>
                                <pre>${jsonString.substring(0, 1000)}${jsonString.length > 1000 ? '...\n\n[Content truncated for preview]' : ''}</pre>
                            </details>
                        </div>
                    </body>
                    </html>
                `);
                newWindow.document.close();
            } else {
                throw new Error('Popup blocked or failed to open new window');
            }
        } catch (error) {
            console.error('❌ Safari new window method failed:', error);
            // Ultimate fallback: try the simple data URI method
            const dataUri = `data:application/json;charset=utf-8,${encodeURIComponent(jsonString)}`;
            const saveLink = document.createElement('a');
            saveLink.href = dataUri;
            saveLink.download = `lyrix_library_${new Date().toISOString().split('T')[0]}.lrx`;
            saveLink.style.display = 'none';
            
            document.body.appendChild(saveLink);
            saveLink.click();
            document.body.removeChild(saveLink);
        }
    } else {
        // Standard method for other browsers
        const blob = new Blob([jsonString], { type: 'application/json' });
        
        
        const saveLink = document.createElement('a');
        const url = URL.createObjectURL(blob);
        saveLink.href = url;
        saveLink.download = `lyrix_library_${new Date().toISOString().split('T')[0]}.lrx`;
        saveLink.style.display = 'none';
        
  
        
        // Add to document, click, and remove
        document.body.appendChild(saveLink);
      //  console.log('🔍 Link added to document, triggering click...');
        
        try {
            saveLink.click();
            console.log('🔍 Click triggered');
        } catch (e) {
            console.log('🔍 Click failed, trying dispatchEvent:', e);
            const clickEvent = new MouseEvent('click', {
                view: window,
                bubbles: true,
                cancelable: false
            });
            saveLink.dispatchEvent(clickEvent);
            console.log('🔍 DispatchEvent triggered');
        }
        
        document.body.removeChild(saveLink);
        console.log('🔍 Link removed from document');
        
        // Clean up the object URL
        setTimeout(() => {
            URL.revokeObjectURL(url);
            console.log('🔍 Object URL revoked');
        }, 100);
    }
    
    console.log(`✅ Successfully exported ${songs.length} songs to LRX format`);
}

// Direct download fallback for LRX export without modal
function exportAllSongsToLRXDirectDownload(songs) {
    // Create export data structure
    const exportData = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        totalSongs: songs.length,
        songs: songs.map(song => ({
            songId: song.songId,
            metadata: song.metadata,
            lyrics: song.lyrics,
            audioPath: song.audioPath || null,
            syncData: song.syncData || null,
            lines: song.lines || []
        }))
    };

    // Create download
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = `lyrix_library_${new Date().toISOString().split('T')[0]}.lrx`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(url);

    console.log(`✅ Direct download initiated for ${songs.length} songs`);
}

// Import songs from LRX format
function importFromLRX(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importData = JSON.parse(e.target.result);
            
            // Validate LRX format
            if (!importData.songs || !Array.isArray(importData.songs)) {
                throw new Error('Invalid LRX format: missing songs array');
            }

            let importedCount = 0;
            const errors = [];

            // Import each song
            importData.songs.forEach((songData, index) => {
                try {
                    // Crée une instance SyncedLyrics pour chaque chanson importée
                    // Utilise uniquement les champs racine du format exporté
                    const syncedLyrics = new SyncedLyrics(
                       songData.title || `Imported ${index + 1}`,
                        songData.artist || 'Unknown',
                        songData.album || '',
                        songData.duration || 0,
                        songData.songId || `imported_${Date.now()}_${index}`
                    );
                    syncedLyrics.lines = (songData.lines || []).map(line => {
                        if (typeof line === 'object' && 'time' in line && 'text' in line) {
                            return { time: Number(line.time) || 0, text: line.text || '' };
                        } else if (typeof line === 'string') {
                            // Fallback: try to parse timecode from string
                            const match = line.match(/^\[(\d+):(\d+)\.(\d+)\]\s*(.*)$/);
                            if (match) {
                                const min = parseInt(match[1], 10);
                                const sec = parseInt(match[2], 10);
                                const cs = parseInt(match[3], 10);
                                const time = min * 60000 + sec * 1000 + cs * 10;
                                return { time, text: match[4] };
                            } else {
                                return { time: 0, text: line };
                            }
                        } else {
                            return { time: 0, text: '' };
                        }
                    });
                    syncedLyrics.audioPath = songData.audioPath;
                    syncedLyrics.syncData = songData.syncData;
                    // Merge any extra metadata, mais NE PAS écraser title/artist/album
                    syncedLyrics.metadata = Object.assign({}, syncedLyrics.metadata, songData.metadata || {}, {
                        audioPath: songData.audioPath,
                        title: syncedLyrics.title,
                        artist: syncedLyrics.artist,
                        album: syncedLyrics.album
                    });
                    // Les champs racine sont déjà corrects
                    // Log avant sauvegarde pour debug
                    console.log('[IMPORT DEBUG] Before save:', {
                        title: syncedLyrics.title,
                        artist: syncedLyrics.artist,
                        album: syncedLyrics.album,
                        metadata: syncedLyrics.metadata
                    });
                    // Add to library
                    const success = lyricsLibrary.saveSong(syncedLyrics);
                    if (success) {
                        importedCount++;
                        console.log(`✅ Imported song: ${syncedLyrics.metadata.title || syncedLyrics.title || 'Unknown'} | Artist: ${syncedLyrics.metadata.artist || syncedLyrics.artist || 'Unknown Artist'}`);
                    } else {
                        errors.push(`Failed to import song: ${syncedLyrics.metadata.title || syncedLyrics.title || 'Unknown'}`);
                    }
                } catch (error) {
                    errors.push(`Error importing song ${index + 1}: ${error.message}`);
                }
            });

            // Show results
            const message = errors.length > 0 
                ? `<p>Imported ${importedCount} songs successfully.</p><p>Errors: ${errors.join(', ')}</p>`
                : `<p>Successfully imported ${importedCount} songs.</p>`;

            Modal({
                title: '📥 Import Complete',
                content: message,
                buttons: [{ text: 'OK' }],
                size: 'medium'
            });

            // Refresh song library if any songs were imported
            if (importedCount > 0) {
                showSongLibrary();
            }

        } catch (error) {
            console.error('❌ Error importing LRX file:', error);
            Modal({
                title: '❌ Import Error',
                content: `<p>Failed to import LRX file: ${error.message}</p>`,
                buttons: [{ text: 'OK' }],
                size: 'small'
            });
        }
    };
    reader.readAsText(file);
}

// Export selected songs as text
function exportSelectedSongsAsText() {
    if (!lyricsLibrary) {
        console.error('❌ LyricsLibrary non disponible');
        return;
    }

    const songs = lyricsLibrary.getAllSongs();
    if (songs.length === 0) {
        console.warn('❌ No songs available to export');
        return;
    }

    // Create selection modal
    const songItems = songs.map(song => ({
        text: `${(song.metadata?.title || song.title || 'Untitled')} - ${(song.metadata?.artist || song.artist || 'Unknown Artist')}${(song.metadata?.album || song.album) ? ` (${song.metadata?.album || song.album})` : ''}`,
        value: song.key,
        song: song,
        selected: false
    }));

    // // Create custom modal with checkboxes
    // const modalContainer = UIManager.createEnhancedModalOverlay();
    // const modal = UIManager.createEnhancedModalContainer({
    //     css: { maxWidth: '600px', width: '90%' }
    // });

    // // Header
    // const header = UIManager.createModalHeader({});
    // const headerTitle = $('h3', {
    //     id: 'export-songs-header1',
    //     text: '📄 Select Songs to Export as Text',
    //     css: { margin: '0', color: 'white' }
    // });
    // header.appendChild(headerTitle);

    // // Content
    // const content = UIManager.createModalContent({});
    
    // const selectAllContainer = $('div', {
    //     css: {
    //         marginBottom: '15px',
    //         padding: '10px',
    //         backgroundColor: UIManager.THEME.colors.background,
    //         borderRadius: '4px'
    //     }
    // });

    // const selectAllCheckbox = $('input', {
    //     type: 'checkbox',
    //     id: 'select-all-songs'
    // });

    // const selectAllLabel = $('label', {
    //     text: ' Select/Deselect All',
    //     css: { marginLeft: '8px', cursor: 'pointer' }
    // });

    // selectAllLabel.addEventListener('click', () => {
    //     const checkboxes = modal.querySelectorAll('input[type="checkbox"]:not(#select-all-songs)');
    //     const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    //     checkboxes.forEach(cb => cb.checked = !allChecked);
    //     selectAllCheckbox.checked = !allChecked;
    // });

    // selectAllContainer.append(selectAllCheckbox, selectAllLabel);
    // content.appendChild(selectAllContainer);

    // Song list
    const listContainer = UIManager.createListContainer({});
    
    songItems.forEach((item, index) => {
        const itemDiv = UIManager.createListItem({});
        
        const checkbox = $('input', {
            type: 'checkbox',
            value: item.value,
            css: { marginRight: '10px' }
        });

        const label = $('label', {
            text: item.text,
            css: { cursor: 'pointer', flex: '1' }
        });

        label.addEventListener('click', () => {
            checkbox.checked = !checkbox.checked;
        });

        itemDiv.append(checkbox, label);
        listContainer.appendChild(itemDiv);
    });

    content.appendChild(listContainer);

    // Footer
    const footer = UIManager.createModalFooter({});
    
    const cancelButton = UIManager.createCancelButton({
        text: 'Cancel',
        onClick: () => document.body.removeChild(modalContainer)
    });

    const exportButton = UIManager.createSaveButton({
        text: 'Export Selected',
        onClick: () => {
            const selectedCheckboxes = modal.querySelectorAll('input[type="checkbox"]:checked:not(#select-all-songs)');
            const selectedSongKeys = Array.from(selectedCheckboxes).map(cb => cb.value);
            
            if (selectedSongKeys.length === 0) {
                Modal({
                    title: '❌ No Selection',
                    content: '<p>Please select at least one song to export.</p>',
                    buttons: [{ text: 'OK' }],
                    size: 'small'
                });
                return;
            }

            // Export selected songs
            let exportText = `Lyrix Songs Export - ${new Date().toLocaleDateString()}\n`;
            exportText += `Total Songs: ${selectedSongKeys.length}\n`;
            exportText += '='.repeat(50) + '\n\n';

            selectedSongKeys.forEach((songKey, index) => {
                const song = lyricsLibrary.getSongByKey(songKey);
                if (song) {
                    exportText += `${index + 1}. ${song.metadata.title || 'Untitled'}\n`;
                    exportText += `Artist: ${song.metadata.artist || 'Unknown'}\n`;
                    if (song.metadata.album) {
                        exportText += `Album: ${song.metadata.album}\n`;
                    }
                    exportText += '\nLyrics:\n';
                    exportText += '-'.repeat(30) + '\n';
                    
                    if (song.lines && song.lines.length > 0) {
                        song.lines.forEach(line => {
                            if (line.time >= 0) {
                                const timeStr = `[${Math.floor(line.time / 60)}:${(line.time % 60).toFixed(2).padStart(5, '0')}]`;
                                exportText += `${timeStr} ${line.text}\n`;
                            } else {
                                exportText += `${line.text}\n`;
                            }
                        });
                    } else {
                        exportText += '(No lyrics available)\n';
                    }
                    
                    exportText += '\n' + '='.repeat(50) + '\n\n';
                }
            });

            // Create download - iOS compatible version
            const filename = `lyrix_songs_${new Date().toISOString().split('T')[0]}.txt`;
            
            // Check if we're on iOS/mobile
            const isIOSorMobile = /iPad|iPhone|iPod|Android/i.test(navigator.userAgent) || 
                                 (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
            
            document.body.removeChild(modalContainer);
            
            if (isIOSorMobile) {
                // iOS/Mobile: Show mobile export modal
                showMobileExportModal(exportText, filename, 'TEXT');
            } else {
                // Desktop: Traditional download
                const dataBlob = new Blob([exportText], { type: 'text/plain' });
                const url = URL.createObjectURL(dataBlob);
                
                const downloadLink = document.createElement('a');
                downloadLink.href = url;
                downloadLink.download = filename;
                document.body.appendChild(downloadLink);
                downloadLink.click();
                document.body.removeChild(downloadLink);
                URL.revokeObjectURL(url);
                
                Modal({
                    title: '✅ Export Complete',
                    content: `<p>Successfully exported ${selectedSongKeys.length} songs as text.</p>`,
                    buttons: [{ text: 'OK' }],
                    size: 'small'
                });
            }
        }
    });

    footer.append(cancelButton, exportButton);

    // Assemble modal
    modal.append(header, content, footer);
    modalContainer.appendChild(modal);
    
    // Add to DOM
    document.body.appendChild(modalContainer);

    // Close on overlay click
    modalContainer.addEventListener('click', (e) => {
        if (e.target === modalContainer) {
            document.body.removeChild(modalContainer);
        }
    });
}

// Export selected songs as text with folder dialog
function exportSelectedSongsAsTextWithFolderDialog() {
    if (!lyricsLibrary) {
        console.error('❌ LyricsLibrary non disponible');
        return;
    }

    // Get all summary song objects
    const songSummaries = lyricsLibrary.getAllSongs();
    if (songSummaries.length === 0) {
        console.warn('❌ No songs available to export');
        return;
    }

    // For each summary, load the full song object (with metadata)
    const songItems = songSummaries.map(songSummary => {
        const fullSong = lyricsLibrary.getSong(songSummary.key);
        if (!fullSong) return null;
        return {
            text: `${(fullSong.metadata?.title || fullSong.title || 'Untitled')} - ${(fullSong.metadata?.artist || fullSong.artist || 'Unknown Artist')}${(fullSong.metadata?.album || fullSong.album) ? ` (${fullSong.metadata?.album || fullSong.album})` : ''}`,
            value: songSummary.songId,
            song: fullSong,
            selected: false
        };
    }).filter(Boolean);

    // Create custom modal with checkboxes
    const modalContainer = UIManager.createEnhancedModalOverlay();
    const modal = UIManager.createEnhancedModalContainer({
        css: { maxWidth: '600px', width: '90%' }
    });

    // Header
    const header = UIManager.createModalHeader({});
    const headerTitle = $('h3', {
            id: 'export-songs-header',
        text: '📄 Select Songs to Export as Text',
        css: { margin: '0', color: 'white' }
    });
    header.appendChild(headerTitle);

    // Content
    const content = UIManager.createModalContent({});
    
    const selectAllContainer = $('div', {
        css: {
            marginBottom: '15px',
            padding: '10px',
            backgroundColor: UIManager.THEME.colors.background,
            borderRadius: '4px',
            display: 'flex',
            justifyContent: 'center'
        }
    });

    let allSelected = false;
    const selectAllBtn = document.createElement('button');
    selectAllBtn.textContent = 'Tout sélectionner';
    selectAllBtn.style.background = '#bbb';
    selectAllBtn.style.color = '#222';
    selectAllBtn.style.border = '1px solid #888';
    selectAllBtn.style.borderRadius = '4px';
    selectAllBtn.style.cursor = 'pointer';
    selectAllBtn.style.padding = '6px 18px';
    selectAllBtn.style.fontWeight = 'bold';
    selectAllBtn.style.fontSize = '15px';
    selectAllBtn.style.transition = 'background 0.2s';

    function updateSelectAllBtn() {
        if (allSelected) {
            selectAllBtn.textContent = 'Tout désélectionner';
            selectAllBtn.style.background = '#e74c3c';
            selectAllBtn.style.color = 'white';
        } else {
            selectAllBtn.textContent = 'Tout sélectionner';
            selectAllBtn.style.background = '#27ae60';
            selectAllBtn.style.color = 'white';
        }
    }
    updateSelectAllBtn();

    selectAllBtn.addEventListener('click', () => {
        allSelected = !allSelected;
        // Toggle all song selection buttons
        Array.from(listContainer.children).forEach(div => {
            div.isSelected = allSelected;
        });
        updateSelectAllBtn();
    });

    selectAllContainer.appendChild(selectAllBtn);
    content.appendChild(selectAllContainer);

    // Export format option
    const formatContainer = $('div', {
        css: {
            marginBottom: '15px',
            padding: '10px',
            backgroundColor: UIManager.THEME.colors.background,
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '15px'
        }
    });

    const formatLabel = $('span', {
        text: 'Export format:',
        css: {
            fontWeight: 'bold',
            color: '#333'
        }
    });

    let exportSeparateFiles = false;

    const singleFileBtn = $('button', {
        text: '📄 Single File',
        css: {
            padding: '6px 12px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            cursor: 'pointer',
            backgroundColor: '#27ae60',
            color: 'white',
            fontWeight: 'bold'
        }
    });

    const separateFilesBtn = $('button', {
        text: '📁 Separate Files',
        css: {
            padding: '6px 12px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            cursor: 'pointer',
            backgroundColor: '#eee',
            color: '#333'
        }
    });

    function updateFormatButtons() {
        if (exportSeparateFiles) {
            singleFileBtn.style.backgroundColor = '#eee';
            singleFileBtn.style.color = '#333';
            separateFilesBtn.style.backgroundColor = '#27ae60';
            separateFilesBtn.style.color = 'white';
        } else {
            singleFileBtn.style.backgroundColor = '#27ae60';
            singleFileBtn.style.color = 'white';
            separateFilesBtn.style.backgroundColor = '#eee';
            separateFilesBtn.style.color = '#333';
        }
    }

    singleFileBtn.addEventListener('click', () => {
        exportSeparateFiles = false;
        updateFormatButtons();
    });

    separateFilesBtn.addEventListener('click', () => {
        exportSeparateFiles = true;
        updateFormatButtons();
    });

    formatContainer.append(formatLabel, singleFileBtn, separateFilesBtn);
    content.appendChild(formatContainer);

    // Song list
    const listContainer = UIManager.createListContainer({});
    

    // Use toggle buttons instead of checkboxes for song selection
    songItems.forEach((item, index) => {
        const itemDiv = UIManager.createListItem({});
        let selected = false;

        const selectBtn = document.createElement('button');
        selectBtn.textContent = 'Sélectionner';
        selectBtn.style.marginRight = '10px';
        selectBtn.style.background = '#eee';
        selectBtn.style.border = '1px solid #bbb';
        selectBtn.style.borderRadius = '4px';
        selectBtn.style.cursor = 'pointer';
        selectBtn.style.padding = '4px 10px';
        selectBtn.style.transition = 'background 0.2s';

        const label = document.createElement('span');
        label.textContent = item.text;
        label.style.flex = '1';
        label.style.cursor = 'pointer';

        function updateBtn() {
            if (selected) {
                selectBtn.textContent = '✅ Sélectionné';
                selectBtn.style.background = '#27ae60';
                selectBtn.style.color = 'white';
            } else {
                selectBtn.textContent = 'Sélectionner';
                selectBtn.style.background = '#eee';
                selectBtn.style.color = '#222';
            }
        }
        updateBtn();

        selectBtn.addEventListener('click', (e) => {
            e.preventDefault();
            selected = !selected;
            updateBtn();
        });

        // Store selection state on the element for later retrieval
        itemDiv.dataset.songId = item.value;
        itemDiv.dataset.selected = 'false';
        Object.defineProperty(itemDiv, 'isSelected', {
            get() { return selected; },
            set(val) { selected = !!val; updateBtn(); }
        });

        itemDiv.append(selectBtn, label);
        listContainer.appendChild(itemDiv);
    });

    content.appendChild(listContainer);

    // Footer
    const footer = UIManager.createModalFooter({});
    
    const cancelButton = UIManager.createCancelButton({
        text: 'Cancel',
        onClick: () => document.body.removeChild(modalContainer)
    });

    const exportButton = UIManager.createSaveButton({
        text: 'Export Selected',
        onClick: () => {
            // Find all selected song divs
            const selectedDivs = Array.from(listContainer.children).filter(div => div.isSelected);
            const selectedSongIds = selectedDivs.map(div => div.dataset.songId);

            if (selectedSongIds.length === 0) {
                Modal({
                    title: '❌ No Selection',
                    content: '<p>Please select at least one song to export.</p>',
                    buttons: [{ text: 'OK' }],
                    size: 'small'
                });
                return;
            }

            document.body.removeChild(modalContainer);

            if (exportSeparateFiles) {
                // Export each song as a separate file
                exportSongsAsSeparateFiles(selectedSongIds);
            } else {
                // Export all songs in a single file
                exportSongsAsSingleFile(selectedSongIds);
            }
        }
    });

    footer.append(cancelButton, exportButton);
    modal.append(header, content, footer);
    modalContainer.appendChild(modal);
    document.body.appendChild(modalContainer);
}

// Function to export songs as separate files
function exportSongsAsSeparateFiles(selectedSongIds) {
    let downloadCount = 0;
    
    selectedSongIds.forEach((songId, index) => {
        const song = lyricsLibrary.getSongById(songId);
        if (song) {
            let exportText = `${song.metadata.title || 'Untitled'}\n\n`;
            
            if (song.lines && song.lines.length > 0) {
                song.lines.forEach(line => {
                    exportText += `${line.text}\n`;
                });
            } else {
                exportText += '(No lyrics available)\n';
            }
            
            // Create safe filename
            const safeTitle = (song.metadata.title || 'Untitled')
                .replace(/[^a-z0-9]/gi, '_')
                .replace(/_+/g, '_')
                .replace(/^_|_$/g, '');
            
            // Use download method with delay to avoid browser blocking
            setTimeout(() => {
                const blob = new Blob([exportText], { type: 'text/plain' });
                const saveLink = document.createElement('a');
                saveLink.href = URL.createObjectURL(blob);
                saveLink.download = `${safeTitle}.txt`;
                saveLink.style.display = 'none';
                
                document.body.appendChild(saveLink);
                saveLink.click();
                document.body.removeChild(saveLink);
                
                setTimeout(() => {
                    URL.revokeObjectURL(saveLink.href);
                }, 100);
                
                downloadCount++;
                if (downloadCount === selectedSongIds.length) {
                    console.log(`✅ Successfully exported ${downloadCount} songs as separate files`);
                }
            }, index * 500); // 500ms delay between downloads
        }
    });
}

// Function to export songs as a single file
function exportSongsAsSingleFile(selectedSongIds) {
    // Generate export text - simple format
    let exportText = '';

    selectedSongIds.forEach((songId, index) => {
        const song = lyricsLibrary.getSongById(songId);
        if (song) {
            // Add song title
            exportText += `${song.metadata.title || 'Untitled'}\n\n`;
            
            // Add lyrics only
            if (song.lines && song.lines.length > 0) {
                song.lines.forEach(line => {
                    // Export only the text, without timecodes
                    exportText += `${line.text}\n`;
                });
            } else {
                exportText += '(No lyrics available)\n';
            }
            
            // Add spacing between songs (only if not the last song)
            if (index < selectedSongIds.length - 1) {
                exportText += '\n\n';
            }
        }
    });

    // Use download method that works on all browsers including Safari
    const blob = new Blob([exportText], { type: 'text/plain' });
    const saveLink = document.createElement('a');
    saveLink.href = URL.createObjectURL(blob);
    saveLink.download = `lyrix_songs_${new Date().toISOString().split('T')[0]}.txt`;
    saveLink.style.display = 'none';
    
    // Add to document, click, and remove
    document.body.appendChild(saveLink);
    saveLink.click();
    document.body.removeChild(saveLink);
    
    // Clean up the object URL
    setTimeout(() => {
        URL.revokeObjectURL(saveLink.href);
    }, 100);
    
    console.log(`✅ Successfully exported ${selectedSongIds.length} songs as single text file`);
}

// Helper function to load and display a song
function loadAndDisplaySong(songKey) {
    if (!lyricsLibrary) {
        console.error('❌ LyricsLibrary not initialized');
        return false;
    }
    
    // Try to get song directly by key first
    let song = lyricsLibrary.getSong(songKey);
    
    // If not found by key, try by songId
    if (!song) {
        song = lyricsLibrary.getSongById(songKey);
    }
    
    // If still not found, try search by name
    if (!song) {
        song = SongManager.loadByName(songKey, lyricsLibrary);
    }
    
    if (song && lyricsDisplay) {
        // Stop current audio playback before loading new song
        if (audioController) {
            audioController.pause();
            audioController.setCurrentTime(0);
        }
        
        currentSong = song;
        window.currentSong = song;
        lyricsDisplay.displayLyrics(song);
        
        // Store current song key for navigation
        if (lyricsDisplay) {
            lyricsDisplay.currentSongKey = songKey;
            console.log(`🎵 Stored currentSongKey in lyricsDisplay: ${songKey}`);
        }
        window.currentSongKey = songKey;
        StorageManager.setLastOpenedSong(songKey);
        
        // Update audio title with current song filename
        updateAudioTitle();
        
        // Synchronize with drag drop manager
        if (dragDropManager) {
            dragDropManager.setCurrentLyrics(song);
        }
        
        // Load associated audio if available
        if (song.hasAudio() && audioController) {
            audioController.loadAudio(song.getAudioPath());
            
            // Apply saved volume to newly loaded audio
            const savedVolume = localStorage.getItem('lyrix_audio_volume') || '70';
            setTimeout(() => {
                if (audioController && audioController.audioPlayer) {
                    safeApplyVolume(audioController.audioPlayer, parseInt(savedVolume), 'new audio');
                }
            }, 100);
            
            // Reset slider to zero when loading new audio
            resetAudioSlider();
            updateSliderDuration();
        } else {
            // If no audio, also reset the slider
            resetAudioSlider();
        }
        
        return true;
    }
    
    return false;
}

// Navigate to previous song in library
function navigateToPreviousSong() {
    if (!lyricsLibrary) {
        console.error('❌ LyricsLibrary not available');
        return;
    }
    
    const songs = lyricsLibrary.getAllSongs();
    if (songs.length === 0) {
        console.warn('⚠️ No songs in library');
        return;
    }
    
    // Find current song index
    let currentIndex = -1;
    const currentSongKey = window.currentSongKey || (currentSong && currentSong.songId);
    
    if (currentSongKey) {
        currentIndex = songs.findIndex(song => song.key === currentSongKey || song.songId === currentSongKey);
    }
    
    // Go to previous song (or last if at beginning)
    const previousIndex = currentIndex <= 0 ? songs.length - 1 : currentIndex - 1;
    const previousSong = songs[previousIndex];
    
    if (previousSong) {
        loadAndDisplaySong(previousSong.key || previousSong.songId);
        console.log(`⏮️ Navigated to previous song: ${previousSong.metadata?.title || previousSong.title}`);
    }
}

// Navigate to next song in library
function navigateToNextSong() {
    if (!lyricsLibrary) {
        console.error('❌ LyricsLibrary not available');
        return;
    }
    
    const songs = lyricsLibrary.getAllSongs();
    if (songs.length === 0) {
        console.warn('⚠️ No songs in library');
        return;
    }
    
    // Find current song index
    let currentIndex = -1;
    const currentSongKey = window.currentSongKey || (currentSong && currentSong.songId);
    
    if (currentSongKey) {
        currentIndex = songs.findIndex(song => song.key === currentSongKey || song.songId === currentSongKey);
    }
    
    // Go to next song (or first if at end)
    const nextIndex = currentIndex >= songs.length - 1 ? 0 : currentIndex + 1;
    const nextSong = songs[nextIndex];
    
    if (nextSong) {
        loadAndDisplaySong(nextSong.key || nextSong.songId);
        console.log(`⏭️ navigated to next song: ${nextSong.metadata?.title || nextSong.title}`);
    }
}

// Update timecode display
function updateTimecode(timeMs) {
    // This function can be used by external hosts to update timecode
    if (lyricsDisplay) {
        lyricsDisplay.updateTime(timeMs);
    }
}

// Create main interface
function createMainInterface() {
    const container = document.getElementById('view') || document.body;
    
    // Create main application container (full screen, no rounded corners)
    const app = $('div', {
        id: 'lyrix_app',
        css: {
            padding: '20px',
            fontFamily: 'Arial, sans-serif',
            width: '100vw',
            height: '100vh',
            margin: '0',
            backgroundColor: '#fff',
            borderRadius: '0',
            minHeight: '100vh',
            boxSizing: 'border-box',
            overflow: 'auto'
        }
    });
    
    // Create main layout (single column now that left panel is removed)
    const mainLayout = $('div', {
        css: {
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            marginBottom: '20px'
        }
    });
    
    // Note: Left panel has been removed - all tools moved to lyrics toolbar
    
    // Add some basic content to left panel
    const settingsButton = UIManager.createInterfaceButton('⚙️', {
        id: 'settings_button',
        onClick: () => {
            showSettingsModal();
        },
        css: {
            marginBottom: '15px'
        }
    });
    
    const importButton = UIManager.createInterfaceButton('📁', {
        id: 'import_file_button',
        onClick: () => {
            showFileImportDialog();
        },
        css: {
            marginBottom: '10px'
        }
    });
    
    // Create song button moved to song library panel
    // const createSongButton = UIManager.createInterfaceButton('➕', {
    //     id: 'create_new_song_button',
    //     onClick: () => {
    //         createNewSong();
    //     },
    //     css: {
    //         marginBottom: '10px'
    //     }
    // });
    
    const songListButton = UIManager.createInterfaceButton('☰', {
        id: 'song_list_button',
        onClick: () => {
            showSongLibrary();
        }
    });    
    // Store tool elements for potential move to lyrics toolbar
    window.leftPanelTools = {
        settingsButton,
        // importButton moved to song library panel
        // createSongButton, // Moved to song library panel
        songListButton
    };
    
    // Note: These tools will be moved to lyrics toolbar by display.js
    // leftPanel.append(settingsButton, importButton, createSongButton, songListButton);
    
    // Add audio controls section
    if (audioController) {
        // Check audio player controls setting state
        // Par défaut, les contrôles audio sont masqués sauf si activés dans les paramètres
        const isAudioPlayerEnabled = localStorage.getItem('lyrix_audio_player_enabled') === 'true';
        const initialDisplay = isAudioPlayerEnabled ? 'block' : 'none';
        
        const playButton = UIManager.createInterfaceButton('▶️', {
            onClick: () => {
                try {
                    if (audioController.isPlaying()) {
                        audioController.pause();
                    } else {
                        // Log the audio file path before playing
                        if (currentSong && currentSong.metadata && currentSong.metadata.audioPath) {
                            console.log('▶️ Audio file path:', currentSong.metadata.audioPath);
                        } else {
                            console.log('▶️ Audio file path: [unknown or not set]');
                        }
                        audioController.play();
                    }
                } catch (error) {
                    console.error('❌ ERREUR Play/Pause:', error);
                }
            },
            css: {
                marginRight: '5px',
                display: initialDisplay
            }
        });
        
        // Add ID and data attribute for identification
        playButton.id = 'audio-play-button';
        playButton.setAttribute('data-element', 'play-button');
        
        const stopButton = UIManager.createInterfaceButton('⏹️', {
            onClick: () => {
                try {
                    audioController.pause();
                    audioController.setCurrentTime(0);
                    // Reset slider to zero when stopping
                    resetAudioSlider();
                } catch (error) {
                    console.error('❌ ERREUR Stop:', error);
                }
            },
            css: {
                marginRight: '10px',
                display: initialDisplay
            }
        });
        
        // Add data attribute for identification
        stopButton.setAttribute('data-element', 'stop-button');
        
        // Add ID for identification
        stopButton.id = 'audio-stop-button';
        
        const audioControls = $('div', {
            id: 'audio-controls-container',
            css: {
                marginBottom: '15px',
                display: initialDisplay,
                flexDirection: 'row', // Buttons side by side
                gap: '5px',
                alignItems: 'center'
            }
        });
        
        // Add data attribute for identification
        audioControls.setAttribute('data-element', 'audio-controls');
        
        audioControls.append(stopButton, playButton);
        
        // Store audio controls for potential move to lyrics toolbar
        window.leftPanelAudioTools = {
            audioControls,
            playButton,    // Store direct reference to play button
            stopButton     // Store direct reference to stop button
        };
        
        // Note: These tools will be moved to lyrics toolbar by display.js
        // leftPanel.append(audioTitle, audioControls);
        
        // Add audio scrub slider
        const scrubContainer = $('div', {
            id: 'audio-scrub-slider-container',
            css: {
                display: initialDisplay,
                padding: '0 10px', // Add horizontal padding to prevent handle overflow
                boxSizing: 'border-box'
            }
        });
        
        // Add data attribute for identification
        scrubContainer.setAttribute('data-element', 'scrub-slider');
        
        // Create Squirrel slider for audio scrubbing
        const scrubSlider = Slider({
            type: 'horizontal',
            min: 0,
            max: 100,
            value: 0,
            showLabel: false,
            id: 'audio_scrub_slider',
            skin: {
                container: {
                    width: 'calc(100% - 20px)', // Reduced width to account for handle size
                    height: '20px',
                    marginBottom: '10px',
                    marginLeft: '10px', // Center the slider
                    marginRight: '10px'
                },
                track: {
                    height: '6px',
                    backgroundColor: '#ddd',
                    borderRadius: '3px'
                },
                progression: {
                    backgroundColor: '#007bff',
                    borderRadius: '3px'
                },
                handle: {
                    width: '14px', // Slightly smaller handle
                    height: '14px',
                    backgroundColor: '#007bff',
                    border: '2px solid #fff',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                }
            },
            onInput: (value) => {
                // Store the target time but don't seek yet during dragging
                if (audioController && audioController.audioPlayer && audioController.audioPlayer.duration) {
                   
                    const duration = audioController.audioPlayer.duration;
                    
                    // Check for valid duration to prevent NaN/Infinity
                    if (!isFinite(duration) || duration <= 0) {
                        console.warn('⚠️ Invalid audio duration:', duration);
                        return;
                    }
                    
                    const targetTime = (value / 100) * duration;
                    
                    // Check for valid target time
                    if (!isFinite(targetTime) || targetTime < 0) {
                        console.warn('⚠️ Invalid target time:', targetTime);
                        return;
                    }
                    
                    // Store the pending seek time for when user releases
                    pendingSeekTime = targetTime;
                    
                    // Only update UI immediately, don't seek audio yet
                    const timecodeMs = targetTime * 1000;
                    updateTimecodeDisplay(timecodeMs);
                    
                    // Update lyrics display while scrubbing
                    if (lyricsDisplay) {
                        lyricsDisplay.updateTime(timecodeMs);
                    } 
                    
                    // Update time labels immediately
                    const currentTimeLabel = document.getElementById('current_time_label');
                    if (currentTimeLabel) {
                        if (isFinite(targetTime) && targetTime >= 0) {
                            const currentMin = Math.floor(targetTime / 60);
                            const currentSec = Math.floor(targetTime % 60);
                            currentTimeLabel.textContent = `${currentMin}:${currentSec.toString().padStart(2, '0')}`;
                        } else {
                            currentTimeLabel.textContent = '0:00';
                        }
                    }
                }
            }
        });
        
        // Store reference for direct updates
        scrubSliderRef = scrubSlider;
        
        // Add event listeners to the actual DOM element after it's built
        // setTimeout(() => {
            const sliderElement = document.getElementById('audio_scrub_slider');
            const sliderHandle = document.getElementById('audio_scrub_slider_handle');
            
            if (sliderElement && sliderHandle) {
                // Add scrubbing detection to the Squirrel slider handle
                sliderHandle.addEventListener('mousedown', () => {
                    isUserScrubbing = true;
                });
                
                sliderHandle.addEventListener('mouseup', () => {
                    // Seek to the pending time immediately
                    seekToPendingTime();
                    
                    // Add a longer delay before allowing automatic updates again
                    setTimeout(() => {
                        isUserScrubbing = false;
                    }, 300);
                });
                
                // Also add to the container for broader detection
                sliderElement.addEventListener('mousedown', () => {
                    isUserScrubbing = true;
                });
                
                sliderElement.addEventListener('mouseup', () => {
                    // Seek to the pending time immediately
                    seekToPendingTime();
                    
                    // Add a longer delay before allowing automatic updates again
                    // setTimeout(() => {
                    //     isUserScrubbing = false;
                    // }, 300);
                });
                
                // Touch events for mobile
                sliderHandle.addEventListener('touchstart', () => {
                    isUserScrubbing = true;
                });
                
                sliderHandle.addEventListener('touchend', () => {
                    // Seek to the pending time immediately
                    seekToPendingTime();
                    
                    // Add a longer delay before allowing automatic updates again
                    setTimeout(() => {
                        isUserScrubbing = false;
                    }, 300);
                });
            } else {
                // Fallback: try to find standard input element
                const sliderInput = sliderElement?.querySelector('input[type="range"]');
                if (sliderInput) {
                    sliderInput.addEventListener('mousedown', () => {
                        isUserScrubbing = true;
                    });
                    
                    sliderInput.addEventListener('mouseup', () => {
                        setTimeout(() => {
                            isUserScrubbing = false;
                        }, 100);
                    });
                }
            }
        // }, 100);
        
        document.addEventListener('mouseup', () => {
            // Global mouseup to catch cases where mouse is released outside the slider
            if (isUserScrubbing) {
                // Seek to the pending time immediately
                seekToPendingTime();
                
                setTimeout(() => {
                    isUserScrubbing = false;
                }, 300);
            }
        });
        
        const timeLabels = $('div', {
            css: {
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '12px',
                color: '#666',
                fontFamily: 'monospace',
                marginTop: '5px'
            }
        });
        
        const currentTimeLabel = $('span', {
            id: 'current_time_label',
            text: '0:00'
        });
        
        const totalTimeLabel = $('span', {
            id: 'total_time_label',
            text: '0:00'
        });
        
        timeLabels.append(currentTimeLabel, totalTimeLabel);
        scrubContainer.append(scrubSlider, timeLabels);

        // Add volume control slider
        const volumeContainer = $('div', {
            id: 'audio-volume-slider-container',
            css: {
                // marginBottom: '15px',
                width: '190px',
                height: '13px',
                // padding: '10px',
                backgroundColor: 'transparent',
                borderRadius: '4px',
                // border: '1px solid #dee2e6',
                display: initialDisplay
            }
        });

        // Add data attribute for identification
        volumeContainer.setAttribute('data-element', 'volume-slider');

        const volumeLabel = $('div', {
            // text: '🔊 Volume',
            css: {
                fontSize: '14px',
                fontWeight: '600',
                marginBottom: '8px',
                color: '#495057'
            }
        });

        // Load saved volume from localStorage (default: 70%)
        const savedVolume = localStorage.getItem('lyrix_audio_volume') || '70';
        
        // Create Squirrel slider for volume control
        const volumeSlider = Slider({
            type: 'horizontal',
            min: 0,
            max: 100,
            value: parseInt(savedVolume),
            showLabel: false,
            id: 'audio_volume_slider',
            skin: {
                container: {
                    width: '100%',
                    height: '20px',
                    marginBottom: '5px'
                },
                track: {
                    height: '6px',
                    backgroundColor: '#ddd',
                    borderRadius: '3px'
                },
                progression: {
                    backgroundColor: '#28a745',
                    borderRadius: '3px'
                },
                handle: {
                    width: '16px',
                    height: '16px',
                    backgroundColor: '#28a745',
                    border: '2px solid #fff',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                    cursor: 'pointer'
                }
            },
            onInput: (value) => {
                // Update audio volume immediately on all platforms
                if (audioController && audioController.audioPlayer) {
                    if (safeApplyVolume(audioController.audioPlayer, value, 'slider')) {
                        // Save volume to localStorage only if successfully applied
                        localStorage.setItem('lyrix_audio_volume', value.toString());
                        
                        // Update volume value display in toolbar
                        const volumeValueDisplay = document.getElementById('volume-value-display');
                        if (volumeValueDisplay) {
                            volumeValueDisplay.textContent = `${Math.round(value)}%`;
                        }
                        
                        // Update current volume label
                        const volumeCurrentLabel = document.getElementById('volume_current_label');
                        if (volumeCurrentLabel) {
                            volumeCurrentLabel.textContent = `${Math.round(value)}%`;
                        }
                    }
                } else {
                    // Store volume for when audio player becomes available
                    localStorage.setItem('lyrix_audio_volume', value.toString());
                    
                    // Update volume value display in toolbar
                    const volumeValueDisplay = document.getElementById('volume-value-display');
                    if (volumeValueDisplay) {
                        volumeValueDisplay.textContent = `${Math.round(value)}%`;
                    }
                    
                    // Update current volume label
                    const volumeCurrentLabel = document.getElementById('volume_current_label');
                    if (volumeCurrentLabel) {
                        volumeCurrentLabel.textContent = `${Math.round(value)}%`;
                    }
                    
                    console.log(`🔊 Volume stored for later: ${Math.round(value)}% (audioPlayer not ready)`);
                }
            }
        });

        // Volume value container
        const volumeValueContainer = $('div', {
            css: {
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '12px',
                color: '#666',
                fontFamily: 'monospace',
                marginTop: '5px'
            }
        });

        const volumeMinLabel = $('span', {
            text: 'volume'
        });

        // Add current volume display
        const volumeCurrentLabel = $('span', {
            id: 'volume_current_label',
            text: `${savedVolume}%`,
            css: {
                fontWeight: '600',
                color: '#28a745'
            }
        });

      

        volumeValueContainer.append(volumeMinLabel, volumeCurrentLabel);
        volumeContainer.append(volumeLabel, volumeSlider, volumeValueContainer);

        // Add volume container to audio tools for display
        if (window.leftPanelAudioTools) {
            window.leftPanelAudioTools.volumeContainer = volumeContainer;
        }

        // Apply saved volume to audio player when it's loaded
        if (audioController && audioController.audioPlayer) {
            safeApplyVolume(audioController.audioPlayer, parseInt(savedVolume), 'initial volume');
        }
        
        // Add function to apply saved volume when audio becomes available
        window.applySavedVolume = function() {
            const savedVol = localStorage.getItem('lyrix_audio_volume') || '70';
            if (audioController && audioController.audioPlayer) {
                safeApplyVolume(audioController.audioPlayer, parseInt(savedVol), 'delayed application');
            }
        };
        
        // Add timecode display for AUv3 host compatibility
        const timecodeDisplay = UIManager.createEnhancedTimecodeDisplay({
            text: '0.000s'
        });
        
        // Apply timecode display visibility setting immediately
        const isTimecodeDisplayVisible = localStorage.getItem('lyrix_timecode_display_visible') === 'true';
        timecodeDisplay.style.display = isTimecodeDisplayVisible ? 'block' : 'none';
        console.log(`🕐 Timecode display initial visibility: ${isTimecodeDisplayVisible ? 'visible' : 'hidden'}`);
        
        // Store scrub and timecode tools for potential move to lyrics toolbar
        window.leftPanelScrubTools = {
            scrubContainer,
            timecodeDisplay
        };
        
        // Note: These tools will be moved to lyrics toolbar by display.js
        // leftPanel.append(scrubContainer, timecodeDisplay);
        
        // Note: MIDI utilities will also be moved to lyrics toolbar by display.js
        // if (midiUtilities && midiUtilities.midiContainer) {
        //     console.log('🎵 Adding MIDI logger to left panel...');
        //     leftPanel.append(midiUtilities.midiContainer);
        // }
        
        // Setup audio event listeners
        if (audioController.on) {
            audioController.on('timeupdate', (currentTime) => {
                updateScrubSliderDisplay(currentTime);
            });
            
            // Primary event - when audio metadata (including duration) is loaded
            audioController.on('loaded', (duration) => {
                startupLog(`📏 Audio loaded event - duration: ${duration}s`);
                updateSliderDuration();
                // Apply saved volume when audio is loaded
                if (window.applySavedVolume) window.applySavedVolume();
            });
            
            audioController.on('loadedmetadata', () => {
                startupLog('📏 Loadedmetadata event triggered');
                updateSliderDuration();
                // Apply saved volume when metadata is loaded
                if (window.applySavedVolume) window.applySavedVolume();
            });
            
            // Also listen for loadeddata and canplay events as fallbacks
            audioController.on('loadeddata', () => {
                startupLog('📏 Loadeddata event triggered');
                updateSliderDuration();
                // Apply saved volume when data is loaded
                if (window.applySavedVolume) window.applySavedVolume();
            });
            
            audioController.on('canplay', () => {
                startupLog('📏 Canplay event triggered');
                updateSliderDuration();
                // Apply saved volume when audio can play
                if (window.applySavedVolume) window.applySavedVolume();
            });
        }
    }
    
    // Note: No longer using right panel - lyrics display elements append directly to lyrix_app
    // Remove: const rightPanel = $('div', { id: 'lyrics_display_area', ... });
    
    // Note: Left panel removed - using single column layout now
    // No longer appending rightPanel to mainLayout since LyricsDisplay handles its own layout
    app.append(mainLayout);
    
    container.append(app);
}

// Load last opened song
function loadLastSong() {
    const lastSongKey = StorageManager.getLastOpenedSong();
    if (lastSongKey && lyricsLibrary) {
        
        // Try to get song directly by key first
        currentSong = lyricsLibrary.getSong(lastSongKey);
        
        // If not found by key, try by songId
        if (!currentSong) {
            currentSong = lyricsLibrary.getSongById(lastSongKey);
        }
        
        // If still not found, try search by name
        if (!currentSong) {
            currentSong = SongManager.loadByName(lastSongKey, lyricsLibrary);
        }
        
        if (currentSong && lyricsDisplay) {
            lyricsDisplay.displayLyrics(currentSong);
            
            // Update audio title with current song filename
            updateAudioTitle();
            
            // ALWAYS reset slider when loading any song
            resetAudioSlider();
        }
    } else {
        // Even if no last song, reset the slider to zero
        resetAudioSlider();
    }
}

// Function to seek audio to pending time when user releases slider
function seekToPendingTime() {
    if (pendingSeekTime !== null && audioController && audioController.audioPlayer) {
        try {
            const currentTime = audioController.audioPlayer.currentTime;
            const isSeekingForward = pendingSeekTime > currentTime;
            
            // console.log(`🎯 SEEKING ${isSeekingForward ? 'forward' : 'backward'} from ${currentTime.toFixed(2)}s to ${pendingSeekTime.toFixed(2)}s`);
            
            // Mark that we're seeking to prevent timeupdate conflicts
            lastSeekTime = Date.now();
            // console.log ("=====> Seeking to pending time: "+pendingSeekTime);
            // Perform the actual seek
            audioController.audioPlayer.currentTime = pendingSeekTime;
            
            // Clear the pending seek time
            pendingSeekTime = null;
            
            // console.log('✅ Audio seeked successfully');
            
        } catch (error) {
            console.error('❌ Error seeking audio:', error);
            pendingSeekTime = null;
        }
    }
}

// Reset audio slider to zero
function resetAudioSlider() {
    // console.log('🔄 RESETTING SLIDER TO ZERO!');
    
    // Clear any pending seek operation
    pendingSeekTime = null;
    
    const scrubSlider = document.getElementById('audio_scrub_slider');
    const currentTimeLabel = document.getElementById('current_time_label');
    const totalTimeLabel = document.getElementById('total_time_label');
    
    if (scrubSlider) {
        // For Squirrel sliders, look for the handle element and reset its position
        const sliderHandle = document.getElementById('audio_scrub_slider_handle');
        if (sliderHandle) {
            // Reset handle position to 0% (left side)
            sliderHandle.style.left = '0%';
            // console.log('✅ Squirrel slider handle reset to 0%');
            
            // Also look for progression element and reset it
            const progressionElements = scrubSlider.querySelectorAll('.hs-slider-progression, [class*="progression"]');
            if (progressionElements.length > 0) {
                progressionElements.forEach(prog => {
                    prog.style.width = '0%';
                });
                // console.log('✅ Slider progression reset to 0%');
            }
            
            // If the slider has an internal value property, reset it too
            if (scrubSliderRef && scrubSliderRef.setValue) {
                try {
                    scrubSliderRef.setValue(0);
                    // console.log('✅ Squirrel slider setValue(0) called');
                } catch (e) {
                    console.log('⚠️ setValue failed:', e);
                }
            }
        } else {
            // Fallback: try to find standard input element
            const sliderInput = scrubSlider.querySelector('input[type="range"]');
            if (sliderInput) {
                sliderInput.value = 0;
                console.log('✅ Standard slider INPUT reset to 0%');
            } else {
                console.log('❌ Neither Squirrel handle nor standard input found!');
            }
        }
    } else {
        console.log('❌ Slider container not found! Will try again in 100ms...');
        // If slider not found, try again after a short delay
        // setTimeout(() => {
        //     const delayedSlider = document.getElementById('audio_scrub_slider');
        //     if (delayedSlider) {
        //         const delayedHandle = document.getElementById('audio_scrub_slider_handle');
        //         if (delayedHandle) {
        //             delayedHandle.style.left = '0%';
        //             console.log('✅ Squirrel slider handle reset DELAYED to 0%');
        //         }
        //     }
        // }, 100);
    }
    
    // Reset time labels
    if (currentTimeLabel) {
        currentTimeLabel.textContent = '0:00';
        // console.log('✅ Current time label reset');
    }
    if (totalTimeLabel) {
        totalTimeLabel.textContent = '0:00';
        // console.log('✅ Total time label reset');
    }
    
    // Reset timecode display
    updateTimecodeDisplay(0);
    // console.log('✅ Timecode display reset');
}

// Update scrub slider display
function updateScrubSliderDisplay(currentTime) {
    const scrubSlider = document.getElementById('audio_scrub_slider');
    const currentTimeLabel = document.getElementById('current_time_label');
    
    if (scrubSlider && currentTimeLabel && audioController && audioController.audioPlayer) {
        const duration = audioController.audioPlayer.duration || 0;
        
        // Don't update if user is scrubbing OR if we recently seeked (to prevent conflicts)
        const timeSinceLastSeek = Date.now() - lastSeekTime;
        const shouldSkipUpdate = isUserScrubbing || timeSinceLastSeek < 500; // 500ms grace period
        
        if (!shouldSkipUpdate && duration > 0) {
            const percentage = (currentTime / duration) * 100;
            
            // Update Squirrel slider handle position directly
            const sliderHandle = document.getElementById('audio_scrub_slider_handle');
            if (sliderHandle) {
                sliderHandle.style.left = `${percentage}%`;
                
                // Also update progression bar
                const progressionElements = scrubSlider.querySelectorAll('.hs-slider-progression, [class*="progression"]');
                if (progressionElements.length > 0) {
                    progressionElements.forEach(prog => {
                        prog.style.width = `${percentage}%`;
                    });
                }
            }
        }
        
        // Always update time labels and timecode (unless user is actively scrubbing)
        if (!isUserScrubbing) {
            const currentMin = Math.floor(currentTime / 60);
            const currentSec = Math.floor(currentTime % 60);
            currentTimeLabel.textContent = `${currentMin}:${currentSec.toString().padStart(2, '0')}`;
            
            // Update timecode
            updateTimecodeDisplay(currentTime * 1000);
        }
    }
}

// Update slider duration when audio loads
function updateSliderDuration() {
    const totalTimeLabel = document.getElementById('total_time_label');
    
    startupLog('📏 updateSliderDuration() called');
    
    if (totalTimeLabel && audioController && audioController.audioPlayer) {
        const duration = audioController.audioPlayer.duration || 0;
        
        startupLog(`📏 Audio duration found: ${duration}s`);
        startupLog(`📏 Audio player ready state: ${audioController.audioPlayer.readyState}`);
        startupLog(`📏 Audio player src: ${audioController.audioPlayer.src ? audioController.audioPlayer.src.substring(0, 50) + '...' : 'empty'}`);
        
        if (duration > 0 && isFinite(duration)) {
            const durationMin = Math.floor(duration / 60);
            const durationSec = Math.floor(duration % 60);
            const timeString = `${durationMin}:${durationSec.toString().padStart(2, '0')}`;
            totalTimeLabel.textContent = timeString;
            
            startupLog(`📏 ✅ Updated total_time_label to: ${timeString}`);
            console.log(`📏 Updated audio duration display: ${timeString}`);
        } else {
            startupLog(`📏 ⚠️ Duration is ${duration} (invalid), will retry...`);
            // Try again after a short delay if duration isn't available yet
            setTimeout(() => {
                if (audioController && audioController.audioPlayer) {
                    const retryDuration = audioController.audioPlayer.duration;
                    startupLog(`📏 🔄 Retrying - new duration: ${retryDuration}s, readyState: ${audioController.audioPlayer.readyState}`);
                    if (retryDuration > 0) {
                        startupLog('📏 🔄 Retrying updateSliderDuration...');
                        updateSliderDuration();
                    }
                }
            }, 250);
        }
    } else {
        startupLog('📏 ❌ Missing elements - totalTimeLabel: ' + !!totalTimeLabel + ', audioController: ' + !!audioController + ', audioPlayer: ' + !!(audioController && audioController.audioPlayer));
        
        if (audioController && audioController.audioPlayer) {
            startupLog(`📏 Audio player details - src: ${audioController.audioPlayer.src ? 'present' : 'empty'}, readyState: ${audioController.audioPlayer.readyState}`);
        }
    }
}

// Update timecode display without play icons
function updateTimecodeDisplay(timecodeMs) {
    // Check for valid timecode to prevent NaN/Infinity display
    if (!isFinite(timecodeMs) || timecodeMs < 0) {
        timecodeMs = 0;
    }
    
    const seconds = (timecodeMs / 1000).toFixed(3);
    
    const timecodeElement = document.getElementById('timecode-display');
    if (timecodeElement) {
        timecodeElement.textContent = `${seconds}s`;
    }
}

// DOM ready initialization
document.addEventListener('DOMContentLoaded', initializeLyrix);

// Also initialize immediately if DOM is already ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeLyrix);
} else {
    // DOM is already ready, initialize immediately
    initializeLyrix();
}

// AUv3 Host compatibility functions
function displayTransportInfo(isPlaying, playheadPosition, sampleRate) {
    // Convert position to milliseconds
    const positionMs = (playheadPosition / sampleRate) * 1000;
    
    // Update timecode display
    updateTimecode(positionMs);
    
    // Update timecode element with play/pause state (background color only, no icons)
    const timecodeElement = document.getElementById('timecode-display');
    if (timecodeElement) {
        const seconds = (positionMs / 1000).toFixed(3);
        timecodeElement.textContent = `${seconds}s`; // Only show time, no icons
        // Ne plus modifier la couleur de fond pour garder le style du thème
    }
}

// Expose functions globally for AUv3 host access
window.updateTimecode = updateTimecode;

// File import dialog function
function showFileImportDialog() {
    console.log('🔧 showFileImportDialog called - accepting .lrx files');
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = false;
    // Remove accept attribute to allow ALL file types, including .lrx
    // input.accept = '.txt,.lrc,.json,.lrx,.md,.lyrics,.mp3,.m4a,.wav,.aac,.flac,.ogg,.webm,audio/*,text/*,application/json,application/octet-stream,*/*';
    input.style.display = 'none';
    
    input.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            try {
                // Use the drag drop manager to process the file
                if (dragDropManager) {
                    await dragDropManager.processFile(file);
                } else {
                    console.error('❌ DragDropManager not available');
                }
            } catch (error) {
                console.error('❌ Error processing file:', error);
                Modal({
                    title: '❌ File Import Error',
                    content: `<p>Failed to import file: ${error.message}</p>`,
                    buttons: [{ text: 'OK' }],
                    size: 'small'
                });
            }
        }
        // Clean up
        if (input.parentNode) {
            input.parentNode.removeChild(input);
        }
    });
    
    document.body.appendChild(input);
    input.click();
}
window.displayTransportInfo = displayTransportInfo;
window.loadAndDisplaySong = loadAndDisplaySong;
window.navigateToPreviousSong = navigateToPreviousSong;
window.navigateToNextSong = navigateToNextSong;
window.createNewSong = createNewSong;
window.exportAllSongsToLRX = exportAllSongsToLRX;
window.exportSelectedSongsAsTextWithFolderDialog = exportSelectedSongsAsTextWithFolderDialog;
window.showFileImportDialog = showFileImportDialog;
window.resetAudioSlider = resetAudioSlider;
window.updateSliderDuration = updateSliderDuration;

// Export for global access
window.Lyrix = {
    audioController,
    uiManager,
    lyricsLibrary,
    lyricsDisplay,
    currentSong,
    dragDropManager,
    midiUtilities,
    loadAndDisplaySong,
    navigateToPreviousSong,
    navigateToNextSong,
    updateTimecode,
    displayTransportInfo,
    testMidi: () => {
        if (midiUtilities) {
            console.log('🧪 Testing MIDI from window.Lyrix...');
            midiUtilities.testMidiData();
        } else {
            console.error('❌ MIDI utilities not available');
        }
    },
    CONSTANTS,
    StorageManager,
    AudioManager,
    SongManager,
    SyncedLyrics,
    LyricsLibrary,
    LyricsDisplay,
    DragDropManager,
    MidiUtilities
};

// Export modules
export {
    SyncedLyrics,
    LyricsDisplay,
    LyricsLibrary,
    StorageManager,
    AudioManager,
    UIManager,
    SongManager,
    DragDropManager,
    Modal,
    InputModal,
    FormModal,
    SelectModal,
    ConfirmModal,
    CONSTANTS
};


