// LyricsLibrary class for Lyrix application
import { CONSTANTS } from '../../core/constants.js';
import { SyncedLyrics } from '../../core/syncedLyrics.js';
import { StorageManager } from '../../services/storage.js';

// Centralizes creation of a SyncedLyrics instance from a songData object
export function createSyncedLyricsFromData(songData) {
    // Create an empty SyncedLyrics instance
    const lyrics = new SyncedLyrics();
    // Stocke toutes les infos dans metadata UNIQUEMENT
    lyrics.metadata = {
        ...(songData.metadata || {}),
        title: songData.metadata?.title || songData.title || '',
        artist: songData.metadata?.artist || songData.artist || '',
        album: songData.metadata?.album || songData.album || '',
        duration: songData.metadata?.duration || songData.duration || 0
    };
    lyrics.songId = songData.songId || '';
    lyrics.lines = songData.lines || [];
    lyrics.audioPath = songData.audioPath;
    lyrics.syncData = songData.syncData;
    // Remove duplicate fields at root level if present (including on export)
    Object.keys(lyrics).forEach(key => {
        if (["title","artist","album","duration"].includes(key)) {
            delete lyrics[key];
        }
    });
    return lyrics;
}

export class LyricsLibrary {
    constructor() {
        this.builtInSongs = new Set(); // Track which built-in songs exist
        this.init();
    }
    
    // Initialize library
    init() {
        this.loadBuiltInSongsStatus();
    }
    
    // Load status of built-in songs
    loadBuiltInSongsStatus() {
        try {
            const status = localStorage.getItem(CONSTANTS.STORAGE.BUILTIN_SONGS);
            if (status) {
                this.builtInSongs = new Set(JSON.parse(status));
            }
        } catch (error) {
            this.builtInSongs = new Set();
        }
    }
    
    // Save status of built-in songs
    saveBuiltInSongsStatus() {
        try {
            localStorage.setItem(CONSTANTS.STORAGE.BUILTIN_SONGS, JSON.stringify([...this.builtInSongs]));
        } catch (error) {
        }
    }
    
    // Check if built-in song exists
    hasBuiltInSong(songId) {
        return this.builtInSongs.has(songId);
    }
    
    // Add built-in song status
    addBuiltInSong(songId) {
        this.builtInSongs.add(songId);
        this.saveBuiltInSongsStatus();
    }
    
    // Remove built-in song status
    removeBuiltInSong(songId) {
        this.builtInSongs.delete(songId);
        this.saveBuiltInSongsStatus();
    }
    
    // Get all songs from localStorage
    getAllSongs() {
        const songs = [];
        const keys = Object.keys(localStorage);
        
        keys.forEach(key => {
            if (key.startsWith(CONSTANTS.STORAGE.LIBRARY_PREFIX)) {
                try {
                    const data = JSON.parse(localStorage.getItem(key));
                    if (data && data.metadata) {
                        songs.push({
                            key: key,
                            songId: data.songId,
                            title: data.metadata.title || data.title || '[no title]',
                            artist: data.metadata.artist || data.artist || '[no artist]',
                            album: data.metadata.album || data.album || '',
                            duration: data.metadata.duration || 0,
                            lastModified: data.metadata.lastModified,
                            created: data.metadata.created,
                            audioPath: data.metadata.audioPath,
                            linesCount: data.lines ? data.lines.length : 0,
                            isBuiltIn: this.hasBuiltInSong(data.songId)
                        });
                    }
                } catch (error) {
                }
            }
        });
        
        // Sort by last modified date (newest first)
        songs.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
        
        return songs;
    }
    
    // Search songs by title or artist
    searchSongs(searchTerm) {
        if (!searchTerm) return this.getAllSongs();
        
        const allSongs = this.getAllSongs();
        const term = searchTerm.toLowerCase();
        
        return allSongs.filter(song => 
            song.title.toLowerCase().includes(term) ||
            song.artist.toLowerCase().includes(term) ||
            (song.album && song.album.toLowerCase().includes(term))
        );
    }
    
    // Get song by key
    getSong(key) {
        return SyncedLyrics.loadFromStorage(key);
    }
    
    // Get song by songId
    getSongById(songId) {
        const allSongs = this.getAllSongs();
        const song = allSongs.find(s => s.songId === songId);
        return song ? this.getSong(song.key) : null;
    }
    
    // Create a new song
    createSong(title, artist, album = '', duration = 0) {
        const songId = this.generateSongId(title, artist);
        return new SyncedLyrics(title, artist, album, duration, songId);
    }
    
    // Generate unique song ID
    generateSongId(title, artist) {
        const safeTitle = (typeof title === 'string') ? title : '';
        const safeArtist = (typeof artist === 'string') ? artist : '';
        const normalizedTitle = safeTitle.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const normalizedArtist = safeArtist.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const timestamp = Date.now();
        return `${normalizedArtist}_${normalizedTitle}_${timestamp}`;
    }
    
    // Save a song to the library
    saveSong(syncedLyrics) {
        try {
            // Nettoyage strict AVANT sauvegarde
            ['title','artist','album','duration'].forEach(key => {
                if (syncedLyrics.hasOwnProperty(key)) {
                    delete syncedLyrics[key];
                }
            });
            const storageKey = syncedLyrics.saveToStorage();
            if (storageKey) {
                return storageKey;
            } else {
                throw new Error('Failed to save to storage');
            }
        } catch (error) {
            return null;
        }
    }
    
    // Delete song
    deleteSong(key) {
        try {
            // Get song data to remove from built-in status if needed
            const songData = localStorage.getItem(key);
            if (songData) {
                const parsed = JSON.parse(songData);
                if (parsed.songId) {
                    this.removeBuiltInSong(parsed.songId);
                }
            }
            
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            return false;
        }
    }
    
    // Delete all songs
    deleteAllSongs() {
        const songs = this.getAllSongs();
        let deletedCount = 0;
        
        songs.forEach(song => {
            if (this.deleteSong(song.key)) {
                deletedCount++;
            }
        });
        
        // Clear built-in songs tracking
        this.builtInSongs.clear();
        this.saveBuiltInSongsStatus();
        
        return deletedCount;
    }
    
    // Get library statistics
    getStats() {
        const songs = this.getAllSongs();
        const totalLines = songs.reduce((sum, song) => sum + song.linesCount, 0);
        const songsWithAudio = songs.filter(song => song.audioPath).length;
        const builtInCount = songs.filter(song => song.isBuiltIn).length;
        
        return {
            totalSongs: songs.length,
            totalLines: totalLines,
            songsWithAudio: songsWithAudio,
            builtInSongs: builtInCount,
            userSongs: songs.length - builtInCount,
            averageLinesPerSong: songs.length > 0 ? Math.round(totalLines / songs.length) : 0,
            oldestSong: songs.length > 0 ? songs[songs.length - 1] : null,
            newestSong: songs.length > 0 ? songs[0] : null
        };
    }
    
    // Export library to JSON
    exportLibrary() {
        const songs = this.getAllSongs();
        const exportData = {
            exportDate: new Date().toISOString(),
            version: '1.0',
            totalSongs: songs.length,
            songs: []
        };
        
        songs.forEach(songInfo => {
            const fullSong = this.getSong(songInfo.key);
            if (fullSong) {
                exportData.songs.push(fullSong);
            }
        });
        
        return exportData;
    }
    
    // Import library from JSON
    importLibrary(importData, options = { overwrite: false, markAsBuiltIn: false }) {
        if (!importData || !importData.songs || !Array.isArray(importData.songs)) {
            throw new Error('Invalid import data format');
        }
        
        let importedCount = 0;
        let skippedCount = 0;
        let errors = [];
        
        importData.songs.forEach((songData, index) => {
            try {
                // Use the centralized function
                const lyrics = createSyncedLyricsFromData(songData);
                // Check if song already exists
                const existingKey = `${CONSTANTS.STORAGE.LIBRARY_PREFIX}${lyrics.songId}`;
                const exists = localStorage.getItem(existingKey);
                if (exists && !options.overwrite) {
                    skippedCount++;
                    return;
                }
                // Save song
                const savedKey = lyrics.saveToStorage();
                if (savedKey) {
                    importedCount++;
                    // Mark as built-in if requested
                    if (options.markAsBuiltIn) {
                        this.addBuiltInSong(lyrics.songId);
                    }
                } else {
                    throw new Error('Failed to save to storage');
                }
            } catch (error) {
                errors.push(`Song ${index + 1}: ${error.message}`);
            }
        });
        
        const result = {
            imported: importedCount,
            skipped: skippedCount,
            errors: errors.length,
            errorDetails: errors
        };
        
        return result;
    }
    
    // Get songs with missing audio files
    getSongsWithMissingAudio() {
        const songs = this.getAllSongs();
        return songs.filter(song => !song.audioPath || song.audioPath.trim() === '');
    }
    
    // Get songs by artist
    getSongsByArtist(artist) {
        const allSongs = this.getAllSongs();
        return allSongs.filter(song => 
            song.artist.toLowerCase() === artist.toLowerCase()
        );
    }
    
    // Get unique artists
    getUniqueArtists() {
        const songs = this.getAllSongs();
        const artists = [...new Set(songs.map(song => song.artist))];
        return artists.sort();
    }
    
    // Get unique albums
    getUniqueAlbums() {
        const songs = this.getAllSongs();
        const albums = [...new Set(songs.map(song => song.album).filter(album => album && album.trim() !== ''))];
        return albums.sort();
    }
    
    // Validate library integrity
    validateLibrary() {
        const songs = this.getAllSongs();
        const issues = [];
        
        songs.forEach(songInfo => {
            try {
                const fullSong = this.getSong(songInfo.key);
                if (!fullSong) {
                    issues.push(`Cannot load song: ${songInfo.title} (${songInfo.key})`);
                    return;
                }
                
                // Check required metadata
                if (!fullSong.metadata.title || !fullSong.metadata.artist) {
                    issues.push(`Missing title/artist: ${songInfo.key}`);
                }
                
                // Check lines structure
                if (!Array.isArray(fullSong.lines)) {
                    issues.push(`Invalid lines array: ${fullSong.metadata.title}`);
                } else {
                    fullSong.lines.forEach((line, index) => {
                        if (typeof line.time !== 'number' || typeof line.text !== 'string') {
                            issues.push(`Invalid line ${index + 1} in ${fullSong.metadata.title}`);
                        }
                    });
                }
                
            } catch (error) {
                issues.push(`Corruption in ${songInfo.title}: ${error.message}`);
            }
        });
        
        return {
            isValid: issues.length === 0,
            issues: issues,
            totalSongs: songs.length,
            validSongs: songs.length - issues.length
        };
    }
    
    // Clean up corrupted entries
    cleanupLibrary() {
        const validation = this.validateLibrary();
        let cleanedCount = 0;
        
        if (!validation.isValid) {
            
            validation.issues.forEach(issue => {
                // Here you could implement specific cleanup logic
                // For now, just log the issues
            });
            
        } else {
        }
        
        return {
            issuesFound: validation.issues.length,
            cleaned: cleanedCount
        };
    }
}
