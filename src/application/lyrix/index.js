// Lyrix Application - New Entry Point
// This is the new modular entry point for the Lyrix application

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

// ===== Global state (module scope) =====
// Core singletons
let audioController = null;
let lyricsLibrary = null;
let lyricsDisplay = null;
let midiUtilities = null;
let currentSong = null;
// Back-compat alias for UI class (some code exports uiManager)
// Note: UIManager exposes static helpers, no instance needed
// Keeping a variable to satisfy window.Lyrix export
const uiManager = UIManager;

// Audio scrub/seek shared state (module-safe declarations)
let pendingSeekTime = null; // number | null
let lastSeekTime = 0;       // number (ms timestamp)
let isUserScrubbing = false; // boolean
let scrubSliderRef = null;   // Squirrel slider instance or null

// Safe updater for an optional audio title element
function updateAudioTitle() {
    try {
        const titleEl = document.getElementById('audio-player-title');
        if (!titleEl) return;
        let label = 'No audio loaded';
        if (currentSong) {
            // Prefer metadata title/artist; fallback to audio filename if present
            const t = currentSong.metadata?.title || currentSong.title || '';
            const a = currentSong.metadata?.artist || currentSong.artist || '';
            if (t || a) {
                label = `🎵 ${t}${a ? ' — ' + a : ''}`;
            } else if (currentSong.hasAudio && currentSong.hasAudio()) {
                const p = currentSong.getAudioPath ? currentSong.getAudioPath() : currentSong.audioPath;
                if (p) {
                    const fileName = ('' + p).split(/[/\\]/).pop();
                    label = `🎵 ${fileName}`;
                }
            }
        }
        titleEl.textContent = label;
    } catch (e) {
        // Non-fatal
        console.warn('updateAudioTitle failed:', e);
    }
}

// Main application initialization
function initializeLyrix() {
    try {
        startupLog('🧩 initializeLyrix()');
        // Create core controllers/utilities once
        if (!audioController) audioController = new AudioController();
        if (!midiUtilities) {
            midiUtilities = new MidiUtilities();
            // Expose for display.js integration
            window.midiUtilities = midiUtilities;
        }
        if (!lyricsLibrary) {
            lyricsLibrary = new LyricsLibrary();
            window.lyricsLibrary = lyricsLibrary;
        }

        // Build base DOM structure and tool placeholders
        createMainInterface();

        // Create lyrics display (handles toolbar/content, moves tools)
        if (!lyricsDisplay) {
            lyricsDisplay = new LyricsDisplay(null, audioController);
            window.lyricsDisplay = lyricsDisplay;
        }

        // Apply persisted settings (visibility, volume, etc.)
        applyInitialSettings();

        // Load last opened song (if any)
        loadLastSong();

        // Ensure audio title reflects current state
        updateAudioTitle();

        startupLog('✅ Lyrix initialized');
    } catch (err) {
        console.error('❌ initializeLyrix error:', err);
    }
}

// iOS Error Handling Setup
// Handle iOS thumbnail and view service termination errors globally
if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
    const isIOSSystemError = (error) => {
        const message = error?.message || error?.toString() || '';
        return message.includes('view service') ||
               message.includes('QLThumbnailErrorDomain') ||
               message.includes('GSLibraryErrorDomain') ||
               message.includes('_UIViewServiceErrorDomain') ||
               message.includes('Generation not found') ||
               message.includes('Terminated=disconnect method');
    };

    // Handle unhandled promise rejections (iOS file picker errors)
    window.addEventListener('unhandledrejection', (event) => {
        if (isIOSSystemError(event.reason)) {
            event.preventDefault();
        }
    });

    // Handle global errors (iOS view service termination)
    window.addEventListener('error', (event) => {
        if (isIOSSystemError(event.error)) {
            event.preventDefault();
        }
    });
}

// Inline text export selector (moved to global scope)
function showInlineTextExportSelector() {
    if (!lyricsLibrary) {
        console.error('❌ LyricsLibrary non disponible');
        return;
    }
    // Source summaries
    const songSummaries = lyricsLibrary.getAllSongs();
    if (songSummaries.length === 0) {
        console.warn('❌ No songs available to export');
        return;
    }
    // Ensure one panel, reuse export inline panel id
    closeExportPanel();
    const displayContainer = document.getElementById('display-container');
    const lyricsContentArea = document.getElementById('lyrics_content_area');
    if (!displayContainer || !lyricsContentArea) {
        console.error('❌ display-container or lyrics_content_area not found');
        return;
    }
    const panel = UIManager.createEnhancedModalContainer({
        id: 'export-inline-panel',
        css: { maxWidth: '100%', width: '100%', maxHeight: '60vh', overflow: 'auto', margin: '0 0 10px 0', borderRadius: '0 0 ' + UIManager.THEME.borderRadius.lg + ' ' + UIManager.THEME.borderRadius.lg, backgroundColor: '#fff', boxShadow: '0 2px 6px rgba(0,0,0,0.08)' }
    });
    const header = $('div', { css: { position: 'sticky', top: '0', zIndex: '5', padding: UIManager.THEME.spacing.lg, backgroundColor: UIManager.THEME.colors.primary, borderRadius: `${UIManager.THEME.borderRadius.lg} ${UIManager.THEME.borderRadius.lg} 0 0`, color: 'white' } });
    const headerTitle = $('h3', { text: '📄 Select Songs to Export as Text', css: { margin: '0', color: 'white' } });
    header.appendChild(headerTitle);
    const content = $('div', { css: { padding: UIManager.THEME.spacing.lg } });
    let allSelected = false;
    const selectAllContainer = $('div', { css: { marginBottom: '15px', display: 'flex', justifyContent: 'center' } });
    const selectAllBtn = $('button', { text: 'Tout sélectionner', css: { backgroundColor: '#bbb', color: '#222', border: '1px solid #888', borderRadius: '4px', cursor: 'pointer', padding: '6px 18px', fontWeight: 'bold', fontSize: '15px' } });
    function updateSelectAllBtn() { if (allSelected) { selectAllBtn.textContent = 'Tout désélectionner'; selectAllBtn.style.backgroundColor = '#27ae60'; selectAllBtn.style.color = 'white'; } else { selectAllBtn.textContent = 'Tout sélectionner'; selectAllBtn.style.backgroundColor = '#bbb'; selectAllBtn.style.color = '#222'; } }
    updateSelectAllBtn();
    selectAllContainer.appendChild(selectAllBtn);
    let exportSeparateFiles = false;
    const formatContainer = $('div', { css: { marginBottom: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '15px' } });
    const formatLabel = $('span', { text: 'Export format:', css: { fontWeight: 'bold', color: '#333' } });
    const singleFileBtn = $('button', { text: '📄 Single File', css: { padding: '6px 12px', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer', backgroundColor: '#27ae60', color: 'white', fontWeight: 'bold' } });
    const separateFilesBtn = $('button', { text: '📁 Separate Files', css: { padding: '6px 12px', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer', backgroundColor: '#eee', color: '#333' } });
    function updateFormatButtons() { if (exportSeparateFiles) { separateFilesBtn.style.backgroundColor = '#27ae60'; separateFilesBtn.style.color = 'white'; singleFileBtn.style.backgroundColor = '#eee'; singleFileBtn.style.color = '#333'; } else { singleFileBtn.style.backgroundColor = '#27ae60'; singleFileBtn.style.color = 'white'; separateFilesBtn.style.backgroundColor = '#eee'; separateFilesBtn.style.color = '#333'; } }
    singleFileBtn.addEventListener('click', () => { exportSeparateFiles = false; updateFormatButtons(); });
    separateFilesBtn.addEventListener('click', () => { exportSeparateFiles = true; updateFormatButtons(); });
    updateFormatButtons();
    formatContainer.append(formatLabel, singleFileBtn, separateFilesBtn);
    const listContainer = UIManager.createListContainer({});
    const items = songSummaries.map(s => ({ summary: s, selected: false }));
    items.forEach(({ summary }, index) => {
        const fullSong = lyricsLibrary.getSong(summary.key) || lyricsLibrary.getSongById?.(summary.songId);
        if (!fullSong) return;
        const itemDiv = UIManager.createListItem({});
        let selected = false;
        const selectBtn = $('button', { text: 'Sélectionner', css: { marginRight: '10px', backgroundColor: '#eee', border: '1px solid #bbb', borderRadius: '4px', cursor: 'pointer', padding: '4px 10px' } });
        const label = $('span', { text: `${(fullSong.metadata?.title || fullSong.title || 'Untitled')} - ${(fullSong.metadata?.artist || fullSong.artist || 'Unknown Artist')}${(fullSong.metadata?.album || fullSong.album) ? ` (${fullSong.metadata?.album || fullSong.album})` : ''}`, css: { flex: '1', cursor: 'pointer' } });
        function updateBtn() { if (selected) { selectBtn.textContent = 'Sélectionné'; selectBtn.style.backgroundColor = '#27ae60'; selectBtn.style.color = 'white'; } else { selectBtn.textContent = 'Sélectionner'; selectBtn.style.backgroundColor = '#eee'; selectBtn.style.color = '#333'; } }
        updateBtn();
        selectBtn.addEventListener('click', () => { selected = !selected; items[index].selected = selected; updateBtn(); });
        label.addEventListener('click', () => { selected = !selected; items[index].selected = selected; updateBtn(); });
        itemDiv.append(selectBtn, label);
        listContainer.appendChild(itemDiv);
    });
    selectAllBtn.addEventListener('click', () => { allSelected = !allSelected; updateSelectAllBtn(); Array.from(listContainer.children).forEach((div, i) => { const btn = div.querySelector('button'); if (btn) { items[i].selected = allSelected; if (allSelected) { btn.textContent = 'Sélectionné'; btn.style.backgroundColor = '#27ae60'; btn.style.color = 'white'; } else { btn.textContent = 'Sélectionner'; btn.style.backgroundColor = '#eee'; btn.style.color = '#333'; } } }); });
    const footer = $('div', { css: { padding: UIManager.THEME.spacing.lg, backgroundColor: UIManager.THEME.colors.background, borderTop: `1px solid ${UIManager.THEME.colors.border}`, borderRadius: `0 0 ${UIManager.THEME.borderRadius.lg} ${UIManager.THEME.borderRadius.lg}`, display: 'flex', gap: '10px', justifyContent: 'flex-end' } });
    const cancelButton = $('button', { text: 'Cancel', css: { padding: '10px 15px', backgroundColor: '#95a5a6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' } });
    cancelButton.addEventListener('click', () => closeExportPanel());
    const exportButton = $('button', { text: 'Export Selected', css: { padding: '10px 15px', backgroundColor: '#007acc', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' } });
    exportButton.addEventListener('click', () => {
        const selectedIds = items.filter(it => it.selected).map(it => it.summary.songId);
        if (selectedIds.length === 0) { Modal({ title: '❌ No Selection', content: '<p>Please select at least one song to export.</p>', buttons: [{ text: 'OK' }], size: 'small' }); return; }
        if (exportSeparateFiles) { exportSongsAsSeparateFiles(selectedIds); content.innerHTML = ''; content.appendChild($('div', { text: `📁 Starting ${selectedIds.length} downloads...`, css: { fontSize: '14px', color: '#333' } })); }
        else {
            let exportText = `Lyrix Songs Export - ${new Date().toLocaleDateString()}\n`; exportText += `Total Songs: ${selectedIds.length}\n`; exportText += '='.repeat(50) + '\n\n';
            selectedIds.forEach((songId, index) => { const song = lyricsLibrary.getSongById ? lyricsLibrary.getSongById(songId) : null; if (song) { exportText += `${song.metadata?.title || song.title || 'Untitled'}\n\n`; if (song.lines && song.lines.length > 0) { song.lines.forEach(line => { exportText += `${line.text}\n`; }); } else { exportText += '(No lyrics available)\n'; } if (index < selectedIds.length - 1) exportText += '\n\n'; } });
            const filename = `lyrix_songs_${new Date().toISOString().split('T')[0]}.txt`;
            showInlineExportPanel(exportText, filename, 'TEXT');
        }
    });
    content.append(selectAllContainer, formatContainer, listContainer);
    panel.append(header, content, footer);
    displayContainer.insertBefore(panel, lyricsContentArea);
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
    
    // Always show inline export panel; close song library if open
    closeSongLibraryPanel();
    showInlineExportPanel(dataStr, filename, 'LRX');
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
    try { closeSongLibraryPanel(); } catch (e) {}
    showInlineTextExportSelector();
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

// Inline song library helpers
function closeSongLibraryPanel() {
    const panel = document.getElementById('song-library-modal');
    if (panel && panel.parentElement) {
        panel.parentElement.removeChild(panel);
    }
}

function toggleSongLibraryPanel() {
    const existing = document.getElementById('song-library-modal');
    if (existing) {
        closeSongLibraryPanel();
    } else {
        showSongLibrary();
    }
}

// Inline export panel helpers
function closeExportPanel() {
    const panel = document.getElementById('export-inline-panel');
    if (panel && panel.parentElement) {
        panel.parentElement.removeChild(panel);
    }
}

function showInlineExportPanel(dataString, filename, fileType) {
    // Ensure only one export panel
    closeExportPanel();

    const displayContainer = document.getElementById('display-container');
    const lyricsContentArea = document.getElementById('lyrics_content_area');
    if (!displayContainer || !lyricsContentArea) {
        console.error('❌ display-container or lyrics_content_area not found for export panel');
        return;
    }

    const panel = UIManager.createEnhancedModalContainer({
        id: 'export-inline-panel',
        css: {
            maxWidth: '100%',
            width: '100%',
            maxHeight: '50vh',
            overflow: 'auto',
            margin: '0 0 10px 0',
            borderRadius: '0 0 ' + UIManager.THEME.borderRadius.lg + ' ' + UIManager.THEME.borderRadius.lg,
            backgroundColor: '#fff',
            boxShadow: '0 2px 6px rgba(0,0,0,0.08)'
        }
    });

    // Content
    const content = $('div', { css: { padding: UIManager.THEME.spacing.lg } });

    const copyButton = $('button', {
        text: '📋 Copy to Clipboard',
        css: {
            width: '100%', padding: '15px', marginBottom: '10px',
            backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: '8px',
            fontSize: '16px', cursor: 'pointer', fontWeight: 'bold'
        }
    });
    copyButton.addEventListener('click', async () => {
        // Close the panel immediately on action
        try { closeExportPanel(); } catch (_) {}
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(dataString);
            } else {
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
            }
        } catch (err) {
            console.error('Failed to copy to clipboard:', err);
        }
    });

    // Desktop-friendly save button for macOS and others
    const downloadButton = $('button', {
        text: '💾 Save to Disk',
        css: {
            width: '100%', padding: '15px', marginBottom: '10px',
            backgroundColor: '#2ecc71', color: 'white', border: 'none', borderRadius: '8px',
            fontSize: '16px', cursor: 'pointer', fontWeight: 'bold'
        }
    });
    downloadButton.addEventListener('click', async () => {
        // Close the panel immediately on action
        try { closeExportPanel(); } catch (_) {}
        const mime = fileType === 'LRX' ? 'application/json' : 'text/plain';
        const blob = new Blob([dataString], { type: mime });
        const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
        const reset = (text = '💾 Save to Disk') => setTimeout(() => {}, 0);

        // 1) Prefer native system file picker when available (shows a real Save dialog)
        if (window.showSaveFilePicker) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: filename,
                    types: [{
                        description: fileType === 'LRX' ? 'Lyrix Library (*.lrx)' : 'Text (*.txt)',
                        accept: { [mime]: [fileType === 'LRX' ? '.lrx' : '.txt'] }
                    }]
                });
                const writable = await handle.createWritable();
                await writable.write(blob);
                await writable.close();
                return;
            } catch (e) {
                // If user cancels or API fails, fall through to the other strategies
                console.warn('showSaveFilePicker not available or canceled, falling back:', e);
            }
        }

        // 2) Non-Safari: anchor download usually triggers the browser download UI
        try {
            if (!isSafari) {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                return;
            }
        } catch (e) {
            console.warn('Anchor download failed, trying Safari fallback:', e);
        }

        // 3) Safari: open a helper page with a download link and instructions (more reliable Save dialog)
        try {
            const newWindow = window.open('', '_blank');
            if (newWindow) {
                const safeDataUri = `data:${mime};charset=utf-8,${encodeURIComponent(dataString)}`;
                newWindow.document.write(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="utf-8" />
                        <title>Download ${filename}</title>
                        <style>
                            body { font-family: -apple-system, system-ui, Arial, sans-serif; padding: 24px; background: #f6f7f9; }
                            .card { max-width: 700px; margin: 0 auto; background: #fff; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,.08); padding: 24px; }
                            .btn { display: inline-block; padding: 12px 18px; background: #007aff; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 700; }
                            .btn:hover { background: #0063cc; }
                            pre { background: #f1f3f5; padding: 12px; border-radius: 6px; max-height: 240px; overflow: auto; font-size: 12px; }
                            .hint { color: #555; font-size: 14px; line-height: 1.5; }
                        </style>
                    </head>
                    <body>
                        <div class="card">
                            <h2>📁 Save ${fileType} File</h2>
                            <p class="hint">Click the button below. If no dialog appears, right‑click the link and choose “Download Linked File As…”</p>
                            <p><a class="btn" href="${safeDataUri}" download="${filename}">💾 Download ${filename}</a></p>
                            <details>
                                <summary>Preview first 1KB</summary>
                                <pre>${dataString.substring(0, 1000).replace(/[&<>]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[s]))}${dataString.length > 1000 ? '\n...\n[truncated]' : ''}</pre>
                            </details>
                        </div>
                    </body>
                    </html>
                `);
                newWindow.document.close();
                return;
            }
        } catch (e) {
            console.warn('Safari helper window failed, using data URI fallback:', e);
        }

        // 4) Last resort: fire a data URI download or show content viewer
        try {
            const a = document.createElement('a');
            a.href = `data:${mime};charset=utf-8,${encodeURIComponent(dataString)}`;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } catch (err2) {
            console.error('All download methods failed, showing viewer:', err2);
            // As a last resort we skip viewer since panel is already closed
        }
    });

    const shareButton = $('button', {
        text: '📤 Share File',
        css: {
            width: '100%', padding: '15px', marginBottom: '10px',
            backgroundColor: '#9b59b6', color: 'white', border: 'none', borderRadius: '8px',
            fontSize: '16px', cursor: 'pointer', fontWeight: 'bold'
        }
    });
    shareButton.addEventListener('click', async () => {
        // Close the panel immediately on action
        try { closeExportPanel(); } catch (_) {}
        try {
            if (navigator.share) {
                const blob = new Blob([dataString], { type: fileType === 'LRX' ? 'application/json' : 'text/plain' });
                const file = new File([blob], filename, { type: fileType === 'LRX' ? 'application/json' : 'text/plain' });
                await navigator.share({ title: `Lyrix ${fileType} Export`, text: `Exported ${fileType} file from Lyrix`, files: [file] });
            } else {
                const blob = new Blob([dataString], { type: fileType === 'LRX' ? 'application/json' : 'text/plain' });
                const url = URL.createObjectURL(blob);
                const newWindow = window.open(url, '_blank');
                if (!newWindow) {
                    const downloadLink = document.createElement('a');
                    downloadLink.href = url;
                    downloadLink.download = filename;
                    downloadLink.click();
                }
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            }
        } catch (err) {
            console.error('Failed to share:', err);
        }
    });

    const info = $('div', {
        text: `Filename: ${filename}`,
        css: { fontSize: '12px', color: '#666', marginBottom: '10px' }
    });

    content.append(info, copyButton, downloadButton, shareButton);

    // Panel contains content only (no header/footer)
    panel.append(content);
    displayContainer.insertBefore(panel, lyricsContentArea);
}

// Show song library as an inline panel that pushes lyrics down
function showSongLibrary() {
    console.log('📚 Opening song library...');
    console.log('🎹 MIDI utilities available:', !!window.midiUtilities);

    // Prevent duplicates by closing any existing panel first
    closeSongLibraryPanel();

    const displayContainer = document.getElementById('display-container');
    const lyricsContentArea = document.getElementById('lyrics_content_area');
    if (!displayContainer || !lyricsContentArea) {
        console.error('❌ display-container or lyrics_content_area not found');
        return;
    }

    // Songs source
    const songs = lyricsLibrary.getAllSongs();

    // Panel container (no overlay)
    const modal = UIManager.createEnhancedModalContainer({
        id: 'song-library-modal',
        css: {
            maxWidth: '100%',
            width: '100%',
            maxHeight: '45vh',
            overflow: 'auto',
            margin: '0 0 10px 0',
            borderRadius: '0 0 ' + UIManager.THEME.borderRadius.lg + ' ' + UIManager.THEME.borderRadius.lg,
            backgroundColor: '#fff',
            boxShadow: '0 2px 6px rgba(0,0,0,0.08)'
        }
    });

    // Header with title and action buttons
    const header = $('div', {
        css: {
            position: 'sticky',
            top: '0',
            zIndex: '5',
            backgroundColor: UIManager.THEME.colors.primary,
            borderRadius: `${UIManager.THEME.borderRadius.lg} ${UIManager.THEME.borderRadius.lg} 0 0`,
            borderBottom: `1px solid ${UIManager.THEME.colors.border}`,
            color: 'white',
            padding: '10px'
        }
    });
    const headerTop = $('div', {
        css: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '10px'
        }
    });

    const headerTitle = $('h3', {
        id: 'song-library-header',
        css: { margin: '0', color: 'white' }
    });

    // Action buttons container
    const actionButtons = $('div', {
        css: {
            display: 'flex',
            gap: '8px',
            flexWrap: 'wrap'
        }
    });

    // Create new song button
    const createNewSongButton = $('button', {
        id: 'create_new_song_button',
        text: '➕ New',
        css: {
            backgroundColor: '#2ecc71',
            color: 'white',
            border: 'none',
            padding: '6px 12px',
            borderRadius: '4px',
            fontSize: '12px',
            cursor: 'pointer'
        },
        onClick: () => {
            closeSongLibraryPanel();
            createNewSong();
        }
    });

    // Export all to LRX button
    const exportLRXButton = $('button', {
          id: 'export-lrx-format',
        text: '💾 Save',
        css: {
            backgroundColor: '#27ae60',
            color: 'white',
            border: 'none',
            padding: '6px 12px',
            borderRadius: '4px',
            fontSize: '12px',
            cursor: 'pointer'
        },
        onClick: () => {
            closeSongLibraryPanel();
            exportAllSongsToLRX(); // Direct download, no dialog
        }
    });

    // Export selected as text button
    const exportTextButton = $('button', {
        id: 'export-songs-as-text',
        text: 'save txt',
        css: {
            backgroundColor: '#3498db',
            color: 'white',
            border: 'none',
            padding: '6px 12px',
            borderRadius: '4px',
            fontSize: '12px',
            cursor: 'pointer'
        },
        onClick: () => {
            closeSongLibraryPanel();
            exportSelectedSongsAsTextWithFolderDialog();
        }
    });

    // Import file button - moved from toolbar to song library panel
    const importFileButton = $('button', {
        id: 'import_file_button_library',
        text: '📁 Import',
        css: {
            backgroundColor: '#f39c12',
            color: 'white',
            border: 'none',
            padding: '6px 12px',
            borderRadius: '4px',
            fontSize: '12px',
            cursor: 'pointer'
        },
        onClick: () => {
            closeSongLibraryPanel();
            showFileImportDialog();
        }
    });

    // Auto Fill MIDI container
    const autoFillContainer = $('div', {
        css: {
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            backgroundColor: '#f8f9fa',
            padding: '4px 8px',
            borderRadius: '4px',
            border: '1px solid #ddd'
        }
    });

    const autoFillLabel = $('span', {
        //text: '',
        css: {
            fontSize: '11px',
            color: '#666',
            fontWeight: '500'
        }
    });

    const autoFillInput = $('input', {
        type: 'number',
        min: '0',
        max: '127',
        placeholder: 'Root',
        value: '60', // Default to middle C
        css: {
            width: '50px',
            padding: '2px 4px',
            border: '1px solid #ccc',
            borderRadius: '3px',
            fontSize: '11px',
            textAlign: 'center'
        }
    });

    const autoFillButton = $('button', {
        text: '🎹 Fill',
        css: {
            backgroundColor: '#4caf50',
            color: 'white',
            border: 'none',
            padding: '4px 8px',
            borderRadius: '3px',
            fontSize: '11px',
            cursor: 'pointer'
        },
        onClick: () => {
            autoFillMidiNotes();
        }
    });

    autoFillContainer.append(autoFillLabel, autoFillInput, autoFillButton);

    // Sort alphabetically button
    const sortAlphabeticallyButton = $('button', {
        text: '🔤 Sort A-Z',
        css: {
            backgroundColor: '#9c27b0',
            color: 'white',
            border: 'none',
            padding: '6px 12px',
            borderRadius: '4px',
            fontSize: '12px',
            cursor: 'pointer'
        },
        onClick: () => {
            sortSongsAlphabetically();
        }
    });

    // Bouton supprimer toutes les chansons
    const deleteAllButton = $('button', {
        text: '🗑️',
        css: {
            backgroundColor: '#e74c3c',
            color: 'white',
            border: 'none',
            padding: '6px 12px',
            borderRadius: '4px',
            fontSize: '12px',
            cursor: 'pointer'
        },
        onClick: () => {
            Modal({
                title: 'Confirmation',
                content: '<p>Voulez-vous vraiment supprimer toutes les chansons ? Cette action est irréversible.</p>',
                buttons: [
                    { text: 'Annuler' },
                    { text: 'Supprimer', onClick: () => {
                        lyricsLibrary.deleteAllSongs();
                        closeSongLibraryPanel();
                        showSongLibrary(); // Reopen inline panel to show it's now empty
                    }, css: { backgroundColor: '#e74c3c', color: 'white' } }
                ],
                size: 'small'
            });
        }
    });
    actionButtons.append(createNewSongButton, importFileButton, exportLRXButton, exportTextButton, autoFillContainer, sortAlphabeticallyButton, deleteAllButton);
    headerTop.append(headerTitle, actionButtons);

    // // Instructions
    // const instructions = $('div', {
    //     text: 'Select a song to load, or use the action buttons above',
    //     css: {
    //         fontSize: '14px',
    //         opacity: '0.9',
    //         fontStyle: 'italic'
    //     }
    // });

    header.append(headerTop);

    // Content with search and song list
    const content = UIManager.createModalContent({});
    
    // // Search input
    // const searchInput = $('input', {
    //     type: 'text',
    //     placeholder: 'Search songs...',
    //     css: {
    //         width: '100%',
    //         padding: '10px',
    //         border: '1px solid #ddd',
    //         borderRadius: '4px',
    //         marginBottom: '15px',
    //         fontSize: '14px',
    //         boxSizing: 'border-box'
    //     }
    // });

    // Song list container
    const listContainer = UIManager.createListContainer({});
    // Add an id to the div containing all song list elements
    try { listContainer.id = 'song-list'; } catch (_) {}
    
    // Prepare items for display
    const songItems = songs.map(song => ({
        text: `${(song.metadata?.title || song.title || 'Untitled')} - ${(song.metadata?.artist || song.artist || 'Unknown Artist')}${(song.metadata?.album || song.album) ? ` (${song.metadata?.album || song.album})` : ''}`,
        value: song.key,
        song: song
    }));

    let filteredItems = [...songItems];

    // Functions to manage custom song order persistence
    function saveCustomSongOrder() {
        const orderData = filteredItems.map((item, index) => ({
            songKey: item.value,
            order: index
        }));
        localStorage.setItem('lyrix_custom_song_order', JSON.stringify(orderData));
        console.log('💾 Custom song order saved to localStorage');
    }

    function loadCustomSongOrder() {
        try {
            const savedOrder = localStorage.getItem('lyrix_custom_song_order');
            if (!savedOrder) {
                console.log('📋 No custom song order found, using default');
                return;
            }

            const orderData = JSON.parse(savedOrder);
            const orderMap = new Map();
            orderData.forEach(item => {
                orderMap.set(item.songKey, item.order);
            });

            // Separate songs with saved order from new songs
            const songsWithOrder = [];
            const newSongs = [];
            
            filteredItems.forEach(item => {
                if (orderMap.has(item.value)) {
                    songsWithOrder.push({
                        ...item,
                        savedOrder: orderMap.get(item.value)
                    });
                } else {
                    newSongs.push(item);
                }
            });

            // Sort songs with saved order
            songsWithOrder.sort((a, b) => a.savedOrder - b.savedOrder);
            
            // Combine: ordered songs first, then new songs at the end
            filteredItems = [
                ...songsWithOrder.map(item => ({ ...item, savedOrder: undefined })),
                ...newSongs
            ];

            console.log(`📋 Custom song order loaded: ${songsWithOrder.length} ordered songs, ${newSongs.length} new songs`);
        } catch (error) {
            console.error('❌ Error loading custom song order:', error);
        }
    }

    // Load custom order on initialization
    loadCustomSongOrder();

    // Function to refresh all MIDI input values
    function refreshMidiInputs() {
        if (!window.midiUtilities) return;
        
        const midiInputs = listContainer.querySelectorAll('input[data-song-key]');
        midiInputs.forEach(input => {
            const songKey = input.getAttribute('data-song-key');
            const midiNote = window.midiUtilities.getMidiAssignment(songKey);
            input.value = midiNote || '';
        });
    }

    // Function to sort songs alphabetically
    function sortSongsAlphabetically() {
        filteredItems.sort((a, b) => {
            const titleA = (a.song.metadata?.title || a.song.title || 'Untitled').toLowerCase();
            const titleB = (b.song.metadata?.title || b.song.title || 'Untitled').toLowerCase();
            return titleA.localeCompare(titleB);
        });
        updateSongList();
        setTimeout(() => refreshMidiInputs(), 50);
        saveCustomSongOrder(); // Save the new order
        console.log('🔤 Songs sorted alphabetically and order saved');
    }

    // Function to auto-fill MIDI notes starting from root note
    function autoFillMidiNotes() {
        if (!window.midiUtilities) {
            console.error('❌ MIDI utilities not available');
            Modal({
                title: '❌ Error',
                content: '<p>MIDI utilities not available</p>',
                buttons: [{ text: 'OK' }],
                size: 'small'
            });
            return;
        }

        const rootNoteStr = autoFillInput.value.trim();
        if (!rootNoteStr) {
            console.error('❌ Root note not specified');
            Modal({
                title: '❌ Error',
                content: '<p>Please enter a root note (0-127)</p>',
                buttons: [{ text: 'OK' }],
                size: 'small'
            });
            return;
        }

        const rootNote = parseInt(rootNoteStr);
        if (isNaN(rootNote) || rootNote < 0 || rootNote > 127) {
            console.error('❌ Invalid root note');
            Modal({
                title: '❌ Error',
                content: '<p>Root note must be between 0 and 127</p>',
                buttons: [{ text: 'OK' }],
                size: 'small'
            });
            return;
        }

        // Perform auto-fill directly
        performAutoFill(rootNote);
    }

    // Function to perform the actual auto-fill
    function performAutoFill(rootNote) {
        let assignedCount = 0;
        let skippedCount = 0;

        filteredItems.forEach((item, index) => {
            const midiNote = rootNote + index;
            
            // Check if MIDI note is in valid range
            if (midiNote > 127) {
                console.warn(`⚠️ Skipping ${item.song.title}: MIDI note ${midiNote} exceeds 127`);
                skippedCount++;
                return;
            }

            try {
                // Remove any existing assignment for this song
                window.midiUtilities.removeMidiAssignment(item.value);
                
                // Set new assignment
                window.midiUtilities.setMidiAssignment(item.value, midiNote);
                assignedCount++;
                
                console.log(`🎹 Auto-assigned: ${item.song.title} -> Note ${midiNote}`);
            } catch (error) {
                console.error(`❌ Error assigning MIDI note to ${item.song.title}:`, error);
                skippedCount++;
            }
        });

        // Refresh MIDI inputs in the UI
        setTimeout(() => refreshMidiInputs(), 100);

        console.log(`🎹 Auto-fill complete: ${assignedCount} assigned, ${skippedCount} skipped`);
    }

    function updateSongList() {
        listContainer.innerHTML = '';
        
        // Check if there are no songs to display
        if (filteredItems.length === 0) {
            const emptyMessage = $('div', {
                css: {
                    textAlign: 'center',
                    padding: '40px 20px',
                    color: '#666',
                    fontSize: '16px'
                }
            });
            
            const emptyIcon = $('div', {
                text: '🎵',
                css: {
                    fontSize: '48px',
                    marginBottom: '15px'
                }
            });
            
            const emptyText = $('div', {
                text: songs.length === 0 ? 
                    'No songs in your library yet.\nUse the buttons above to create a new song or import existing ones.' : 
                    'No songs match your search.',
                css: {
                    lineHeight: '1.6',
                    whiteSpace: 'pre-line'
                }
            });
            
            emptyMessage.append(emptyIcon, emptyText);
            listContainer.appendChild(emptyMessage);
            return;
        }
        
        filteredItems.forEach((item, index) => {
            const itemDiv = UIManager.createListItem({});
            
            // Add drag and drop functionality
            itemDiv.draggable = true;
            itemDiv.dataset.songIndex = index;
            itemDiv.style.cursor = 'grab';
            
            // Add drag handle visual indicator
            const dragHandle = $('span', {
                text: '⋮⋮',
                css: {
                    marginRight: '8px',
                    color: '#999',
                    fontSize: '14px',
                    cursor: 'grab',
                    userSelect: 'none'
                }
            });
            
            const textSpan = UIManager.createListItemText({
                text: item.text
            });

            // MIDI controls container
            const midiControls = $('div', {
                css: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    marginLeft: '10px'
                }
            });

            // MIDI note input box - get fresh value each time the list is updated
            let currentMidiNote = null;
            if (window.midiUtilities) {
                currentMidiNote = window.midiUtilities.getMidiAssignment(item.value);
            }
            
            const midiInput = $('input', {
                type: 'number',
                min: '0',
                max: '127',
                placeholder: 'Note',
                value: currentMidiNote || '',
                css: {
                    width: '50px',
                    padding: '2px 4px',
                    border: '1px solid #ccc',
                    borderRadius: '3px',
                    fontSize: '11px',
                    textAlign: 'center'
                }
            });
            
            // Store reference to input for updating
            midiInput.setAttribute('data-song-key', item.value);

            // Update MIDI assignment when input changes
            midiInput.addEventListener('change', (e) => {
                e.stopPropagation();
                const midiNote = parseInt(e.target.value);
                if (window.midiUtilities && !isNaN(midiNote) && midiNote >= 0 && midiNote <= 127) {
                    // Remove any existing assignment for this song
                    window.midiUtilities.removeMidiAssignment(item.value);
                    // Set new assignment
                    window.midiUtilities.setMidiAssignment(item.value, midiNote);
                    console.log(`🎹 Manual MIDI assignment: Note ${midiNote} -> ${item.song.title}`);
                } else if (window.midiUtilities && e.target.value === '') {
                    // Remove assignment if input is cleared
                    window.midiUtilities.removeMidiAssignment(item.value);
                    console.log(`🎹 MIDI assignment removed for: ${item.song.title}`);
                }
            });

            // MIDI learn button
            const midiLearnButton = $('button', {
                text: '🎹',
                css: {
                    width: '25px',
                    height: '25px',
                    border: '1px solid #007acc',
                    borderRadius: '3px',
                    backgroundColor: '#f0f8ff',
                    color: '#007acc',
                    cursor: 'pointer',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0'
                },
                title: `Learn MIDI note for ${item.song.title}`
            });

            // MIDI learn functionality
            midiLearnButton.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!window.midiUtilities) {
                    console.error('❌ MIDI utilities not available');
                    return;
                }

                if (window.midiUtilities.isLearning) {
                    // Stop learning
                    window.midiUtilities.stopMidiLearn();
                    midiLearnButton.style.backgroundColor = '#f0f8ff';
                    midiLearnButton.style.color = '#007acc';
                    midiLearnButton.textContent = '🎹';
                    console.log('🎹 MIDI learn stopped');
                } else {
                    // Start learning
                    midiLearnButton.style.backgroundColor = '#ff6b6b';
                    midiLearnButton.style.color = 'white';
                    midiLearnButton.textContent = '⏹️';
                    console.log(`🎹 MIDI learn started for: ${item.song.title}`);
                    
                    window.midiUtilities.startMidiLearn((midiNote) => {
                        console.log(`🎹 MIDI learn callback triggered with note: ${midiNote}`);
                        // Remove any existing assignment for this song
                        window.midiUtilities.removeMidiAssignment(item.value);
                        // Set new assignment
                        window.midiUtilities.setMidiAssignment(item.value, midiNote);
                        // Update input field
                        midiInput.value = midiNote;
                        // Reset button appearance
                        midiLearnButton.style.backgroundColor = '#f0f8ff';
                        midiLearnButton.style.color = '#007acc';
                        midiLearnButton.textContent = '🎹';
                        console.log(`🎹 MIDI learn completed: Note ${midiNote} -> ${item.song.title}`);
                    });
                }
            });

            midiControls.append(midiInput, midiLearnButton);

            // Delete button
            const deleteButton = UIManager.createDeleteButton({
                onClick: (e) => {
                    e.stopPropagation();
                    
                    ConfirmModal({
                        title: '🗑️ Delete Song',
                        message: `Are you sure you want to delete "${item.song.title}" by ${item.song.artist}?`,
                        confirmText: 'Delete',
                        cancelText: 'Cancel',
                        onConfirm: () => {
                            try {
                                // Remove MIDI assignment when deleting song
                                if (window.midiUtilities) {
                                    window.midiUtilities.removeMidiAssignment(item.value);
                                }
                                const success = lyricsLibrary.deleteSong(item.value);
                                if (success) {
                                    closeSongLibraryPanel();
                                    showSongLibrary();
                                } else {
                                    console.error('❌ Failed to delete song');
                                }
                            } catch (error) {
                                console.error('❌ Error deleting song:', error);
                            }
                        }
                    });
                }
            });

            // Controls container for MIDI and delete buttons
            const controlsContainer = $('div', {
                css: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                }
            });

            controlsContainer.append(midiControls, deleteButton);

            // Click handler for song selection
            itemDiv.addEventListener('click', (e) => {
                if (e.target !== deleteButton && 
                    e.target !== midiLearnButton && 
                    e.target !== midiInput && 
                    e.target !== dragHandle &&
                    !midiControls.contains(e.target)) {
                    closeSongLibraryPanel();
                    loadAndDisplaySong(item.value);
                }
            });

            // Drag and drop event handlers
            itemDiv.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', index);
                itemDiv.style.opacity = '0.5';
                itemDiv.style.cursor = 'grabbing';
            });

            itemDiv.addEventListener('dragend', (e) => {
                itemDiv.style.opacity = '1';
                itemDiv.style.cursor = 'grab';
            });

            itemDiv.addEventListener('dragover', (e) => {
                e.preventDefault();
                itemDiv.style.borderTop = '2px solid #007acc';
            });

            itemDiv.addEventListener('dragleave', (e) => {
                itemDiv.style.borderTop = '';
            });

            itemDiv.addEventListener('drop', (e) => {
                e.preventDefault();
                itemDiv.style.borderTop = '';
                const draggedIndex = parseInt(e.dataTransfer.getData('text/plain'));
                const targetIndex = index;
                
                if (draggedIndex !== targetIndex) {
                    // Reorder the filteredItems array
                    const draggedItem = filteredItems[draggedIndex];
                    filteredItems.splice(draggedIndex, 1);
                    filteredItems.splice(targetIndex, 0, draggedItem);
                    
                    // Update the display
                    updateSongList();
                    setTimeout(() => refreshMidiInputs(), 50);
                    saveCustomSongOrder(); // Save the new order
                    console.log(`🔄 Moved song from position ${draggedIndex} to ${targetIndex} and saved order`);
                }
            });

            itemDiv.append(dragHandle, textSpan, controlsContainer);
            listContainer.appendChild(itemDiv);
        });
    }

    // // Search functionality
    // searchInput.addEventListener('input', (e) => {
    //     const searchTerm = e.target.value.toLowerCase();
    //     filteredItems = songItems.filter(item => 
    //         item.text.toLowerCase().includes(searchTerm)
    //     );
    //     updateSongList();
    //     // Refresh MIDI inputs after search
    //     setTimeout(() => refreshMidiInputs(), 50);
    // });

    content.append( listContainer);
    updateSongList();
    
    // Refresh MIDI inputs after DOM is ready
    setTimeout(() => {
        refreshMidiInputs();
        console.log('🎹 MIDI inputs refreshed in song library');
    }, 100);

    // Assemble inline panel (no footer/close button)
    modal.append(header, content);

    // Insert above lyrics_content_area so it pushes it down
    displayContainer.insertBefore(modal, lyricsContentArea);

    // Focus search input shortly after insert
}

// Show settings modal with MIDI fullscreen assignments
function showSettingsModal() {
    
    // Create settings content
    const settingsContent = $('div', {
        css: {
            padding: '20px',
            maxWidth: '400px'
        }
    });

    // Title
    // const title = $('h3', {
    //     text: 'Settings - MIDI Control, UI Visibility & Timecode Options',
    //     css: {
    //         margin: '0 0 20px 0',
    //         color: '#333',
    //         textAlign: 'center'
    //     }
    // });

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
            marginBottom: '5px',
            color: '#1976D2'
        }
    });

    // Experimental warning
    const audioWarning = $('div', {
        text: '⚠️ EXPERIMENTAL FEATURE - NOT RECOMMENDED FOR USE',
        css: {
            fontSize: '11px',
            color: '#ff5722',
            fontWeight: '600',
            marginBottom: '10px',
            padding: '4px 8px',
            backgroundColor: '#fff3e0',
            borderRadius: '3px',
            border: '1px solid #ff9800',
            textAlign: 'center'
        }
    });

    const audioDisclaimer = $('div', {
        text: 'This feature is unstable and may cause interface issues. Use at your own risk.',
        css: {
            fontSize: '10px',
            color: '#666',
            fontStyle: 'italic',
            marginBottom: '10px',
            textAlign: 'center'
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
    audioSection.append(audioTitle, audioWarning, audioDisclaimer, audioContainer);

    // Audio Sync section
    const syncSection = $('div', {
        css: {
            marginBottom: '20px',
            padding: '15px',
            backgroundColor: '#fff3e0',
            borderRadius: '5px',
            border: '1px solid #ff9800'
        }
    });

    const syncTitle = $('h4', {
        text: '⚠️ EXPERIMENTAL FEATURES',
        css: {
            fontSize: '16px',
            marginBottom: '5px',
            color: '#e65100'
        }
    });

    // Subtitle for sync section
    const syncSubtitle = $('div', {
        text: '🔄 Audio Sync with Host Timecode',
        css: {
            fontSize: '14px',
            marginBottom: '10px',
            color: '#e65100',
            fontWeight: '500'
        }
    });

    // Experimental warning for sync
    const syncWarning = $('div', {
        text: '⚠️ EXPERIMENTAL FEATURE - REQUIRES HOST APPLICATION SUPPORT',
        css: {
            fontSize: '11px',
            color: '#d84315',
            fontWeight: '600',
            marginBottom: '10px',
            padding: '4px 8px',
            backgroundColor: '#fbe9e7',
            borderRadius: '3px',
            border: '1px solid #f44336',
            textAlign: 'center'
        }
    });

    const syncDisclaimer = $('div', {
        text: 'This feature attempts to sync audio playback with host application timecode. May not work in all environments.',
        css: {
            fontSize: '10px',
            color: '#666',
            fontStyle: 'italic',
            marginBottom: '10px',
            textAlign: 'center'
        }
    });

    const syncContainer = $('div', {
        css: {
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '10px'
        }
    });

    // Load current sync state from localStorage
    const isSyncEnabled = localStorage.getItem('lyrix_audio_sync_enabled') === 'true';

    const syncButton = UIManager.createInterfaceButton(
        isSyncEnabled ? '✅' : '❌', 
        {
            onClick: () => toggleAudioSync(syncButton, syncLabel)
        }
    );

    const syncLabel = $('span', {
        text: isSyncEnabled ? 'Host Sync Enabled' : 'Host Sync Disabled',
        css: {
            fontSize: '14px',
            color: '#e65100',
            fontWeight: '500'
        }
    });

    syncContainer.append(syncButton, syncLabel);

    // Test sync container
    const testSyncContainer = $('div', {
        css: {
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginTop: '10px'
        }
    });

    const testPlayButton = UIManager.createInterfaceButton('▶️', {
        onClick: () => {
            console.log('🔄 Testing host sync - simulating timecode progression');
            const timecodeDisplay = document.getElementById('timecode-display');
            if (timecodeDisplay) {
                // Simulate timecode progression
                let time = 0;
                const interval = setInterval(() => {
                    time += 0.1;
                    timecodeDisplay.textContent = `${time.toFixed(3)}s`;
                    if (time >= 2) {
                        clearInterval(interval);
                    }
                }, 100);
            } else {
                console.warn('⚠️ Host timecode display not found for test');
            }
        }
    });

    const testStopButton = UIManager.createInterfaceButton('⏹️', {
        onClick: () => {
            console.log('🔄 Testing host sync - simulating timecode stop');
            const timecodeDisplay = document.getElementById('timecode-display');
            if (timecodeDisplay) {
                // Keep timecode static to simulate stop
                const currentTime = timecodeDisplay.textContent;
                setTimeout(() => {
                    timecodeDisplay.textContent = currentTime; // Keep same time
                }, 1000);
            } else {
                console.warn('⚠️ Host timecode display not found for test');
            }
        }
    });

    const testLabel = $('span', {
        text: 'Test sync manually',
        css: {
            fontSize: '12px',
            color: '#666',
            fontStyle: 'italic'
        }
    });

    testSyncContainer.append(testPlayButton, testStopButton, testLabel);

    syncSection.append(syncTitle, syncSubtitle, syncWarning, syncDisclaimer, syncContainer, testSyncContainer);

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

    // Timecode Display section
    const timecodeDisplaySection = $('div', {
        css: {
            marginBottom: '20px',
            padding: '15px',
            backgroundColor: '#e8f5e8',
            borderRadius: '5px',
            border: '1px solid #4caf50'
        }
    });

    const timecodeDisplayTitle = $('div', {
        text: '🕐 Timecode Display',
        css: {
            fontWeight: 'bold',
            marginBottom: '10px',
            color: '#2e7d32'
        }
    });

    const timecodeDisplayContainer = $('div', {
        css: {
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '10px'
        }
    });

    // Load current state from localStorage
    const isTimecodeDisplayVisible = localStorage.getItem('lyrix_timecode_display_visible') === 'true'; // Default to false (hidden)

    const timecodeDisplayButton = UIManager.createInterfaceButton(
        isTimecodeDisplayVisible ? '✅' : '❌', 
        {
            onClick: () => toggleTimecodeDisplayVisibility(timecodeDisplayButton, timecodeDisplayLabel)
        }
    );

    const timecodeDisplayLabel = $('span', {
        text: isTimecodeDisplayVisible ? 'Timecode Display Visible' : 'Timecode Display Hidden',
        css: {
            fontSize: '14px',
            color: '#2e7d32',
            fontWeight: '500'
        }
    });

    timecodeDisplayContainer.append(timecodeDisplayButton, timecodeDisplayLabel);

    timecodeDisplaySection.append(timecodeDisplayTitle, timecodeDisplayContainer);

    // Timecode Options section
    const timecodeOptionsSection = $('div', {
        css: {
            marginBottom: '20px',
            padding: '15px',
            backgroundColor: '#e3f2fd',
            borderRadius: '5px',
            border: '1px solid #2196f3'
        }
    });

    const timecodeOptionsTitle = $('div', {
        text: '⏱️ Timecode Options',
        css: {
            fontWeight: 'bold',
            marginBottom: '10px',
            color: '#1976d2'
        }
    });

    const timecodeOptionsContainer = $('div', {
        css: {
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
        }
    });

    // Show/Hide Timecodes toggle
    const showTimecodesContainer = $('div', {
        css: {
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
        }
    });

    const showTimecodesButton = UIManager.createInterfaceButton(
        lyricsDisplay?.showTimecodes ? '✅' : '❌',
        {
            onClick: () => {
                if (lyricsDisplay) {
                    lyricsDisplay.toggleTimecodes();
                    showTimecodesButton.textContent = lyricsDisplay.showTimecodes ? '✅' : '❌';
                    showTimecodesLabel.textContent = lyricsDisplay.showTimecodes ? 'Timecodes Visible' : 'Timecodes Hidden';
                }
            }
        }
    );

    const showTimecodesLabel = $('span', {
        text: lyricsDisplay?.showTimecodes ? 'Timecodes Visible' : 'Timecodes Hidden',
        css: {
            fontSize: '14px',
            color: '#1976d2',
            fontWeight: '500'
        }
    });

    showTimecodesContainer.append(showTimecodesButton, showTimecodesLabel);

    // Clear All Timecodes button
    const clearTimecodesContainer = $('div', {
        css: {
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
        }
    });

    const clearAllTimecodesButton = UIManager.createInterfaceButton('🗑️', {
        onClick: () => {
            console.log('🗑️ Clear all timecodes button clicked');
            console.log('🔍 Debug info:', {
                lyricsDisplay: !!lyricsDisplay,
                currentLyrics: !!(lyricsDisplay && lyricsDisplay.currentLyrics),
                songId: lyricsDisplay?.currentLyrics?.songId,
                linesCount: lyricsDisplay?.currentLyrics?.lines?.length
            });
            
            if (lyricsDisplay && lyricsDisplay.currentLyrics && lyricsDisplay.currentLyrics.clearAllTimecodes) {
                // Show confirmation modal instead of system confirm
                ConfirmModal({
                    title: '🗑️ Clear All Timecodes',
                    message: `Are you sure you want to remove all timecodes from "${lyricsDisplay.currentLyrics.title || 'current song'}"?\n\nThis action cannot be undone.`,
                    confirmText: 'Clear All',
                    cancelText: 'Cancel',
                    confirmStyle: 'danger',
                    onConfirm: () => {
                    console.log('🗑️ User confirmed, clearing timecodes...');
                    lyricsDisplay.currentLyrics.clearAllTimecodes();
                    
                    // Save to localStorage
                    const saveSuccess = StorageManager.saveSong(lyricsDisplay.currentLyrics.songId, lyricsDisplay.currentLyrics);
                    if (saveSuccess) {
                        console.log('✅ Cleared all timecodes saved to localStorage successfully');
                    } else {
                        console.error('❌ Failed to save cleared timecodes to localStorage');
                    }
                    
                    // Force re-render of lyrics to show the changes
                    if (lyricsDisplay.renderLyrics) {
                        lyricsDisplay.renderLyrics();
                        console.log('� Lyrics re-rendered after clearing timecodes');
                    } else {
                        console.error('❌ renderLyrics method not found');
                    }
                    
                    console.log('�🗑️ All timecodes cleared from settings');
                    },
                    onCancel: () => {
                        console.log('❌ User cancelled clearing timecodes');
                    }
                });
            } else {
                console.error('❌ Debug info:', {
                    lyricsDisplay: !!lyricsDisplay,
                    currentLyrics: !!(lyricsDisplay && lyricsDisplay.currentLyrics),
                    clearAllTimecodes: !!(lyricsDisplay && lyricsDisplay.currentLyrics && lyricsDisplay.currentLyrics.clearAllTimecodes)
                });
                // Use custom modal instead of system alert for Tauri compatibility
                Modal({
                    title: '⚠️ No Lyrics Available',
                    content: $('div', {
                        text: 'No lyrics loaded to clear timecodes from, or method not available.',
                        css: { padding: '10px', textAlign: 'center' }
                    }),
                    buttons: [
                        {
                            text: 'OK',
                            style: 'primary',
                            action: () => {} // Just close modal
                        }
                    ]
                });
            }
        }
    });

    const clearTimecodesLabel = $('span', {
        text: 'Remove all timecodes from current song',
        css: {
            fontSize: '12px',
            color: '#666',
            fontStyle: 'italic'
        }
    });

    clearTimecodesContainer.append(clearAllTimecodesButton, clearTimecodesLabel);

    timecodeOptionsContainer.append(showTimecodesContainer, clearTimecodesContainer);
    timecodeOptionsSection.append(timecodeOptionsTitle, timecodeOptionsContainer);

    // Metadata Display Options section
    const metadataOptionsSection = $('div', {
        css: {
            marginBottom: '20px',
            padding: '15px',
            backgroundColor: '#f8f4ff',
            borderRadius: '5px',
            border: '1px solid #e0d4f7'
        }
    });

    const metadataOptionsTitle = $('div', {
        text: 'Metadata Display Options',
        css: {
            fontWeight: 'bold',
            marginBottom: '15px',
            color: '#6a1b9a',
            fontSize: '16px'
        }
    });

    const metadataOptionsContainer = $('div', {
        css: {
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
        }
    });

    // Show/Hide Title toggle
    const showTitleContainer = $('div', {
        css: {
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
        }
    });

    const showTitleButton = UIManager.createInterfaceButton(
        lyricsDisplay?.showTitle ? '✅' : '❌',
        {
            onClick: () => {
                if (lyricsDisplay) {
                    lyricsDisplay.toggleTitle();
                    showTitleButton.textContent = lyricsDisplay.showTitle ? '✅' : '❌';
                    showTitleLabel.textContent = lyricsDisplay.showTitle ? 'Title Visible' : 'Title Hidden';
                }
            }
        }
    );

    const showTitleLabel = $('span', {
        text: lyricsDisplay?.showTitle ? 'Title Visible' : 'Title Hidden',
        css: {
            fontSize: '14px',
            color: '#6a1b9a',
            fontWeight: '500'
        }
    });

    showTitleContainer.append(showTitleLabel, showTitleButton);

    // Show/Hide Artist toggle
    const showArtistContainer = $('div', {
        css: {
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
        }
    });

    const showArtistButton = UIManager.createInterfaceButton(
        lyricsDisplay?.showArtist ? '✅' : '❌',
        {
            onClick: () => {
                if (lyricsDisplay) {
                    lyricsDisplay.toggleArtist();
                    showArtistButton.textContent = lyricsDisplay.showArtist ? '✅' : '❌';
                    showArtistLabel.textContent = lyricsDisplay.showArtist ? 'Artist Visible' : 'Artist Hidden';
                }
            }
        }
    );

    const showArtistLabel = $('span', {
        text: lyricsDisplay?.showArtist ? 'Artist Visible' : 'Artist Hidden',
        css: {
            fontSize: '14px',
            color: '#6a1b9a',
            fontWeight: '500'
        }
    });

    showArtistContainer.append(showArtistLabel, showArtistButton);

    metadataOptionsContainer.append(showTitleContainer, showArtistContainer);
    metadataOptionsSection.append(metadataOptionsTitle, metadataOptionsContainer);

    // Font Size Controls section
    const fontSizeSection = $('div', {
        css: {
            marginBottom: '20px',
            padding: '15px',
            backgroundColor: '#f0f8ff',
            borderRadius: '5px',
            border: '1px solid #87ceeb'
        }
    });

    const fontSizeTitle = $('div', {
        text: '📝 Font Size Controls',
        css: {
            fontWeight: 'bold',
            marginBottom: '10px',
            color: '#4682b4'
        }
    });

    const fontSizeContainer = $('div', {
        css: {
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            justifyContent: 'center'
        }
    });

    // Get current font size
    const currentFontSize = lyricsDisplay ? lyricsDisplay.fontSize : 24;

    const fontMinusButton = UIManager.createInterfaceButton('A-', {
        onClick: () => {
            if (lyricsDisplay) {
                lyricsDisplay.adjustFontSize(-2);
                fontSizeLabel.textContent = `${lyricsDisplay.fontSize}px`;
            }
        }
    });

    const fontSizeLabel = $('span', {
        text: `${currentFontSize}px`,
        css: {
            padding: '5px 10px',
            backgroundColor: '#f0f0f0',
            borderRadius: '4px',
            fontSize: '14px',
            fontWeight: '500',
            minWidth: '50px',
            textAlign: 'center',
            border: '1px solid #ccc'
        }
    });

    const fontPlusButton = UIManager.createInterfaceButton('A+', {
        onClick: () => {
            if (lyricsDisplay) {
                lyricsDisplay.adjustFontSize(2);
                fontSizeLabel.textContent = `${lyricsDisplay.fontSize}px`;
            }
        }
    });

    // Add double-click handler for direct font size editing
    fontSizeLabel.addEventListener('dblclick', (e) => {
        e.preventDefault();
        if (lyricsDisplay) {
            lyricsDisplay.editFontSizeDirectly();
            // Update label after editing
            setTimeout(() => {
                fontSizeLabel.textContent = `${lyricsDisplay.fontSize}px`;
            }, 100);
        }
    });

    const fontSizeHint = $('div', {
        text: 'Click A- / A+ or double-click size to adjust',
        css: {
            fontSize: '11px',
            color: '#666',
            fontStyle: 'italic',
            textAlign: 'center',
            marginTop: '5px'
        }
    });

    fontSizeContainer.append(fontMinusButton, fontSizeLabel, fontPlusButton);
    fontSizeSection.append(fontSizeTitle, fontSizeContainer, fontSizeHint);

    // Assemble the content - move experimental features to the bottom
    settingsContent.append( activateSection, deactivateSection, timecodeDisplaySection, timecodeOptionsSection, metadataOptionsSection, fontSizeSection, midiSection, audioSection, syncSection);

    // Show as a simple modal without header/footer/close button
    const settingsOverlay = UIManager.createEnhancedModalOverlay();
    const settingsModal = UIManager.createEnhancedModalContainer({
        css: { maxWidth: '480px', width: '95%' }
    });
    settingsModal.append(settingsContent);
    settingsOverlay.appendChild(settingsModal);
    document.body.appendChild(settingsOverlay);

    // Close when clicking on overlay background
    settingsOverlay.addEventListener('click', (e) => {
        if (e.target === settingsOverlay) {
            try { document.body.removeChild(settingsOverlay); } catch (_) {}
        }
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
        document.getElementById('audio-play-button'),
        document.getElementById('audio-stop-button'),
        document.getElementById('audio-controls-container'),
        document.getElementById('audio-scrub-slider-container'),
        document.getElementById('audio-volume-slider-container'),
        document.getElementById('volume-value-display'),
        document.getElementById('volume-wrapper-toolbar')
    ];
    
    // Also toggle the audio tools row
    const audioToolRow = document.getElementById('audio-tools-row');
    
    // Use 'flex' for the container, 'inline-block' for buttons
    audioElementsToToggle.forEach(element => {
        if (!element) return;
        if (element.id === 'audio-controls-container') {
            element.style.display = newState ? 'flex' : 'none';
        } else if (element.id === 'audio-play-button' || element.id === 'audio-stop-button') {
            element.style.display = newState ? 'inline-block' : 'none';
        } else {
            element.style.display = newState ? 'block' : 'none';
        }
    });
    // Toggle the audio tools row
    if (audioToolRow) {
        audioToolRow.style.display = newState ? 'flex' : 'none';
    }
    // Ajout : si audioControls existe et audio activé, on l'ajoute au toolbarRow
    const toolbarRow = document.getElementById('main-toolbar-row');
    const audioControls = window.leftPanelAudioTools && window.leftPanelAudioTools.audioControls;
    const playButton = window.leftPanelAudioTools && window.leftPanelAudioTools.playButton;
    const stopButton = window.leftPanelAudioTools && window.leftPanelAudioTools.stopButton;
    const volumeContainer = window.leftPanelAudioTools && window.leftPanelAudioTools.volumeContainer;
    if (newState && toolbarRow) {
        if (audioControls && !toolbarRow.contains(audioControls)) {
            toolbarRow.appendChild(audioControls);
        }
        if (volumeContainer && !toolbarRow.contains(volumeContainer)) {
            toolbarRow.appendChild(volumeContainer);
        }
        if (stopButton && !toolbarRow.contains(stopButton)) {
            toolbarRow.appendChild(stopButton);
        }
        if (playButton && !toolbarRow.contains(playButton)) {
            toolbarRow.appendChild(playButton);
        }
    }
    
    // Notify the lyrics display to refresh audio tools visibility
    if (window.lyricsDisplay && window.lyricsDisplay.refreshAudioToolsVisibility) {
        window.lyricsDisplay.refreshAudioToolsVisibility();
    }
    
    console.log(`🎵 Audio Player Controls: ${newState ? 'ENABLED' : 'DISABLED'} - Audio controls ${newState ? 'shown' : 'hidden'}`);
}

// Toggle audio sync with host timecode
function toggleAudioSync(buttonElement, labelElement) {
    const isCurrentlyEnabled = localStorage.getItem('lyrix_audio_sync_enabled') === 'true';
    const newState = !isCurrentlyEnabled;
    
    // Save new state
    localStorage.setItem('lyrix_audio_sync_enabled', newState.toString());
    
    // Update button and label
    buttonElement.textContent = newState ? '✅' : '❌';
    labelElement.textContent = newState ? 'Host Sync Enabled' : 'Host Sync Disabled';
    
    if (newState) {
        // Enable host sync - monitor timecode display
        try {
            // Start monitoring host timecode
            startHostTimecodeMonitoring();
            
            // Also try host-specific interfaces as backup
            if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.audioSync) {
                window.webkit.messageHandlers.audioSync.postMessage({
                    action: 'enableSync',
                    enabled: true
                });
                window.addEventListener('message', handleHostTransportMessage);
                console.log('🔄 Host timeline sync enabled via webkit + timecode monitoring');
            } else if (window.electronAPI && window.electronAPI.audioSync) {
                window.electronAPI.audioSync.enable();
                window.electronAPI.audioSync.onTransportChange(handleHostTransportChange);
                console.log('🔄 Host timeline sync enabled via electron + timecode monitoring');
            } else {
                window.addEventListener('message', handleHostTransportMessage);
                if (window.external && window.external.OnPlaybackChanged) {
                    window.external.OnPlaybackChanged = handleHostPlaybackChange;
                }
                console.log('🔄 Audio sync enabled via timecode monitoring');
            }
        } catch (error) {
            console.error('❌ Failed to enable host timeline sync:', error);
        }
    } else {
        // Disable host sync
        try {
            // Stop monitoring timecode
            stopHostTimecodeMonitoring();
            hostPlaybackActive = false;
            
            if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.audioSync) {
                window.webkit.messageHandlers.audioSync.postMessage({
                    action: 'enableSync',
                    enabled: false
                });
                window.removeEventListener('message', handleHostTransportMessage);
                console.log('🔄 Host timeline sync disabled via webkit');
            } else if (window.electronAPI && window.electronAPI.audioSync) {
                window.electronAPI.audioSync.disable();
                console.log('🔄 Host timeline sync disabled via electron');
            } else {
                window.removeEventListener('message', handleHostTransportMessage);
                if (window.external && window.external.OnPlaybackChanged) {
                    window.external.OnPlaybackChanged = null;
                }
                console.log('🔄 Audio sync disabled');
            }
        } catch (error) {
            console.error('❌ Failed to disable host timeline sync:', error);
        }
    }
    
    console.log(`🔄 Audio Host Sync: ${newState ? 'ENABLED' : 'DISABLED'} - Timeline sync ${newState ? 'active' : 'inactive'}`);
}

// Handle host transport messages (for webkit/generic hosts)
function handleHostTransportMessage(event) {
    if (!localStorage.getItem('lyrix_audio_sync_enabled') === 'true') return;
    
    console.log('🔄 Received host transport message:', event.data);
    
    try {
        let transportData = event.data;
        
        // Parse if it's a string
        if (typeof transportData === 'string') {
            transportData = JSON.parse(transportData);
        }
        
        // Handle different message formats
        if (transportData.type === 'transport' || transportData.action === 'transport') {
            const state = transportData.state || transportData.playing;
            const position = transportData.position || transportData.time;
            
            if (state === 'playing' || state === true) {
                console.log('🔄 Host started playback - starting audio sync');
                if (audioController && audioController.play) {
                    audioController.play();
                }
            } else if (state === 'stopped' || state === false) {
                console.log('🔄 Host stopped playback - stopping audio sync');
                if (audioController && audioController.stop) {
                    audioController.stop();
                }
            }
            
            // Sync position if provided
            if (position !== undefined && audioController && audioController.audioPlayer) {
                audioController.audioPlayer.currentTime = position;
                console.log(`🔄 Synced position to: ${position}s`);
            }
        }
    } catch (error) {
        console.warn('⚠️ Failed to parse host transport message:', error);
    }
}

// Variables for timecode monitoring
let lastHostTimecode = '0.000s';
let hostTimecodeObserver = null;
let hostPlaybackActive = false;
let lastSyncTime = 0;

// Monitor host timecode display for changes
function startHostTimecodeMonitoring() {
    const timecodeDisplay = document.getElementById('timecode-display');
    
    if (!timecodeDisplay) {
        console.warn('⚠️ Host timecode display not found');
        return;
    }
    
    console.log('🔄 Starting host timecode monitoring');
    console.log('🔄 Initial timecode:', timecodeDisplay.textContent || timecodeDisplay.innerText);
    console.log('🔄 AudioController available:', !!audioController);
    if (audioController) {
        console.log('🔄 AudioController.play available:', !!audioController.play);
        console.log('🔄 AudioController.stop available:', !!audioController.stop);
        console.log('🔄 AudioController.audioPlayer available:', !!audioController.audioPlayer);
    }
    
    // Reset state
    hostPlaybackActive = false;
    lastHostTimecode = timecodeDisplay.textContent || timecodeDisplay.innerText || '0.000s';
    lastSyncTime = Date.now();
    
    // Use MutationObserver to detect timecode changes
    if (hostTimecodeObserver) {
        hostTimecodeObserver.disconnect();
    }
    
    hostTimecodeObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'childList' || mutation.type === 'characterData') {
                const currentTimecode = timecodeDisplay.textContent || timecodeDisplay.innerText;
                handleHostTimecodeChange(currentTimecode);
            }
        });
    });
    
    // Observe text content changes
    hostTimecodeObserver.observe(timecodeDisplay, {
        childList: true,
        subtree: true,
        characterData: true
    });
    
    // Also poll every 50ms as backup for faster detection
    setInterval(() => {
        if (localStorage.getItem('lyrix_audio_sync_enabled') === 'true') {
            const currentTimecode = timecodeDisplay.textContent || timecodeDisplay.innerText;
            handleHostTimecodeChange(currentTimecode);
        }
    }, 50);
}

// Stop host timecode monitoring
function stopHostTimecodeMonitoring() {
    if (hostTimecodeObserver) {
        hostTimecodeObserver.disconnect();
        hostTimecodeObserver = null;
    }
    console.log('🔄 Stopped host timecode monitoring');
}

// Handle host timecode changes
function handleHostTimecodeChange(currentTimecode) {
    if (localStorage.getItem('lyrix_audio_sync_enabled') !== 'true') {
        console.log('🔄 Audio sync disabled in settings');
        return;
    }
    
    if (currentTimecode === lastHostTimecode) {
        console.log('🔄 Timecode unchanged:', currentTimecode);
        return;
    }
    
    console.log('🔄 AudioController status:', {
        exists: !!audioController,
        hasPlay: !!(audioController && audioController.play),
        hasStop: !!(audioController && audioController.stop),
        hasAudioPlayer: !!(audioController && audioController.audioPlayer),
        audioPlayerHasPlay: !!(audioController && audioController.audioPlayer && audioController.audioPlayer.play),
        audioPlayerHasPause: !!(audioController && audioController.audioPlayer && audioController.audioPlayer.pause)
    });
    
    // Parse timecode (format: "X.XXXs")
    const timeMatch = currentTimecode.match(/(\d+\.?\d*)s?/);
    if (!timeMatch) {
        console.log('❌ Could not parse timecode:', currentTimecode);
        return;
    }
    
    const currentTime = parseFloat(timeMatch[1]);
    const lastTime = parseFloat(lastHostTimecode.match(/(\d+\.?\d*)s?/)?.[1] || '0');
    
    console.log(`🔄 Host timecode changed: ${lastHostTimecode} -> ${currentTimecode} (${lastTime} -> ${currentTime})`);
    
    // Calculate time difference
    const timeDiff = currentTime - lastTime;
    const now = Date.now();
    const realTimeDiff = (now - lastSyncTime) / 1000; // Convert to seconds
    
    console.log(`🔄 Time analysis: timeDiff=${timeDiff}s, realTimeDiff=${realTimeDiff}s, hostPlaybackActive=${hostPlaybackActive}`);
    
    // If timecode is advancing (even slightly), host is playing
    if (timeDiff > 0.001) { // Very sensitive threshold
        console.log('🔄 Timecode progressing - host is playing');
        
        if (!hostPlaybackActive) {
            console.log('🔄 HOST PLAYBACK DETECTED - Starting audio sync');
            hostPlaybackActive = true;
            
            // Start audio playback
            if (audioController && audioController.play) {
                try {
                    console.log('🎵 Calling audioController.play()');
                    audioController.play();
                    console.log('✅ Audio playback started successfully');
                } catch (error) {
                    console.error('❌ Failed to start audio playback:', error);
                }
            } else if (audioController && audioController.audioPlayer && audioController.audioPlayer.play) {
                try {
                    console.log('🎵 Calling audioController.audioPlayer.play()');
                    audioController.audioPlayer.play();
                    console.log('✅ Audio playback started successfully via audioPlayer');
                } catch (error) {
                    console.error('❌ Failed to start audio playback via audioPlayer:', error);
                }
            } else {
                console.warn('⚠️ AudioController or play method not available');
            }
        } else {
            console.log('🔄 Already playing - continuing sync');
        }
        
        // Always sync audio position when timecode changes
        if (audioController && audioController.audioPlayer) {
            const audioTime = audioController.audioPlayer.currentTime;
            const timeDifference = Math.abs(audioTime - currentTime);
            
            console.log(`🔄 Audio sync check: audioTime=${audioTime}s, hostTime=${currentTime}s, diff=${timeDifference}s`);
            
            // Sync if difference is more than 100ms (more sensitive)
            if (timeDifference > 0.1) {
                audioController.audioPlayer.currentTime = currentTime;
                console.log(`✅ Synced audio position: ${audioTime}s -> ${currentTime}s`);
            }
        }
    } 
    // If timecode stopped changing for more than 300ms, host likely stopped
    else if (timeDiff === 0 && realTimeDiff > 0.3) {
        if (hostPlaybackActive) {
            console.log('🔄 HOST PLAYBACK STOPPED - Stopping audio sync');
            hostPlaybackActive = false;
            
            if (audioController && audioController.stop) {
                try {
                    audioController.stop();
                    console.log('✅ Audio playback stopped successfully');
                } catch (error) {
                    console.error('❌ Failed to stop audio playback:', error);
                }
            }
        }
    }
    // If timecode jumped backwards (rewind/reset), also sync
    else if (timeDiff < -0.1) {
        console.log('🔄 HOST TIMECODE REWIND DETECTED');
        if (audioController && audioController.audioPlayer) {
            audioController.audioPlayer.currentTime = currentTime;
            console.log(`✅ Rewound audio position to: ${currentTime}s`);
        }
    }
    
    lastHostTimecode = currentTimecode;
    lastSyncTime = now;
}

// Handle host transport changes (for Electron)
function handleHostTransportChange(transportInfo) {
    if (!localStorage.getItem('lyrix_audio_sync_enabled') === 'true') return;
    
    console.log('🔄 Host transport changed:', transportInfo);
    
    try {
        if (transportInfo.playing) {
            console.log('🔄 Host started playback via Electron - starting audio sync');
            if (audioController && audioController.play) {
                audioController.play();
            }
        } else {
            console.log('🔄 Host stopped playback via Electron - stopping audio sync');
            if (audioController && audioController.stop) {
                audioController.stop();
            }
        }
        
        // Sync position
        if (transportInfo.position !== undefined && audioController && audioController.audioPlayer) {
            audioController.audioPlayer.currentTime = transportInfo.position;
            console.log(`🔄 Synced position via Electron to: ${transportInfo.position}s`);
        }
    } catch (error) {
        console.error('❌ Failed to handle Electron transport change:', error);
    }
}

// Handle host playback changes (for external DAW interfaces)
function handleHostPlaybackChange(isPlaying, position) {
    if (!localStorage.getItem('lyrix_audio_sync_enabled') === 'true') return;
    
    console.log('🔄 Host playback changed via external interface:', { isPlaying, position });
    
    try {
        if (isPlaying) {
            console.log('🔄 Host started playback via external - starting audio sync');
            if (audioController && audioController.play) {
                audioController.play();
            }
        } else {
            console.log('🔄 Host stopped playback via external - stopping audio sync');
            if (audioController && audioController.stop) {
                audioController.stop();
            }
        }
        
        // Sync position if provided
        if (position !== undefined && audioController && audioController.audioPlayer) {
            audioController.audioPlayer.currentTime = position;
            console.log(`🔄 Synced position via external to: ${position}s`);
        }
    } catch (error) {
        console.error('❌ Failed to handle external playback change:', error);
    }
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

// Toggle timecode display visibility
function toggleTimecodeDisplayVisibility(buttonElement, labelElement) {
    const isCurrentlyVisible = localStorage.getItem('lyrix_timecode_display_visible') === 'true'; // Default to false (hidden)
    const newState = !isCurrentlyVisible;
    
    // Save new state
    localStorage.setItem('lyrix_timecode_display_visible', newState.toString());
    
    // Update button and label
    buttonElement.textContent = newState ? '✅' : '❌';
    labelElement.textContent = newState ? 'Timecode Display Visible' : 'Timecode Display Hidden';
    
    // Get timecode display element to toggle
    const timecodeElement = document.getElementById('timecode-display');
    
    // Toggle visibility for timecode display
    if (timecodeElement) {
        timecodeElement.style.display = newState ? 'block' : 'none';
    }
    
    console.log(`🕐 Timecode Display: ${newState ? 'VISIBLE' : 'HIDDEN'} - Timecode display ${newState ? 'shown' : 'hidden'}`);
}

// Apply initial settings on application startup
function applyInitialSettings() {
    
    // Set default values for new settings if they don't exist
    if (localStorage.getItem('lyrix_audio_player_enabled') === null) {
        localStorage.setItem('lyrix_audio_player_enabled', 'false'); // Default to hidden
    }
    
    if (localStorage.getItem('lyrix_midi_inspector_enabled') === null) {
        localStorage.setItem('lyrix_midi_inspector_enabled', 'false'); // Default to hidden
    }
    
    if (localStorage.getItem('lyrix_timecode_display_visible') === null) {
        localStorage.setItem('lyrix_timecode_display_visible', 'false'); // Default to hidden
    }
    
    // Set default volume if it doesn't exist
    if (localStorage.getItem('lyrix_audio_volume') === null) {
        localStorage.setItem('lyrix_audio_volume', '70'); // Default to 70%
    }
    
    // Apply timecode display visibility setting
    const isTimecodeDisplayVisible = localStorage.getItem('lyrix_timecode_display_visible') === 'true';
    const timecodeElement = document.getElementById('timecode-display');
    if (timecodeElement) {
        timecodeElement.style.display = isTimecodeDisplayVisible ? 'block' : 'none';
        console.log(`🕐 Applied timecode display visibility from applyInitialSettings: ${isTimecodeDisplayVisible ? 'visible' : 'hidden'}`);
    } else {
        console.log('🕐 Timecode display element not found in applyInitialSettings - will be applied later');
    }
  
}

// Show file import dialog
function showFileImportDialog() {
    // Create a hidden file input element
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    // Maximum permissive accept attribute to prevent files from appearing grayed out
    // Use */* to accept ALL files, then filter manually in JavaScript
    fileInput.accept = '*/*';
    fileInput.multiple = true;
    fileInput.style.display = 'none';
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
    
    // Set up the change event with enhanced iOS error handling and permissive file selection
    fileInput.addEventListener('change', async (event) => {
        try {
            const files = Array.from(event.target.files);
            if (files.length > 0) {
                // Filter files manually to ensure .lrx files are accepted even if they appear grayed out
                const validFiles = files.filter(file => {
                    const fileName = file.name.toLowerCase();
                    // Check for valid extensions - be very permissive
                    return fileName.endsWith('.lrx') || 
                           fileName.endsWith('.txt') || 
                           fileName.endsWith('.lrc') ||
                           fileName.endsWith('.json') ||
                           fileName.endsWith('.md') ||
                           fileName.endsWith('.mp3') ||
                           fileName.endsWith('.wav') ||
                           fileName.endsWith('.m4a') ||
                           fileName.endsWith('.flac') ||
                           fileName.endsWith('.ogg') ||
                           file.type.startsWith('audio/') ||
                           file.type.startsWith('text/') ||
                           file.type === 'application/json' ||
                           file.type === '';
                });
                
                if (validFiles.length > 0) {
                    console.log(`✅ Accepting ${validFiles.length} valid files:`, validFiles.map(f => f.name));
                    dragDropManager.handleDroppedFiles(validFiles);
                } else {
                    showCustomAlert('Invalid File Type', 'Please select text files (.lrx, .txt, .lrc, .json) or audio files (.mp3, .wav, .m4a, .flac, .ogg)');
                }
            } else {
                showCustomAlert('File Picker', 'No files returned by the picker. Please try again.');
            }
        } catch (error) {
            console.error('❌ File import error:', error);
            showCustomAlert('Import Error', `Failed to import files: ${error.message}`);
        } finally {
            setTimeout(() => {
                try {
                    if (fileInput.parentNode) {
                        document.body.removeChild(fileInput);
                    }
                } catch (cleanupError) {
                    console.warn('⚠️ File input cleanup error:', cleanupError);
                }
            }, 100);
        }
    });

    // Trigger the file picker with error handling
    try {
        fileInput.click();
        
        // Show helpful tip about file selection, especially for .lrx files
        console.log('💡 Tip: If .lrx files appear grayed out, try changing the file type filter to "All Files" in the file picker.');
    } catch (error) {
        console.error('❌ File picker error:', error);
        document.body.removeChild(fileInput);
    }
}

// ...existing code...

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

// Function to get songs in custom order (respecting user's reordering)
function getSongsInCustomOrder() {
    const allSongs = lyricsLibrary.getAllSongs();
    
    try {
        const savedOrder = localStorage.getItem('lyrix_custom_song_order');
        if (!savedOrder) {
            // No custom order, return songs in creation order
            return allSongs;
        }

        const orderData = JSON.parse(savedOrder);
        const orderMap = new Map();
        orderData.forEach(item => {
            orderMap.set(item.songKey, item.order);
        });

        // Separate songs with saved order from new songs
        const songsWithOrder = [];
        const newSongs = [];
        
        allSongs.forEach(song => {
            if (orderMap.has(song.key)) {
                songsWithOrder.push({
                    ...song,
                    savedOrder: orderMap.get(song.key)
                });
            } else {
                newSongs.push(song);
            }
        });

        // Sort songs with saved order
        songsWithOrder.sort((a, b) => a.savedOrder - b.savedOrder);
        
        // Combine: ordered songs first, then new songs at the end
        const orderedSongs = [
            ...songsWithOrder.map(song => ({ ...song, savedOrder: undefined })),
            ...newSongs
        ];

        console.log(`🎵 Retrieved ${orderedSongs.length} songs in custom order`);
        return orderedSongs;
    } catch (error) {
        console.error('❌ Error getting songs in custom order:', error);
        return allSongs; // Fallback to default order
    }
}

// Song navigation functions
function navigateToPreviousSong() {
    if (!lyricsLibrary) {
        console.error('❌ LyricsLibrary not initialized');
        return false;
    }
    
    const songs = getSongsInCustomOrder(); // Use custom order instead of getAllSongs()
    console.log(`🎵 Total songs in library: ${songs.length}`);
    if (songs.length === 0) {
        console.log('📚 No songs in library');
        return false;
    }
    
    // Debug: Show all songs
    console.log('📚 All songs in custom order:', songs.map(s => ({ key: s.key, title: s.title })));
    
    // Get current song key from display or global backup
    const currentSongKey = window.lyricsDisplay?.currentSongKey || window.currentSongKey || null;
    console.log(`🎵 Current song key: ${currentSongKey} (from ${window.lyricsDisplay?.currentSongKey ? 'lyricsDisplay' : window.currentSongKey ? 'global backup' : 'null'})`);
    
    if (!currentSongKey) {
        // No current song, load the last song
        const lastSong = songs[songs.length - 1];
        console.log(`⏮️ No current song, loading last song: ${lastSong.title} (key: ${lastSong.key})`);
        loadAndDisplaySong(lastSong.key);
        return true;
    }
    
    // Find current song index
    const currentIndex = songs.findIndex(song => song.key === currentSongKey);
    console.log(`🎵 Current song index: ${currentIndex}`);
    
    if (currentIndex === -1) {
        // Current song not found, load first song
        console.log(`⏮️ Current song not found in library, loading first song: ${songs[0].title}`);
        loadAndDisplaySong(songs[0].key);
        return true;
    }
    
    // Navigate to previous song (wrap around to last if at beginning)
    const previousIndex = currentIndex === 0 ? songs.length - 1 : currentIndex - 1;
    const previousSong = songs[previousIndex];
    
    console.log(`⏮️ Navigating from index ${currentIndex} to ${previousIndex}: ${previousSong.title} (key: ${previousSong.key})`);
    loadAndDisplaySong(previousSong.key);
    return true;
}

function navigateToNextSong() {
    if (!lyricsLibrary) {
        console.error('❌ LyricsLibrary not initialized');
        return false;
    }
    
    const songs = getSongsInCustomOrder(); // Use custom order instead of getAllSongs()
    console.log(`🎵 Total songs in library: ${songs.length}`);
    if (songs.length === 0) {
        console.log('📚 No songs in library');
        return false;
    }
    
    // Debug: Show all songs
    console.log('📚 All songs in custom order:', songs.map(s => ({ key: s.key, title: s.title })));
    
    // Get current song key from display or global backup
    const currentSongKey = window.lyricsDisplay?.currentSongKey || window.currentSongKey || null;
    console.log(`🎵 Current song key: ${currentSongKey} (from ${window.lyricsDisplay?.currentSongKey ? 'lyricsDisplay' : window.currentSongKey ? 'global backup' : 'null'})`);
    
    if (!currentSongKey) {
        // No current song, load the first song
        const firstSong = songs[0];
        console.log(`⏭️ No current song, loading first song: ${firstSong.title} (key: ${firstSong.key})`);
        loadAndDisplaySong(firstSong.key);
        return true;
    }
    
    // Find current song index
    const currentIndex = songs.findIndex(song => song.key === currentSongKey);
    console.log(`🎵 Current song index: ${currentIndex}`);
    
    if (currentIndex === -1) {
        // Current song not found, load first song
        console.log(`⏭️ Current song not found in library, loading first song: ${songs[0].title}`);
        loadAndDisplaySong(songs[0].key);
        return true;
    }
    
    // Navigate to next song (wrap around to first if at end)
    const nextIndex = currentIndex === songs.length - 1 ? 0 : currentIndex + 1;
    const nextSong = songs[nextIndex];
    
    console.log(`⏭️ Navigating from index ${currentIndex} to ${nextIndex}: ${nextSong.title} (key: ${nextSong.key})`);
    loadAndDisplaySong(nextSong.key);
    return true;
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
        // Store current song key for navigation (both in lyricsDisplay and globally)
        if (lyricsDisplay) {
            lyricsDisplay.currentSongKey = songKey;
            console.log(`🎵 Stored currentSongKey in lyricsDisplay: ${songKey}`);
        } else {
            console.warn('⚠️ lyricsDisplay not available when storing currentSongKey');
        }
        // Also store globally as backup
        window.currentSongKey = songKey;
        console.log(`🎵 Stored currentSongKey globally: ${songKey}`);
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
            toggleSongLibraryPanel();
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
    // leftPanel.append(audioControls);
        
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
function updateTimecode(timecodeMs) {
    // Convert to seconds for display
    const seconds = (timecodeMs / 1000).toFixed(3);
    
    // Update timecode display element
    const timecodeElement = document.getElementById('timecode-display');
    if (timecodeElement) {
        timecodeElement.textContent = `${seconds}s`;
        // Ne plus modifier la couleur de fond pour garder le style du thème
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
    const timecodeElement = document.getElementById('timecode-display');
    if (timecodeElement) {
        const seconds = (positionMs / 1000).toFixed(3);
        timecodeElement.textContent = `${seconds}s`; // Only show time, no icons
        // Ne plus modifier la couleur de fond pour garder le style du thème
    }
}

// Expose functions globally for AUv3 host access
window.updateTimecode = updateTimecode;
window.displayTransportInfo = displayTransportInfo;
window.loadAndDisplaySong = loadAndDisplaySong;
window.navigateToPreviousSong = navigateToPreviousSong;
window.navigateToNextSong = navigateToNextSong;

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

// console.log('🎵 Lyrix module initialized');
// Lyrix module loaded
