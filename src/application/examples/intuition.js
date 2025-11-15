
// const shadowLeft = 0,
//     shadowTop = 0,
//     shadowBlur = 12;
// const items_spacing = 3;
// const item_border_radius = 6;
// const item_size = 54;
// const DIRECTIONS = [
//     "top_left_horizontal",
//     "top_right_horizontal",
//     "bottom_left_horizontal",
//     "bottom_right_horizontal",
//     "top_left_vertical",
//     "bottom_left_vertical",
//     "top_right_vertical",
//     "bottom_right_vertical"
// ];

// const light_theme = {
//     themeName: "light",
//     button_color: 'rgba(204, 35, 35, 0.85)',
//     button_active_color: "#bbeb0eff",
//     palette_bg: '#804901ff',
//     tool_bg: 'linear-gradient(180deg, rgba(32, 190, 48, 0.85) 0%, rgba(72,71,71,0.35) 100%)',
//     particle_bg: '#4a4a4aff',
//     option_bg: '#c40fdfff',
//     zonespecial_bg: '#4a4a4aff',
//     slider_length: '70%',
//     slider_zoom_length: '100%',
//     slider_length_vertical: '30%',
//     slider_zoom_length_vertical: '69%',
//     slider_track_color: 'rgba(241, 139, 49, 1)',
//     slider_revealed_track_color: 'rgba(241, 139, 49, 1)',
//     handle_color: 'rgba(248, 184, 128, 1)',
//     slider_handle_size: '16%', // relative handle size (%, px, or ratio)
//     slider_handle_radius: '25%', // border-radius for handle (%, px, or ratio 0..1)
//     item_zoom: '330%',            // width target when pressing a slider item
//     item_zoom_transition: '220ms',// animation duration
//     drag_sensitivity: 0.5, // 0.5 => dx direct; <0.5 plus fin; >0.5 plus rapide
//     drag_mode: 'unit', // 'unit' => 1px pointeur = 1 unité; 'percent' => (dx/width*100)
//     button_size: '33%',
//     items_spacing: items_spacing + 'px',
//     item_size: item_size + 'px',
//     support_thickness: item_size + shadowBlur + shadowTop + shadowLeft + 'px',
//     // Translucent gradient for a glassy look
//     tool_bg: 'linear-gradient(180deg, rgba(72,71,71,0.85) 0%, rgba(72,71,71,0.35) 100%)',
//     tool_bg_active: "#7a7c73ff",
//     tool_backDrop_effect: '8px',
//     tool_text: "#cacacaff",
//     tool_font: "0.9vw",
//     tool_font_px: 10,
//     text_char_max: 9,
//     tool_active_bg: "#e0e0e0",
//     tool_lock_bg: '#ff5555', // couleur lock
//     tool_lock_pulse_duration: '1400ms', // durée animation clignotement doux
//     tool_lock_toggle_mode: 'long', // 'long' (par défaut) ou 'click' pour permettre le clic simple de sortir
//     tool_lock_bg: "#b22929ff",
//     toolbox_icon: 'menu',            // false pour masquer, ou 'settings', 'play', etc.
//     toolbox_icon_color: '#cacacaff',
//     toolbox_icon_size: '30%',      // px, %, ou ratio (0..1)
//     toolbox_icon_top: '50%',       // position verticale
//     toolbox_icon_left: '50%',
//     toolboxOffsetMain: "7px",
//     toolboxOffsetEdge: "7px",
//     items_offset_main: item_border_radius + items_spacing + 'px',
//     icon_color: "#cacacaff",
//     icon_size: "39%",
//     icon_top: '60%',       // position verticale
//     icon_left: '50%',
//     // Toggle label/icon visibility when a palette is popped out
//     palette_icon: false,
//     palette_label: true,
//     // Particle value/unit display (theme-driven)
//     particle_value_unit: '%',
//     particle_value_value: 30,
//     particle_value_decimals: 0,
//     particle_value_font_px: 11,
//     particle_value_bottom: '6%',
//     particle_value_color: '#cacacaff',
//     particle_unit_color: '#9e9e9eff',
//     item_shadow: `${shadowLeft}px ${shadowTop}px ${shadowBlur}px rgba(0,0,0,0.69)`,
//     item_border_radius: item_border_radius + 'px',
//     // Animation settings for menu open
//     anim_duration_ms: 333,
//     anim_stagger_ms: 33,
//     anim_bounce_overshoot: 0.09,
//     // Elasticity controls extra rebounds (0 = back easing, 1 = strong elastic)
//     anim_elasticity: 6,
//     direction: "top_left_horizontal"

// };
// Intuition.addTheme(light_theme)





// const intuition_content = {
//     version: "1.1",
//     meta: { namespace: "atome.menu", defaultLocale: "en" },
//     toolbox: { children: ['home', 'find', 'time', 'view', 'tools', 'communication', 'capture', 'edit'] },
//     home: { type: 'palette', children: ['quit', 'user', 'settings', 'clear', 'cleanup'], icon: null },
//     find: { type: 'tool', children: ['width, height',], icon: null, touch: tools_test_touch },
//     time: { type: 'particle', children: ['filter'] },
//     view: { type: 'option', icon: null },
//     tools: { type: 'zonespecial', children: ['filter'] },
//     communication: { type: 'palette', children: ['quit', 'user', 'settings', 'clear', 'cleanup'] },
//     capture: { type: 'palette', children: ['filter'], icon: null },
//     edit: { type: 'palette', children: ['filter'] },
//     filter: { type: 'palette', children: ['internet', 'local'] },
//     quit: { type: 'tool', icon: null },
//     user: { type: 'palette', children: ['add', 'remove'], icon: null },
//     settings: { type: 'tool' },
//     clear: { type: 'tool' },
//     cleanup: { type: 'tool', icon: null },
//     add: { type: 'tool' },
//     remove: { type: 'tool', icon: null },
// };


// function tools_test_touch() {
//     $('div', {
//         css: {
//             position: 'absolute',
//             top: '50%',
//             left: '50%',
//             transform: 'translate(-50%, -50%)',
//             backgroundColor: 'rgba(0, 0, 0, 0.8)',
//             color: 'white',
//             padding: '20px',
//             borderRadius: '10px',
//             zIndex: 1000
//         },
//         text: 'Tools touch activated! 🎉'
//     });
//     setTimeout(() => {
//         const existingDiv = document.querySelector('div[style*="position: absolute"]');
//         if (existingDiv) {
//             existingDiv.remove();
//         }
//     }, 2000); // Disparaît après 2 secondes
// }

// const new_menu = Intuition({ name: 'newMenu', theme: 'light', content: intuition_content, orientation: 'bottom_right_horizontal' });


