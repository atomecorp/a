// SyncedLyrics class for Lyrix application
import { CONSTANTS } from './constants.js';
import { AudioManager } from './audio.js';

export class SyncedLyrics {
    constructor(title, artist, album = '', duration = 0, songId = null) {
        this.songId = songId || this.generateSongId(title, artist);
        this.metadata = {
            title: title,
            artist: artist,
            album: album,
            duration: duration, // in milliseconds
            format: 'syncedlyrics-v1.0',
            created: new Date().toISOString(),
            lastModified: new Date().toISOString(),
            audioPath: null // Path to associated audio file
        };
        this.lines = []; // Array of {time, text, type} objects
        this.version = '1.0';
    }
    
    // Generate unique ID for song
    generateSongId(title, artist) {
        const normalizedTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const normalizedArtist = artist.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const timestamp = Date.now();
        return `${normalizedArtist}_${normalizedTitle}_${timestamp}`;
    }
    
    // Add lyric line with timecode
    addLine(timeMs, text, type = 'vocal') {
        this.lines.push({
            time: timeMs,
            text: text.trim(),
            type: type, // 'vocal', 'chorus', 'bridge', 'instrumental', 'outro'
            id: this.generateLineId()
        });
        this.sortLines();
        this.updateLastModified();
        return this;
    }
    
    // Add multiple lines at once
    addLines(linesArray) {
        linesArray.forEach(line => {
            this.addLine(line.time, line.text, line.type || 'vocal');
        });
        return this;
    }
    
    // Generate unique ID for each line
    generateLineId() {
        return 'line_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    // Ensure all lines have IDs (for backward compatibility)
    ensureLineIds() {
        this.lines.forEach(line => {
            if (!line.id) {
                line.id = this.generateLineId();
            }
        });
        this.updateLastModified();
        return this;
    }
    
    // Sort lines by timecode
    sortLines() {
        this.lines.sort((a, b) => {
            // Lines with time = -1 (unsynchronized) go to the end
            if (a.time === -1 && b.time === -1) return 0;
            if (a.time === -1) return 1; // a goes to end
            if (b.time === -1) return -1; // b goes to end
            // Normal sort for others
            return a.time - b.time;
        });
    }
    
    // Clear all timecodes (reset for new recording)
    clearAllTimecodes() {
        this.lines.forEach((line, index) => {
            // Use -1 as special value to ignore lines during scroll
            line.time = -1;
            
            // IMPORTANT: Clean text of all parasitic timecodes
            if (line.text) {
                // Remove all patterns [X.Xs] or [-X.Xs] from text
                line.text = line.text.replace(/\[[-]?\d+(?:\.\d+)?s\]\s*/g, '').trim();
            }
        });
        this.updateLastModified();
        console.log(`✨ All timecodes cleared - ${this.lines.length} lines marked as unsynchronized (-1) and texts cleaned`);
    }
    
    // Reset timecodes with uniform spacing
    resetTimecodesToDefault(intervalMs = CONSTANTS.UI.DEFAULT_LINE_SPACING) {
        this.lines.forEach((line, index) => {
            line.time = index * intervalMs;
        });
        this.updateLastModified();
        console.log(`🔄 Timecodes reset with ${intervalMs}ms interval`);
    }
    
    // Emergency cleaning function for corrupted texts
    cleanCorruptedTexts() {
        let cleanedCount = 0;
        this.lines.forEach((line, index) => {
            if (line.text) {
                const originalText = line.text;
                // Remove all patterns [X.Xs] or [-X.Xs] from text
                line.text = line.text.replace(/\[[-]?\d+(?:\.\d+)?s\]\s*/g, '').trim();
                
                if (originalText !== line.text) {
                    cleanedCount++;
                }
            }
        });
        
        if (cleanedCount > 0) {
            this.updateLastModified();
            console.log(`🧹 Emergency cleaning performed - ${cleanedCount} lines repaired`);
        }
        
        return cleanedCount;
    }
    
    // Clear timecode of specific line (place at end)
    clearLineTimecode(lineIndex) {
        if (lineIndex >= 0 && lineIndex < this.lines.length) {
            // Use -1 to mark as unsynchronized
            this.lines[lineIndex].time = -1;
            this.updateLastModified();
            console.log(`❌ Timecode cleared for line ${lineIndex + 1}`);
        }
    }
    
    // Check if custom timecodes are defined (different from default spacing)
    hasCustomTimecodes() {
        // Check if there are lines with valid timecodes (not -1)
        const validLines = this.lines.filter(line => line.time >= 0);
        if (validLines.length === 0) return false; // All lines are unsynchronized
        
        // Check if timecodes are different from default spacing
        for (let i = 0; i < validLines.length; i++) {
            const expectedTime = i * CONSTANTS.UI.DEFAULT_LINE_SPACING;
            if (Math.abs(validLines[i].time - expectedTime) > 100) { // 100ms tolerance
                return true;
            }
        }
        return false;
    }
    
    // Update modification date
    updateLastModified() {
        this.metadata.lastModified = new Date().toISOString();
    }
    
    // Associate audio file with this song
    setAudioPath(audioPath) {
        // Normalize audio path to start with assets/audios/
        this.metadata.audioPath = AudioManager.normalize(audioPath);
        this.updateLastModified();
        return this;
    }
    
    // Get associated audio path
    getAudioPath() {
        return this.metadata.audioPath;
    }
    
    // Check if song has associated audio file
    hasAudio() {
        return !!this.metadata.audioPath;
    }
    
    // Get active line for given timecode
    getActiveLineAt(timeMs) {
        // If no lines, return null
        if (this.lines.length === 0) return null;
        
        // Filter lines with valid timecodes (not -1)
        const validLines = this.lines.filter(line => line.time >= 0);
        if (validLines.length === 0) return null; // No synchronized lines
        
        // If timecode is before first valid line, return first valid line
        if (timeMs < validLines[0].time) {
            return validLines[0];
        }
        
        let activeLine = null;
        for (let i = 0; i < validLines.length; i++) {
            if (validLines[i].time <= timeMs) {
                activeLine = validLines[i];
            } else {
                break;
            }
        }
        return activeLine || validLines[0]; // Fallback to first valid line
    }
    
    // Get next line after given timecode
    getNextLineAfter(timeMs) {
        return this.lines.find(line => line.time > timeMs) || null;
    }
    
    // Save to localStorage
    saveToStorage(key = null) {
        // Use songId as key if no key provided
        const storageKey = key || `${CONSTANTS.STORAGE.LIBRARY_PREFIX}${this.songId}`;
        try {
            localStorage.setItem(storageKey, JSON.stringify(this));
            console.log('✅ Lyrics saved:', storageKey);
            return storageKey;
        } catch (error) {
            console.error('❌ Save error:', error);
            return null;
        }
    }
    
    // Load from localStorage
    static loadFromStorage(key) {
        try {
            const data = localStorage.getItem(key);
            if (!data) return null;
            
            const parsed = JSON.parse(data);
            const lyrics = new SyncedLyrics(
                parsed.metadata.title,
                parsed.metadata.artist,
                parsed.metadata.album,
                parsed.metadata.duration,
                parsed.songId
            );
            
            lyrics.lines = parsed.lines;
            lyrics.metadata = parsed.metadata;
            return lyrics;
        } catch (error) {
            console.error('❌ Load error:', error);
            return null;
        }
    }
    
    // Export to LRC format (karaoke standard)
    toLRC() {
        let lrc = `[ti:${this.metadata.title}]\n`;
        lrc += `[ar:${this.metadata.artist}]\n`;
        if (this.metadata.album) lrc += `[al:${this.metadata.album}]\n`;
        lrc += `[length:${this.formatTime(this.metadata.duration)}]\n\n`;
        
        this.lines.forEach(line => {
            const timeFormatted = this.formatTime(line.time);
            lrc += `[${timeFormatted}]${line.text}\n`;
        });
        
        return lrc;
    }
    
    // Format time as MM:SS.xx for LRC
    formatTime(ms) {
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        const centiseconds = Math.floor((ms % 1000) / 10);
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
    }
    
    // Import from LRC format
    static fromLRC(lrcContent) {
        const lines = lrcContent.split('\n');
        let title = '', artist = '', album = '';
        const syncedLines = [];

        lines.forEach(line => {
            const titleMatch = line.match(/\[ti:(.*?)\]/);
            const artistMatch = line.match(/\[ar:(.*?)\]/);
            const albumMatch = line.match(/\[al:(.*?)\]/);
            const timeMatch = line.match(/\[(\d{2}):(\d{2})\.(\d{2})\](.*)/);

            if (titleMatch) title = titleMatch[1];
            if (artistMatch) artist = artistMatch[1];
            if (albumMatch) album = albumMatch[1];
            if (timeMatch) {
                const minutes = parseInt(timeMatch[1]);
                const seconds = parseInt(timeMatch[2]);
                const centiseconds = parseInt(timeMatch[3]);
                const timeMs = (minutes * 60 + seconds) * 1000 + centiseconds * 10;
                const text = timeMatch[4].trim();
                if (text) {
                    syncedLines.push({ time: timeMs, text: text });
                }
            }
        });

        const lyrics = new SyncedLyrics(title, artist, album);
        lyrics.addLines(syncedLines);
        return lyrics;
    }
    
    // Get all stored lyrics
    static getAllStoredLyrics() {
        const keys = Object.keys(localStorage).filter(key => key.startsWith(CONSTANTS.STORAGE.LIBRARY_PREFIX));
        return keys.map(key => {
            try {
                const data = JSON.parse(localStorage.getItem(key));
                return {
                    key: key,
                    title: data.metadata.title,
                    artist: data.metadata.artist,
                    lastModified: data.metadata.lastModified
                };
            } catch {
                return null;
            }
        }).filter(item => item !== null);
    }
}
