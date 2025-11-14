


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

}


const intuition_content = {
    version: "1.1",
    meta: { namespace: "vie.menu", defaultLocale: "en" },
    toolbox: { children: ['file', 'tools', 'capture', 'perform', 'songs', 'settings'] },
    //
    file: { type: 'palette', children: ['import', 'load', 'save', 'export'] },
    songs: { type: 'tool', touch: openSongLibrary, icon: null },
    tools: { type: 'palette', children: ['edit', 'new'] },
    settings: { type: 'tool', touch: option_test_touch, touch: openSettingsPanel },
    capture: { label: 'capture', type: 'tool', icon: 'record', touch: recordLyrixTimecode },
    perform: { label: 'perform', type: 'palette', children: ['play', 'pause', 'prev', 'next', 'fullscreen'], icon: null, active: performing, inactive: stopPerforming, lock: tools_lock_test_touch, unlock: stop_lock_test_touch },


    import: { type: 'tool', touch_down: importFilesIntoLyrix },
    load: { type: 'tool', touch: openSongLibrary },
    save: { type: 'tool', touch: saveLRXFormat },
    export: { type: 'tool', touch: exportAsTxt, icon: false },

    edit: { type: 'tool', touch: activate_Edition, icon: 'edit' },
    new: { type: 'tool', icon: 'envelope', touch: createNewSongFromMenu, lock: tools_lock_test_touch },
    play: { type: 'tool', touch: playMode },
    pause: { type: 'tool', touch: pauseMode },
    prev: { type: 'tool', touch: prevMode, icon: 'previous' },
    next: { type: 'tool', touch: nextMode, icon: 'next' },
    fullscreen: { type: 'tool', touch: fullscreenMode },

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