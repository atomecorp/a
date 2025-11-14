const vieLogo = $('img', {
  id: 'img_test',
  parent: "#view",
  attrs: {
    src: './assets/images/2.png',
    alt: 'ballanim'
  },
  css: {
    marginLeft: '0',
    color: 'white',
    left: '0px',
    top: '0px',
    position: 'relative',
    height: "100%",
    width: "100%",
    textAlign: 'center',
    display: 'block'
  }
});

const shadowLeft = 0,
  shadowTop = 0,
  shadowBlur = 12;
const items_spacing = 3;
const item_border_radius = 3;
const item_size = 39;
const DIRECTIONS = [
  "TLH",
  "TRH",
  "BLH",
  "BRH",
  "TLV",
  "BLV",
  "TRV",
  "BRV"
];

const DIRECTION_LABEL_TO_VALUE = {
  TLH: "top_left_horizontal",
  TRH: "top_right_horizontal",
  BLH: "bottom_left_horizontal",
  BRH: "bottom_right_horizontal",
  TLV: "top_left_vertical",
  BLV: "bottom_left_vertical",
  TRV: "top_right_vertical",
  BRV: "bottom_right_vertical"
};

const DIRECTION_VALUES = DIRECTIONS.map(code => DIRECTION_LABEL_TO_VALUE[code]);
const DIRECTION_VALUE_TO_LABEL = DIRECTION_VALUES.reduce((acc, value, index) => {
  acc[value] = DIRECTIONS[index];
  return acc;
}, {});

const light_theme = {
  themeName: "light",
  button_color: 'rgba(48, 188, 55, 0.85)',
  button_active_color: "#b70fd5ff",
  // palette_bg: '#804901ff',
  // tool_bg: 'linear-gradient(180deg, rgba(32, 190, 48, 0.85) 0%, rgba(72,71,71,0.35) 100%)',
  // particle_bg: '#4a4a4aff',
  // option_bg: '#c40fdfff',
  // zonespecial_bg: '#4a4a4aff',
  momentary_flash_duration: 150,
  slider_length: '70%',
  slider_zoom_length: '100%',
  slider_length_vertical: '30%',
  slider_zoom_length_vertical: '69%',
  slider_track_color: 'rgba(241, 139, 49, 1)',
  slider_revealed_track_color: 'rgba(241, 139, 49, 1)',
  handle_color: 'rgba(248, 184, 128, 1)',
  slider_handle_size: '16%', // relative handle size (%, px, or ratio)
  slider_handle_radius: '25%', // border-radius for handle (%, px, or ratio 0..1)
  item_zoom: '330%',            // width target when pressing a slider item
  item_zoom_transition: '220ms',// animation duration
  drag_sensitivity: 0.5, // 0.5 => dx direct; <0.5 plus fin; >0.5 plus rapide
  drag_mode: 'unit', // 'unit' => 1px pointeur = 1 unité; 'percent' => (dx/width*100)
  button_size: '33%',
  items_spacing: items_spacing + 'px',
  item_size: item_size + 'px',
  support_thickness: item_size + shadowBlur + shadowTop + shadowLeft + 'px',
  // Translucent gradient for a glassy look
  tool_bg: 'linear-gradient(180deg, rgba(72,71,71,0.85) 0%, rgba(72,71,71,0.35) 100%)',
  tool_bg_active: "#7a7c73ff",
  tool_backDrop_effect: '9px',
  tool_text: "#cacacaff",
  tool_font: "0.9vw",
  tool_font_px: 10,
  text_char_max: 9,
  tool_active_bg: "#e0e0e0",
  tool_lock_bg: '#ff5555', // couleur lock
  tool_lock_pulse_duration: '1400ms', // durée animation clignotement doux
  tool_lock_toggle_mode: 'long', // 'long' (par défaut) ou 'click' pour permettre le clic simple de sortir
  tool_lock_bg: "#b22929ff",
  toolbox_icon: 'menu',            // false pour masquer, ou 'settings', 'play', etc.
  toolbox_icon_color: '#cacacaff',
  toolbox_icon_size: '30%',      // px, %, ou ratio (0..1)
  toolbox_icon_top: '50%',       // position verticale
  toolbox_icon_left: '50%',
  edit_mode_color: '#ff6f61',
  toolboxOffsetMain: "7px",
  toolboxOffsetEdge: "19px",
  satellite_offset: '0px',
  items_offset_main: item_border_radius + items_spacing + 'px',
  icon_color: "#cacacaff",
  icon_size: "39%",
  icon_top: '60%',       // position verticale
  icon_left: '50%',
  // Toggle label/icon visibility when a palette is popped out
  palette_icon: false,
  palette_label: true,
  // Particle value/unit display (theme-driven)
  particle_value_unit: '%',
  particle_value_value: 30,
  particle_value_decimals: 0,
  particle_value_font_px: 11,
  particle_value_bottom: '6%',
  particle_value_color: '#cacacaff',
  particle_unit_color: '#9e9e9eff',
  item_shadow: `${shadowLeft}px ${shadowTop}px ${shadowBlur}px rgba(0,0,0,0.69)`,
  item_border_radius: item_border_radius + 'px',
  // Animation settings for menu open
  anim_duration_ms: 333,
  anim_stagger_ms: 33,
  anim_bounce_overshoot: 0.09,
  // Elasticity controls extra rebounds (0 = back easing, 1 = strong elastic)
  anim_elasticity: 6,
  direction: "top_left_horizontal",
  button_color: 'rgba(204, 35, 35, 0.85)',
  button_active_color: "rgba(72,71,71,0.15) 100%)",
  palette_bg: 'rgba(72,71,71,0)',
  tool_bg: 'rgba(72,71,71,0)',
  particle_bg: 'rgba(72,71,71)',
  option_bg: 'rgba(72,71,71,0)',
  zonespecial_bg: 'rgba(72,71,71,0)',

};
Intuition.addTheme(light_theme)

const DEFAULT_ORIENTATION = (light_theme.direction || 'top_left_horizontal').toLowerCase();

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

function sliderAStart({ value }) {
  puts(`Slider A touch start (value: ${Math.round(value ?? 0)})`);
}

function sliderAChange({ value }) {
  puts(`Slider A changed to ${Math.round(value ?? 0)}`);
}

function sliderARelease({ value }) {
  puts(`Slider A released at ${Math.round(value ?? 0)}`);
}

function buttonDTouch() {
  puts('Button D pressed');
}

function buttonDActive() {
  puts('Button D ON');
}

function buttonDInactive() {
  puts('Button D OFF');
}

function orientationChanged({ value }) {
  const dir = typeof value === 'string' ? value.toLowerCase() : DEFAULT_ORIENTATION;
  if (typeof window.setDirection === 'function') {
    window.setDirection(dir);
  }
}

const intuition_content = {
  version: "1.1",
  meta: { namespace: "vie.menu", defaultLocale: "en" },
  toolbox: { children: ['file', 'tools', 'capture', 'perform', 'settings'] },
  //
  file: { type: 'palette', children: ['import', 'load', 'save'] },
  tools: { type: 'palette', children: ['volume', 'ADSR', 'controller'], touch_up: tools_test_touch, floatingMenuKey: 'record_child_tools' },
  settings: { type: 'palette', children: ['orientation'], icon: false },
  capture: { label: 'record', type: 'tool', icon: 'record' },
  perform: { label: 'perform', type: 'tool', icon: null, action: 'momentary', active: performing, inactive: stopPerforming, lock: tools_lock_test_touch, unlock: stop_lock_test_touch },


  import: { type: 'tool', children: ['audio', 'modules', 'projects'] },
  load: { type: 'tool', children: ['modules', 'projects'], touch_up: function () { puts('Import touch triggered'); } },
  save: { type: 'tool', touch: function () { puts('Save touch triggered'); } },
  email: { type: 'option', touch: option_test_touch },
  orientation: {
    type: 'particle',
    label: 'orientation',
    unit: [...DIRECTION_VALUES],
    value: DEFAULT_ORIENTATION,
    ext: 0,
    orientationControl: true,
    allowInlineEdit: false,
    hideUnitLabel: true,
    openUnitDropdownOnItem: true,
    syncValueWithUnit: true,
    unitLabelMap: DIRECTION_VALUE_TO_LABEL,
    change: orientationChanged
  },
  volume: { type: 'particle', helper: 'slider', value: 3 },
  ADSR: { type: 'tool', children: ['A', 'D', 'S', 'R'], icon: 'envelope', touch: tools_test_touch, lock: tools_lock_test_touch },
  controller: { type: 'zonespecial', touch: function () { puts('Controller touch triggered'); } },
  A: {
    type: 'particle',
    helper: 'slider',
    unit: ['%', 'px', 'em', 'rem', 'vw'],
    value: 50,
    ext: 1,
    touch: sliderAStart,
    change: sliderAChange,
    touch_up: sliderARelease
  },
  D: {
    type: 'particle',
    helper: 'button',
    unit: ['%', 'px', 'em', 'rem', 'vw'],
    value: 0,
    ext: 3,
    touch: buttonDTouch,
    active: buttonDActive,
    inactive: buttonDInactive,
    change: ({ value }) => puts(`Button D value -> ${Math.round(value ?? 0)}`)
  },
  S: { type: 'particle', helper: 'slider', unit: ['%', 'px', 'em', 'rem', 'vw'], value: 0, ext: 3 },
  R: { type: 'particle', unit: ['%', 'px', 'em', 'rem', 'vw'], value: 20, ext: 3 },

};

const new_menu = Intuition({ name: 'newMenu', theme: light_theme, content: intuition_content, orientation: DEFAULT_ORIENTATION });

const MENU_SNAPSHOT_STORAGE_KEY = 'intuition_menu_status_snapshot';





setTimeout(() => {
  const test_elem = {
    content: { key: "tools", title: "tools", children: ["volume", "ADSR", "controller"] },

    id: "intuition-floating-1",

    orientation: "top_left_vertical",

    state: 'close',


    position: { left: 0, top: 183 },

    reference: "toolbox",

    toolboxOffsetEdge: 19,

    toolboxOffsetMain: 7
  }

  Intuition({ type: 'extract', content: test_elem });
  puts('restore extract in 2s')
}
  , 2000);





setTimeout(() => {
  const support = grab('toolbox_support');
  if (support && typeof support.add === 'function') {
    console.log('Before adding - verif exists:', !!intuition_content.verif);
    console.log('Before adding - dummy_palette exists:', !!intuition_content.dummy_palette);

    support.add([
      { key: 'verif', parent: 'settings', type: 'option', label: 'verification', icon: null },
      { key: 'dummy_palette', parent: 'tools', type: 'palette', label: 'dummy', icon: null, children: ['test'] },
      { key: 'test', parent: 'dummy_palette', type: 'tool', label: 'test tool', icon: null, children: ['blur'] },
      { key: 'blur', parent: 'test', type: 'particle', label: 'blur amount', helper: 'slider', value: 0, icon: null }
    ]);

    setTimeout(() => {
      console.log('After adding - verif exists:', !!intuition_content.verif);
      console.log('After adding - verif definition:', intuition_content.verif);
      console.log('After adding - dummy_palette exists:', !!intuition_content.dummy_palette);
      console.log('After adding - dummy_palette definition:', intuition_content.dummy_palette);
      console.log('Full intuition_content keys:', Object.keys(intuition_content));
    }, 100);
  }
}, 3000);

setTimeout(() => {
  const floatingGrip = grab('intuition-floating-1__grip');
  if (floatingGrip && typeof floatingGrip.add === 'function') {
    floatingGrip.add([
      { key: 'tools_helper', type: 'tool', label: 'helper', icon: 'info', children: ['tools_helper_gain'] },
      { key: 'tools_helper_gain', type: 'particle', label: 'gain', helper: 'slider', value: 50 }
    ]);
  }
}, 4500);

setTimeout(() => {
  const support = grab('toolbox_support');
  if (support && typeof support.remove === 'function') {
    console.log('Before removing - verif exists:', !!intuition_content.verif);
    console.log('Before removing - dummy_palette exists:', !!intuition_content.dummy_palette);

    const removed = support.remove(['verif', 'dummy_palette']);
    console.log('Removed keys:', removed);

    setTimeout(() => {
      console.log('After removing - verif exists:', !!intuition_content.verif);
      console.log('After removing - dummy_palette exists:', !!intuition_content.dummy_palette);
      console.log('Settings children now:', intuition_content.settings?.children);
      console.log('Tools children now:', intuition_content.tools?.children);
    }, 100);
  }
}, 6000);

setTimeout(() => {
  const floatingGrip = grab('intuition-floating-1__grip');
  if (floatingGrip && typeof floatingGrip.remove === 'function') {
    console.log('Before removing from floating - tools_helper exists:', !!intuition_content.tools_helper);

    const removed = floatingGrip.remove(['tools_helper']);
    console.log('Removed from floating:', removed);

    setTimeout(() => {
      console.log('After removing from floating - tools_helper exists:', !!intuition_content.tools_helper);
    }, 100);
  }
}, 7500);



// $('span', {
//   id: 'checker',
//   css: {
//     backgroundColor: '#00f',
//     marginLeft: '0',
//     padding: '10px',
//     color: 'white',
//     margin: '10px',
//     display: 'inline-block',
//     left: '50%',
//     top: '50%',
//     position: 'relative',
//     transform: 'translateX(-50%)'
//   },
//   text: 'intuition content',
//   onclick: () => {
//     const snapshot = typeof window.getFloatingPalettePersistenceSnapshot === 'function'
//       ? window.getFloatingPalettePersistenceSnapshot()
//       : null;
//     if (snapshot && typeof snapshot === 'object') {
//       console.log('📦 Extracted palette metadata snapshot:', snapshot);
//     } else {
//       console.log('⚠️ Aucun extrait enregistré pour le moment (snapshot indisponible).');
//     }
//   },
// });


$('div', {
  id: 'test1',
  css: {
    backgroundColor: '#00f',
    marginLeft: '0',
    top: '25%',
    position: 'relative',
    padding: '10px',
    color: 'white',
    margin: '10px',
    display: 'inline-block'
  },
  text: 'store content ',
  onclick: () => {
    const updatedSnapshot = (typeof window !== 'undefined' && typeof window.updateCurrentMenuStatus === 'function')
      ? window.updateCurrentMenuStatus({ reason: 'manual-store' })
      : (typeof window !== 'undefined' ? window.current_menu_status : null);
    console.log('Current menu status snapshot:', updatedSnapshot);
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      console.warn('localStorage unavailable; snapshot not persisted.');
      return;
    }
    try {
      localStorage.removeItem(MENU_SNAPSHOT_STORAGE_KEY);
      localStorage.setItem(MENU_SNAPSHOT_STORAGE_KEY, JSON.stringify(updatedSnapshot || null));
      console.log('Menu snapshot stored in localStorage.');
    } catch (error) {
      console.error('Failed to store menu snapshot:', error);
    }
  },
});

$('div', {
  id: 'test2',
  css: {
    backgroundColor: '#00f',
    marginLeft: '0',
    top: '25%',
    position: 'relative',
    padding: '10px',
    color: 'white',
    margin: '10px',
    display: 'inline-block'
  },
  text: 'restore content ',
  onclick: () => {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      console.warn('localStorage unavailable; cannot restore menu snapshot.');
      return;
    }
    const serialized = localStorage.getItem(MENU_SNAPSHOT_STORAGE_KEY);
    if (!serialized) {
      console.warn('No stored menu snapshot found.');
      return;
    }
    let storedSnapshot = null;
    try {
      storedSnapshot = JSON.parse(serialized);
    } catch (error) {
      console.error('Failed to parse stored menu snapshot:', error);
      return;
    }
    if (typeof window !== 'undefined') {
      window.current_menu_status = storedSnapshot;
    }
    const floatingPayload = storedSnapshot && storedSnapshot.floatingSnapshot;
    if (floatingPayload) {
      if (typeof window !== 'undefined' && typeof window.clearFloatingPalettePersistenceSnapshot === 'function') {
        window.clearFloatingPalettePersistenceSnapshot();
      }
      try {
        if (typeof Intuition === 'function') {
          Intuition({ type: 'extract', content: floatingPayload });
        } else if (typeof window !== 'undefined' && typeof window.setFloatingPalettePersistenceSnapshot === 'function') {
          window.setFloatingPalettePersistenceSnapshot(floatingPayload);
        } else {
          console.warn('No extractor available to restore floating payload.');
        }
      } catch (error) {
        console.error('Failed to restore floating payload via Intuition:', error);
      }
    }
    if (storedSnapshot && storedSnapshot.menuOpen && typeof window !== 'undefined' && typeof window.openMenu === 'function') {
      window.openMenu(storedSnapshot.menuOpen);
    }
    const refreshedStatus = (typeof window !== 'undefined' && typeof window.updateCurrentMenuStatus === 'function')
      ? window.updateCurrentMenuStatus({ reason: 'manual-restore' })
      : storedSnapshot;
    console.log('Menu state restored from stored snapshot:', refreshedStatus);
  },
});