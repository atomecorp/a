// Lyrix Application - New Entry Point
// This is the new modular entry point for the Lyrix application

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
import { Modal, InputModal, FormModal, SelectModal, ConfirmModal } from './src/modal.js';
import { MidiUtilities } from './src/midi_utilities.js';

// iOS Error Handling Setup
// Handle iOS thumbnail and view service termination errors globally
if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
    console.log('🍎 iOS detected - Setting up global error handling for thumbnail/view service issues');
    
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
            console.log('🍎 Suppressed iOS system error:', event.reason?.message || event.reason);
            event.preventDefault(); // Prevent the error from being logged
        }
    });
    
    // Handle global errors (iOS view service termination)
    window.addEventListener('error', (event) => {
        if (isIOSSystemError(event.error)) {
            console.log('🍎 Suppressed iOS system error:', event.error?.message || event.error);
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

// Initialize the application
function initializeLyrix() {
    try {
        // iOS-specific initialization
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        if (isIOS) {
            console.log('🍎 iOS initialization started');
            setupiOSOptimizations();
        }
        
        // Initialize managers
        audioController = new AudioController();
        uiManager = new UIManager();
        lyricsLibrary = new LyricsLibrary();
        
        // iOS memory check after initialization
        if (isIOS && audioController.checkIOSMemory) {
            audioController.checkIOSMemory();
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
            
            // iOS-specific error handling
            if (isIOS) {
                audioController.on('error', (error) => {
                    console.error('🍎 iOS audio error:', error);
                    handleIOSAudioError(error);
                });
            }
        }
        
        // Initialize MIDI utilities
        midiUtilities = new MidiUtilities();
        
        // Apply saved settings on startup
        applyInitialSettings();
        
        // Initialize drag and drop
        const appContainer = document.getElementById('lyrix_app');
        if (appContainer) {
            dragDropManager = new DragDropManager(audioController, lyricsLibrary, lyricsDisplay);
            
            // Set callback for when a song is loaded via drag and drop
            dragDropManager.onSongLoaded = (song) => {
                // iOS memory cleanup before loading new content
                if (isIOS && audioController.forceMemoryCleanup) {
                    audioController.forceMemoryCleanup();
                }
                
                // Stop current audio playback before loading new song
                if (audioController) {
                    audioController.pause();
                    audioController.setCurrentTime(0);
                }
                
                currentSong = song;
                
                // Log audio filename when dropped
                if (song.hasAudio()) {
                    const audioPath = song.getAudioPath();
                    if (audioPath) {
                        const filename = audioPath.split('/').pop().split('\\').pop();
                        console.log('Audio file dropped:', filename);
                    }
                }
                
                updateAudioTitle();
                
                // Reset slider when loading song via drag and drop
                resetAudioSlider();
            };
            
            dragDropManager.initialize(appContainer);
        }
        
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
                const song = SongManager.create(values.title, values.artist || 'Unknown Artist', values.album || '', lyricsLibrary);
                
                if (song) {
                    const result = loadAndDisplaySong(song.songId);
                    
                    // Success message removed - direct loading only
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

// Show song library
function showSongLibrary() {
    if (!lyricsLibrary) {
        console.error('❌ LyricsLibrary non disponible');
        Modal({
            title: '❌ Error',
            content: '<p>Library not initialized</p>',
            buttons: [{ text: 'OK' }],
            size: 'small'
        });
        return;
    }

    const songs = lyricsLibrary.getAllSongs();    if (songs.length === 0) {
        Modal({
            title: '📚 Library Empty',
            content: '<p>No songs in library. Create a new song first.</p>',
            buttons: [{ text: 'OK' }],
            size: 'small'
        });
        return;
    }
    
    // Prepare items for SelectModal
    const songItems = songs.map(song => ({
        text: `${song.title} - ${song.artist}${song.album ? ` (${song.album})` : ''}`,
        value: song.key,  // Use the storage key for deletion
        song: song
    }));
    
    SelectModal({
        title: '📚 Select Song to Load',
        items: songItems,
        searchable: true,
        onSelect: (songKey, item) => {
            const result = loadAndDisplaySong(songKey);
            
            // Success message removed - direct loading only
        },
        onDelete: (songKey, item) => {
            // Confirm deletion
            ConfirmModal({
                title: '🗑️ Delete Song',
                message: `Are you sure you want to delete "${item.song.title}" by ${item.song.artist}?`,
                confirmText: 'Delete',
                cancelText: 'Cancel',
                onConfirm: () => {
                    try {
                        // Delete the song using the library with the storage key
                        const success = lyricsLibrary.deleteSong(songKey);
                        if (success) {
                            // Close current modal and reopen the song library to show updated list
                            // setTimeout(() => {
                                showSongLibrary();
                            // }, 100);
                        } else {
                            console.error('❌ Failed to delete song');
                        }
                    } catch (error) {
                        console.error('❌ Error deleting song:', error);
                    }
                },
                onCancel: () => {
                    // User cancelled deletion
                }
            });
        },
        onCancel: () => {
            // User cancelled song selection
        }
    });
}

// Show settings modal with MIDI fullscreen assignments
function showSettingsModal() {
    console.log('🔧 Opening settings modal...');
    
    // Create settings content
    const settingsContent = $('div', {
        css: {
            padding: '20px',
            maxWidth: '400px'
        }
    });

    // Title
    const title = $('h3', {
        text: 'Settings - MIDI Fullscreen Control & UI Visibility',
        css: {
            margin: '0 0 20px 0',
            color: '#333',
            textAlign: 'center'
        }
    });

    // Fullscreen activation section
    const activateSection = $('div', {
        css: {
            marginBottom: '20px',
            padding: '15px',
            backgroundColor: '#f8f9fa',
            borderRadius: '5px',
            border: '1px solid #e9ecef'
        }
    });

    const activateTitle = $('div', {
        text: 'Activate Fullscreen',
        css: {
            fontWeight: 'bold',
            marginBottom: '10px',
            color: '#495057'
        }
    });

    const activateContainer = $('div', {
        css: {
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
        }
    });

    const activateInput = $('input', {
        type: 'text',
        placeholder: 'MIDI Note',
        css: {
            flex: '1',
            height: '30px',
            fontSize: '14px',
            textAlign: 'center',
            border: '1px solid #ccc',
            borderRadius: '4px',
            padding: '5px'
        }
    });

    // Load existing assignment
    const savedActivateNote = window.Lyrix?.midiUtilities?.getMidiSpecialAssignment?.('fullscreen_activate');
    if (savedActivateNote) {
        activateInput.value = savedActivateNote;
    }

    const activateLearnButton = Button({
        text: '🎹 Learn',
        onClick: () => {
            startMidiLearnForSetting(activateInput, 'fullscreen_activate', activateLearnButton);
        },
        css: {
            padding: '5px 10px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px'
        }
    });

    activateContainer.append(activateInput, activateLearnButton);
    activateSection.append(activateTitle, activateContainer);

    // Fullscreen deactivation section
    const deactivateSection = $('div', {
        css: {
            marginBottom: '20px',
            padding: '15px',
            backgroundColor: '#f8f9fa',
            borderRadius: '5px',
            border: '1px solid #e9ecef'
        }
    });

    const deactivateTitle = $('div', {
        text: 'Deactivate Fullscreen',
        css: {
            fontWeight: 'bold',
            marginBottom: '10px',
            color: '#495057'
        }
    });

    const deactivateContainer = $('div', {
        css: {
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
        }
    });

    const deactivateInput = $('input', {
        type: 'text',
        placeholder: 'MIDI Note',
        css: {
            flex: '1',
            height: '30px',
            fontSize: '14px',
            textAlign: 'center',
            border: '1px solid #ccc',
            borderRadius: '4px',
            padding: '5px'
        }
    });

    // Load existing assignment
    const savedDeactivateNote = window.Lyrix?.midiUtilities?.getMidiSpecialAssignment?.('fullscreen_deactivate');
    if (savedDeactivateNote) {
        deactivateInput.value = savedDeactivateNote;
    }

    const deactivateLearnButton = Button({
        text: '🎹 Learn',
        onClick: () => {
            startMidiLearnForSetting(deactivateInput, 'fullscreen_deactivate', deactivateLearnButton);
        },
        css: {
            padding: '5px 10px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px'
        }
    });

    deactivateContainer.append(deactivateInput, deactivateLearnButton);
    deactivateSection.append(deactivateTitle, deactivateContainer);

    // Save input changes
    activateInput.addEventListener('input', (e) => {
        const midiNote = e.target.value.trim();
        if (midiNote) {
            window.Lyrix?.midiUtilities?.setMidiSpecialAssignment?.('fullscreen_activate', midiNote);
        } else {
            window.Lyrix?.midiUtilities?.removeMidiSpecialAssignment?.('fullscreen_activate');
        }
    });

    deactivateInput.addEventListener('input', (e) => {
        const midiNote = e.target.value.trim();
        if (midiNote) {
            window.Lyrix?.midiUtilities?.setMidiSpecialAssignment?.('fullscreen_deactivate', midiNote);
        } else {
            window.Lyrix?.midiUtilities?.removeMidiSpecialAssignment?.('fullscreen_deactivate');
        }
    });

    // Audio Player Controls section
    const audioSection = $('div', {
        css: {
            marginBottom: '20px',
            padding: '15px',
            backgroundColor: '#e3f2fd',
            borderRadius: '5px',
            border: '1px solid #2196F3'
        }
    });

    const audioTitle = $('div', {
        text: '🎵 Audio Player Controls',
        css: {
            fontWeight: 'bold',
            marginBottom: '10px',
            color: '#1976D2'
        }
    });

    const audioContainer = $('div', {
        css: {
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
        }
    });

    // Load current state from localStorage
    const isAudioEnabled = localStorage.getItem('lyrix_audio_player_enabled') === 'true'; // Default to false

    const audioButton = UIManager.createInterfaceButton(
        isAudioEnabled ? '✅' : '❌', 
        {
            onClick: () => toggleAudioPlayerControls(audioButton, audioLabel)
        }
    );

    const audioLabel = $('span', {
        text: isAudioEnabled ? 'Audio Controls Visible' : 'Audio Controls Hidden',
        css: {
            fontSize: '14px',
            color: '#1976D2',
            fontWeight: '500'
        }
    });

    audioContainer.append(audioButton, audioLabel);
    audioSection.append(audioTitle, audioContainer);

    // MIDI Inspector section
    const midiSection = $('div', {
        css: {
            marginBottom: '20px',
            padding: '15px',
            backgroundColor: '#f3e5f5',
            borderRadius: '5px',
            border: '1px solid #9c27b0'
        }
    });

    const midiTitle = $('div', {
        text: '🎹 MIDI Inspector',
        css: {
            fontWeight: 'bold',
            marginBottom: '10px',
            color: '#7b1fa2'
        }
    });

    const midiContainer = $('div', {
        css: {
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
        }
    });

    // Load current state from localStorage
    const isMidiEnabled = localStorage.getItem('lyrix_midi_inspector_enabled') === 'true'; // Default to false

    const midiButton = UIManager.createInterfaceButton(
        isMidiEnabled ? '✅' : '❌', 
        {
            onClick: () => toggleMidiInspector(midiButton, midiLabel)
        }
    );

    const midiLabel = $('span', {
        text: isMidiEnabled ? 'MIDI Inspector Visible' : 'MIDI Inspector Hidden',
        css: {
            fontSize: '14px',
            color: '#7b1fa2',
            fontWeight: '500'
        }
    });

    midiContainer.append(midiButton, midiLabel);
    midiSection.append(midiTitle, midiContainer);

    // Assemble the content
    settingsContent.append(title, activateSection, deactivateSection, audioSection, midiSection);

    // Show modal
    Modal({
        title: '⚙️ Settings',
        content: settingsContent,
        buttons: [
            {
                text: 'Close',
                style: 'primary',
                action: () => {
                    console.log('🔧 Settings modal closed');
                }
            }
        ]
    });
}

// Toggle audio player controls visibility
function toggleAudioPlayerControls(buttonElement, labelElement) {
    const isCurrentlyEnabled = localStorage.getItem('lyrix_audio_player_enabled') === 'true';
    const newState = !isCurrentlyEnabled;
    
    // Save new state
    localStorage.setItem('lyrix_audio_player_enabled', newState.toString());
    
    // Update button and label
    buttonElement.textContent = newState ? '✅' : '❌';
    labelElement.textContent = newState ? 'Audio Controls Visible' : 'Audio Controls Hidden';
    
    // Get audio elements to toggle using their IDs
    const audioElementsToToggle = [
        document.getElementById('audio-player-title'),
        document.getElementById('audio-play-button'),
        document.getElementById('audio-stop-button'),
        document.getElementById('audio-controls-container'),
        document.getElementById('audio-scrub-slider-container')
    ];
    
    // Also toggle the audio tools row
    const audioToolRow = document.getElementById('audio-tools-row');
    
    const displayValue = newState ? 'flex' : 'none'; // Use flex for the audio row
    
    // Toggle visibility for audio elements only
    audioElementsToToggle.forEach(element => {
        if (element) {
            element.style.display = newState ? 'block' : 'none';
        }
    });
    
    // Toggle the audio tools row
    if (audioToolRow) {
        audioToolRow.style.display = displayValue;
    }
    
    console.log(`🎵 Audio Player Controls: ${newState ? 'ENABLED' : 'DISABLED'} - Audio controls ${newState ? 'shown' : 'hidden'}`);
}

// Toggle MIDI inspector visibility
function toggleMidiInspector(buttonElement, labelElement) {
    const isCurrentlyEnabled = localStorage.getItem('lyrix_midi_inspector_enabled') === 'true';
    const newState = !isCurrentlyEnabled;
    
    // Save new state
    localStorage.setItem('lyrix_midi_inspector_enabled', newState.toString());
    
    // Update button and label
    buttonElement.textContent = newState ? '✅' : '❌';
    labelElement.textContent = newState ? 'MIDI Inspector Visible' : 'MIDI Inspector Hidden';
    
    // Get MIDI element to toggle
    const midiElement = document.getElementById('midi-logger-container');
    
    const displayValue = newState ? 'block' : 'none';
    
    // Toggle visibility for MIDI inspector
    if (midiElement) {
        midiElement.style.display = displayValue;
    }
    
    console.log(`🎹 MIDI Inspector: ${newState ? 'ENABLED' : 'DISABLED'} - MIDI data logger ${newState ? 'shown' : 'hidden'}`);
}

// Apply initial settings on application startup
function applyInitialSettings() {
    console.log('⚙️ Applying initial settings...');
    
    // Set default values for new settings if they don't exist
    if (localStorage.getItem('lyrix_audio_player_enabled') === null) {
        localStorage.setItem('lyrix_audio_player_enabled', 'false'); // Default to hidden
    }
    
    if (localStorage.getItem('lyrix_midi_inspector_enabled') === null) {
        localStorage.setItem('lyrix_midi_inspector_enabled', 'false'); // Default to hidden
    }
    
    // Wait for DOM elements to be created, then apply settings
    setTimeout(() => {
        // Apply audio player settings
        const isAudioPlayerEnabled = localStorage.getItem('lyrix_audio_player_enabled') === 'true';
        const audioElements = [
            document.getElementById('audio-player-title'),
            document.getElementById('audio-play-button'),
            document.getElementById('audio-stop-button'),
            document.getElementById('audio-controls-container'),
            document.getElementById('audio-scrub-slider-container')
        ];
        
        // Also handle the audio tools row
        const audioToolRow = document.getElementById('audio-tools-row');
        
        const audioDisplayValue = isAudioPlayerEnabled ? 'block' : 'none';
        const audioRowDisplayValue = isAudioPlayerEnabled ? 'flex' : 'none';
        
        audioElements.forEach(element => {
            if (element) {
                element.style.display = audioDisplayValue;
            }
        });
        
        if (audioToolRow) {
            audioToolRow.style.display = audioRowDisplayValue;
        }
        
        // Apply MIDI inspector settings
        const isMidiInspectorEnabled = localStorage.getItem('lyrix_midi_inspector_enabled') === 'true';
        const midiElement = document.getElementById('midi-logger-container');
        if (midiElement) {
            midiElement.style.display = isMidiInspectorEnabled ? 'block' : 'none';
        }
        
        console.log(`⚙️ Settings applied: Audio Player ${isAudioPlayerEnabled ? 'visible' : 'hidden'}, MIDI Inspector ${isMidiInspectorEnabled ? 'visible' : 'hidden'}`);
    }, 100); // Small delay to ensure DOM is ready
}

// Show file import dialog
function showFileImportDialog() {
    // Create a hidden file input element
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.lrc,.txt,.mp3,.wav,.ogg,.m4a,.flac';
    fileInput.multiple = true;
    fileInput.style.display = 'none';
    
    // iOS-specific attributes for better file handling
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (isIOS) {
        fileInput.setAttribute('capture', 'filesystem');
        fileInput.setAttribute('webkitdirectory', 'false');
        // Disable thumbnail generation to prevent iOS errors
        fileInput.setAttribute('data-no-thumbnail', 'true');
    }
    
    // Add to document temporarily
    document.body.appendChild(fileInput);

    // Enhanced iOS error handler
    const handleIOSError = (error, context = 'file operation') => {
        const errorMessage = error?.message || error?.toString() || 'Unknown error';
        
        // Check for known iOS thumbnail/view service errors
        if (errorMessage.includes('thumbnail') ||
            errorMessage.includes('view service') ||
            errorMessage.includes('QLThumbnailErrorDomain') ||
            errorMessage.includes('GSLibraryErrorDomain') ||
            errorMessage.includes('_UIViewServiceErrorDomain') ||
            errorMessage.includes('Generation not found') ||
            errorMessage.includes('Terminated=disconnect method')) {
            
            console.log(`🍎 iOS ${context}: Expected thumbnail/view service error (can be ignored)`);
            return true; // This is an expected iOS error
        }
        
        console.warn(`⚠️ iOS ${context} error:`, error);
        return false; // This is an unexpected error
    };
    
    // Set up the change event with enhanced iOS error handling
    fileInput.addEventListener('change', async (event) => {
        try {
            const files = Array.from(event.target.files);
            if (files.length > 0) {
                console.log('📁 Files selected:', files.map(f => f.name));
                
                if (isIOS) {
                    console.log('🍎 iOS file processing with enhanced error handling');
                    await processIOSFilesRobustly(files);
                } else {
                    // Desktop: Process immediately
                    dragDropManager.handleDroppedFiles(files);
                }
            }
        } catch (error) {
            if (isIOS && handleIOSError(error, 'file import')) {
                console.log('🍎 File import completed despite iOS system errors');
            } else {
                console.error('❌ File import error:', error);
                showCustomAlert('Import Error', `Failed to import files: ${error.message}`);
            }
        } finally {
            // Enhanced cleanup with longer delay for iOS
            setTimeout(() => {
                try {
                    if (fileInput.parentNode) {
                        document.body.removeChild(fileInput);
                    }
                } catch (cleanupError) {
                    console.warn('⚠️ File input cleanup error:', cleanupError);
                }
            }, isIOS ? 1000 : 100); // Longer delay on iOS
        }
    });

    // Process iOS files with robust error handling
    async function processIOSFilesRobustly(files) {
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            
            try {
                console.log(`🍎 Processing iOS file ${i + 1}/${files.length}: ${file.name}`);
                
                // Add delay between files to prevent system overload
                if (i > 0) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
                
                // Process with timeout and error recovery
                await Promise.race([
                    processFileWithIOSErrorHandling(file),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('iOS processing timeout')), 15000)
                    )
                ]);
                
                console.log(`✅ iOS file processed: ${file.name}`);
                
            } catch (error) {
                if (handleIOSError(error, `file processing for ${file.name}`)) {
                    // For expected iOS errors, continue processing
                    console.log(`🍎 File ${file.name} processed with expected iOS errors`);
                } else {
                    console.error(`❌ Failed to process ${file.name}:`, error);
                    showCustomAlert('File Error', `Could not process ${file.name}. Try selecting one file at a time.`);
                }
            }
        }
    }

    // Process single file with iOS error handling
    async function processFileWithIOSErrorHandling(file) {
        return new Promise((resolve, reject) => {
            // Wrap in setTimeout to handle iOS quirks
            setTimeout(() => {
                try {
                    // Override problematic file properties for iOS
                    const fileProxy = new Proxy(file, {
                        get(target, prop) {
                            // Prevent access to properties that trigger thumbnail generation
                            if (prop === 'webkitRelativePath') return '';
                            if (prop === 'webkitDirectory') return false;
                            return target[prop];
                        }
                    });
                    
                    dragDropManager.handleDroppedFiles([fileProxy]);
                    resolve();
                    
                } catch (error) {
                    if (handleIOSError(error, 'file processing')) {
                        resolve(); // Treat expected iOS errors as success
                    } else {
                        reject(error);
                    }
                }
            }, 50); // Small delay to let iOS settle
        });
    }
    
    // Enhanced error handlers for iOS
    fileInput.addEventListener('error', (event) => {
        handleIOSError(event, 'file input');
    });
    
    // Global iOS error suppression for view service termination
    if (isIOS) {
        const originalConsoleError = console.error;
        const originalConsoleWarn = console.warn;
        
        // Temporarily suppress iOS thumbnail errors during file processing
        console.error = (...args) => {
            const message = args.join(' ');
            if (!handleIOSError({ message }, 'console error')) {
                originalConsoleError.apply(console, args);
            }
        };
        
        console.warn = (...args) => {
            const message = args.join(' ');
            if (!handleIOSError({ message }, 'console warning')) {
                originalConsoleWarn.apply(console, args);
            }
        };
        
        // Restore console after a delay
        setTimeout(() => {
            console.error = originalConsoleError;
            console.warn = originalConsoleWarn;
        }, 5000);
    }
    
    // Trigger the file picker with error handling
    try {
        fileInput.click();
    } catch (error) {
        console.error('❌ File picker error:', error);
        document.body.removeChild(fileInput);
    }
}

// Helper function to process files sequentially (iOS fallback)
function processFilesSequentially(files) {
    if (!files || files.length === 0) return;
    
    let currentIndex = 0;
    
    const processNext = () => {
        if (currentIndex >= files.length) return;
        
        const file = files[currentIndex];
        console.log(`📁 Processing file ${currentIndex + 1}/${files.length}: ${file.name}`);
        
        try {
            // Process single file
            dragDropManager.handleDroppedFiles([file]);
            currentIndex++;
            
            // Process next file after a short delay
            if (currentIndex < files.length) {
                setTimeout(processNext, 200);
            }
        } catch (error) {
            console.error(`❌ Error processing file ${file.name}:`, error);
            currentIndex++;
            // Continue with next file
            if (currentIndex < files.length) {
                setTimeout(processNext, 200);
            }
        }
    };
    
    processNext();
}

// Helper function for MIDI learning in settings
function startMidiLearnForSetting(inputElement, settingKey, buttonElement) {
    if (window.Lyrix?.midiUtilities?.startMidiLearn) {
        // Change button appearance
        buttonElement.textContent = '⏹ Stop';
        buttonElement.style.backgroundColor = '#ff4757';
        
        window.Lyrix.midiUtilities.startMidiLearn((midiNote) => {
            // MIDI note learned
            inputElement.value = midiNote;
            
            // Reset button appearance
            buttonElement.textContent = '🎹 Learn';
            buttonElement.style.backgroundColor = '#007bff';
            
            // Save the assignment
            window.Lyrix.midiUtilities.setMidiSpecialAssignment(settingKey, midiNote);
            
            console.log(`🎵 MIDI note ${midiNote} assigned to ${settingKey}`);
        });
    }
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
        lyricsDisplay.displayLyrics(song);
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
            
            // Reset slider to zero when loading new audio
            resetAudioSlider();
            
            // Update slider duration after a short delay to ensure audio is loaded
            // setTimeout(() => {
                updateSliderDuration();
            // }, 500);
        } else {
            // If no audio, also reset the slider
            resetAudioSlider();
        }
        
        return true;
    }
    
    return false;
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
    
    const createSongButton = UIManager.createInterfaceButton('➕', {
        id: 'create_new_song_button',
        onClick: () => {
            createNewSong();
        },
        css: {
            marginBottom: '10px'
        }
    });
    
    const songListButton = UIManager.createInterfaceButton('☰', {
        id: 'song_list_button',
        onClick: () => {
            showSongLibrary();
        }
    });    
    // Store tool elements for potential move to lyrics toolbar
    window.leftPanelTools = {
        settingsButton,
        importButton, 
        createSongButton,
        songListButton
    };
    
    // Note: These tools will be moved to lyrics toolbar by display.js
    // leftPanel.append(settingsButton, importButton, createSongButton, songListButton);
    
    // Add audio controls section
    if (audioController) {
        // Check audio player controls setting state
        const isAudioPlayerEnabled = localStorage.getItem('lyrix_audio_player_enabled') === 'true'; // Default to false (hidden)
        const initialDisplay = isAudioPlayerEnabled ? 'block' : 'none';
        
        const playButton = UIManager.createInterfaceButton('▶️', {
            onClick: () => {
                try {
                    if (audioController.isPlaying()) {
                        audioController.pause();
                    } else {
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
        
        audioControls.append(playButton, stopButton);
        
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
                marginBottom: '15px',
                padding: '10px',
                backgroundColor: '#f8f9fa',
                borderRadius: '4px',
                border: '1px solid #dee2e6',
                display: initialDisplay
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
                    width: '100%',
                    height: '20px',
                    marginBottom: '10px'
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
                    width: '16px',
                    height: '16px',
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
                    // setTimeout(() => {
                    //     isUserScrubbing = false;
                    // }, 300);
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
                    // setTimeout(() => {
                    //     isUserScrubbing = false;
                    // }, 300);
                });
            } else {
                // Fallback: try to find standard input element
                const sliderInput = sliderElement?.querySelector('input[type="range"]');
                if (sliderInput) {
                    sliderInput.addEventListener('mousedown', () => {
                        isUserScrubbing = true;
                    });
                    
                    sliderInput.addEventListener('mouseup', () => {
                        // setTimeout(() => {
                        //     isUserScrubbing = false;
                        // }, 100);
                    });
                }
            }
        // }, 100);
        
        document.addEventListener('mouseup', () => {
            // Global mouseup to catch cases where mouse is released outside the slider
            if (isUserScrubbing) {
                // Seek to the pending time immediately
                seekToPendingTime();
                
                // setTimeout(() => {
                //     isUserScrubbing = false;
                // }, 300);
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
        
        // Add timecode display for AUv3 host compatibility
        const timecodeDisplay = UIManager.createEnhancedTimecodeDisplay({
            text: '0.000s'
        });
        
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
            
            audioController.on('loadedmetadata', () => {
                updateSliderDuration();
            });
            
            // Also listen for loadeddata and canplay events as fallbacks
            audioController.on('loadeddata', () => {
                updateSliderDuration();
            });
            
            audioController.on('canplay', () => {
                updateSliderDuration();
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
    
    if (totalTimeLabel && audioController && audioController.audioPlayer) {
        const duration = audioController.audioPlayer.duration || 0;
        
        if (duration > 0) {
            const durationMin = Math.floor(duration / 60);
            const durationSec = Math.floor(duration % 60);
            totalTimeLabel.textContent = `${durationMin}:${durationSec.toString().padStart(2, '0')}`;
            console.log(`📏 Updated audio duration display: ${durationMin}:${durationSec.toString().padStart(2, '0')}`);
        } else {
            // Try again after a short delay if duration isn't available yet
            // setTimeout(() => {
            //     if (audioController && audioController.audioPlayer && audioController.audioPlayer.duration > 0) {
            //         updateSliderDuration();
            //     }
            // }, 250);
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
    
    const timecodeElement = document.getElementById('timecode');
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
function updateTimecode(timecodeMs) {
    // Convert to seconds for display
    const seconds = (timecodeMs / 1000).toFixed(3);
    
    // Update timecode display element
    const timecodeElement = document.getElementById('timecode');
    if (timecodeElement) {
        timecodeElement.textContent = `${seconds}s`;
        timecodeElement.style.backgroundColor = '#0a0'; // Green when receiving from host
    }
    
    // Update lyrics display with the timecode
    if (lyricsDisplay) {
        lyricsDisplay.updateTime(timecodeMs);
    }
}

function displayTransportInfo(isPlaying, playheadPosition, sampleRate) {
    // Convert position to milliseconds
    const positionMs = (playheadPosition / sampleRate) * 1000;
    
    // Update timecode display
    updateTimecode(positionMs);
    
    // Update timecode element with play/pause state (background color only, no icons)
    const timecodeElement = document.getElementById('timecode');
    if (timecodeElement) {
        const seconds = (positionMs / 1000).toFixed(3);
        timecodeElement.textContent = `${seconds}s`; // Only show time, no icons
        timecodeElement.style.backgroundColor = isPlaying ? '#0a0' : '#a00';
    }
}

// Expose functions globally for AUv3 host access
window.updateTimecode = updateTimecode;
window.displayTransportInfo = displayTransportInfo;
window.loadAndDisplaySong = loadAndDisplaySong;

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

// iOS-specific optimization functions
function setupiOSOptimizations() {
    console.log('🍎 Setting up iOS optimizations...');
    
    // Prevent zoom on input focus
    const viewport = document.querySelector('meta[name="viewport"]');
    if (viewport) {
        viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
    }
    
    // Prevent iOS bounce scrolling
    document.body.style.overscrollBehavior = 'none';
    
    // Add iOS-specific CSS for better performance
    const style = document.createElement('style');
    style.textContent = `
        * {
            -webkit-tap-highlight-color: transparent;
            -webkit-touch-callout: none;
        }
        
        audio {
            -webkit-playsinline: true;
            playsinline: true;
        }
        
        .ios-optimized {
            -webkit-transform: translateZ(0);
            transform: translateZ(0);
            -webkit-backface-visibility: hidden;
            backface-visibility: hidden;
        }
    `;
    document.head.appendChild(style);
    
    // Setup memory monitoring
    if (performance.memory) {
        setInterval(() => {
            const memoryInfo = performance.memory;
            const usedMB = Math.round(memoryInfo.usedJSHeapSize / 1024 / 1024);
            const limitMB = Math.round(memoryInfo.jsHeapSizeLimit / 1024 / 1024);
            
            if (usedMB > limitMB * 0.9) {
                console.warn('🍎 High memory usage detected:', usedMB, 'MB');
                if (audioController && audioController.forceMemoryCleanup) {
                    audioController.forceMemoryCleanup();
                }
            }
        }, 30000); // Check every 30 seconds
    }
    
    console.log('🍎 iOS optimizations completed');
}

// Handle iOS-specific audio errors
function handleIOSAudioError(error) {
    console.error('🍎 iOS audio error handler:', error);
    
    // Common iOS audio error recovery
    if (error && error.message) {
        if (error.message.includes('decode') || error.message.includes('format')) {
            showCustomAlert('Audio Format Error', 'This audio format may not be supported on iOS. Try using MP3 or M4A format.');
        } else if (error.message.includes('network') || error.message.includes('loading')) {
            showCustomAlert('Audio Loading Error', 'Failed to load audio file. Please check your connection and try again.');
        } else if (error.message.includes('memory')) {
            if (audioController && audioController.forceMemoryCleanup) {
                audioController.forceMemoryCleanup();
            }
            showCustomAlert('Memory Error', 'Low memory detected. Please close other apps and try again.');
        }
    }
}

// Lyrix module loaded
