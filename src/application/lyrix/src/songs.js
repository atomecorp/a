// Song management for Lyrix application
import { CONSTANTS } from './constants.js';
import { StorageManager } from './storage.js';
import { SyncedLyrics } from './syncedLyrics.js';

export class SongManager {
    
    // Load song by name (search)
    static loadByName(searchTerm, library) {
        const results = library.searchSongs(searchTerm);
        
        if (results.length === 0) {
            console.log('❌ No songs found for:', searchTerm);
            return null;
        }
        
        if (results.length === 1) {
            const song = library.getSongById(results[0].songId);
            console.log('✅ Song loaded:', song.metadata.title, 'by', song.metadata.artist);
            return song;
        }
        
        // Multiple results
        console.log('🔍 Multiple songs found for "' + searchTerm + '":');
        results.forEach((result, index) => {
            console.log(`  ${index + 1}. ${result.title} - ${result.artist} (ID: ${result.songId})`);
        });
        
        // Return first by default
        const song = library.getSongById(results[0].songId);
        console.log('✅ First song loaded:', song.metadata.title);
        return song;
    }
    
    // Show library statistics
    static showStats(library) {
        const stats = library.getStats();
        console.log('📊 Library statistics:');
        console.log(`  - ${stats.totalSongs} songs`);
        console.log(`  - ${stats.uniqueArtists} unique artists`);
        console.log(`  - ${stats.totalLines} lyric lines`);
        console.log(`  - Total duration: ${(stats.totalDuration / 1000 / 60).toFixed(1)} minutes`);
        return stats;
    }
    
    // Load song in display
    static loadInDisplay(songName, library, display) {
        if (!display) {
            console.log('❌ LyricsDisplay not initialized');
            return null;
        }
        
        const song = this.loadByName(songName, library);
        if (song) {
            display.loadLyrics(song);
            console.log('✅ Song loaded in display:', song.metadata.title);
        }
        return song;
    }
    
    // Create new song
    // static create(title, artist, album = '', library) {
    //     console.log('🆕 Creating new song:', title, 'by', library);
    //     if (!title || !artist) {
    //         console.log('❌ Title and artist required');
    //         return null;
    //     }
    //     // Crée la chanson avec metadata uniquement
    //     const newSong = library.createSong(title, artist, album);
    //     newSong.addLine(0, 'First lyric line...', 'vocal');
    //     library.saveSong(newSong);
    //     console.log('✅ New song created:', newSong);
    //     return newSong;
    // }
    
    // Delete song
    // static delete(songIdentifier, library, display) {
    //     let songId = songIdentifier;
        
    //     // If it's a name, search for ID
    //     if (typeof songIdentifier === 'string' && !songIdentifier.includes('_')) {
    //         const results = library.searchSongs(songIdentifier);
    //         if (results.length === 0) {
    //             console.log('❌ Song not found:', songIdentifier);
    //             return false;
    //         }
    //         songId = results[0].songId;
    //     }
        
    //     const success = library.deleteSong(songId);
    //     if (success && display?.currentLyrics?.metadata.songId === songId) {
    //         // Clean display if deleted song was showing
    //         display.currentLyrics = null;
    //         display.updateHeader();
    //         display.renderLines();
    //     }
        
    //     console.log(success ? '✅ Song deleted' : '❌ Deletion failed');
    //     return success;
    // }
    
    // List all songs
    // static listAll(library) {
    //     const songs = library.getAllSongs();
    //     console.log('📋 Song list (' + songs.length + '):');
    //     songs.forEach((song, index) => {
    //         const audioIcon = song.hasAudio ? '🎵' : '📝';
    //         console.log(`  ${index + 1}. ${audioIcon} ${song.title} - ${song.artist}`);
    //     });
    //     return songs;
    // }
    
    // Search songs by title
    static searchByTitle(searchTerm, library) {
        return library.searchByTitle(searchTerm);
    }
    
    // Search songs by artist
    static searchByArtist(searchTerm, library) {
        return library.searchByArtist(searchTerm);
    }
    
    // Search songs (title and artist)
    static search(searchTerm, library) {
        return library.searchSongs(searchTerm);
    }
    
    // Create demo songs
    static createDemoSongs(library) {
        console.log('🎵 Creating demo songs...');
        
        // Create Darkbox song
        const darkboxData = CONSTANTS.DEMO_SONGS.DARKBOX;
        const darkboxSong = library.createSong(darkboxData.title, darkboxData.artist, darkboxData.album);
        darkboxData.lyrics.forEach(lyric => {
            darkboxSong.addLine(lyric.time, lyric.text, lyric.type || 'vocal');
        });
        if (darkboxData.audioFile) {
            darkboxSong.setAudioPath(darkboxData.audioFile);
        }
        library.saveSong(darkboxSong);
        
        // Create Digital Dreams song
        const digitalData = CONSTANTS.DEMO_SONGS.DIGITAL_DREAMS;
        const digitalSong = library.createSong(digitalData.title, digitalData.artist, digitalData.album);
        digitalData.lyrics.forEach(lyric => {
            digitalSong.addLine(lyric.time, lyric.text, lyric.type || 'vocal');
        });
        if (digitalData.audioFile) {
            digitalSong.setAudioPath(digitalData.audioFile);
        }
        library.saveSong(digitalSong);
        
        console.log('✅ Demo songs created');
        return { darkboxSong, digitalSong };
    }
    
    // Import from text file
    static importFromText(filename, content, library) {
        try {
            // Extract title from filename
            const title = filename.replace(/\.[^/.]+$/, '');
            
            // Check if it's LRC file
            if (filename.toLowerCase().endsWith('.lrc')) {
                return this.importFromLRC(title, content, library);
            }
            
            // Process as plain text
            return this.importFromPlainText(title, content, library);
            
        } catch (error) {
            console.error('❌ Error importing song:', error);
            return null;
        }
    }
    
    // Import from LRC format
    static importFromLRC(title, lrcContent, library) {
        try {
            const syncedLyrics = SyncedLyrics.fromLRC(lrcContent);
            
            if (!syncedLyrics.metadata.title) {
                syncedLyrics.metadata.title = title;
            }
            if (!syncedLyrics.metadata.artist) {
                syncedLyrics.metadata.artist = 'Unknown Artist';
            }
            
            // Regenerate ID with new metadata
            syncedLyrics.songId = library.generateSongId(
                syncedLyrics.metadata.title, 
                syncedLyrics.metadata.artist
            );
            
            library.saveSong(syncedLyrics);
            console.log('✅ LRC song created:', syncedLyrics.metadata.title);
            return syncedLyrics;
            
        } catch (error) {
            console.error('❌ Error parsing LRC:', error);
            // Fallback to plain text
            return this.importFromPlainText(title, lrcContent, library);
        }
    }
    
    // Import from plain text
    static importFromPlainText(title, textContent, library) {
        const newSong = library.createSong(title, 'Unknown Artist', '');
        
        // Split text into lines
        const lines = textContent.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);
        
        // Add each line with automatic timecode (5 seconds between lines)
        lines.forEach((line, index) => {
            const timeMs = index * 5000; // 5 seconds between lines
            newSong.addLine(timeMs, line, 'vocal');
        });
        
        // If no lines were added, add default line
        if (lines.length === 0) {
            newSong.addLine(0, 'Lyrics imported from file...', 'vocal');
        }
        
        library.saveSong(newSong);
        console.log('✅ Text song created:', title, `(${lines.length} lines)`);
        return newSong;
    }
    
    // Export song to LRC format
    static exportToLRC(song) {
        if (!song || !song.toLRC) {
            console.error('❌ Invalid song for LRC export');
            return null;
        }
        
        return song.toLRC();
    }
    
    // Get song statistics
    static getSongStats(library) {
        const allSongs = library.getAllSongs();
        const stats = {
            total: allSongs.length,
            withAudio: allSongs.filter(song => song.hasAudio).length,
            withoutAudio: allSongs.filter(song => !song.hasAudio).length,
            artists: [...new Set(allSongs.map(song => song.artist))].length,
            averageLines: allSongs.length > 0 ? 
                Math.round(allSongs.reduce((sum, song) => sum + song.linesCount, 0) / allSongs.length) : 0
        };
        
        console.log('📊 Song statistics:', stats);
        return stats;
    }
    
    // Clean up duplicate songs
    static cleanupDuplicates(library) {
        console.log('🧹 Cleaning up duplicate songs...');
        
        const allSongs = library.getAllSongs();
        const duplicateGroups = {};
        
        // Group songs by title and artist
        allSongs.forEach(song => {
            const key = `${song.title.toLowerCase()}_${song.artist.toLowerCase()}`;
            if (!duplicateGroups[key]) {
                duplicateGroups[key] = [];
            }
            duplicateGroups[key].push(song);
        });
        
        let deletedCount = 0;
        
        // Process each group
        Object.values(duplicateGroups).forEach(group => {
            if (group.length > 1) {
                // Sort by lastModified date (keep the newest)
                group.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
                
                // Delete all but the first (newest)
                for (let i = 1; i < group.length; i++) {
                    library.deleteSong(group[i].songId);
                    deletedCount++;
                    console.log('🗑️ Deleted duplicate:', group[i].title);
                }
            }
        });
        
        console.log(`✅ Cleanup completed - ${deletedCount} duplicates removed`);
        return deletedCount;
    }
}
