// TEMPORARY MIGRATION INDEX - Handles both old and new import paths
// This allows gradual migration while maintaining functionality

// Export everything from the new organized structure
export * from './index.js';

// Legacy re-exports for backward compatibility during migration
export { CONSTANTS } from './core/constants.js';
export { SyncedLyrics } from './core/syncedLyrics.js';
export { AudioManager, extractCleanFileName } from './features/audio/audio.js';
export { displayLyrics, displayCurrentSong } from './features/lyrics/display.js';
export { LyricLibraryManager } from './features/lyrics/library.js';
export { SongUtils } from './features/lyrics/SongUtils.js';
export { loadSongs, saveSongs } from './features/lyrics/songs.js';
export { setupDragAndDrop } from './features/import/dragDrop.js';
export { setupMidiControllers } from './features/midi/midi_utilities.js';
export { createSettingsModal } from './components/modal.js';
export { createSettingsPage } from './components/settings.js';
export { createStyleManager } from './components/style.js';
export { createUI } from './components/ui.js';
export { loadPreferences, savePreferences } from './services/prefs.js';
export { StorageManager } from './services/storage.js';
