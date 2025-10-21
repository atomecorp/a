
const shadowLeft = 0,
  shadowTop = 0,
  shadowBlur = 12;
const items_spacing = 3;
const item_border_radius = 6;
const item_size = 54;
const DIRECTIONS = [
  "top_left_horizontal",
  "top_right_horizontal",
  "bottom_left_horizontal",
  "bottom_right_horizontal",
  "top_left_vertical",
  "bottom_left_vertical",
  "top_right_vertical",
  "bottom_right_vertical"
];





const intuition_content = {
  version: "1.1",
  meta: { namespace: "atome.menu", defaultLocale: "en" },
  toolbox: { children: ['home', 'find', 'time', 'view', 'tools', 'communication', 'capture', 'edit'] },
  home: { type: 'tool', children: ['quit', 'user', 'settings', 'clear', 'cleanup'], icon: null },
  find: { type: 'tool', children: ['width, height',], icon: null, touch: tools_test_touch },
  time: { type: 'tool', children: ['filter'] },
  view: { type: 'tool', icon: null },
  tools: { type: 'tool', children: ['filter'] },
  communication: { type: 'palette', children: ['quit', 'user', 'settings', 'clear', 'cleanup'] },
  capture: { type: 'tool', children: ['filter'], icon: null },
  edit: { type: 'tool', children: ['filter'] },
  filter: { type: 'tool', children: ['internet', 'local'] },
  quit: { type: 'tool', icon: null },
  user: { type: 'tool', children: ['add', 'remove'], icon: null },
  settings: { type: 'tool' },
  clear: { type: 'tool' },
  cleanup: { type: 'tool', icon: null },
  add: { type: 'tool' },
  remove: { type: 'tool', icon: null },
};


function tools_test_touch() {
  $('div', {
    css: {
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      color: 'white',
      padding: '20px',
      borderRadius: '10px',
      zIndex: 1000
    },
    text: 'Tools touch activated! 🎉'
  });
  setTimeout(() => {
    const existingDiv = document.querySelector('div[style*="position: absolute"]');
    if (existingDiv) {
      existingDiv.remove();
    }
  }, 2000); // Disparaît après 2 secondes
}

Intuition({ name: 'newMenu', theme: 'light', content: intuition_content, orientation: 'top_left_horizontal' });
