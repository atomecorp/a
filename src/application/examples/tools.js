// test
//click: function (e) { reveal_children('toolbox'); },

const vieLogo = $('img', {
  id: 'img_test',
  parent: "#view",
  attrs: {
    src: './assets/images/ballanim.png',
    alt: 'ballanim'
  },
  css: {
    marginLeft: '0',
    color: 'white',
    left: '90px',
    top: '0px',
    position: 'relative',
    height: "120px",
    width: "120px",
    textAlign: 'center',
    display: 'block'
  }
});
vieLogo.addEventListener('click', () => puts('hello!'));



let calculatedCSS = {};
const shadowLeft = 0,
  shadowTop = 0,
  shadowBlur = 12;
const items_spacing = 6;
const item_border_radius = 6;
const item_size = 93;
let menuOpen = 'false';

const Intuition_theme = {
  light: {
    items_spacing: items_spacing + 'px',
    item_size: item_size + 'px',
    support_thickness: item_size + shadowBlur + shadowTop + shadowLeft + 'px',
    tool_bg: "#484747ff",
    tool_bg_active: "#656565ff",
    tool_text: "#8c8b8bff",
    text_char_max: 5,
    tool_active_bg: "#e0e0e0",
    toolboxOffsetMain: "3px",
    toolboxOffsetEdge: "3px",
    items_offset_main: item_border_radius + items_spacing + 'px',
    icon_top: "45%",
    icon_left: "33%",
    icon_centered_top: "33%",
    icon_centered_left: "33%",
    icon_size: "16%",
    item_shadow: `${shadowLeft}px ${shadowTop}px ${shadowBlur}px rgba(0,0,0,0.69)`,
    item_border_radius: item_border_radius + 'px',
  }
};

const currentTheme = Intuition_theme.light;

currentTheme.direction = "top_right_horizontal";

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

function calculate_positions() {
  const dir = (currentTheme?.direction || 'top_left_horizontal').toLowerCase();
  const thickness = currentTheme.support_thickness || (parseFloat(currentTheme.item_size || '0') + parseFloat((currentTheme.margin || '0')) + 'px');

  const thicknessNum = parseFloat(thickness) || 0;
  const itemsSizeNum = parseFloat(currentTheme.item_size) || 0;
  const toolboxOffsetMainNum = parseFloat(currentTheme.toolboxOffsetMain) || 0;
  const toolboxOffsetEdgeNum = parseFloat(currentTheme.toolboxOffsetEdge) || 0;
  const itemsOffsetMainNum = parseFloat(currentTheme.items_offset_main || '0') || 0;

  // centrage cross‑axis
  const centerDelta = (itemsSizeNum - thicknessNum) / 2;
  const item_border_radius = parseFloat(currentTheme.item_border_radius);

  // offsets
  const itemOffsetMainPx = `${toolboxOffsetMainNum + itemsSizeNum - item_border_radius}px`;
  const itemOffsetEdgeNum = toolboxOffsetEdgeNum + centerDelta;
  const itemOffsetEdgePx = `${itemOffsetEdgeNum}px`;

  // support sizes (we remove the main padding to avoid overflow)
  const H = { width: `calc(100vw - ${itemOffsetEdgeNum}px - ${itemsOffsetMainNum}px)`, height: thickness, columnGap: currentTheme.items_spacing };
  const V = { width: thickness, height: `calc(100vh - ${itemOffsetEdgeNum}px - ${itemsOffsetMainNum}px)`, rowGap: currentTheme.items_spacing };

  let support = {};
  let trigger = {};

  switch (dir) {
    case 'top_left_horizontal':
      support = { ...H, flexDirection: 'row', top: itemOffsetEdgePx, left: itemOffsetMainPx, alignItems: 'center', overflowX: 'auto', overflowY: 'hidden' };
      trigger = { top: `${toolboxOffsetEdgeNum}px`, left: `${toolboxOffsetMainNum}px` };
      break;
    case 'top_right_horizontal':
      support = { ...H, flexDirection: 'row-reverse', top: itemOffsetEdgePx, right: itemOffsetMainPx, alignItems: 'center', overflowX: 'auto', overflowY: 'hidden' };
      trigger = { top: `${toolboxOffsetEdgeNum}px`, right: `${toolboxOffsetMainNum}px` };
      break;
    case 'bottom_left_horizontal':
      support = { ...H, flexDirection: 'row', bottom: itemOffsetEdgePx, left: itemOffsetMainPx, alignItems: 'center', overflowX: 'auto', overflowY: 'hidden' };
      trigger = { bottom: `${toolboxOffsetEdgeNum}px`, left: `${toolboxOffsetMainNum}px` };
      break;
    case 'bottom_right_horizontal':
      support = { ...H, flexDirection: 'row-reverse', bottom: itemOffsetEdgePx, right: itemOffsetMainPx, alignItems: 'center', overflowX: 'auto', overflowY: 'hidden' };
      trigger = { bottom: `${toolboxOffsetEdgeNum}px`, right: `${toolboxOffsetMainNum}px` };
      break;
    case 'top_left_vertical':
      support = { ...V, flexDirection: 'column', top: itemOffsetMainPx, left: itemOffsetEdgePx, alignItems: 'center', overflowX: 'hidden', overflowY: 'auto' };
      trigger = { top: `${toolboxOffsetMainNum}px`, left: `${toolboxOffsetEdgeNum}px` };
      break;
    case 'bottom_left_vertical':
      support = { ...V, flexDirection: 'column-reverse', bottom: itemOffsetMainPx, left: itemOffsetEdgePx, alignItems: 'center', overflowX: 'hidden', overflowY: 'auto' };
      trigger = { bottom: `${toolboxOffsetMainNum}px`, left: `${toolboxOffsetEdgeNum}px` };
      break;
    case 'top_right_vertical':
      support = { ...V, flexDirection: 'column', top: itemOffsetMainPx, right: itemOffsetEdgePx, alignItems: 'center', overflowX: 'hidden', overflowY: 'auto' };
      trigger = { top: `${toolboxOffsetMainNum}px`, right: `${toolboxOffsetEdgeNum}px` };
      break;
    case 'bottom_right_vertical':
      support = { ...V, flexDirection: 'column-reverse', bottom: itemOffsetMainPx, right: itemOffsetEdgePx, alignItems: 'center', overflowX: 'hidden', overflowY: 'auto' };
      trigger = { bottom: `${toolboxOffsetMainNum}px`, right: `${toolboxOffsetEdgeNum}px` };
      break;
    default:
      support = { ...H, flexDirection: 'row', top: itemOffsetEdgePx, left: itemOffsetMainPx, alignItems: 'center', overflowX: 'auto', overflowY: 'hidden' };
      trigger = { top: `${toolboxOffsetEdgeNum}px`, left: `${toolboxOffsetMainNum}px` };
  }

  // Apply item offset on the main axis using the support’s padding
  const isHorizontal = dir.includes('horizontal');
  const isReverse = (isHorizontal && dir.includes('right')) || (!isHorizontal && dir.includes('bottom'));
  const padPx = `${itemsOffsetMainNum}px`;

  if (isHorizontal) {
    if (isReverse) support.paddingRight = padPx;
    else support.paddingLeft = padPx;
  } else {
    if (isReverse) support.paddingBottom = padPx;
    else support.paddingTop = padPx;
  }

  // Fade mask on both edges unchanged
  const fadePx = Math.max(12, parseFloat(currentTheme.items_spacing) || 20);
  const mask = isHorizontal
    ? `linear-gradient(to right, transparent 0, black ${fadePx}px, black calc(100% - ${fadePx}px), transparent 100%)`
    : `linear-gradient(to bottom, transparent 0, black ${fadePx}px, black calc(100% - ${fadePx}px), transparent 100%)`;

  if (typeof CSS !== 'undefined' && CSS.supports &&
    (CSS.supports('mask-image: linear-gradient(black, transparent)') ||
      CSS.supports('-webkit-mask-image: linear-gradient(black, transparent)'))) {
    support.webkitMaskImage = mask;
    support.maskImage = mask;
  }

  support.pointerEvents = 'none';


  return { toolbox_support: support, toolbox: trigger };
}

calculatedCSS = calculate_positions();
const width = calculatedCSS.toolbox_support.width;
const height = calculatedCSS.toolbox_support.height;
const posCss = calculatedCSS.toolbox_support;

const toolbox_support = {
  id: 'toolbox_support',
  type: 'toolbox_support',
  parent: '#intuition',
  css: {
    display: 'flex',
    boxSizing: 'border-box',
    justifyContent: 'flex-start',
    position: 'fixed',
    // No width/height/posCss here, apply_layout will set them
    backgroundColor: 'red',
    gap: currentTheme.items_spacing,
    scrollbarWidth: 'none',
    msOverflowStyle: 'none'
  }
};


const intuition_content = {
  version: "1.1",
  meta: { namespace: "atome.menu", defaultLocale: "en" },
  toolbox: { children: ['home', 'find', 'time', 'view', 'tools', 'communication', 'capture', 'edit'] },
  home: { type: palette, children: ['quit', 'user', 'settings', 'clear', 'cleanup'] },
  find: { type: tool, children: ['filter'] },
  time: { type: particle, children: ['filter'] },
  view: { type: option, children: ['filter'] },
  tools: { type: zonespecial, children: ['filter'] },
  communication: { type: palette, children: ['filter'] },
  capture: { type: palette, children: ['filter'] },
  edit: { type: palette, children: ['filter'] },
};

const toolbox = {
  id: 'toolbox',
  type: 'toolbox',
  parent: '#intuition',
  css: {
    backgroundColor: currentTheme.tool_bg,
    position: 'fixed',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    zIndex: 10000000,
    ...calculatedCSS.toolbox
  },
  click: function (e) { reveal_children('toolbox'); },
  label: null,
  icon: 'menu'
};

function open_menu(name) {

}
function close_menu(name) {

}

function reveal_children(parent) {
  const methods = (intuition_content[parent] && intuition_content[parent].children) || [];
  if (menuOpen !== parent) {
    methods.forEach(name => {
      const fct_exec = intuition_content[name]['type'];
      if (typeof fct_exec === 'function') {
        const optionalParams = { ...{ id: `_intuition_${name}`, label: name, icon: name, parent: '#toolbox_support' }, ...(intuitionAddOn[name] || {}) };
        fct_exec(optionalParams);
      } else {
        console.warn(`Function ${fct_exec} not found`);
      }
    });
    // Add a green overflow-forcing item when opening the menu
    addOverflowForcer();
    menuOpen = parent;
  } else {
    methods.forEach(name => {
      const el = grab(`_intuition_${name}`);
      if (el) el.remove();
    });
    // Remove the overflow-forcing item when closing the menu
    removeOverflowForcer();
    menuOpen = 'false';
  }
}

function intuitionCommon(cfg) {
  const el = $('div', {
    id: cfg.id,
    parent: cfg.parent,
    class: cfg.type,
    css: {
      backgroundColor: currentTheme.tool_bg,
      width: currentTheme.item_size,
      height: currentTheme.item_size,
      color: 'lightgray',
      margin: 0,
      boxShadow: currentTheme.item_shadow,
      borderRadius: currentTheme.item_border_radius,
      textAlign: 'center',
      display: 'inline-block',
      position: 'relative',
      flex: '0 0 auto',
      pointerEvents: 'auto',        // réactive les events sur l’item
      touchAction: 'manipulation',  // tap/drag mobiles OK
      ...(cfg.css || {})
    }
  });
  el.click = cfg.click;
  if (typeof cfg.click === 'function') {
    el.addEventListener('click', function (e) {
      try { cfg.click.call(el, e); } catch (err) { console.error(err); }
    });
  }
  return el;
}

const items_common = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'sans-serif',
  userSelect: 'none',

};


function create_label(cfg) {
  if (cfg.label) {
    const rawText = String(cfg.label);
    const maxChars = parseInt(currentTheme.text_char_max, 10);
    let displayText = rawText;
    if (!isNaN(maxChars) && maxChars > 0 && rawText.length > maxChars) {
      // Réserver 1 caractère pour l'ellipse si possible
      displayText = maxChars > 1 ? rawText.slice(0, maxChars - 1) + '…' : rawText.slice(0, maxChars);
    }
    $('div', {
      parent: `#${cfg.id}`,
      text: displayText,
      attrs: { title: rawText },
      css: {
        position: 'absolute',
        top: '2px',             // à l'intérieur de l'item pour éviter overflow hidden du parent
        left: '50%',
        transform: 'translateX(-50%)',
        fontSize: '11px',
        lineHeight: '12px',
        color: currentTheme.tool_text,
        padding: '0 4px',
        backgroundColor: 'transparent',
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
        userSelect: 'none'
      }
    });
  }
}


function palette(cfg) {
  intuitionCommon({ ...cfg, ...items_common });
  create_label(cfg)
}
function tool(cfg) {
  intuitionCommon({ ...cfg, ...items_common });
  create_label(cfg)
}
function particle(cfg) {
  intuitionCommon({ ...cfg, ...items_common });
  create_label(cfg)
}
function option(cfg) {
  intuitionCommon({ ...cfg, ...items_common });
  create_label(cfg)
}
function zonespecial(cfg) {
  intuitionCommon({ ...cfg, ...items_common });
  create_label(cfg)
}
const intuitionAddOn = {
  communication: { label: 'communication', icon: 'communication' }
};

function init_inituition() {
  intuitionCommon(toolbox_support);
  intuitionCommon(toolbox);
}

function apply_layout() {
  calculatedCSS = calculate_positions();

  const supportEl = grab('toolbox_support');
  const triggerEl = grab('toolbox');

  if (supportEl) {
    // Reset anchors and paddings that may remain from a previous direction
    ['top', 'right', 'bottom', 'left'].forEach(k => supportEl.style[k] = 'auto');
    ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].forEach(k => supportEl.style[k] = '0');

    Object.assign(supportEl.style, calculatedCSS.toolbox_support);
    supportEl.style.width = calculatedCSS.toolbox_support.width;
    supportEl.style.height = calculatedCSS.toolbox_support.height;
    supportEl.style.gap = currentTheme.items_spacing;
  }
  if (triggerEl) {
    ['top', 'right', 'bottom', 'left'].forEach(k => triggerEl.style[k] = 'auto');
    Object.assign(triggerEl.style, calculatedCSS.toolbox);
  }
}


// Isolated methods to add/remove a green item to force overflow
function addOverflowForcer() {
  const supportEl = grab('toolbox_support');
  if (!supportEl) return;
  if (document.getElementById('_intuition_overflow_forcer')) return;

  // Create a green block matching the item size to extend the scrollable area
  $('div', {
    id: '_intuition_overflow_forcer',
    parent: '#toolbox_support',
    css: {
      backgroundColor: 'transparent', // was 'green' for testing
      width: currentTheme.item_size,
      height: currentTheme.item_size,
      borderRadius: currentTheme.item_border_radius,
      flex: '0 0 auto',
      pointerEvents: 'none'
    }
  });

  // Ensure it's at the very end so it truly forces extra scroll
  const el = document.getElementById('_intuition_overflow_forcer');
  if (el && el.parentElement && el.parentElement.lastElementChild !== el) {
    el.parentElement.appendChild(el);
  }
}

function removeOverflowForcer() {
  const el = document.getElementById('_intuition_overflow_forcer');
  if (el) el.remove();
}



window.addEventListener('resize', apply_layout);
window.setDirection = function (dir) {
  currentTheme.direction = String(dir).toLowerCase();
  apply_layout();
};

// Helper to recalculate after theme/value changes
window.refreshMenu = function (partialTheme = {}) {
  Object.assign(currentTheme, partialTheme);
  apply_layout();
};
init_inituition();
apply_layout();


function mountDirectionSelector() {
  if (document.getElementById('intuition-direction-select')) return;

  const wrap = $('div', {
    id: 'intuition-direction-select',
    parent: '#intuition',
    css: {
      position: 'fixed',
      top: '108px',
      left: '108px',
      zIndex: 10000002,
      backgroundColor: 'transparent',
      padding: '0'
    }
  });

  const select = $('select', {
    parent: wrap,
    css: {
      fontSize: '12px',
      padding: '2px 6px',
      color: '#fff',
      backgroundColor: '#2b2b2b',
      border: '1px solid #555'
    }
  });

  DIRECTIONS.forEach(d => {
    const opt = $('option', { parent: select, text: d });
    opt.value = d;
  });


  //test current value
  select.value = (currentTheme?.direction || 'top_left_horizontal').toLowerCase();
  select.addEventListener('change', (e) => {
    window.setDirection(e.target.value);
  });
}
mountDirectionSelector();




