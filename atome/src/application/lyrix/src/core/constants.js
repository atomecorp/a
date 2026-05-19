// Constants and configuration for Lyrix application
export const CONSTANTS = {
    // Audio configuration
    AUDIO: {
    BASE_PATH: './assets/audios/', // fallback when local server port not yet known
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
    MAX_FONT_SIZE: 150,
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
        TEXT: /\.(txt|lrc|lrx|json|md|lyrics)$/i,
        AUDIO: /\.(mp3|mp4|wav|m4a|aac|flac|ogg|webm)$/i,
        TEXT_MIME: ['text/', 'application/json'],
        AUDIO_MIME: ['audio/', 'video/']
    }
};
