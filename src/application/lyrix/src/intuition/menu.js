


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

const intuition_content = {
    version: "1.1",
    meta: { namespace: "vie.menu", defaultLocale: "en" },
    toolbox: { children: ['file', 'tools', 'capture', 'perform', 'projects', 'settings'] },
    //
    file: { type: 'palette', children: ['import', 'load', 'save', 'export'] },
    projects: { type: 'tool', touch: openSongLibrary, icon: null },
    tools: { type: 'palette', children: ['edit', 'new'] },
    settings: { type: 'tool', touch: option_test_touch, touch: openSettingsPanel },
    capture: { label: 'capture', type: 'palette', icon: 'record' },
    perform: { label: 'perform', type: 'palette', children: ['play', 'pause', 'prev', 'next', 'fullscreen'], icon: null, active: performing, inactive: stopPerforming, lock: tools_lock_test_touch, unlock: stop_lock_test_touch },


    import: { type: 'tool', touch_down: function () { puts('Import touch triggered'); } },
    load: { type: 'tool', children: ['modules', 'projects'], touch_down: function () { puts('load touch triggered'); } },
    save: { type: 'tool', touch: function () { puts('Save touch triggered'); } },
    export: { type: 'tool', touch: exportAsTxt },

    edit: { type: 'particle', helper: 'slider' },
    new: { type: 'tool', icon: 'envelope', touch: tools_test_touch, lock: tools_lock_test_touch },
    play: { type: 'tool' },
    pause: { type: 'tool' },
    prev: { type: 'tool' },
    next: { type: 'tool' },
    fullscreen: { type: 'tool' },

};

Intuition({
    name: 'newMenu',
    theme: {
        // tool_bg: 'linear-gradient(180deg, #ff7000 0%, #994400 100%)',
        option_bg: '#442200cc',
        item_size: '39px',
        anim_duration_ms: 200,
        toolboxOffsetMain: "3px",
        toolboxOffsetEdge: "63px",
        satellite_bg: 'red',
        // tool_active_bg: "yellow",
        // tool_lock_bg: '#ff5555', 

    },
    content: intuition_content,
    orientation: 'top_left_horizontal'
});


// touch_up: openSettingsPanel,
//    toggleSettingsPanel('settings_button');