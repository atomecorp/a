


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
    $('div', { text: 'Performing...', id: 'performingDiv', css: { width: '200px', height: '100px' } });
}
function stopPerforming() {

    grab('performingDiv').remove();
}

function stop_lock_test_touch() {
    puts('Tools lock test unlock triggered!!!');
}
function openSettingsPanel() {
    toggleSettingsPanel('settings_button');
    puts('Settings panel opened');
}

const intuition_content = {
    version: "1.1",
    meta: { namespace: "vie.menu", defaultLocale: "en" },
    toolbox: { children: ['file', 'tools', 'capture', 'perform', 'settings'] },
    //
    file: { type: 'palette', children: ['import', 'load', 'save'] },
    tools: { type: 'palette', children: ['volume', 'ADSR', 'controller'], touch_up: tools_test_touch },
    settings: { type: 'palette', children: ['midi',], icon: false, touch: openSettingsPanel },
    capture: { label: 'record', type: 'tool', icon: 'record' },
    perform: { label: 'perform', type: 'tool', icon: null, active: performing, inactive: stopPerforming, lock: tools_lock_test_touch, unlock: stop_lock_test_touch },


    import: { type: 'tool', children: ['audio', 'modules', 'projects'] },
    load: { type: 'tool', children: ['modules', 'projects'], touch_up: function () { puts('Import touch triggered'); } },
    save: { type: 'tool', touch: function () { puts('Save touch triggered'); } },
    midi: { type: 'tool', touch: option_test_touch, touch: openSettingsPanel, icon: false },
    volume: { type: 'particle', helper: 'slider', value: 3 },
    ADSR: { type: 'tool', children: ['A', 'D', 'S', 'R'], icon: 'envelope', touch: tools_test_touch, lock: tools_lock_test_touch },
    controller: { type: 'zonespecial', touch: function () { puts('Controller touch triggered'); } },
    A: { type: 'particle', helper: 'slider', unit: '%', value: 50, ext: 3, },
    D: { type: 'particle', helper: 'button', unit: '%', value: 0, ext: 3 },
    S: { type: 'particle', helper: 'slider', unit: '%', value: 0, ext: 3 },
    R: { type: 'particle', unit: '%', value: 20, ext: 3 },

};

Intuition({
    name: 'newMenu',
    theme: {
        tool_bg: 'linear-gradient(180deg, #ff7000 0%, #994400 100%)',
        option_bg: '#442200cc',
        item_size: '39px',
        anim_duration_ms: 200,
        toolboxOffsetMain: "7px",
        toolboxOffsetEdge: "69px",
        satellite_bg: 'red',


    },
    content: intuition_content,
    orientation: 'top_left_horizontal'
});


// touch_up: openSettingsPanel,
//    toggleSettingsPanel('settings_button');