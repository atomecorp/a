// Storage management for Lyrix application
import { CONSTANTS } from '../core/constants.js';

export class StorageManager {
    
    // Font size management
    static saveFontSize(size) {
        try {
            localStorage.setItem('lyrix_font_size', size.toString());
        } catch (error) {
        }
    }
    
    static loadFontSize() {
        try {
            const saved = localStorage.getItem(CONSTANTS.STORAGE.FONT_SIZE);
            if (saved) {
                const size = parseInt(saved, 10);
                if (size >= CONSTANTS.UI.MIN_FONT_SIZE && size <= CONSTANTS.UI.MAX_FONT_SIZE) {
                    return size;
                }
            }
        } catch (error) {
        }
        return CONSTANTS.UI.DEFAULT_FONT_SIZE;
    }
    
    // Last song management
    static saveLastSong(songData) {
        try {
            localStorage.setItem('lyrix_last_song', JSON.stringify(data));
        } catch (error) {
        }
    }
    
    static loadLastSong() {
        try {
            const saved = localStorage.getItem(CONSTANTS.STORAGE.LAST_SONG);
            if (saved) {
                const data = JSON.parse(saved);
                return data;
            }
        } catch (error) {
        }
        return null;
    }
    
    // Library settings
    static saveLibrarySettings(settings) {
        try {
            localStorage.setItem('lyrix_library_settings', JSON.stringify(settings));
        } catch (error) {
        }
    }
    
    static loadLibrarySettings() {
        try {
            const settings = localStorage.getItem(CONSTANTS.STORAGE.SETTINGS_KEY);
            if (settings) {
                const parsed = JSON.parse(settings);
                return parsed;
            }
        } catch (error) {
        }
        return {};
    }
    
    // Song list management
    static saveSongList(songList) {
        try {
            localStorage.setItem(CONSTANTS.STORAGE.SONG_LIST_KEY, JSON.stringify(songList));
        } catch (error) {
        }
    }
    
    static loadSongList() {
        try {
            const songList = localStorage.getItem(CONSTANTS.STORAGE.SONG_LIST_KEY);
            if (songList) {
                const parsed = JSON.parse(songList);
                return parsed;
            }
        } catch (error) {
        }
        return [];
    }
    
    // Song storage
    static saveSong(songId, songData) {
        const storageKey = CONSTANTS.STORAGE.LIBRARY_PREFIX + songId;
        try {
            localStorage.setItem(storageKey, JSON.stringify(songData));
            return storageKey;
        } catch (error) {
            return null;
        }
    }
    
    static loadSong(songId) {
        const storageKey = CONSTANTS.STORAGE.LIBRARY_PREFIX + songId;
        try {
            const data = localStorage.getItem(storageKey);
            if (!data) return null;
            
            const parsed = JSON.parse(data);
            return parsed;
        } catch (error) {
            return null;
        }
    }
    
    static deleteSong(songId) {
        const storageKey = CONSTANTS.STORAGE.LIBRARY_PREFIX + songId;
        try {
            const existingSong = localStorage.getItem(storageKey);
            if (!existingSong) {
                return false;
            }
            
            localStorage.removeItem(storageKey);
            return true;
        } catch (error) {
            return false;
        }
    }
    
    // Get all songs
    static getAllSongs() {
        const keys = Object.keys(localStorage).filter(key => key.startsWith(CONSTANTS.STORAGE.LIBRARY_PREFIX));
        return keys.map(key => {
            try {
                const data = JSON.parse(localStorage.getItem(key));
                return {
                    key: key,
                    songId: data.songId,
                    title: data.metadata.title,
                    artist: data.metadata.artist,
                    album: data.metadata.album,
                    duration: data.metadata.duration,
                    lastModified: data.metadata.lastModified,
                    linesCount: data.lines.length,
                    hasAudio: !!data.metadata.audioPath,
                    audioPath: data.metadata.audioPath
                };
            } catch {
                return null;
            }
        }).filter(item => item !== null);
    }
    
    // Last opened song management (alternative method names for compatibility)
    static getLastOpenedSong() {
        try {
            // First try to get the saved key
            const savedKey = localStorage.getItem(CONSTANTS.STORAGE.LAST_SONG + '_key');
            if (savedKey) {
                return savedKey;
            }
            
            // Fallback to getting from last song data
            const lastSong = this.loadLastSong();
            return lastSong ? lastSong.id : null;
        } catch (error) {
            return null;
        }
    }

    static clearLastOpenedSong() {
        try {
            localStorage.removeItem('lastOpenedSongKey');
            localStorage.removeItem('lastOpenedSong');
            localStorage.removeItem('currentAudioFile');
        } catch (error) {
        }
    }
    
    static setLastOpenedSong(songKey) {
        // For this method to work properly, we need to load the song data first
        // This is a simplified version that just stores the key
        try {
            localStorage.setItem(CONSTANTS.STORAGE.LAST_SONG + '_key', songKey);
        } catch (error) {
        }
    }
    
    // Clear all data
    static clearAll() {
        try {
            localStorage.removeItem(CONSTANTS.STORAGE.FONT_SIZE);
            localStorage.removeItem(CONSTANTS.STORAGE.LAST_SONG);
            localStorage.removeItem(CONSTANTS.STORAGE.SETTINGS_KEY);
            localStorage.removeItem(CONSTANTS.STORAGE.SONG_LIST_KEY);
            
            // Clear all songs
            const songKeys = Object.keys(localStorage).filter(key => key.startsWith(CONSTANTS.STORAGE.LIBRARY_PREFIX));
            songKeys.forEach(key => localStorage.removeItem(key));
            
        } catch (error) {
        }
    }
}
