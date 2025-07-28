// Constants and configuration for Lyrix application
export const CONSTANTS = {
    // Audio configuration
    AUDIO: {
        BASE_PATH: 'assets/audios/',
        BASE_URL: 'http://localhost:3001/assets/audios/',
        DEMO_FILES: {
            darkbox: 'darkbox.mp3',
            digitalDreams: 'digital_dreams.mp3'
        }
    },
    
    // Storage keys
    STORAGE: {
        FONT_SIZE: 'lyrix_font_size',
        LAST_SONG: 'lyrix_last_song',
        LIBRARY_PREFIX: 'lyrics_',
        SETTINGS_KEY: 'lyrics_library_settings',
        SONG_LIST_KEY: 'lyrics_song_list'
    },
    
    // UI configuration
    UI: {
        DEFAULT_FONT_SIZE: 24,
        MIN_FONT_SIZE: 12,
        MAX_FONT_SIZE: 100,
        DEFAULT_LINE_SPACING: 2000, // milliseconds
        LONG_PRESS_DURATION: 800, // milliseconds
        AUTO_SAVE_DELAY: 500 // milliseconds
    },
    
    // Record mode configuration
    RECORD: {
        TIMECODE_PRECISION: 3, // decimal places
        SCROLL_BLOCK_ENABLED: true,
        VISUAL_FEEDBACK_DURATION: 500 // milliseconds
    },
    
    // File types
    FILE_TYPES: {
        TEXT: /\.(txt|lrc|json|md|lyrics)$/i,
        AUDIO: /\.(mp3|mp4|wav|m4a|aac|flac|ogg|webm)$/i,
        TEXT_MIME: ['text/', 'application/json'],
        AUDIO_MIME: ['audio/', 'video/']
    },
    
    // Demo songs data
    DEMO_SONGS: {
        DARKBOX: {
            title: "The Darkbox",
            artist: "Atome Artist",
            album: "Demo Album",
            audioFile: "darkbox.mp3",
            lyrics: [
                { time: 0, text: "Spread the words", type: "vocal" },
                { time: 2000, text: "That'll burn your mind", type: "vocal" },
                { time: 4000, text: "Seal your eyes", type: "vocal" },
                { time: 6000, text: "Shut your ears", type: "vocal" },
                { time: 8000, text: "Swallow this and dive inside", type: "vocal" },
                { time: 10000, text: "dive inside", type: "vocal" },
                { time: 11000, text: "dive inside", type: "vocal" },
                { time: 12000, text: "dive inside", type: "vocal" },
                { time: 14000, text: "", type: "instrumental" },
                { time: 16000, text: "The darkbox...", type: "chorus" },
                { time: 18000, text: "", type: "instrumental" },
                { time: 20000, text: "Do you wanna be scared", type: "vocal" },
                { time: 22000, text: "No real fun won't begin", type: "vocal" },
                { time: 24000, text: "Stay away from what is there", type: "vocal" },
                { time: 26000, text: "", type: "instrumental" },
                { time: 28000, text: "Close your mind", type: "vocal" },
                { time: 30000, text: "Widely shut,", type: "vocal" },
                { time: 32000, text: "You won't see it's a trap", type: "vocal" },
                { time: 34000, text: "A golden coffin for your mind", type: "vocal" },
                { time: 36000, text: "", type: "instrumental" },
                { time: 38000, text: "The darkbox", type: "chorus" },
                { time: 40000, text: "", type: "instrumental" },
                { time: 42000, text: "Ghost box, don't get inside this dark box", type: "vocal" },
                { time: 45000, text: "No satisfaction out of the box", type: "vocal" },
                { time: 48000, text: "", type: "instrumental" },
                { time: 50000, text: "Ghost box, stay away from this dark box", type: "vocal" },
                { time: 53000, text: "Destroy this fuckin' Pandora's box", type: "vocal" },
                { time: 56000, text: "", type: "instrumental" },
                { time: 58000, text: "Ghost box, don't get inside this dark box", type: "vocal" },
                { time: 61000, text: "No satisfaction out of the box", type: "vocal" },
                { time: 64000, text: "", type: "instrumental" },
                { time: 66000, text: "Ghost box, don't get inside this dark box", type: "vocal" },
                { time: 69000, text: "Smash that nightmare box", type: "vocal" },
                { time: 72000, text: "", type: "instrumental" },
                { time: 74000, text: "Smash that nightmare box", type: "vocal" },
                { time: 76000, text: "Smash that nightmare box", type: "vocal" }
            ]
        },
        DIGITAL_DREAMS: {
            title: "Digital Dreams",
            artist: "Cyber Collective",
            album: "Electronic Visions",
            audioFile: "digital_dreams.mp3",
            lyrics: [
                { time: 0, text: "In the neon lights we find", type: "vocal" },
                { time: 3000, text: "Digital dreams of a different kind", type: "vocal" },
                { time: 6000, text: "Circuits dancing in the night", type: "vocal" },
                { time: 9000, text: "Electric souls burning bright", type: "vocal" },
                { time: 12000, text: "", type: "instrumental" },
                { time: 15000, text: "Download my heart", type: "chorus" },
                { time: 18000, text: "Upload your soul", type: "chorus" },
                { time: 21000, text: "In this digital world", type: "chorus" },
                { time: 24000, text: "We lose control", type: "chorus" }
            ]
        }
    }
};
