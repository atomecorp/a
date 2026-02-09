import Intuition from '../../../../squirrel/components/intuition_builder/index.js';




function tools_test_touch() {
    puts('Tools test touch triggered');
}

function tools_lock_test_touch() {
    puts('Tools lock test touch triggered!!!');
}

function option_test_touch() {
    puts('Option test touch triggered');
}

function performing() {
    puts('performing started');
    $('div', { text: 'Performing...', id: 'performingDiv', css: { width: '200px', height: '100px' } });
}
function stopPerforming() {
    puts('performing stopped');
    grab('performingDiv').remove();
}

function stop_lock_test_touch() {
    puts('Tools lock test unlock triggered!!!');
}
function openSettingsPanel() {
    toggleSettingsPanel();
}

function openSongLibrary() {
    puts('Opening song library from menu');
    toggleSongLibrary('settings_button');
}

function closeSongLibrary() {
    toggleSongLibrary('settings_button');
}

function exportAsTxt() {
    exportSelectedSongsAsTextWithFolderDialog();
}
function importFilesIntoLyrix() {
    import_files_into_library();
}

function activate_Edition() {
    window.toggleLyricsEditMode()
}

function createNewSongFromMenu() {
    if (window.createNewEmptySong) {
        window.createNewEmptySong();
        window.toggleLyricsEditMode()
    } else if (window.lyricsDisplay && typeof window.lyricsDisplay.createNewEmptySong === 'function') {
        window.lyricsDisplay.createNewEmptySong();
        window.toggleLyricsEditMode()
    } else {
        console.warn('❌ Impossible de créer une chanson : createNewEmptySong non disponible');
    }
}

function recordLyrixTimecode() {
    if (window.toggleLyricsRecordMode) {
        window.toggleLyricsRecordMode();
    } else if (window.lyricsDisplay && typeof window.lyricsDisplay.toggleRecordMode === 'function') {
        window.lyricsDisplay.toggleRecordMode();
    } else {
        puts('Record Lyrix Timecode triggered (fallback)');
    }
}

function playMode() {
    const playButton = document.getElementById('audio-play-button');
    if (playButton) {
        playButton.click();
    } else {
        puts('Play mode activated (no play button)');
    }
}

function pauseMode() {
    const playButton = document.getElementById('audio-play-button');
    if (playButton && window.audioController) {
        if (window.audioController.isPlaying && window.audioController.isPlaying()) {
            window.audioController.pause();
            playButton._setActive ? playButton._setActive(false) : (playButton.style.backgroundColor = 'transparent');
        }
    } else {
        puts('Pause mode activated (fallback)');
    }
}

function prevMode() {
    if (window.navigateToPreviousSong) {
        window.navigateToPreviousSong();
    } else {
        puts('Previous mode activated (no handler)');
    }
}

function nextMode() {
    if (window.navigateToNextSong) {
        window.navigateToNextSong();
    } else {
        puts('Next mode activated (no handler)');
    }
}

function fullscreenMode() {

    const button = document.getElementById('fullscreen_mode');
    if (button) {
        button.click();
    } else if (window.lyricsDisplay && typeof window.lyricsDisplay.toggleFullscreen === 'function') {
        window.lyricsDisplay.toggleFullscreen();
    } else {
        puts('Fullscreen mode activated (fallback)');
    }
}


function saveLRXFormat() {
    exportSongLibraryAsLRX();
}
function getExecutionModeLabel() {
    try {
        if (typeof window.__IS_AUV3__ === 'boolean') {
            return window.__IS_AUV3__ ? 'AUv3' : 'Host';
        }
        const raw = ((window.__EXECUTION_MODE__ || window.__HOST_ENV || '') + '').toLowerCase();
        if (raw.includes('auv3')) return 'AUv3';
        if (raw.includes('host') || raw.includes('app')) return 'Host';
    } catch (error) {
        console.warn('[dev-tools] Failed to resolve execution mode', error);
    }
    return 'Unknown';
}

window.getExecutionModeLabel = getExecutionModeLabel;

let intuition_content = {};

const performChildren = (getExecutionModeLabel() === 'AUv3')
    ? ['prev', 'next', 'fullscreen']
    : ['play', 'pause', 'prev', 'next', 'fullscreen'];

intuition_content = {
    version: "1.1",
    meta: { namespace: "vie.menu", defaultLocale: "en" },
    toolbox: { children: ['file', 'edit', 'capture', 'perform', 'songs', 'settings'] },
    //
    file: { type: 'palette', children: ['import', 'save', 'export'], touch: openSongLibrary, close: closeSongLibrary },
    songs: { type: 'tool', touch: openSongLibrary, icon: null },
    edit: { type: 'palette', children: ['new'], touch: activate_Edition, },
    settings: { type: 'tool', touch: option_test_touch, touch: openSettingsPanel },
    capture: { label: 'capture', type: 'tool', icon: 'record', touch: recordLyrixTimecode },
    perform: { label: 'perform', type: 'palette', children: performChildren, icon: null, active: performing, inactive: stopPerforming, lock: tools_lock_test_touch, unlock: stop_lock_test_touch },


    import: { type: 'tool', touch_down: importFilesIntoLyrix, action: 'momentary' },
    load: { type: 'tool', touch: openSongLibrary },
    save: { type: 'tool', touch: saveLRXFormat, action: 'momentary' },
    export: { type: 'tool', touch: exportAsTxt, icon: false },

    edit: { type: 'tool', touch: activate_Edition, icon: 'edit' },
    new: { type: 'tool', icon: 'new', touch: createNewSongFromMenu, lock: tools_lock_test_touch },
    play: { type: 'tool', touch: playMode, action: 'momentary' },
    pause: { type: 'tool', touch: pauseMode },
    prev: { type: 'tool', touch: prevMode, icon: 'previous', action: 'momentary' },
    next: { type: 'tool', touch: nextMode, icon: 'next', action: 'momentary' },
    fullscreen: { type: 'tool', touch: fullscreenMode, action: 'momentary' },

};

Intuition({
    name: 'newMenu',
    theme: {
        // tool_bg: 'linear-gradient(180deg, #ff7000 0%, #994400 100%)',
        option_bg: '#442200cc',
        item_size: '39px',
        anim_duration_ms: 200,
        toolboxOffsetMain: "3px",
        toolboxOffsetEdge: "3px",
        satellite_bg: 'red',
        // tool_active_bg: "yellow",
        // tool_lock_bg: '#ff5555', 

    },
    content: intuition_content,
    orientation: 'top_left_horizontal'
});


// touch_up: openSettingsPanel,
//    toggleSettingsPanel('settings_button');



// grab('toolbox').style.display = 'none';
