  // Console redefinition
        window.console.log = (function(oldLog) {
            return function(message) {
                oldLog(message);
                try {
                    window.webkit.messageHandlers.console.postMessage("LOG: " + message);
                } catch(e) {
                    oldLog();
                }
            }
        })(window.console.log);

        window.console.error = (function(oldErr) {
            return function(message) {
                oldErr(message);
                try {
                    window.webkit.messageHandlers.console.postMessage("ERROR: " + message);
                } catch(e) {
                    oldErr();
                }
            }
        })(window.console.error);

// Main exports for the lyrix module - provides clean imports from reorganized structure

// Core modules
export { CONSTANTS } from './core/constants.js';
export { SyncedLyrics } from './core/syncedLyrics.js';

// Services
export { StorageManager } from './services/storage.js';

// Components
export { UIManager } from './components/ui.js';
export { Modal, InputModal, FormModal, SelectModal, ConfirmModal } from './components/modal.js';
export { default_theme } from './components/style.js';

// Features - Audio
export { AudioManager, AudioController } from './features/audio/audio.js';

// Features - Lyrics
export { LyricsDisplay } from './features/lyrics/display.js';
export { LyricsLibrary } from './features/lyrics/library.js';
export { SongManager } from './features/lyrics/songs.js';
export { exportSongsToLRX } from './features/lyrics/SongUtils.js';

// Features - MIDI
export { MidiUtilities } from './features/midi/midi_utilities.js';

// Features - Import
export { DragDropManager } from './features/import/dragDrop.js';
///