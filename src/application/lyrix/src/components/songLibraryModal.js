// Song Library Modal Component
// Handles all song library functionality including MIDI controls, export, import, and sorting

import { exportSongsToLRX } from '../features/lyrics/SongUtils.js';
import default_theme from './style.js';
import { closeSettingsPanel } from './settings.js';

function exportSongLibraryAsLRX() {
    try {
        closeSongLibraryPanel();
        const btn = document.getElementById('song_list_button');
        if (btn && btn._setActive) btn._setActive(false);
        const library = window.lyricsLibrary || (typeof lyricsLibrary !== 'undefined' ? lyricsLibrary : null);
        if (!library) return;
        const list = library.getAllSongs();
        if (!list.length) return;
        const data = exportSongsToLRX(list, library);
        const json = JSON.stringify(data, null, 2);
        const date = new Date().toISOString().split('T')[0];
        const name = `song_library_${date}.lrx`;
        const isAUv3 = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.swiftBridge;
        if (isAUv3) {
            window.webkit.messageHandlers.swiftBridge.postMessage({
                action: 'saveFileWithDocumentPicker',
                requestId: Date.now().toString(),
                fileName: name,
                data: json,
                encoding: 'utf8'
            });
        } else {
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = name;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
        console.log('Export LRX triggered');
    } catch (error) {
        console.error('❌ Export LRX failed', error);
    }
}
window.exportSongLibraryAsLRX = exportSongLibraryAsLRX;

// Helper function to properly close song library panel and remove all related elements
function closeSongLibraryPanel(keepButtonActive = false) {
    const existingPanel = document.getElementById('song-library-panel');
    const existingGrip = document.getElementById('song-library-resize-grip');

    if (existingPanel) {
        existingPanel.remove();
    }

    if (existingGrip) {
        existingGrip.remove();
    }

    // Restore original settings button visibility if it was hidden
    const originalSettings = document.getElementById('settings_button');
    if (originalSettings && originalSettings.__hiddenBySongLibrary) {
        originalSettings.style.display = originalSettings.__originalDisplay || '';
        delete originalSettings.__hiddenBySongLibrary;
        delete originalSettings.__originalDisplay;
    }

    // Always ensure the song list toggle button reflects closed state
    const btn = document.getElementById('song_list_button');
    if (btn && btn._setActive && !keepButtonActive) {
        btn._setActive(false);
    }
}

// Toggle song library panel (show/hide)
export function toggleSongLibrary() {
    const existingPanel = document.getElementById('song-library-panel');
    const settingsPanel = document.getElementById('settings-panel');

    // New case: settings panel open, song library closed -> clicking song list button should close settings and deactivate
    if (!existingPanel && settingsPanel) {
        if (typeof closeSettingsPanel === 'function') closeSettingsPanel();
        const btn = document.getElementById('song_list_button');
        if (btn && btn._setActive) btn._setActive(false);
        return false;
    }
    if (existingPanel) {
        // Panel exists, close it properly
        closeSongLibraryPanel();
        // If settings panel is open, also close it when explicitly toggling off song list
        const settingsPanel2 = document.getElementById('settings-panel');
        if (settingsPanel2 && typeof closeSettingsPanel === 'function') {
            closeSettingsPanel();
        }
        const btn2 = document.getElementById('song_list_button');
        if (btn2 && btn2._setActive) btn2._setActive(false);
        return false; // Panel closed
    } else {
        // Panel doesn't exist, show it
        showSongLibrary();
        // Immediately hide original settings button if still visible
        const origSettings = document.getElementById('settings_button');
        if (origSettings && !origSettings.__hiddenBySongLibrary) {
            origSettings.__originalDisplay = origSettings.style.display;
            origSettings.style.display = 'none';
            origSettings.__hiddenBySongLibrary = true;
        }
        const btn = document.getElementById('song_list_button');
        if (btn && btn._setActive) btn._setActive(true);
        return true; // Panel opened
    }
}
window.toggleSongLibrary = toggleSongLibrary;

export function import_files_into_library() {
    closeSongLibraryPanel();
    const btn = document.getElementById('song_list_button');
    if (btn && btn._setActive) btn._setActive(false);

    const processImportedFiles = async (files) => {
        if (!files || !files.length) return;
        try {
            const mgr = (window.Lyrix && window.Lyrix.dragDropManager) ? window.Lyrix.dragDropManager : window.dragDropManager;
            if (mgr) {
                const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
                if (isIOS) {
                    for (let i = 0; i < files.length; i++) {
                        if (i > 0) await new Promise(r => setTimeout(r, 120));
                        await mgr.processFile(files[i]);
                    }
                } else {
                    for (const f of files) {
                        await mgr.processFile(f);
                    }
                }
            }
            window.showSongLibrary && window.showSongLibrary();
        } catch (error) {
            window.Modal && window.Modal({ title: '❌ File Import Error', content: `<p>Failed to import: ${error.message}</p>`, buttons: [{ text: 'OK' }], size: 'small' });
        }
    };

    const hasAUv3Multi = !!(window.AUv3API && AUv3API.fileSystem && AUv3API.fileSystem.loadFilesWithDocumentPicker);
    if (hasAUv3Multi) {
        try {
            AUv3API.fileSystem.loadFilesWithDocumentPicker(['txt', 'lrc', 'lrx', 'json', 'mp3', 'm4a', 'wav'], async (resp) => {
                if (!resp || !resp.success || !resp.data || !resp.data.files) {
                    fallbackChain();
                    return;
                }
                const out = [];
                for (const entry of resp.data.files) {
                    try {
                        const b64 = entry.base64;
                        const byteStr = atob(b64);
                        const len = byteStr.length;
                        const bytes = new Uint8Array(len);
                        for (let i = 0; i < len; i++) bytes[i] = byteStr.charCodeAt(i);
                        const ext = (entry.name || '').split('.').pop().toLowerCase();
                        let mime = 'application/octet-stream';
                        if (['txt', 'lrc', 'lrx', 'json'].includes(ext)) mime = 'text/plain';
                        else if (ext === 'mp3') mime = 'audio/mpeg';
                        else if (['m4a', 'aac'].includes(ext)) mime = 'audio/mp4';
                        else if (ext === 'wav') mime = 'audio/wav';
                        out.push(new File([bytes], entry.name || 'import', { type: mime }));
                    } catch { }
                }
                await processImportedFiles(out);
            });
            return;
        } catch (e) {
            /* continue */
        }
    }

    const hasRawBridge = !hasAUv3Multi && !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.fileSystem);
    if (hasRawBridge) {
        try {
            window.fileSystemCallback = async (resp) => {
                if (resp && resp.success && resp.data && resp.data.files) {
                    const out = [];
                    for (const entry of resp.data.files) {
                        try {
                            const b64 = entry.base64;
                            const bs = atob(b64);
                            const len = bs.length;
                            const bytes = new Uint8Array(len);
                            for (let i = 0; i < len; i++) bytes[i] = bs.charCodeAt(i);
                            const ext = (entry.name || '').split('.').pop().toLowerCase();
                            let mime = 'application/octet-stream';
                            if (['txt', 'lrc', 'lrx', 'json'].includes(ext)) mime = 'text/plain';
                            else if (ext === 'mp3') mime = 'audio/mpeg';
                            else if (['m4a', 'aac'].includes(ext)) mime = 'audio/mp4';
                            else if (ext === 'wav') mime = 'audio/wav';
                            out.push(new File([bytes], entry.name || 'import', { type: mime }));
                        } catch { }
                    }
                    await processImportedFiles(out);
                } else {
                    fallbackChain();
                }
            };
            window.webkit.messageHandlers.fileSystem.postMessage({ action: 'loadFilesWithDocumentPicker', fileTypes: ['txt', 'lrc', 'lrx', 'json', 'mp3', 'm4a', 'wav'] });
            return;
        } catch (e) {
            /* continue */
        }
    }

    function fallbackChain() {
        const fsAccess = typeof window.showOpenFilePicker === 'function';
        if (fsAccess) {
            (async () => {
                try {
                    const handles = await window.showOpenFilePicker({
                        multiple: true,
                        types: [
                            { description: 'Lyrics & Text', accept: { 'text/plain': ['.txt', '.lrc', '.lrx'] } },
                            { description: 'JSON', accept: { 'application/json': ['.json'] } },
                            { description: 'Audio', accept: { 'audio/*': ['.mp3', '.m4a', '.wav'] } }
                        ]
                    });
                    const files = [];
                    for (const h of handles) {
                        try {
                            files.push(await h.getFile());
                        } catch { }
                    }
                    await processImportedFiles(files);
                    return;
                } catch (err) {
                    legacyInput();
                }
            })();
        } else {
            legacyInput();
        }
    }

    function legacyInput() {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.accept = '.txt,.lrc,.lrx,.json,.mp3,.m4a,.wav';
        input.style.display = 'none';
        input.addEventListener('change', async (e) => {
            const files = Array.from(e.target.files || []);
            await processImportedFiles(files);
            input.remove();
        });
        document.body.appendChild(input);
        setTimeout(() => input.click(), 0);
    }

    // Start fallback chain if native not used
    fallbackChain();
}

window.import_files_into_library = import_files_into_library;
// Show song library
export function showSongLibrary() {
    if (window.midiUtilities) {
    }

    if (!window.lyricsLibrary) {
        window.Modal({
            title: '❌ Error',
            content: '<p>Library not initialized</p>',
            buttons: [{ text: 'OK' }],
            size: 'small'
        });
        return;
    }

    // Close settings panel if it's open (mutual exclusion)
    const settingsPanel = document.getElementById('settings-panel');
    if (settingsPanel) {
        settingsPanel.remove();

        // Also remove the settings resize grip
        const settingsGrip = document.getElementById('settings-resize-grip');
        if (settingsGrip) {
            settingsGrip.remove();
        }

        // (Theme utilities already imported at top if needed)
        // Also reset settings panel state if needed
        if (window.settingsState) {
            window.settingsState.isSettingsOpen = false;
            window.settingsState.settingsPanel = null;
        }
        // Reset the settings button visual state (ensure it doesn't look active)
        const settingsButton = document.getElementById('settings_button');
        if (settingsButton) {
            if (settingsButton._setActive) { settingsButton._setActive(false); } else {
                settingsButton.style.backgroundColor = 'transparent';
                settingsButton.style.color = '';
            }
        }
    }

    const songs = window.lyricsLibrary.getAllSongs();

    // Always show the song library, even if empty, so users can create or import songs

    // Create inline panel instead of modal - insert between toolbar and lyrics
    const toolbar = document.querySelector('#lyrics-toolbar, .lyrics-toolbar, [id*="toolbar"]') || document.getElementById('view') || document.body;
    const lyricsContainer = document.querySelector('#lyrics-content, #lyrics_lines_container, .lyrics-container') || document.getElementById('view') || document.body;

    // Remove existing song library panel if it exists
    const existingPanel = document.getElementById('song-library-panel');
    if (existingPanel) {
        existingPanel.remove();
    }

    // Create panel container (not modal)
    const savedHeight = localStorage.getItem('lyrix_song_library_panel_height') || '400px';
    const modalContainer = window.$('div', {
        id: 'song-library-panel',
        css: {
            width: '100%',
            height: savedHeight,
            // backgroundColor: '#ffffff',
            // border: '1px solid #ddd',
            // borderRadius: '8px',
            margin: '10px 0',
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            resize: 'vertical',
            minHeight: '150px',
            userSelect: 'none',
            webkitUserSelect: 'none',
            mozUserSelect: 'none',
            msUserSelect: 'none'
        }
    });

    const modal = window.$('div', {
        id: 'song-library-modal',
        css: {
            top: '36px',
            position: 'relative',
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            //         padding: window.UIManager.THEME.spacing.lg,
            backgroundColor: window.UIManager.THEME.colors.primary,
            //         borderRadius: `${window.UIManager.THEME.borderRadius.lg} ${window.UIManager.THEME.borderRadius.lg} 0 0`,
            //         borderBottom: `1px solid ${window.UIManager.THEME.colors.border}`,
        }
    });

    // const headerTop = window.$('div', {
    //     id: 'song-library-header-top',
    //     css: {
    //         display: 'flex',
    //         justifyContent: 'space-between',
    //         alignItems: 'center',
    //         marginBottom: '10px',
    //         padding: window.UIManager.THEME.spacing.lg,
    //         backgroundColor: window.UIManager.THEME.colors.primary,
    //         borderRadius: `${window.UIManager.THEME.borderRadius.lg} ${window.UIManager.THEME.borderRadius.lg} 0 0`,
    //         borderBottom: `1px solid ${window.UIManager.THEME.colors.border}`,
    //         color: 'white'
    //     }
    // });

    const headerTitle = window.$('h3', {
        id: 'song-library-header',
        css: { margin: '0', color: 'white' }
    });

    // Action buttons container (clean rebuild)
    const actionButtons = window.$('div', { id: 'songs_panel_tools', css: { position: 'absolute', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', left: '23px', top: '-15px' } });

    // Unified small button factory (consistent bg, font, sizing)
    const UNIFIED_BTN_BG = default_theme.colors.surfaceAlt;
    const UNIFIED_FONT_SIZE = '11px';
    const makeMiniBtn = (cfg) => {
        const btn = window.$('button', {
            css: {
                ...default_theme.button,
                backgroundColor: UNIFIED_BTN_BG,
                // Border removed for uniform flat style across all header action buttons
                border: 'none',
                width: 'auto',
                padding: '0 10px',
                fontSize: UNIFIED_FONT_SIZE,
                height: '28px',
                lineHeight: '28px',
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                ...cfg.css
            },
            text: cfg.text || '',
            id: cfg.id,
            onClick: cfg.onClick
        });
        return btn;
    };

    function exportSongLibraryAsLRX() {
        try {
            closeSongLibraryPanel();
            const btn = document.getElementById('song_list_button');
            if (btn && btn._setActive) btn._setActive(false);
            if (!lyricsLibrary) return;
            const list = lyricsLibrary.getAllSongs();
            if (!list.length) return;
            const data = exportSongsToLRX(list, lyricsLibrary);
            const json = JSON.stringify(data, null, 2);
            const date = new Date().toISOString().split('T')[0];
            const name = `song_library_${date}.lrx`;
            const isAUv3 = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.swiftBridge;
            if (isAUv3) {
                window.webkit.messageHandlers.swiftBridge.postMessage({ action: 'saveFileWithDocumentPicker', requestId: Date.now().toString(), fileName: name, data: json, encoding: 'utf8' });
            } else {
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = name; a.style.display = 'none';
                document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
            }
            console.log('Export LRX triggered');
        } catch (error) {
            console.error('❌ Export LRX failed', error);
        }
    }
    // const exportLRXButton = makeMiniBtn({
    //     id: 'export-lrx-format',
    //     onClick: exportSongLibraryAsLRX
    // });
    // Replace emoji with SVG save icon
    // try { exportLRXButton.innerHTML = ''; const img = document.createElement('img'); img.src = 'assets/images/icons/save.svg'; img.alt = 'save'; img.style.width = '14px'; img.style.height = '14px'; img.style.pointerEvents = 'none'; const span = document.createElement('span'); span.textContent = 'Save'; span.style.fontSize = UNIFIED_FONT_SIZE; exportLRXButton.append(img, span); } catch (e) { }

    const exportTextButton = makeMiniBtn({
        id: 'export-songs-as-text',
        onClick: () => {
            closeSongLibraryPanel();
            const btn = document.getElementById('song_list_button');
            if (btn && btn._setActive) btn._setActive(false);
            window.exportSelectedSongsAsTextWithFolderDialog && window.exportSelectedSongsAsTextWithFolderDialog();
        }
    });
    // try { exportTextButton.innerHTML = ''; const span = document.createElement('span'); span.textContent = 'export all as text'; span.style.fontSize = UNIFIED_FONT_SIZE; exportTextButton.append(span); } catch (e) { }
    function import_files_into_library() {
        closeSongLibraryPanel();
        const btn = document.getElementById('song_list_button');
        if (btn && btn._setActive) btn._setActive(false);

        const processImportedFiles = async (files) => {
            if (!files || !files.length) return;
            try {
                const mgr = (window.Lyrix && window.Lyrix.dragDropManager) ? window.Lyrix.dragDropManager : window.dragDropManager;
                if (mgr) {
                    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
                    if (isIOS) {
                        for (let i = 0; i < files.length; i++) { if (i > 0) await new Promise(r => setTimeout(r, 120)); await mgr.processFile(files[i]); }
                    } else {
                        for (const f of files) { await mgr.processFile(f); }
                    }
                }
                window.showSongLibrary && window.showSongLibrary();
            } catch (error) {
                window.Modal && window.Modal({ title: '❌ File Import Error', content: `<p>Failed to import: ${error.message}</p>`, buttons: [{ text: 'OK' }], size: 'small' });
            }
        };

        const hasAUv3Multi = !!(window.AUv3API && AUv3API.fileSystem && AUv3API.fileSystem.loadFilesWithDocumentPicker);
        if (hasAUv3Multi) {
            try {
                AUv3API.fileSystem.loadFilesWithDocumentPicker(['txt', 'lrc', 'lrx', 'json', 'mp3', 'm4a', 'wav'], async (resp) => {
                    if (!resp || !resp.success || !resp.data || !resp.data.files) { fallbackChain(); return; }
                    const out = [];
                    for (const entry of resp.data.files) {
                        try {
                            const b64 = entry.base64; const byteStr = atob(b64); const len = byteStr.length; const bytes = new Uint8Array(len);
                            for (let i = 0; i < len; i++) bytes[i] = byteStr.charCodeAt(i);
                            const ext = (entry.name || '').split('.').pop().toLowerCase();
                            let mime = 'application/octet-stream';
                            if (['txt', 'lrc', 'lrx', 'json'].includes(ext)) mime = 'text/plain'; else if (ext === 'mp3') mime = 'audio/mpeg'; else if (['m4a', 'aac'].includes(ext)) mime = 'audio/mp4'; else if (ext === 'wav') mime = 'audio/wav';
                            out.push(new File([bytes], entry.name || 'import', { type: mime }));
                        } catch { }
                    }
                    await processImportedFiles(out);
                });
                return;
            } catch (e) { /* continue */ }
        }

        const hasRawBridge = !hasAUv3Multi && !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.fileSystem);
        if (hasRawBridge) {
            try {
                window.fileSystemCallback = async (resp) => {
                    if (resp && resp.success && resp.data && resp.data.files) {
                        const out = []; for (const entry of resp.data.files) { try { const b64 = entry.base64; const bs = atob(b64); const len = bs.length; const bytes = new Uint8Array(len); for (let i = 0; i < len; i++) bytes[i] = bs.charCodeAt(i); const ext = (entry.name || '').split('.').pop().toLowerCase(); let mime = 'application/octet-stream'; if (['txt', 'lrc', 'lrx', 'json'].includes(ext)) mime = 'text/plain'; else if (ext === 'mp3') mime = 'audio/mpeg'; else if (['m4a', 'aac'].includes(ext)) mime = 'audio/mp4'; else if (ext === 'wav') mime = 'audio/wav'; out.push(new File([bytes], entry.name || 'import', { type: mime })); } catch { } }
                        await processImportedFiles(out);
                    } else { fallbackChain(); }
                };
                window.webkit.messageHandlers.fileSystem.postMessage({ action: 'loadFilesWithDocumentPicker', fileTypes: ['txt', 'lrc', 'lrx', 'json', 'mp3', 'm4a', 'wav'] });
                return;
            } catch (e) { /* continue */ }
        }

        function fallbackChain() {
            const fsAccess = typeof window.showOpenFilePicker === 'function';
            if (fsAccess) {
                (async () => {
                    try {
                        const handles = await window.showOpenFilePicker({ multiple: true, types: [{ description: 'Lyrics & Text', accept: { 'text/plain': ['.txt', '.lrc', '.lrx'] } }, { description: 'JSON', accept: { 'application/json': ['.json'] } }, { description: 'Audio', accept: { 'audio/*': ['.mp3', '.m4a', '.wav'] } }] });
                        const files = []; for (const h of handles) { try { files.push(await h.getFile()); } catch { } }
                        await processImportedFiles(files); return;
                    } catch (err) { legacyInput(); }
                })();
            } else { legacyInput(); }
        }

        function legacyInput() {
            const input = document.createElement('input');
            input.type = 'file'; input.multiple = true; input.accept = '.txt,.lrc,.lrx,.json,.mp3,.m4a,.wav'; input.style.display = 'none';
            input.addEventListener('change', async (e) => { const files = Array.from(e.target.files || []); await processImportedFiles(files); input.remove(); });
            document.body.appendChild(input); setTimeout(() => input.click(), 0);
        }

        // Start fallback chain if native not used
        fallbackChain();
    }
    window.import_files_into_library = import_files_into_library;

    // const importFileButton = makeMiniBtn({
    //     id: 'import_file_button_library',
    //     onClick: () => {
    //         import_files_into_library();
    //         // closeSongLibraryPanel();
    //         // const btn = document.getElementById('song_list_button');
    //         // if (btn && btn._setActive) btn._setActive(false);

    //         // const processImportedFiles = async (files) => {
    //         //     if (!files || !files.length) return;
    //         //     try {
    //         //         const mgr = (window.Lyrix && window.Lyrix.dragDropManager) ? window.Lyrix.dragDropManager : window.dragDropManager;
    //         //         if (mgr) {
    //         //             const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    //         //             if (isIOS) {
    //         //                 for (let i = 0; i < files.length; i++) { if (i > 0) await new Promise(r => setTimeout(r, 120)); await mgr.processFile(files[i]); }
    //         //             } else {
    //         //                 for (const f of files) { await mgr.processFile(f); }
    //         //             }
    //         //         }
    //         //         window.showSongLibrary && window.showSongLibrary();
    //         //     } catch (error) {
    //         //         window.Modal && window.Modal({ title: '❌ File Import Error', content: `<p>Failed to import: ${error.message}</p>`, buttons: [{ text: 'OK' }], size: 'small' });
    //         //     }
    //         // };

    //         // const hasAUv3Multi = !!(window.AUv3API && AUv3API.fileSystem && AUv3API.fileSystem.loadFilesWithDocumentPicker);
    //         // if (hasAUv3Multi) {
    //         //     try {
    //         //         AUv3API.fileSystem.loadFilesWithDocumentPicker(['txt', 'lrc', 'lrx', 'json', 'mp3', 'm4a', 'wav'], async (resp) => {
    //         //             if (!resp || !resp.success || !resp.data || !resp.data.files) { fallbackChain(); return; }
    //         //             const out = [];
    //         //             for (const entry of resp.data.files) {
    //         //                 try {
    //         //                     const b64 = entry.base64; const byteStr = atob(b64); const len = byteStr.length; const bytes = new Uint8Array(len);
    //         //                     for (let i = 0; i < len; i++) bytes[i] = byteStr.charCodeAt(i);
    //         //                     const ext = (entry.name || '').split('.').pop().toLowerCase();
    //         //                     let mime = 'application/octet-stream';
    //         //                     if (['txt', 'lrc', 'lrx', 'json'].includes(ext)) mime = 'text/plain'; else if (ext === 'mp3') mime = 'audio/mpeg'; else if (['m4a', 'aac'].includes(ext)) mime = 'audio/mp4'; else if (ext === 'wav') mime = 'audio/wav';
    //         //                     out.push(new File([bytes], entry.name || 'import', { type: mime }));
    //         //                 } catch { }
    //         //             }
    //         //             await processImportedFiles(out);
    //         //         });
    //         //         return;
    //         //     } catch (e) { /* continue */ }
    //         // }

    //         // const hasRawBridge = !hasAUv3Multi && !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.fileSystem);
    //         // if (hasRawBridge) {
    //         //     try {
    //         //         window.fileSystemCallback = async (resp) => {
    //         //             if (resp && resp.success && resp.data && resp.data.files) {
    //         //                 const out = []; for (const entry of resp.data.files) { try { const b64 = entry.base64; const bs = atob(b64); const len = bs.length; const bytes = new Uint8Array(len); for (let i = 0; i < len; i++) bytes[i] = bs.charCodeAt(i); const ext = (entry.name || '').split('.').pop().toLowerCase(); let mime = 'application/octet-stream'; if (['txt', 'lrc', 'lrx', 'json'].includes(ext)) mime = 'text/plain'; else if (ext === 'mp3') mime = 'audio/mpeg'; else if (['m4a', 'aac'].includes(ext)) mime = 'audio/mp4'; else if (ext === 'wav') mime = 'audio/wav'; out.push(new File([bytes], entry.name || 'import', { type: mime })); } catch { } }
    //         //                 await processImportedFiles(out);
    //         //             } else { fallbackChain(); }
    //         //         };
    //         //         window.webkit.messageHandlers.fileSystem.postMessage({ action: 'loadFilesWithDocumentPicker', fileTypes: ['txt', 'lrc', 'lrx', 'json', 'mp3', 'm4a', 'wav'] });
    //         //         return;
    //         //     } catch (e) { /* continue */ }
    //         // }

    //         // function fallbackChain() {
    //         //     const fsAccess = typeof window.showOpenFilePicker === 'function';
    //         //     if (fsAccess) {
    //         //         (async () => {
    //         //             try {
    //         //                 const handles = await window.showOpenFilePicker({ multiple: true, types: [{ description: 'Lyrics & Text', accept: { 'text/plain': ['.txt', '.lrc', '.lrx'] } }, { description: 'JSON', accept: { 'application/json': ['.json'] } }, { description: 'Audio', accept: { 'audio/*': ['.mp3', '.m4a', '.wav'] } }] });
    //         //                 const files = []; for (const h of handles) { try { files.push(await h.getFile()); } catch { } }
    //         //                 await processImportedFiles(files); return;
    //         //             } catch (err) { legacyInput(); }
    //         //         })();
    //         //     } else { legacyInput(); }
    //         // }

    //         // function legacyInput() {
    //         //     const input = document.createElement('input');
    //         //     input.type = 'file'; input.multiple = true; input.accept = '.txt,.lrc,.lrx,.json,.mp3,.m4a,.wav'; input.style.display = 'none';
    //         //     input.addEventListener('change', async (e) => { const files = Array.from(e.target.files || []); await processImportedFiles(files); input.remove(); });
    //         //     document.body.appendChild(input); setTimeout(() => input.click(), 0);
    //         // }

    //         // // Start fallback chain if native not used
    //         // fallbackChain();
    //     }
    // });
    // try { importFileButton.innerHTML = ''; const img = document.createElement('img'); img.src = 'assets/images/icons/folder.svg'; img.alt = 'import'; img.style.width = '14px'; img.style.height = '14px'; img.style.pointerEvents = 'none'; const span = document.createElement('span'); span.textContent = 'Import'; span.style.fontSize = UNIFIED_FONT_SIZE; importFileButton.append(img, span); } catch (e) { }

    // Auto Fill MIDI container
    const autoFillContainer = window.$('div', { id: 'auto-fill-midi-container', css: { display: 'flex', alignItems: 'center', gap: '5px', backgroundColor: UNIFIED_BTN_BG, height: '28px', padding: '0 8px', borderRadius: default_theme.borderRadius.sm, border: 'none', boxSizing: 'border-box' } });

    const newSongButton = window.$('button', {
        id: 'new-song-button',
        css: {
            backgroundColor: 'transparent',
            border: 'none',
            color: default_theme.colors.textMuted,
            fontSize: UNIFIED_FONT_SIZE,
            cursor: 'pointer',
            padding: '0',
            marginRight: '15px',

            display: 'flex',
            alignItems: 'center'
        },
        onClick: () => {
            // Try window scope first
            if (typeof window.createNewSongFromMenu === 'function') {
                window.createNewSongFromMenu();
                return;
            }
            // Fallback to direct implementation if function is missing
            if (window.createNewEmptySong) {
                window.createNewEmptySong();
                if (window.toggleLyricsEditMode) window.toggleLyricsEditMode();
            } else if (window.lyricsDisplay && typeof window.lyricsDisplay.createNewEmptySong === 'function') {
                window.lyricsDisplay.createNewEmptySong();
                if (window.toggleLyricsEditMode) window.toggleLyricsEditMode();
            } else {
                console.warn('❌ Impossible de créer une chanson : createNewEmptySong non disponible');
            }
        }
    });
    try {
        const img = document.createElement('img');
        img.src = 'assets/images/icons/new.svg';
        img.style.width = '14px';
        img.style.height = '14px';
        img.style.marginRight = '4px';
        img.style.pointerEvents = 'none'; // Ensure click passes through
        newSongButton.appendChild(img);
        const span = document.createElement('span');
        span.textContent = 'New song';
        span.style.pointerEvents = 'none'; // Ensure click passes through
        newSongButton.appendChild(span);
    } catch (e) {
        newSongButton.textContent = 'New song';
    }

    const autoFillLabel = window.$('span', { id: 'autoFillLabel', text: 'Base note:', css: { fontSize: UNIFIED_FONT_SIZE, color: default_theme.colors.textMuted, userSelect: 'none' } });

    const autoFillInput = window.$('input', {
        id: 'auto-fill-midi-input',
        type: 'text',
        css: {
            width: '50px',
            padding: '2px 4px',
            border: 'none',
            borderRadius: '3px',
            fontSize: '11px',
            textAlign: 'center',
            backgroundColor: 'rgb(48, 60, 78)',
            color: '#fff'
        }
    });
    autoFillInput.placeholder = 'Root';
    autoFillInput.value = '33';

    const autoFillButton = window.$('button', {
        id: 'auto-fill-midi-button',
        css: {
            ...default_theme.button,
            backgroundColor: UNIFIED_BTN_BG,
            width: 'auto',
            padding: '0 8px',
            fontSize: UNIFIED_FONT_SIZE,
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            height: '28px',
            lineHeight: '28px',
            boxSizing: 'border-box',
            boxShadow: 'none',
            WebkitBoxShadow: 'none'
        },
        onClick: () => autoFillMidiNotes()
    });
    try { autoFillButton.innerHTML = ''; const img = document.createElement('img'); img.src = 'assets/images/icons/target.svg'; img.alt = 'auto fill'; img.style.width = '14px'; img.style.height = '14px'; img.style.pointerEvents = 'none'; const span = document.createElement('span'); span.textContent = 'Fill bindings'; span.style.fontSize = UNIFIED_FONT_SIZE; autoFillButton.append(img, span); } catch (e) { }

    autoFillContainer.append(newSongButton, autoFillLabel, autoFillInput, autoFillButton);

    // Sort alphabetically button
    const sortAlphabeticallyButton = window.$('button', {
        id: 'sort-alphabetically-button', css: { ...default_theme.button, backgroundColor: UNIFIED_BTN_BG, width: 'auto', padding: '0 10px', fontSize: UNIFIED_FONT_SIZE, border: 'none', display: 'flex', alignItems: 'center', gap: '4px', height: '28px', lineHeight: '28px', boxSizing: 'border-box' }, onClick: () => {
            // Directly invoke local sort without rebuilding the whole panel to avoid duplicate separators / grips
            try {
                sortSongsAlphabetically();
            } catch (e) {
                console.warn('Sort A-Z failed:', e);
            }
        }
    });
    try { sortAlphabeticallyButton.innerHTML = ''; const span = document.createElement('span'); span.textContent = 'A-Z'; span.style.fontSize = UNIFIED_FONT_SIZE; sortAlphabeticallyButton.append(span); } catch (e) { }

    // Bouton supprimer toutes les chansons
    const deleteAllButton = window.$('button', {
        id: 'delete-all-songs-button', css: { ...default_theme.button, backgroundColor: UNIFIED_BTN_BG, width: 'auto', padding: '0 10px', fontSize: UNIFIED_FONT_SIZE, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '28px', lineHeight: '28px', boxSizing: 'border-box' }, onClick: () => {
            window.Modal && window.Modal({ title: 'Confirmation', content: '<p>Supprimer toutes les chansons ? Action irréversible.</p>', buttons: [{ text: 'Annuler' }, { text: 'Supprimer', onClick: () => { try { window.lyricsLibrary && window.lyricsLibrary.deleteAllSongs(); closeSongLibraryPanel(); showSongLibrary(); } catch { } }, css: { backgroundColor: default_theme.colors.danger, color: '#fff' } }], size: 'small' });
        }
    });
    try {
        deleteAllButton.innerHTML = '';
        const img = document.createElement('img');
        img.src = 'assets/images/icons/delete.svg';
        img.alt = 'delete all';
        img.style.width = '16px';
        img.style.height = '16px';
        img.style.pointerEvents = 'none';
        deleteAllButton.appendChild(img);
    } catch (e) { /* silent */ }
    // Create inline settings button (new instance) shown only inside song list panel
    const inlineSettingsButton = window.$('button', {
        id: 'settings_button_inline', css: { display: 'none' }, onClick: () => {
            // Required behavior: close song library panel but keep song list button marked active
            closeSongLibraryPanel(true);
            const btn = document.getElementById('song_list_button');
            if (btn && btn._setActive) btn._setActive(true);
            toggleSettingsPanel('settings_button_inline');
        }
    });
    // Inject SVG icon for inline settings
    // try {
    //     inlineSettingsButton.innerHTML = '';
    //     const img = document.createElement('img');
    //     img.src = 'assets/images/icons/settings.svg';
    //     img.alt = 'settings';
    //     img.style.width = '14px';
    //     img.style.height = '14px';
    //     img.style.pointerEvents = 'none';
    //     const span = document.createElement('span'); span.textContent = 'Settings'; span.style.fontSize = UNIFIED_FONT_SIZE; inlineSettingsButton.append(img, span);
    // } catch (e) { /* silent */ }

    // Hide original settings button while panel open (if exists)
    const originalSettings = document.getElementById('settings_button');
    if (originalSettings && originalSettings.style) {
        if (!originalSettings.__hiddenBySongLibrary) {
            originalSettings.__originalDisplay = originalSettings.style.display;
            originalSettings.__hiddenBySongLibrary = true;
        }
        originalSettings.style.display = 'none';
    }

    actionButtons.append(autoFillContainer, sortAlphabeticallyButton, deleteAllButton);
    modal.append(headerTitle, actionButtons);

    // Content with search and song list
    const content = window.UIManager.createModalContent({});

    // Search input
    const searchInput = window.$('input', {
        type: 'text',
        placeholder: 'Search songs...',
        css: {
            display: 'none',
            width: '100%',
            padding: '10px',
            border: 'none',
            borderRadius: '4px',
            marginBottom: '15px',
            fontSize: '14px',
            boxSizing: 'border-box',
            backgroundColor: 'rgb(48, 60, 78)',
            color: '#fff'
        }
    });

    // Song list container (override background to match action buttons: rgb(37,48,64))
    const listContainer = window.UIManager.createListContainer({
        css: {
            backgroundColor: 'rgb(37, 48, 64)'
        }
    });

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
    }

    function loadCustomSongOrder() {
        try {
            const savedOrder = localStorage.getItem('lyrix_custom_song_order');
            if (!savedOrder) {
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

        } catch (error) {
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
            // Enforce unified styling if legacy style (white background) persists
            if (input && input.style) {
                input.style.backgroundColor = 'rgb(48, 60, 78)';
                input.style.color = '#fff';
                input.style.border = input.style.border || '1px solid #ccc';
            }
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
    }

    // Function to auto-fill MIDI notes starting from root note
    function autoFillMidiNotes() {
        if (!window.midiUtilities) {
            window.Modal({
                title: '❌ Error',
                content: '<p>MIDI utilities not available</p>',
                buttons: [{ text: 'OK' }],
                size: 'small'
            });
            return;
        }

        const rootNoteStr = autoFillInput.value.trim();
        if (!rootNoteStr) {
            window.Modal({
                title: '❌ Error',
                content: '<p>Please enter a root note (0-127)</p>',
                buttons: [{ text: 'OK' }],
                size: 'small'
            });
            return;
        }

        const rootNote = parseInt(rootNoteStr);
        if (isNaN(rootNote) || rootNote < 0 || rootNote > 127) {
            window.Modal({
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
                skippedCount++;
                return;
            }

            try {
                // Remove any existing assignment for this song
                window.midiUtilities.removeMidiAssignment(item.value);

                // Set new assignment
                window.midiUtilities.setMidiAssignment(item.value, midiNote);
                assignedCount++;

            } catch (error) {
                skippedCount++;
            }
        });

        // Refresh MIDI inputs in the UI
        setTimeout(() => refreshMidiInputs(), 100);

    }

    function updateSongList() {
        listContainer.innerHTML = '';

        // Check if there are no songs to display
        if (filteredItems.length === 0) {
            const emptyMessage = window.$('div', {
                css: {
                    textAlign: 'center',
                    padding: '40px 20px',
                    color: '#666',
                    fontSize: '16px'
                }
            });

            const emptyIcon = window.$('div', {
                text: '',
                css: {
                    fontSize: '48px',
                    marginBottom: '15px'
                }
            });

            const emptyText = window.$('div', {
                text: songs.length === 0 ?
                    'No songs in your library yet.\nUse the buttons above to import existing songs.' :
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
            const itemDiv = window.UIManager.createListItem({
                css: {
                    backgroundColor: '#253040'
                }
            });

            // Add drag and drop functionality
            itemDiv.draggable = true;
            itemDiv.dataset.songIndex = index;
            itemDiv.style.cursor = 'grab';

            // Add drag handle visual indicator
            const dragHandle = window.$('span', {
                text: '⋮⋮',
                css: {
                    marginRight: '8px',
                    color: '#999',
                    fontSize: '14px',
                    cursor: 'grab',
                    userSelect: 'none'
                }
            });

            const textSpan = window.UIManager.createListItemText({
                text: item.text
            });

            // MIDI controls container
            const midiControls = window.$('div', {
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

            const midiInput = window.$('input', {
                type: 'number',
                min: '0',
                max: '127',
                placeholder: 'Note',
                value: currentMidiNote || '',
                css: {
                    width: '50px',
                    padding: '2px 4px',
                    border: 'none',
                    borderRadius: '3px',
                    fontSize: '11px',
                    textAlign: 'center',
                    backgroundColor: 'rgb(48, 60, 78)',
                    color: '#fff'
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
                } else if (window.midiUtilities && e.target.value === '') {
                    // Remove assignment if input is cleared
                    window.midiUtilities.removeMidiAssignment(item.value);
                }
            });

            // MIDI learn button
            const midiLearnButton = window.$('button', {
                text: '',
                css: {
                    width: '25px',
                    height: '25px',
                    border: 'none',
                    borderRadius: '3px',
                    backgroundColor: 'transparent',
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
            // Initial icon injection so it shows before first click
            try {
                midiLearnButton.innerHTML = '';
                const img = document.createElement('img');
                img.src = 'assets/images/icons/target.svg';
                img.alt = 'midi';
                img.style.width = '12px';
                img.style.height = '12px';
                img.style.pointerEvents = 'none';
                midiLearnButton.appendChild(img);
            } catch (e) { /* silent */ }

            // MIDI learn functionality
            midiLearnButton.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!window.midiUtilities) {
                    return;
                }

                if (window.midiUtilities.isLearning) {
                    // Stop learning
                    window.midiUtilities.stopMidiLearn();
                    midiLearnButton.style.backgroundColor = 'transparent';
                    midiLearnButton.style.setProperty('background-color', 'transparent', 'important');
                    midiLearnButton.style.color = '#007acc';
                    setTimeout(() => {
                        midiLearnButton.style.backgroundColor = 'transparent';
                        midiLearnButton.style.setProperty('background-color', 'transparent', 'important');
                    }, 0);
                    midiLearnButton.innerHTML = ''; try { const img = document.createElement('img'); img.src = 'assets/images/icons/target.svg'; img.alt = 'midi'; img.style.width = '12px'; img.style.height = '12px'; img.style.pointerEvents = 'none'; midiLearnButton.appendChild(img); } catch (e) { }
                } else {
                    // Start learning
                    midiLearnButton.style.backgroundColor = '#ff6b6b';
                    midiLearnButton.style.color = 'white';
                    midiLearnButton.textContent = '⏹️';

                    window.midiUtilities.startMidiLearn((midiNote) => {
                        // Remove any existing assignment for this song
                        window.midiUtilities.removeMidiAssignment(item.value);
                        // Set new assignment
                        window.midiUtilities.setMidiAssignment(item.value, midiNote);
                        // Update input field
                        midiInput.value = midiNote;
                        // Reset button appearance
                        midiLearnButton.style.backgroundColor = 'transparent';
                        midiLearnButton.style.setProperty('background-color', 'transparent', 'important');
                        midiLearnButton.style.color = '#007acc';
                        setTimeout(() => {
                            midiLearnButton.style.backgroundColor = 'transparent';
                            midiLearnButton.style.setProperty('background-color', 'transparent', 'important');
                        }, 0);
                        midiLearnButton.innerHTML = ''; try { const img = document.createElement('img'); img.src = 'assets/images/icons/target.svg'; img.alt = 'midi'; img.style.width = '12px'; img.style.height = '12px'; img.style.pointerEvents = 'none'; midiLearnButton.appendChild(img); } catch (e) { }
                    });
                }
            });

            midiControls.append(midiInput, midiLearnButton);

            // Delete button
            const deleteButton = window.UIManager.createDeleteButton({
                onClick: (e) => {
                    e.stopPropagation();

                    window.ConfirmModal({
                        title: 'Delete Song',
                        message: `Are you sure you want to delete "${item.song.title}" by ${item.song.artist}?`,
                        confirmText: 'Delete',
                        cancelText: 'Cancel',
                        onConfirm: () => {
                            try {
                                // Remove MIDI assignment when deleting song
                                if (window.midiUtilities) {
                                    window.midiUtilities.removeMidiAssignment(item.value);
                                }
                                const success = window.lyricsLibrary.deleteSong(item.value);
                                if (success) {
                                    closeSongLibraryPanel();
                                    showSongLibrary();
                                } else {
                                }
                            } catch (error) {
                            }
                        }
                    });
                }
            });

            // Controls container for MIDI and delete buttons
            const controlsContainer = window.$('div', {
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
                    window.loadAndDisplaySong(item.value);
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
                }
            });

            itemDiv.append(dragHandle, textSpan, controlsContainer);
            listContainer.appendChild(itemDiv);
        });
    }

    // Search functionality
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        filteredItems = songItems.filter(item =>
            item.text.toLowerCase().includes(searchTerm)
        );
        updateSongList();
        // Refresh MIDI inputs after search
        setTimeout(() => refreshMidiInputs(), 50);
    });

    content.append(searchInput, listContainer);
    updateSongList();

    // Refresh MIDI inputs after DOM is ready
    setTimeout(() => {
        refreshMidiInputs();
    }, 100);

    // Assemble panel (without footer/close button)
    modal.append(content);
    modalContainer.appendChild(modal);

    // Create resize grip
    const resizeGrip = window.$('div', {
        id: 'song-library-resize-grip',
        css: {
            width: '100%',
            height: '8px',
            // More greyed blue (darker, desaturated)
            backgroundColor: '#364754',
            cursor: 'ns-resize',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderTop: '1px solid #3d566b',
            position: 'relative'
        }
    });

    // Add visual indicator (dots)
    const gripIndicator = window.$('div', {
        css: {
            width: '30px',
            height: '4px',
            backgroundColor: '#90b0c6',
            borderRadius: '2px'
        }
    });

    // Force stable color on hover (prevent any external CSS turning it white)
    const stableColor = '#364754';
    function lockGripColor() {
        resizeGrip.style.backgroundColor = stableColor;
    }
    ['mouseenter', 'mouseleave', 'mouseover', 'mouseout', 'focus', 'blur'].forEach(evt => {
        resizeGrip.addEventListener(evt, lockGripColor);
    });

    // Add strong CSS override to defeat external :hover rules turning it white
    if (!document.getElementById('song-library-resize-grip-style')) {
        const styleEl = document.createElement('style');
        styleEl.id = 'song-library-resize-grip-style';
        styleEl.textContent = `#song-library-resize-grip, #song-library-resize-grip:hover, #song-library-resize-grip:active { background-color: #364754 !important; }`;
        document.head.appendChild(styleEl);
    }

    resizeGrip.appendChild(gripIndicator);

    // Insert between toolbar and lyrics (not as modal overlay)
    if (toolbar && lyricsContainer) {
        if (toolbar.nextSibling) {
            toolbar.parentNode.insertBefore(modalContainer, toolbar.nextSibling);
            toolbar.parentNode.insertBefore(resizeGrip, modalContainer.nextSibling);
        } else {
            toolbar.parentNode.appendChild(modalContainer);
            toolbar.parentNode.appendChild(resizeGrip);
        }

        // Add resize functionality
        addResizeListeners(modalContainer, resizeGrip, 'lyrix_song_library_panel_height');
    } else {
        // Fallback: add to body if toolbar/lyrics not found
        document.body.appendChild(modalContainer);
        document.body.appendChild(resizeGrip);

        // Add resize functionality
        addResizeListeners(modalContainer, resizeGrip, 'lyrix_song_library_panel_height');
    }

    // Focus search input
    setTimeout(() => searchInput.focus(), 100);
}

// Add resize functionality to panels
function addResizeListeners(panel, grip, storageKey) {
    let isResizing = false;
    let startY = 0;
    let startHeight = 0;

    // Hover effects for the grip
    grip.addEventListener('mouseenter', () => {
        grip.style.backgroundColor = '#d0d0d0';
        grip.querySelector('div').style.backgroundColor = '#666';
    });

    grip.addEventListener('mouseleave', () => {
        if (!isResizing) {
            grip.style.backgroundColor = '#e0e0e0';
            grip.querySelector('div').style.backgroundColor = '#999';
        }
    });

    // Start resizing
    grip.addEventListener('mousedown', (e) => {
        isResizing = true;
        startY = e.clientY;
        startHeight = parseInt(window.getComputedStyle(panel).height, 10);

        grip.style.backgroundColor = '#007acc';
        grip.querySelector('div').style.backgroundColor = 'white';

        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';

        e.preventDefault();
    });

    // Handle resizing
    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;

        const deltaY = e.clientY - startY;
        const newHeight = startHeight + deltaY;

        // Set minimum and maximum heights
        const minHeight = 150; // minimum 150px
        const maxHeight = window.innerHeight * 0.8; // maximum 80% of viewport height

        const clampedHeight = Math.max(minHeight, Math.min(maxHeight, newHeight));

        panel.style.height = `${clampedHeight}px`;

        e.preventDefault();
    });

    // Stop resizing
    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;

            // Save the new height
            const finalHeight = panel.style.height;
            localStorage.setItem(storageKey, finalHeight);

            // Reset cursor and selection
            document.body.style.cursor = '';
            document.body.style.userSelect = '';

            // Reset grip appearance
            grip.style.backgroundColor = '#e0e0e0';
            grip.querySelector('div').style.backgroundColor = '#999';
        }
    });
}
