// Lyrix Application - New Entry Point
// This is the new modular entry point for the Lyrix application
//Todo : Menu structure :
// Tools => edit song
// medias => song panel 
// settings => settings panel
// file : import: import file  / project ; save : save current song
//      : load : load file in current user folder 
//      save => save current song
//      export => text / lrc / lrx export
//record => record audio, capture user zcyions (lyrics)
//perform => play / stop audio + fullscreen display /next song/previous song
//
//scroll with reference between two lines of lyrics
//pause in lyrics ( sec/wait for user action)
// rich txt editor for lyrics +relative size
//
//
//
//
//
//
//
//
//
//
//
//
// Import modal modules from new organized structure
import { showSongLibrary, toggleSongLibrary } from './src/components/songLibraryModal.js';
import { showSettingsModal, toggleSettingsPanel, toggleAudioPlayerControls, toggleAudioSync, toggleMidiInspector, toggleTimecodeVisibility } from './src/components/settings.js';
import { getPurchaseManager } from './src/features/purchase/purchase_manager.js';




// Application startup message


// Import all modules
import { CONSTANTS } from './src/core/constants.js';
import './src/intuition/menu.js';
import { StorageManager } from './src/services/storage.js';
import { AudioManager, AudioController, extractCleanFileName } from './src/features/audio/audio.js';
import { UIManager } from './src/components/ui.js';
import { SongManager } from './src/features/lyrics/songs.js';
import { SyncedLyrics } from './src/core/syncedLyrics.js';
import { LyricsLibrary } from './src/features/lyrics/library.js';
import { LyricsDisplay } from './src/features/lyrics/display.js';
import { DragDropManager } from './src/features/import/dragDrop.js';
import { Modal, InputModal, FormModal, SelectModal, ConfirmModal } from './src/components/modal.js';
import { MidiUtilities } from './src/features/midi/midi_utilities.js';
import { exportSongsToLRX } from './src/features/lyrics/SongUtils.js';

// Initialize global objects
window.dragDropManager = new DragDropManager();

// iOS Error Handling Setup
// Handle iOS thumbnail and view service termination errors globally
if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {

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

// Parasitic reset tracking
window.parasiticResetCount = 0;
window.lastParasiticResetLog = 0;

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

// Function to inject global CSS for text selection control
function injectTextSelectionStyles() {
    const styleId = 'lyrix-text-selection-styles';
    // Remove any previous (for hot reload / re-init cases)
    const existing = document.getElementById(styleId);
    if (existing) existing.remove();
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `/* Text selection policy */
/* Disable selection for most UI chrome */
#settings-panel,
#song-library-panel,
#settings-resize-grip,
#song-library-resize-grip,
.audio-tools-row, .audio-tools-row *,
#audio-scrub-slider-container, #audio-scrub-slider-container *:not(#audio_scrub_slider_handle),
.toolbar, .toolbar *,
#main-toolbar-row, #main-toolbar-row *,
.toolbar,
.resize-grip,
[id*="resize-grip"],
#lyrics_lines_container,
.lyrics-line:not(.editing) {
    -webkit-user-select: none !important;
    -moz-user-select: none !important;
    -ms-user-select: none !important;
    user-select: none !important;
    -webkit-touch-callout: none !important;
}

/* Allow selection inside editable / input zones */
input,
textarea,
[contenteditable="true"],
.editable-content,
.lyrics-line.editing,
.search-input,
.midi-input,
.filename-input,
.text-input {
    -webkit-user-select: text !important;
    -moz-user-select: text !important;
    -ms-user-select: text !important;
    user-select: text !important;
    -webkit-touch-callout: default !important;
}`;
    document.head.appendChild(style);
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

        // Experimental controls removed; ensure audio controls visible on first launch
        if (localStorage.getItem('lyrix_audio_player_enabled') === null) {
            localStorage.setItem('lyrix_audio_player_enabled', 'true');
        }

        // Apply font size (use storage fallback consistent with display)
        const storedFont = localStorage.getItem('lyrix_font_size');
        if (storedFont) {
            // Delay in case display not yet built
            setTimeout(() => {
                const area = document.getElementById('lyrics_content_area');
                if (area) area.style.fontSize = `${storedFont}px`;
                if (window.lyricsDisplay) {
                    window.lyricsDisplay.fontSize = parseInt(storedFont, 10);
                    window.lyricsDisplay.applyGlobalFontSize && window.lyricsDisplay.applyGlobalFontSize();
                }
            }, 0);
        }

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

        // One-time migration of legacy audioPath values (assets/audios or hardcoded HTTP) -> clean filename
        (function migrateLegacyAudioPaths() {
            const MIGRATION_KEY = 'lyrix_audio_migrated_v1';
            if (localStorage.getItem(MIGRATION_KEY) === 'done') return; // already migrated
            try {
                const all = lyricsLibrary.getAllSongs();
                let changed = 0;
                all.forEach(summary => {
                    if (!summary.audioPath) return;
                    const ap = summary.audioPath;
                    // Detect legacy patterns
                    if (/\/assets\/audios\//.test(ap) || /http:\/\/127\.0\.0\.1:3000\/assets\/audios\//.test(ap)) {
                        const clean = extractCleanFileName(ap);
                        if (clean && clean !== ap) {
                            const song = lyricsLibrary.getSong(summary.key);
                            if (song && song.metadata) {
                                song.metadata.audioPath = clean; // store only filename
                                song.saveToStorage();
                                changed++;
                            }
                        }
                    }
                });
                localStorage.setItem(MIGRATION_KEY, 'done');
                console.log(`🎵 Migration audio paths v1: ${changed} entrées mises à jour`);
            } catch (e) {
                console.error('Migration audio paths v1 failed', e);
            }
        })();

        // Initialize Audio Controller without volume
        audioController = new AudioController();

        // Create main UI
        createMainInterface();

        // Initialize display (container removed; we append directly to body/#view)
        lyricsDisplay = new LyricsDisplay(null, audioController);
        // Re-sync font size immediately after display creation
        const storedFontImmediate = localStorage.getItem('lyrix_font_size');
        if (storedFontImmediate) {
            lyricsDisplay.fontSize = parseInt(storedFontImmediate, 10);
            lyricsDisplay.applyGlobalFontSize && lyricsDisplay.applyGlobalFontSize();
        }

        // Connect audio time updates to lyrics display
        if (audioController && audioController.on) {
            audioController.on('timeupdate', (currentTime) => {
                // Convert seconds to milliseconds for lyrics synchronization
                const timeMs = currentTime * 1000;

                // Check if host has been active recently (within last 500ms)
                const now = Date.now();
                const hostRecentlyActive = lyricsDisplay && lyricsDisplay.lastUpdateTimes &&
                    lyricsDisplay.lastUpdateTimes.host &&
                    (now - lyricsDisplay.lastUpdateTimes.host) < 500;

                if (hostRecentlyActive) {
                    console.log('🎯 Local audio defers to active host timecode');
                    // Still send the update but mark it as local - the display will handle priority
                }

                lyricsDisplay.updateTime(timeMs, 'local'); // Mark as local audio source
            });
        }

        // Initialize MIDI utilities
        midiUtilities = new MidiUtilities();
        window.midiUtilities = midiUtilities;  // Expose globally

        // Initialize Purchase Manager for MIDI console unlock
        const purchaseManager = getPurchaseManager();
        window.purchaseManager = purchaseManager;

        function ensureMidiConsoleUI() {
            const toolbarRow = document.getElementById('main-toolbar-row');
            if (!toolbarRow) return;
            let consoleBtn = document.getElementById('show_midi_console_button');
            if (purchaseManager.isOwned()) {
                if (!consoleBtn) {
                    consoleBtn = $('div', { id: 'show_midi_console_button', text: 'MIDI', css: { padding: '4px 10px', backgroundColor: 'rgb(48,60,78)', color: '#fff', borderRadius: '4px', cursor: 'pointer', userSelect: 'none' } });
                    consoleBtn.addEventListener('click', () => {
                        const el = midiUtilities && midiUtilities.midiContainer;
                        if (el) { el.style.display = (el.style.display === 'none' || !el.style.display) ? 'block' : 'none'; }
                    });
                    toolbarRow.appendChild(consoleBtn);
                }
            } else {
                if (consoleBtn) consoleBtn.remove();
            }
        }
        window.addEventListener('lyrix-purchase-updated', ensureMidiConsoleUI);
        setTimeout(ensureMidiConsoleUI, 0);

        // Export managers and modal functions to global scope
        window.UIManager = UIManager; // Export the class for static methods
        window.uiManager = uiManager; // Export the instance for instance methods
        window.lyricsLibrary = lyricsLibrary;
        window.audioController = audioController;
        window.lyricsDisplay = lyricsDisplay;
        window.toggleLyricsEditMode = () => {
            if (window.lyricsDisplay && typeof window.lyricsDisplay.toggleEditMode === 'function') {
                window.lyricsDisplay.toggleEditMode();
            } else {
                console.warn('❌ toggleEditMode indisponible (lyricsDisplay non initialisé)');
            }
        };
        window.createNewEmptySong = () => {
            if (window.lyricsDisplay && typeof window.lyricsDisplay.createNewEmptySong === 'function') {
                window.lyricsDisplay.createNewEmptySong();
            } else {
                console.warn('❌ createNewEmptySong indisponible (lyricsDisplay non initialisé)');
            }
        };
        window.currentSong = currentSong;
        window.Modal = Modal;
        window.ConfirmModal = ConfirmModal;
        window.InputModal = InputModal;
        window.FormModal = FormModal;
        window.$ = $;

        // Export imported modal functions to global scope
        window.showSongLibrary = showSongLibrary;
        window.showSettingsModal = showSettingsModal;
        window.toggleSettingsPanel = toggleSettingsPanel;
        window.toggleAudioPlayerControls = toggleAudioPlayerControls;
        window.toggleAudioSync = toggleAudioSync;
        window.toggleMidiInspector = toggleMidiInspector;
        window.toggleTimecodeVisibility = toggleTimecodeVisibility;
        // Ensure MIDI inspector is in the toolbar
        const appContainer = document.getElementById('view') || document.body;
        const toolbarRow = document.getElementById('main-toolbar-row');
        if (toolbarRow && midiUtilities && midiUtilities.midiContainer) {
            toolbarRow.appendChild(midiUtilities.midiContainer);
        } else if (appContainer && midiUtilities && midiUtilities.midiContainer) {
            // Fallback: append to appContainer if toolbar not found
            appContainer.appendChild(midiUtilities.midiContainer);
        }
        // Apply saved settings on startup
        applyInitialSettings();

        // --- AUv3 Host Stop Watchdog -------------------------------------------------
        // Some host stop scenarios may not trigger our heuristics fast enough (e.g. host freezes
        // playhead without rewinding). This watchdog enforces a rapid pause & re-arm if no
        // host advance is observed for a short window while we still think we're in playingHost.
        (function initAuv3HostWatchdog() {
            try {
                const env = (window.__HOST_ENV || '').toString().toLowerCase();
                if (env !== 'auv3') return; // only inside AUv3
                if (window.__lyrixHostWatchdog) return; // already installed
                const POLL_MS = 120;          // watchdog poll frequency
                const IDLE_THRESHOLD = 220;   // ms without host advance -> treat as stop
                window.__lyrixHostWatchdog = setInterval(function () {
                    try {
                        const btn = document.getElementById('audio-play-button');
                        if (!btn) return;
                        const state = btn.dataset.state;
                        if (state !== 'playingHost') return; // only care about host-synced playback
                        const lastAdvanceTs = window.__lyrixHostSync && window.__lyrixHostSync.lastAdvanceTs || 0;
                        if (!lastAdvanceTs) return; // haven't started yet
                        const idleFor = performance.now() - lastAdvanceTs;
                        if (idleFor > IDLE_THRESHOLD) {
                            if (audioController && audioController.isPlaying && audioController.isPlaying()) {
                                try { audioController.pause && audioController.pause(); } catch (e) { }
                                if (typeof window.__lyrixArmButton === 'function') {
                                    window.__lyrixArmButton(btn);
                                } else {
                                    btn.dataset.state = 'armed';
                                    btn.classList.add('auv3-armed');
                                    if (btn._setActive) btn._setActive(false); else btn.style.backgroundColor = '';
                                }
                                if (!window.__lyrixHostSync) window.__lyrixHostSync = { lastTime: 0, started: false, lastAdvanceTs: 0 };
                                window.__lyrixHostSync.started = false;
                                console.log('🧵 AUv3 host watchdog idle ' + idleFor.toFixed(0) + 'ms -> force pause & re-arm');
                            }
                        }
                    } catch (err) {
                        // Silent to avoid flooding
                    }
                }, POLL_MS);
            } catch (e) {
                console.warn('⚠️ AUv3 host watchdog init failed', e);
            }
        })();
        // -----------------------------------------------------------------------------

        // Inject text selection control styles
        injectTextSelectionStyles();
        // Generic toolbar long-press suppression (prevents iOS selection anywhere in toolbar)
        (function initToolbarLongPressSuppression() {
            try {
                const toolbar = document.getElementById('main-toolbar-row') || document.querySelector('.toolbar');
                if (!toolbar) return;
                if (toolbar.__lyrixLongPressNoSelectInstalled) return;
                toolbar.__lyrixLongPressNoSelectInstalled = true;
                let lpTimer = null;
                const LONG_PRESS_MS = 420; // delay before activating shield
                const ACTIVATE_CLASS = 'lyrix-block-select';
                function activateShield() {
                    if (document.body.classList.contains(ACTIVATE_CLASS)) return;
                    document.body.classList.add(ACTIVATE_CLASS);
                    if (!document.getElementById('lyrix-longpress-shield')) {
                        const shield = document.createElement('div');
                        shield.id = 'lyrix-longpress-shield';
                        shield.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:transparent;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;';
                        const swallow = (ev) => { if (ev.cancelable) ev.preventDefault(); ev.stopPropagation(); };
                        ['contextmenu', 'selectionchange'].forEach(tp => document.addEventListener(tp, swallow, { capture: true, passive: false }));
                        // shield only swallows move/longpress events after activation, not initial tap
                        ['touchmove', 'touchcancel'].forEach(tp => shield.addEventListener(tp, swallow, { passive: false }));
                        document.body.appendChild(shield);
                    }
                    if (!window.__lyrixSelectionClearInterval) {
                        window.__lyrixSelectionClearInterval = setInterval(() => { if (!document.body.classList.contains(ACTIVATE_CLASS)) { clearInterval(window.__lyrixSelectionClearInterval); window.__lyrixSelectionClearInterval = null; return; } try { const sel = window.getSelection(); if (sel) sel.removeAllRanges(); } catch (_) { } }, 140);
                    }
                }
                function start(e) {
                    // Do NOT preventDefault here; allow normal click
                    if (lpTimer) clearTimeout(lpTimer);
                    lpTimer = setTimeout(() => { activateShield(); }, LONG_PRESS_MS);
                }
                function end() {
                    if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; }
                    if (!document.body.classList.contains(ACTIVATE_CLASS)) return; // nothing to clean if not activated
                    setTimeout(() => { document.body.classList.remove(ACTIVATE_CLASS); const shield = document.getElementById('lyrix-longpress-shield'); if (shield) shield.remove(); try { const sel = window.getSelection(); if (sel) sel.removeAllRanges(); } catch (_) { } }, 110);
                }
                ['touchstart', 'mousedown'].forEach(ev => toolbar.addEventListener(ev, start, { passive: true }));
                ['touchend', 'touchcancel', 'mouseup', 'mouseleave', 'pointerleave', 'pointerup'].forEach(ev => toolbar.addEventListener(ev, end, { passive: true }));
            } catch (e) { /* silent */ }
        })();

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
            }
        }, 500);

        // Initialize drag and drop for external files (.txt, .lrc, .lrx, music)
        if (appContainer) {
            dragDropManager = new DragDropManager(audioController, lyricsLibrary, lyricsDisplay);
            dragDropManager.onSongLoaded = (song) => {
                // Rafraîchir titre audio & slider
                updateAudioTitle();
                resetAudioSlider(true);
                try {
                    // Si lyricsDisplay existe, re-render pour refléter audioPath mis à jour
                    if (lyricsDisplay && lyricsDisplay.displayLyrics) {
                        lyricsDisplay.displayLyrics(song);
                    }
                    // Mettre à jour la sélection dans la liste si ouverte
                    const listContainer = document.getElementById('song-library-list');
                    if (listContainer) {
                        const selected = listContainer.querySelector('[data-song-id="' + song.songId + '"]');
                        if (selected) {
                            // Ajouter un petit flash visuel pour signaler maj
                            selected.style.outline = '2px solid #27ae60';
                            setTimeout(() => { selected.style.outline = ''; }, 800);
                        }
                    }
                } catch (e) { /* silent */ }
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

        // Make drag-and-drop work for the entire window (former #lyrix_app removed)
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
        // Assure re-liaison audio quand le port local HTTP arrive après l'initialisation
        setupDeferredAudioRebind();

        // Remove loading message
        const loadingDiv = document.getElementById('loading');
        if (loadingDiv) {
            loadingDiv.remove();
        }

    } catch (error) {
        console.error('❌ Error initializing Lyrix:', error);
    }
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
        css: {
            maxWidth: '500px',
            width: '90%',
            userSelect: 'none',
            webkitUserSelect: 'none',
            mozUserSelect: 'none',
            msUserSelect: 'none'
        }
    });

    // Header
    const header = $('div', {
        css: {
            padding: UIManager.THEME.spacing.lg,
            backgroundColor: UIManager.THEME.colors.primary,
            // borderRadius: `${UIManager.THEME.borderRadius.lg} ${UIManager.THEME.borderRadius.lg} 0 0`,
            color: 'white',
            userSelect: 'none',
            webkitUserSelect: 'none',
            mozUserSelect: 'none',
            msUserSelect: 'none'
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
            padding: UIManager.THEME.spacing.lg,
            userSelect: 'none',
            webkitUserSelect: 'none',
            mozUserSelect: 'none',
            msUserSelect: 'none'
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
            // borderRadius: `0 0 ${UIManager.THEME.borderRadius.lg} ${UIManager.THEME.borderRadius.lg}`,
            textAlign: 'center',
            userSelect: 'none',
            webkitUserSelect: 'none',
            mozUserSelect: 'none',
            msUserSelect: 'none'
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
            cursor: 'pointer',
            userSelect: 'none',
            webkitUserSelect: 'none',
            mozUserSelect: 'none',
            msUserSelect: 'none'
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
        css: {
            maxWidth: '800px',
            width: '95%',
            maxHeight: '90vh',
            userSelect: 'none',
            webkitUserSelect: 'none',
            mozUserSelect: 'none',
            msUserSelect: 'none'
        }
    });

    // Header
    const header = $('div', {
        css: {
            padding: UIManager.THEME.spacing.md,
            backgroundColor: UIManager.THEME.colors.primary,
            // borderRadius: `${UIManager.THEME.borderRadius.lg} ${UIManager.THEME.borderRadius.lg} 0 0`,
            color: 'white',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            userSelect: 'none',
            webkitUserSelect: 'none',
            mozUserSelect: 'none',
            msUserSelect: 'none'
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
            fontSize: '12px',
            userSelect: 'none',
            webkitUserSelect: 'none',
            mozUserSelect: 'none',
            msUserSelect: 'none'
        }
    });

    header.append(headerTitle, selectAllButton);

    // Content
    const content = $('div', {
        css: {
            padding: UIManager.THEME.spacing.md,
            maxHeight: '60vh',
            overflow: 'auto',
            userSelect: 'none',
            webkitUserSelect: 'none',
            mozUserSelect: 'none',
            msUserSelect: 'none'
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
            boxSizing: 'border-box',
            userSelect: 'text', // Explicitly allow selection in textarea
            webkitUserSelect: 'text',
            mozUserSelect: 'text',
            msUserSelect: 'text'
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
    if (songs.length === 0) {
        console.warn('❌ No songs available to export');
        return;
    }

    // Create export data structure
    const exportData = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        totalSongs: songs.length,
        songs: songs.map(song => {
            // Log the audioPath format for debugging
            if (song.audioPath) {
                (`📤 Exporting song "${song.metadata?.title || 'Unknown'}" with audioPath: "${song.audioPath}"`);

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
        // Safari-specific method - uses the window passed from the handler
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

        try {
            saveLink.click();
        } catch (e) {
            const clickEvent = new MouseEvent('click', {
                view: window,
                bubbles: true,
                cancelable: false
            });
            saveLink.dispatchEvent(clickEvent);
        }

        document.body.removeChild(saveLink);

        // Clean up the object URL
        setTimeout(() => {
            URL.revokeObjectURL(url);
        }, 100);
    }

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

}

// Import songs from LRX format
function importFromLRX(file) {
    const reader = new FileReader();
    reader.onload = function (e) {
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
                    // Create a SyncedLyrics instance for each imported song
                    // Use only root fields from the exported format
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
                    // Merge any extra metadata, but DO NOT overwrite title/artist/album
                    syncedLyrics.metadata = Object.assign({}, syncedLyrics.metadata, songData.metadata || {}, {
                        audioPath: songData.audioPath,
                        title: syncedLyrics.title,
                        artist: syncedLyrics.artist,
                        album: syncedLyrics.album
                    });
                    // Root fields are already correct

                    // Add to library
                    const success = lyricsLibrary.saveSong(syncedLyrics);
                    if (success) {
                        importedCount++;
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

    const existingModal = window._exportSelectedSongsFolderModal;
    if (existingModal) {
        if (existingModal.parentElement) {
            existingModal.parentElement.removeChild(existingModal);
        } else if (typeof existingModal.remove === 'function') {
            existingModal.remove();
        }
        window._exportSelectedSongsFolderModal = null;
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
    window._exportSelectedSongsFolderModal = modalContainer;

    const modal = UIManager.createEnhancedModalContainer({
        css: {
            maxWidth: '600px',
            width: '90%',
            userSelect: 'none',
            webkitUserSelect: 'none',
            mozUserSelect: 'none',
            msUserSelect: 'none'
        }
    });

    // // Header
    // const header = UIManager.createModalHeader({});
    // const headerTitle = $('h3', {
    //         id: 'export-songs-header',
    //     text: '📄 Select Songs to Export as Text',
    //     css: { margin: '0', color: 'white' }
    // });
    // header.appendChild(headerTitle);

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
    selectAllBtn.style.userSelect = 'none';
    selectAllBtn.style.webkitUserSelect = 'none';
    selectAllBtn.style.mozUserSelect = 'none';
    selectAllBtn.style.msUserSelect = 'none';

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
        selectBtn.style.userSelect = 'none';
        selectBtn.style.webkitUserSelect = 'none';
        selectBtn.style.mozUserSelect = 'none';
        selectBtn.style.msUserSelect = 'none';

        const label = document.createElement('span');
        label.textContent = item.text;
        label.style.flex = '1';
        label.style.cursor = 'pointer';
        label.style.userSelect = 'none';
        label.style.webkitUserSelect = 'none';
        label.style.mozUserSelect = 'none';
        label.style.msUserSelect = 'none';

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

    // const cancelButton = UIManager.createCancelButton({
    //     text: 'Cancel jjjjjj',
    //     onClick: () => document.body.removeChild(modalContainer)
    // });

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

            if (modalContainer.parentElement) {
                modalContainer.parentElement.removeChild(modalContainer);
            }
            if (window._exportSelectedSongsFolderModal === modalContainer) {
                window._exportSelectedSongsFolderModal = null;
            }

            // Export all songs in a single file
            exportSongsAsSingleFile(selectedSongIds);
        }
    });

    // footer.append(exportButton);
    selectAllContainer.append(exportButton);
    modal.append(content, footer);
    modalContainer.appendChild(modal);
    document.body.appendChild(modalContainer);

    modalContainer.addEventListener('click', (event) => {
        if (event.target === modalContainer) {
            modalContainer.parentElement?.removeChild(modalContainer);
            if (window._exportSelectedSongsFolderModal === modalContainer) {
                window._exportSelectedSongsFolderModal = null;
            }
        }
    });
}

// Function to export songs as separate files
function exportSongsAsSeparateFiles(selectedSongIds) {
    console.log('🔧 Exporting songs as separate files');

    // Check if we're on iOS/AUv3
    const isAUv3 = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.swiftBridge;

    if (isAUv3) {
        console.log('🔧 iOS/AUv3 detected - using iOS save dialogs for separate files');

        // For iOS, export each file using the native save dialog
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

                // Use iOS native save dialog with delay between calls
                setTimeout(() => {
                    const payload = {
                        action: 'saveFileWithDocumentPicker',
                        requestId: `${Date.now()}_${index}`,
                        fileName: `${safeTitle}.txt`,
                        data: exportText,
                        encoding: 'utf8'
                    };

                    console.log(`🔧 Sending file ${index + 1}/${selectedSongIds.length} to Swift bridge: ${safeTitle}.txt`);
                    window.webkit.messageHandlers.swiftBridge.postMessage(payload);
                }, index * 1000); // 1 second delay between iOS save dialogs
            }
        });

    } else {
        console.log('🔧 Desktop/Web detected - using HTML5 downloads for separate files');

        // Desktop/Web: Original logic with HTML5 downloads
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

    // Check if we're on iOS/AUv3
    const isAUv3 = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.swiftBridge;

    if (isAUv3) {
        console.log('🔧 iOS/AUv3 detected - using iOS save dialog for single file');

        // Use iOS native save dialog
        const currentDate = new Date().toISOString().split('T')[0];
        const fileName = `lyrix_songs_${currentDate}.txt`;

        const payload = {
            action: 'saveFileWithDocumentPicker',
            requestId: Date.now().toString(),
            fileName: fileName,
            data: exportText,
            encoding: 'utf8'
        };

        console.log(`🔧 Sending single file to Swift bridge: ${fileName}`);
        window.webkit.messageHandlers.swiftBridge.postMessage(payload);

    } else {
        console.log('🔧 Desktop/Web detected - using HTML5 download for single file');

        // Desktop/Web: Use download method that works on all browsers including Safari
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

        console.log(`✅ Single file download initiated`);
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
        window.currentSong = song;
        lyricsDisplay.displayLyrics(song);

        // Store current song key for navigation
        if (lyricsDisplay) {
            lyricsDisplay.currentSongKey = songKey;
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

            // Reset slider to zero when loading new audio
            resetAudioSlider(true); // Force reset when loading new audio
            updateSliderDuration();
        } else {
            // If no audio, also reset the slider
            resetAudioSlider(true); // Force reset when no audio
        }

        // Always reset play button visual state on song change (audio is paused at top of function)
        const playBtn = document.getElementById('audio-play-button');
        if (playBtn) {
            if (playBtn._setActive) playBtn._setActive(false); else playBtn.style.backgroundColor = 'transparent';
        }

        return true;
    }

    return false;
}

// Get songs in custom display order (respects user reordering)
function getSongsInCustomOrder() {
    if (!lyricsLibrary) {
        return [];
    }

    const songs = lyricsLibrary.getAllSongs();
    if (songs.length === 0) {
        return [];
    }

    try {
        // Load custom order from localStorage
        const savedOrder = localStorage.getItem('lyrix_custom_song_order');
        if (!savedOrder) {
            return songs; // Return original order if no custom order saved
        }

        const orderData = JSON.parse(savedOrder);
        const orderMap = new Map();
        orderData.forEach(item => {
            orderMap.set(item.songKey, item.order);
        });

        // Separate songs into ordered and new ones
        const songsWithOrder = [];
        const newSongs = [];

        songs.forEach(song => {
            const savedOrder = orderMap.get(song.key || song.songId);
            if (savedOrder !== undefined) {
                songsWithOrder.push({ ...song, savedOrder });
            } else {
                newSongs.push(song);
            }
        });

        // Sort songs with saved order
        songsWithOrder.sort((a, b) => a.savedOrder - b.savedOrder);

        // Combine: ordered songs first, then new songs at the end
        return [
            ...songsWithOrder.map(song => ({ ...song, savedOrder: undefined })),
            ...newSongs
        ];
    } catch (error) {
        return songs; // Return original order if parsing fails
    }
}

// Navigate to previous song in library
function navigateToPreviousSong() {
    if (!lyricsLibrary) {
        return;
    }

    const songs = getSongsInCustomOrder();
    if (songs.length === 0) {
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
        // Ensure play button reflects stopped state after navigation
        const playBtn = document.getElementById('audio-play-button');
        if (playBtn) {
            if (playBtn._setActive) playBtn._setActive(false); else playBtn.style.backgroundColor = 'transparent';
        }
    }
}

// Navigate to next song in library
function navigateToNextSong() {
    if (!lyricsLibrary) {
        return;
    }

    const songs = getSongsInCustomOrder();
    if (songs.length === 0) {
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
        // Ensure play button reflects stopped state after navigation
        const playBtn = document.getElementById('audio-play-button');
        if (playBtn) {
            if (playBtn._setActive) playBtn._setActive(false); else playBtn.style.backgroundColor = 'transparent';
        }
    }
}

// Update timecode display
function updateTimecode(timeMs) {
    // Emergency host blocking system
    if (window.blockAllHostUpdates) {
        console.log('🛑 Host update blocked by emergency blocking system');
        return;
    }

    // Enhanced conflict detection for host vs local audio
    if (timeMs === 0) {
        // Check if local audio is playing
        const localAudioPlaying = audioController && audioController.isPlaying && audioController.isPlaying();

        // Check if we recently had a valid time (not a cold start)
        const hadRecentValidTime = lyricsDisplay && lyricsDisplay.currentTime > 1000;

        if (localAudioPlaying || hadRecentValidTime) {
            // Count parasitic resets
            window.parasiticResetCount++;

            // Throttle parasitic reset logging to avoid spam (every 5 seconds)
            const now = Date.now();
            if (!window.lastParasiticResetLog || (now - window.lastParasiticResetLog) > 5000) {
                console.log(`🚨 Blocking parasitic host resets (${window.parasiticResetCount} total blocked, logged every 5s)`);
                window.lastParasiticResetLog = now;

                // Also log details to help identify the pattern
                const localTime = audioController && audioController.getCurrentTime ? audioController.getCurrentTime() : 0;
                console.log(`📊 Current state: Local audio playing=${localAudioPlaying}, Local time=${localTime.toFixed(3)}s, Host sending=0s`);

                // Auto-suggest host blocking if too many resets
                if (window.parasiticResetCount > 100) {
                    console.log('💡 Suggestion: Run toggleHostBlocking(true) to stop all host updates if this continues');
                }
            }
            return;
        }
    }

    // Check for potential conflicts between host and local audio
    const localAudioPlaying = audioController && audioController.isPlaying && audioController.isPlaying();
    const localCurrentTime = audioController && audioController.getCurrentTime ? audioController.getCurrentTime() * 1000 : 0;

    // If local audio is playing and host time is significantly different, log the conflict
    if (localAudioPlaying && timeMs > 0 && Math.abs(timeMs - localCurrentTime) > 200) {
        console.log(`🎯 Host/Local conflict detected: Host=${(timeMs / 1000).toFixed(3)}s, Local=${(localCurrentTime / 1000).toFixed(3)}s - Host takes priority`);
    }

    // This function can be used by external hosts to update timecode
    if (lyricsDisplay) {
        lyricsDisplay.updateTime(timeMs, 'host'); // Mark as host source for prioritization
    }

    // AUv3 host-synced playback arming logic
    const __hostEnv = (window.__HOST_ENV || '').toString().toLowerCase();
    if (__hostEnv === 'auv3') {
        if (!window.__lyrixHostSync) {
            window.__lyrixHostSync = { lastTime: 0, started: false, lastAdvanceTs: 0 };
        }
        const btn = document.getElementById('audio-play-button');
        if (btn) {
            const state = btn.dataset.state;
            // Reflect host position on slider when either armed or playingHost (and user not manually scrubbing)
            if ((state === 'armed' || state === 'playingHost') && typeof updateScrubSliderDisplay === 'function' && !window.isUserScrubbing) {
                try { updateScrubSliderDisplay(timeMs / 1000); } catch (e) { }
            }
            // Detect host running (any forward advance >1ms)
            if (timeMs >= window.__lyrixHostSync.lastTime + 1) {
                if (!window.__lyrixHostSync.started) {
                    window.__lyrixHostSync.started = true;
                }
                window.__lyrixHostSync.lastAdvanceTs = performance.now();
                // If armed and not yet playing, start synced
                if (btn.dataset.state === 'armed' && audioController && !audioController.isPlaying()) {
                    try {
                        audioController.setCurrentTime(timeMs / 1000);
                    } catch (e) { /* ignore */ }
                    try { audioController.play(); } catch (e) { console.warn('⚠️ host sync play failed', e); }
                    if (btn._setActive) btn._setActive(true); else btn.style.backgroundColor = 'white';
                    btn.classList.remove('auv3-armed');
                    btn.dataset.state = 'playingHost';
                    console.log('▶️ AUv3 host-synced playback started at', (timeMs / 1000).toFixed(3), 's');
                }
            }
            // Host stop detection: conditions
            const nowTs = performance.now();
            const hostStoppedByZero = (timeMs === 0 && window.__lyrixHostSync.lastTime > 0);
            const hostWentBackwards = timeMs < window.__lyrixHostSync.lastTime - 2; // rewind / jump back
            const hostInactive = (window.__lyrixHostSync.lastAdvanceTs && (nowTs - window.__lyrixHostSync.lastAdvanceTs) > 250); // >250ms no forward advance
            const btnState = btn.dataset.state;
            if ((hostStoppedByZero || hostWentBackwards || hostInactive) && (btnState === 'playingHost' || btnState === 'forced')) {
                // Pause local playback and re-arm without changing position unless host at zero
                try { audioController && audioController.pause && audioController.pause(); } catch (e) { }
                if (hostStoppedByZero) {
                    try { audioController && audioController.setCurrentTime && audioController.setCurrentTime(0); } catch (e) { }
                    try { updateScrubSliderDisplay && updateScrubSliderDisplay(0); } catch (e) { }
                }
                window.__lyrixHostSync.started = false;
                if (typeof window.__lyrixArmButton === 'function') {
                    window.__lyrixArmButton(btn);
                } else {
                    btn.dataset.state = 'armed';
                    btn.classList.add('auv3-armed');
                    if (btn._setActive) btn._setActive(false); else btn.style.backgroundColor = '';
                }
                console.log(`🔁 AUv3 host stop detected (${hostStoppedByZero ? 'zero' : ''}${hostWentBackwards ? ' rewind' : ''}${hostInactive ? ' idle' : ''}) -> re-armed`);
            }
            // Safety fallback: if host time not advancing (idle) for >750ms and audio still playing in host mode, force pause & re-arm
            if (btnState === 'playingHost' && audioController && audioController.isPlaying && audioController.isPlaying()) {
                const idleFor = performance.now() - (window.__lyrixHostSync.lastAdvanceTs || 0);
                if (idleFor > 750) {
                    try { audioController.pause(); } catch (e) { }
                    if (typeof window.__lyrixArmButton === 'function') window.__lyrixArmButton(btn); else { btn.dataset.state = 'armed'; btn.classList.add('auv3-armed'); }
                    console.log('🛑 AUv3 host idle fallback (>750ms) -> force pause & re-arm');
                }
            }
        }
        window.__lyrixHostSync.lastTime = timeMs;
    }
}

// Diagnostic function for parasitic resets (available in console)
window.getParasiticResetStats = function () {
    const stats = {
        totalBlocked: window.parasiticResetCount || 0,
        lastLogTime: window.lastParasiticResetLog || 0,
        timeSinceLastLog: window.lastParasiticResetLog ? Date.now() - window.lastParasiticResetLog : 0,
        localAudioPlaying: audioController && audioController.isPlaying ? audioController.isPlaying() : false,
        localCurrentTime: audioController && audioController.getCurrentTime ? audioController.getCurrentTime() : 0,
        displayCurrentTime: lyricsDisplay ? lyricsDisplay.currentTime : 0,
        hostBlockingActive: window.blockAllHostUpdates || false
    };
    console.log('📊 Parasitic Reset Statistics:', stats);
    return stats;
};

// Reset the counter (available in console)
window.resetParasiticResetCounter = function () {
    window.parasiticResetCount = 0;
    window.lastParasiticResetLog = 0;
    console.log('🔄 Parasitic reset counter reset');
};

// Emergency function to block ALL host updates (available in console)
window.blockAllHostUpdates = false;
window.toggleHostBlocking = function (block = null) {
    if (block === null) {
        window.blockAllHostUpdates = !window.blockAllHostUpdates;
    } else {
        window.blockAllHostUpdates = !!block;
    }

    const status = window.blockAllHostUpdates ? 'ENABLED' : 'DISABLED';
    console.log(`🛑 Host update blocking ${status}`);

    if (window.blockAllHostUpdates) {
        console.log('⚠️ ALL host timecode updates will be ignored until you run toggleHostBlocking(false)');
    }

    return window.blockAllHostUpdates;
};

// Helper function to show available console commands
window.help = function () {
    console.log(`
🆘 Lyrix Console Commands:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 DIAGNOSTICS:
• getParasiticResetStats() - Show reset blocking statistics
• resetParasiticResetCounter() - Reset the counter to zero

🛑 HOST CONTROL:
• toggleHostBlocking() - Toggle ALL host timecode blocking
• toggleHostBlocking(true) - Block ALL host updates
• toggleHostBlocking(false) - Allow host updates again

🎵 AUDIO CONTROL:
• audioController.play() - Start local audio
• audioController.pause() - Pause local audio
• audioController.getCurrentTime() - Get current time

📝 LYRICS:
• lyricsDisplay.currentTime - Current display time
• lyricsDisplay.currentLineIndex - Current line index

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
};

// Create main interface
function createMainInterface() {
    // lyrix_app container removed: we use body (or #view) directly now
    const container = document.getElementById('view') || document.body;
    const app = container; // alias to preserve downstream variable logic

    // (mainLayout removed: tools injected directly by feature modules)

    // Add some basic content to left panel
    const settingsButton = UIManager.createInterfaceButton('⚙️', {
        id: 'settings_button',
        onClick: () => {
            toggleSettingsPanel('settings_button');
        },
        css: {
            marginBottom: '15px',
            display: 'none' // permanently hidden placeholder
        },
        'aria-expanded': 'false',
        'aria-controls': 'settings-panel',
        'aria-label': 'Open settings panel'
    });
    settingsButton.dataset.forceHidden = 'true';

    // Legacy import_file_button removed (direct multi-file import now handled elsewhere)
    // If any legacy code tries to reference #import_file_button, keep a harmless stub for safety
    if (!document.getElementById('import_file_button')) {
        const stub = document.createElement('div');
        stub.id = 'import_file_button';
        stub.style.display = 'none';
        // We do NOT append it to DOM to avoid accidental layout impact
        window.__removedImportButton = true;
    }

    // Song list button (SVG icon)
    const songListButton = UIManager.createInterfaceButton('', {
        id: 'song_list_button',
        onClick: () => {
            const isOpen = toggleSongLibrary();
            if (songListButton._setActive) songListButton._setActive(isOpen);
        }
    });
    (function attachSongListIcon() {
        try {
            songListButton.innerHTML = '';
            const img = document.createElement('img');
            img.src = 'assets/images/icons/sequence.svg';
            img.alt = 'song list';
            img.style.width = '18px';
            img.style.height = '18px';
            img.style.pointerEvents = 'none';
            songListButton.appendChild(img);
        } catch (e) { /* silent */ }
    })();

    // Store tool elements for potential move to lyrics toolbar
    window.leftPanelTools = {
        settingsButton,
        songListButton
        // import_file_button fully removed
        // createSongButton, // Moved to song library panel
    };

    // Note: These tools will be moved to lyrics toolbar by display.js
    // leftPanel.append(settingsButton, importButton, createSongButton, songListButton);

    // Add audio controls section
    if (audioController) {
        // Check audio player controls setting state
        // By default, audio controls are hidden unless enabled in settings
        let isAudioPlayerEnabled = localStorage.getItem('lyrix_audio_player_enabled');
        if (isAudioPlayerEnabled === null) {
            localStorage.setItem('lyrix_audio_player_enabled', 'true');
            isAudioPlayerEnabled = 'true';
        }
        const initialDisplay = isAudioPlayerEnabled === 'true' ? 'block' : 'none';

        const playButton = UIManager.createInterfaceButton('', {
            id: 'audio-play-button',
            onClick: () => {
                try {
                    const hostEnv = (window.__HOST_ENV || '').toString().toLowerCase();
                    if (hostEnv === 'auv3') {
                        if (playButton._longPressTriggered) { // guard: ignore base click after long press
                            playButton._longPressTriggered = false;
                            return;
                        }
                        const state = playButton.dataset.state || 'idle';
                        // If currently playing locally, toggle pause
                        if (audioController.isPlaying() && state !== 'armed') {
                            audioController.pause();
                            if (playButton._setActive) playButton._setActive(false); else playButton.style.backgroundColor = 'transparent';
                            playButton.dataset.state = 'idle';
                            return;
                        }
                        if (state === 'idle') {
                            // Arm playback (wait for host start)
                            armAuv3Playback(playButton);
                            console.log('🟡 AUv3 playback armed (waiting host start)');
                        } else if (state === 'armed') {
                            // Disarm
                            disarmAuv3Playback(playButton);
                            console.log('⚪️ AUv3 playback disarmed');
                        } else if (state === 'playingHost' || state === 'forced') {
                            // Pause current playback
                            audioController.pause();
                            if (playButton._setActive) playButton._setActive(false); else playButton.style.backgroundColor = 'transparent';
                            playButton.dataset.state = 'idle';
                            console.log('⏸️ AUv3 playback paused');
                        } else {
                            // Fallback toggle
                            audioController.play();
                            playButton.dataset.state = 'playingHost';
                            console.log('▶️ AUv3 fallback play');
                        }
                    } else {
                        // Application mode: original behavior
                        if (audioController.isPlaying()) {
                            audioController.pause();
                            if (playButton._setActive) playButton._setActive(false); else playButton.style.backgroundColor = 'transparent';
                        } else {
                            if (playButton._setActive) playButton._setActive(true); else playButton.style.backgroundColor = 'white';
                            audioController.play();
                        }
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
        // AUv3 arming helpers (defined inline to avoid polluting global scope)
        function ensureAuv3ArmStyles() {
            if (document.getElementById('lyrix-auv3-arm-style')) return;
            const st = document.createElement('style');
            st.id = 'lyrix-auv3-arm-style';
            st.textContent = `@keyframes lyrixArmBlink{0%,100%{background:#444;}50%{background:#888;}} .auv3-armed{animation:lyrixArmBlink 0.9s linear infinite; box-shadow:0 0 0 1px #666 inset;}`;
            document.head.appendChild(st);
        }
        function armAuv3Playback(btn) {
            ensureAuv3ArmStyles();
            btn.dataset.state = 'armed';
            btn.classList.add('auv3-armed');
            if (btn._setActive) btn._setActive(false); // keep icon neutral
        }
        function disarmAuv3Playback(btn) {
            btn.dataset.state = 'idle';
            btn.classList.remove('auv3-armed');
            if (btn._setActive) btn._setActive(false); else btn.style.backgroundColor = 'transparent';
        }
        function forceImmediatePlayback(btn) {
            btn.classList.remove('auv3-armed');
            btn.dataset.state = 'forced';
            try { audioController.play(); } catch (e) { console.warn('⚠️ force play failed', e); }
            if (btn._setActive) btn._setActive(true); else btn.style.backgroundColor = 'white';
        }
        // Expose arming helper globally so updateTimecode can reuse
        window.__lyrixArmButton = armAuv3Playback;
        window.__lyrixEnsureArmStyles = ensureAuv3ArmStyles;
        // Long press detection (AUv3 only)
        if ((window.__HOST_ENV || '').toString().toLowerCase() === 'auv3') {
            let pressTimer = null;
            const longPressMs = 600;
            const startPress = () => {
                if (pressTimer) clearTimeout(pressTimer);
                pressTimer = setTimeout(() => {
                    // Activate shield & selection block only when long press threshold reached
                    try {
                        document.body.classList.add('lyrix-block-select');
                        if (!document.getElementById('lyrix-longpress-shield')) {
                            const shield = document.createElement('div');
                            shield.id = 'lyrix-longpress-shield';
                            shield.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:transparent;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;';
                            const swallow = (ev) => { if (ev.cancelable) ev.preventDefault(); ev.stopPropagation(); };
                            ['touchmove', 'touchcancel', 'contextmenu'].forEach(tp => shield.addEventListener(tp, swallow, { passive: false }));
                            document.body.appendChild(shield);
                        }
                        if (!window.__lyrixSelectionClearInterval) {
                            window.__lyrixSelectionClearInterval = setInterval(() => { if (!document.body.classList.contains('lyrix-block-select')) { clearInterval(window.__lyrixSelectionClearInterval); window.__lyrixSelectionClearInterval = null; return; } try { const sel = window.getSelection(); if (sel) sel.removeAllRanges(); } catch (_) { } }, 150);
                        }
                    } catch (_) { }
                    if (playButton.dataset.state === 'armed' || playButton.dataset.state === 'idle') {
                        forceImmediatePlayback(playButton);
                        playButton._longPressTriggered = true; // guard
                        console.log('⚡️ AUv3 long press forced playback');
                    }
                }, longPressMs);
            };
            const cancelPress = () => {
                if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
                // Remove selection blocking class at end of interaction (slightly longer delay to avoid iOS post-longpress selection)
                setTimeout(() => document.body.classList.remove('lyrix-block-select'), 160);
                // Remove shield
                const shield = document.getElementById('lyrix-longpress-shield');
                if (shield) shield.remove();
                // Final selection clear
                try { const sel = window.getSelection(); if (sel && sel.removeAllRanges) sel.removeAllRanges(); } catch (_) { }
            };
            ['mousedown', 'touchstart'].forEach(ev => playButton.addEventListener(ev, startPress, { passive: false }));
            ['mouseup', 'mouseleave', 'touchend', 'touchcancel'].forEach(ev => playButton.addEventListener(ev, cancelPress, { passive: true }));
            // Ensure global CSS for blocking selection on demand exists
            if (!document.getElementById('lyrix-block-select-style')) {
                const st = document.createElement('style');
                st.id = 'lyrix-block-select-style';
                st.textContent = '.lyrix-block-select, .lyrix-block-select * { -webkit-user-select:none !important; user-select:none !important; -webkit-touch-callout:none !important; }';
                document.head.appendChild(st);
            }
        }
        // Inject SVG icon for play
        (function attachPlayIcon() {
            try {
                playButton.innerHTML = '';
                const img = document.createElement('img');
                img.src = 'assets/images/icons/play.svg';
                img.alt = 'play';
                img.style.width = '18px';
                img.style.height = '18px';
                img.style.pointerEvents = 'none';
                playButton.appendChild(img);
            } catch (e) { /* silent */ }
        })();

        // Add ID and data attribute for identification
        // playButton.id = 'audio-play-button';
        playButton.setAttribute('data-element', 'play-button');

        const stopButton = UIManager.createInterfaceButton('', {
            id: 'audio-stop-button',
            onClick: () => {
                try {
                    audioController.pause();
                    audioController.setCurrentTime(0);
                    resetAudioSlider(false); // don't force lyrics reset
                    const playBtn = document.getElementById('audio-play-button');
                    if (playBtn) {
                        // Disarm AUv3 armed state explicitly
                        const hostEnv = (window.__HOST_ENV || '').toString().toLowerCase();
                        if (hostEnv === 'auv3') {
                            playBtn.classList.remove('auv3-armed');
                            playBtn.dataset.state = 'idle';
                        }
                        if (playBtn._setActive) playBtn._setActive(false); else playBtn.style.backgroundColor = 'transparent';
                    }
                } catch (error) {
                    console.error('❌ ERREUR Stop:', error);
                }
            },
            css: {
                marginRight: '10px',
                display: initialDisplay
            }
        });
        // Inject SVG icon for stop
        (function attachStopIcon() {
            try {
                stopButton.innerHTML = '';
                const img = document.createElement('img');
                img.src = 'assets/images/icons/stop.svg';
                img.alt = 'stop';
                img.style.width = '18px';
                img.style.height = '18px';
                img.style.pointerEvents = 'none';
                stopButton.appendChild(img);
            } catch (e) { /* silent */ }
        })();

        // Add data attribute for identification
        stopButton.setAttribute('data-element', 'stop-button');

        // // Add ID for identification
        // stopButton.id = 'audio-stop-button';

        // audio-controls-container removed (legacy). We still build buttons (play/stop) but not grouped in a container.
        // Use a lightweight div wrapper instead of DocumentFragment so attribute APIs still work
        const audioControls = document.createElement('div');
        audioControls.id = 'audio-controls-inline';
        audioControls.style.display = 'flex';
        audioControls.style.flexDirection = 'row';
        audioControls.style.gap = '5px';
        audioControls.style.alignItems = 'center';

        // Attach audioController event listeners once controls exist to keep UI sync robust
        try {
            if (!audioController._uiSyncBound) {
                audioController.on && audioController.on('play', () => {
                    const btn = document.getElementById('audio-play-button');
                    if (btn) { if (btn._setActive) btn._setActive(true); else btn.style.backgroundColor = 'white'; }
                });
                audioController.on && audioController.on('pause', () => {
                    const btn = document.getElementById('audio-play-button');
                    if (btn && !audioController.isPlaying()) { if (btn._setActive) btn._setActive(false); else btn.style.backgroundColor = 'transparent'; }
                });
                audioController.on && audioController.on('ended', () => {
                    const btn = document.getElementById('audio-play-button');
                    if (btn) { if (btn._setActive) btn._setActive(false); else btn.style.backgroundColor = 'transparent'; }
                });
                audioController._uiSyncBound = true;
            }
        } catch (e) {
            console.warn('⚠️ Failed to bind audioController UI sync listeners', e);
        }

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
                padding: '0 8px', // Slightly reduced horizontal + no extra vertical height
                boxSizing: 'border-box'
            }
        });
        scrubContainer.classList.add('audio-tools-row');
        // Prevent text selection inside the scrub row except handle drag
        const suppressSelection = (e) => {
            const handle = document.getElementById('audio_scrub_slider_handle');
            if (handle && (e.target === handle || handle.contains(e.target))) return; // allow drag
            if (e.type === 'selectstart' && e.cancelable) e.preventDefault();
        };
        scrubContainer.addEventListener('selectstart', suppressSelection, { passive: false });

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
                    width: 'calc(100% - 16px)',
                    height: '11px', // further reduced by 3px
                    marginBottom: '3px',
                    marginLeft: '8px',
                    marginRight: '8px'
                },
                track: {
                    // THEME OVERRIDE: unified dark blue rail
                    height: '3px', // further reduced
                    backgroundColor: 'rgb(48,60,78)',
                    borderRadius: '3px',
                    border: 'none',
                    boxShadow: 'none'
                },
                progression: {
                    // Darker, greyer blue progression
                    backgroundColor: '#4a6a85',
                    borderRadius: '3px'
                },
                handle: {
                    width: '9px', // further reduced by 3px
                    height: '9px',
                    backgroundColor: '#fff',
                    border: 'none',
                    borderRadius: '50%',
                    boxShadow: '0 0 2px rgba(0,0,0,0.3)',
                    top: '-3px' // recenter for reduced size
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
                        lyricsDisplay.updateTime(timecodeMs, 'scrub');
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
        // Force track / progression styles after creation (defensive override)
        setTimeout(() => {
            try {
                const trackEl = document.getElementById('audio_scrub_slider_track');
                const progEl = document.getElementById('audio_scrub_slider_progression');
                if (trackEl) {
                    trackEl.style.backgroundColor = 'rgb(48,60,78)';
                    trackEl.style.border = 'none';
                    trackEl.style.boxShadow = 'none';
                }
                if (progEl) {
                    // Slight contrast for progression
                    progEl.style.backgroundColor = 'rgb(74,106,133)';
                    progEl.style.border = 'none';
                }
            } catch (e) {
                console.warn('Scrub slider post-style failed', e);
            }
        }, 0);

        // Global CSS (once) to override any default slider track style
        if (!document.getElementById('scrub-slider-global-style')) {
            const styleTag = document.createElement('style');
            styleTag.id = 'scrub-slider-global-style';
            styleTag.textContent = `#audio-scrub-slider-container .hs-slider-track, #audio_scrub_slider_track {\n  background-color: rgb(48,60,78) !important;\n  border: none !important;\n  box-shadow: none !important;\n}\n#audio-scrub-slider-container .hs-slider-progression, #audio_scrub_slider_progression {\n  background-color: rgb(74,106,133) !important;\n  border: none !important;\n}`;
            document.head.appendChild(styleTag);
        }

        // Store reference for direct updates
        scrubSliderRef = scrubSlider;

        // Enhance slider appearance (design_slider-like) after DOM creation without breaking geometry
        const enhanceAudioSliderDesign = () => {
            const track = document.getElementById('audio_scrub_slider_track');
            const handle = document.getElementById('audio_scrub_slider_handle');
            const progression = document.getElementById('audio_scrub_slider_progression');
            if (track) {
                track.style.height = '18px';
                track.style.top = '50%';
                track.style.transform = 'translateY(-50%)';
                track.style.backgroundColor = '#2a3038';
                track.style.borderRadius = '18px';
                track.style.border = '1px solid rgba(255,255,255,0.08)';
                track.style.boxShadow = 'inset 0 4px 8px rgba(0,0,0,0.35), inset 0 -4px 8px rgba(255,255,255,0.06), inset 4px 0 6px rgba(0,0,0,0.25), inset -4px 0 6px rgba(0,0,0,0.25), 0 2px 4px rgba(0,0,0,0.25)';
            }
            if (progression) {
                progression.style.height = '100%';
                progression.style.top = '0';
                progression.style.left = '0';
                progression.style.background = '#4a6a85';
                progression.style.borderRadius = '18px';
                progression.style.boxShadow = 'inset 0 0 4px rgba(0,0,0,0.35)';
            }
            if (handle) {
                handle.style.width = '22px';
                handle.style.height = '22px';
                handle.style.top = '50%';
                handle.style.transform = 'translate(-50%, -50%)';
                handle.style.backgroundColor = '#4a6a85';
                handle.style.border = 'none';
                handle.style.borderRadius = '50%';
                handle.style.boxShadow = '0 3px 6px rgba(0,0,0,0.5), 0 6px 12px rgba(0,0,0,0.35), inset 0 1px 3px rgba(255,255,255,0.20), inset 0 -1px 3px rgba(0,0,0,0.55)';
            }
        };
        setTimeout(enhanceAudioSliderDesign, 0);

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
            css: {
                textAlign: 'left',
                display: 'none',
            },
            text: '0:00'
        });

        const totalTimeLabel = $('span', {
            id: 'total_time_label',
            css: {
                textAlign: 'left',
                display: 'none',
            },
            text: '0:00'
        });

        timeLabels.append(currentTimeLabel, totalTimeLabel);
        scrubContainer.append(scrubSlider, timeLabels);

        // Add timecode display for AUv3 host compatibility
        const timecodeDisplay = UIManager.createEnhancedTimecodeDisplay({
            text: '0.000s'
        });

        // Apply timecode display visibility setting immediately
        const isTimecodeDisplayVisible = localStorage.getItem('lyrix_timecode_display_visible') === 'true';
        timecodeDisplay.style.display = isTimecodeDisplayVisible ? 'block' : 'none';

        // Store scrub and timecode tools for potential move to lyrics toolbar
        window.leftPanelScrubTools = {
            scrubContainer,
            timecodeDisplay
        };

        // Note: These tools will be moved to lyrics toolbar by display.js
        // leftPanel.append(scrubContainer, timecodeDisplay);

        // Setup audio event listeners
        if (audioController.on) {
            audioController.on('timeupdate', (currentTime) => {
                updateScrubSliderDisplay(currentTime);
            });

            // Primary event - when audio metadata (including duration) is loaded
            audioController.on('loaded', (duration) => {
                console.log(`📏 Audio loaded event - duration: ${duration}s`);
                updateSliderDuration();
            });

            audioController.on('loadedmetadata', () => {
                console.log('📏 Loadedmetadata event triggered');
                updateSliderDuration();
            });

            // Also listen for loadeddata and canplay events as fallbacks
            audioController.on('loadeddata', () => {
                console.log('📏 Loadeddata event triggered');
                updateSliderDuration();
            });

            audioController.on('canplay', () => {
                console.log('📏 Canplay event triggered');
                updateSliderDuration();
            });
        }
    }

    // Note: No longer using right panel - lyrics display elements append directly to body
    // Remove: const rightPanel = $('div', { id: 'lyrics_display_area', ... });

    // Note: Left panel removed - using single column layout now
    // No longer appending rightPanel (lyrics display manages its own layout)
    // Removed container.append(app) because app is now the container (lyrix_app wrapper removed)
}

// Load last opened song
function setupDeferredAudioRebind() {
    let attempts = 0;
    const maxAttempts = 15; // ~7.5s total
    const intervalMs = 500;
    function tryBind() {
        attempts++;
        // Besoin: port disponible + currentSong avec audioPath + audioController sans player chargé ou player src encore ancien
        const port = window.ATOME_LOCAL_HTTP_PORT || window.__ATOME_LOCAL_HTTP_PORT__;
        if (port && currentSong && currentSong.getAudioPath && currentSong.getAudioPath()) {
            const fileName = currentSong.getAudioPath().split(/[/\\]/).pop();
            if (audioController && audioController.loadAudio) {
                const ok = audioController.loadAudio(fileName);
                if (ok) {
                    return; // stop retries
                }
            }
        }
        if (attempts < maxAttempts) {
            setTimeout(tryBind, intervalMs);
        } else {
            console.log('⏱️ Fin des tentatives de rebind audio (port ou fichier indisponible)');
        }
    }
    setTimeout(tryBind, intervalMs);
}

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
            // Always load the song first (lyrics display)
            lyricsDisplay.displayLyrics(currentSong);
            window.currentSong = currentSong;

            // Update audio title with current song filename
            updateAudioTitle();

            // ALWAYS reset slider when loading any song
            resetAudioSlider(true); // Force reset when loading song

            // Charger l'audio réel via le contrôleur (et non plus un test invisible)
            if (currentSong.getAudioPath && currentSong.getAudioPath()) {
                const audioPath = currentSong.getAudioPath();
                const fileName = audioPath.split(/[/\\]/).pop();
                if (audioController && audioController.loadAudio) {
                    const ok = audioController.loadAudio(fileName);
                    if (!ok) {
                        console.warn('⚠️ Impossible to load audio at startup:', fileName);
                    }
                }
            } else {
                console.log('ℹ️ Last song has no audio file, but loaded lyrics successfully');
            }
        } else {
            console.warn('⚠️ Last song not found in library, clearing from storage');
            StorageManager.clearLastOpenedSong();
        }
    } else {
        // Even if no last song, reset the slider to zero
        resetAudioSlider(true); // Force reset at startup
    }
}

// Function to seek audio to pending time when user releases slider
function seekToPendingTime() {
    if (pendingSeekTime !== null && audioController && audioController.audioPlayer) {
        try {
            const currentTime = audioController.audioPlayer.currentTime;
            const isSeekingForward = pendingSeekTime > currentTime;


            // Mark that we're seeking to prevent timeupdate conflicts
            lastSeekTime = Date.now();
            // Perform the actual seek
            audioController.audioPlayer.currentTime = pendingSeekTime;

            // Clear the pending seek time
            pendingSeekTime = null;


        } catch (error) {
            console.error('❌ Error seeking audio:', error);
            pendingSeekTime = null;
        }
    }
}

// Reset audio slider to zero
function resetAudioSlider(forceLyricsReset = false) {

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

            // Also look for progression element and reset it
            const progressionElements = scrubSlider.querySelectorAll('.hs-slider-progression, [class*="progression"]');
            if (progressionElements.length > 0) {
                progressionElements.forEach(prog => {
                    prog.style.width = '0%';
                });
            }

            // If the slider has an internal value property, reset it too
            if (scrubSliderRef && scrubSliderRef.setValue) {
                try {
                    scrubSliderRef.setValue(0);
                } catch (e) {
                }
            }
        } else {
            // Fallback: try to find standard input element
            const sliderInput = scrubSlider.querySelector('input[type="range"]');
            if (sliderInput) {
                sliderInput.value = 0;
            }
        }
    }


    // Reset time labels
    if (currentTimeLabel) {
        currentTimeLabel.textContent = '0:00';
    }
    if (totalTimeLabel) {
        totalTimeLabel.textContent = '0:00';
    }

    // Reset timecode display only if explicitly requested or when loading new songs
    if (forceLyricsReset) {
        updateTimecodeDisplay(0);
    }
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

            // Update timecode - but don't reset to zero if audio is still loaded and was playing
            const shouldUpdateTimecode = currentTime > 0 || !audioController || !audioController.audioPlayer || audioController.audioPlayer.readyState === 0;
            if (shouldUpdateTimecode) {
                updateTimecodeDisplay(currentTime * 1000);
            }
        }
    }
}

// Update slider duration when audio loads
function updateSliderDuration() {
    const totalTimeLabel = document.getElementById('total_time_label');

    console.log('📏 updateSliderDuration() called');

    if (totalTimeLabel && audioController && audioController.audioPlayer) {
        const duration = audioController.audioPlayer.duration || 0;

        console.log(`📏 Audio duration found: ${duration}s`);
        console.log(`📏 Audio player ready state: ${audioController.audioPlayer.readyState}`);
        console.log(`📏 Audio player src: ${audioController.audioPlayer.src ? audioController.audioPlayer.src.substring(0, 50) + '...' : 'empty'}`);

        if (duration > 0 && isFinite(duration)) {
            const durationMin = Math.floor(duration / 60);
            const durationSec = Math.floor(duration % 60);
            const timeString = `${durationMin}:${durationSec.toString().padStart(2, '0')}`;
            totalTimeLabel.textContent = timeString;

            console.log(`📏 ✅ Updated total_time_label to: ${timeString}`);
        } else {
            console.log(`📏 ⚠️ Duration is ${duration} (invalid), will retry...`);
            // Try again after a short delay if duration isn't available yet
            setTimeout(() => {
                if (audioController && audioController.audioPlayer) {
                    const retryDuration = audioController.audioPlayer.duration;
                    console.log(`📏 🔄 Retrying - new duration: ${retryDuration}s, readyState: ${audioController.audioPlayer.readyState}`);
                    if (retryDuration > 0) {
                        console.log('📏 🔄 Retrying updateSliderDuration...');
                        updateSliderDuration();
                    }
                }
            }, 250);
        }
    } else {
        console.log('📏 ❌ Missing elements - totalTimeLabel: ' + !!totalTimeLabel + ', audioController: ' + !!audioController + ', audioPlayer: ' + !!(audioController && audioController.audioPlayer));

        if (audioController && audioController.audioPlayer) {
            console.log(`📏 Audio player details - src: ${audioController.audioPlayer.src ? 'present' : 'empty'}, readyState: ${audioController.audioPlayer.readyState}`);
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
        // No longer modify background color to keep theme style
    }
}

// Expose functions globally for AUv3 host access
window.updateTimecode = updateTimecode;

// File import dialog function
function showFileImportDialog() {
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
    toggleEditMode: () => window.toggleLyricsEditMode && window.toggleLyricsEditMode(),
    createNewEmptySong: () => window.createNewEmptySong && window.createNewEmptySong(),
    loadAndDisplaySong,
    navigateToPreviousSong,
    navigateToNextSong,
    updateTimecode,
    displayTransportInfo,
    testMidi: () => {
        if (midiUtilities) {
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


// grab('view').style.backgroundColor = 'black'; // patch for notch support