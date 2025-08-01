// SyncedLyrics class for Lyrix application
export class SyncedLyrics {
    constructor(title = '', artist = '', album = '', duration = 0, songId = '') {
        // Always ensure string or 0
        const safeTitle = (typeof title === 'string') ? title : '';
        const safeArtist = (typeof artist === 'string') ? artist : '';
        const safeAlbum = (typeof album === 'string') ? album : '';
        const safeDuration = (typeof duration === 'number' && !isNaN(duration)) ? duration : 0;
        this.metadata = {
            title: safeTitle,
            artist: safeArtist,
            album: safeAlbum,
            duration: safeDuration,
            format: 'syncedlyrics-v1.0',
            created: new Date().toISOString(),
            lastModified: new Date().toISOString(),
            audioPath: null
        };
        this.songId = songId;
        this.lines = [];
        this.audioPath = null;
        this.syncData = null;
        this.version = '1.0';

        // Nettoyage strict des champs racine
        ['title','artist','album','duration'].forEach(key => {
            if (this.hasOwnProperty(key)) {
                delete this[key];
            }
        });
    }

    // Add a line to the lyrics
    addLine(time, text, type = 'vocal') {
        this.lines.push({
            time,
            text,
            type,
            id: `line_${Date.now()}_${Math.random().toString(36).substr(2, 10)}`
        });
    }

    // Set audio path
    setAudioPath(path) {
        this.audioPath = path;
        this.metadata.audioPath = path;
        this.metadata.lastModified = new Date().toISOString();
    }

    // Get audio path
    getAudioPath() {
        return this.audioPath || this.metadata.audioPath;
    }

   
    // Static: load from localStorage
    static loadFromStorage(key) {
        const data = localStorage.getItem(key);
        if (!data) return null;
        const obj = JSON.parse(data);
        // Rebuild SyncedLyrics instance
        const lyrics = new SyncedLyrics();
        lyrics.songId = obj.songId;
        lyrics.metadata = { ...obj.metadata };
        lyrics.lines = obj.lines || [];
        lyrics.audioPath = obj.audioPath;
        lyrics.syncData = obj.syncData;
        lyrics.version = obj.version || '1.0';
        return lyrics;
    }

    // Static: create from LRC string (dummy, to be implemented)
    static fromLRC(lrcContent) {
        // Dummy implementation for now
        const lyrics = new SyncedLyrics();
        lyrics.metadata.title = 'Imported LRC';
        lyrics.lines = lrcContent.split('\n').map((line, i) => ({
            time: i * 5000,
            text: line,
            type: 'vocal',
            id: `line_${Date.now()}_${Math.random().toString(36).substr(2, 10)}`
        }));
        return lyrics;
    }
}
