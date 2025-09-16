// test
//click: function (e) { reveal_children('toolbox'); },

const vieLogo = $('img', {
  id: 'img_test',
  parent: "#view",
  attrs: {
    src: './assets/images/1.png',
    alt: 'ballanim'
  },
  css: {
    marginLeft: '0',
    color: 'white',
    left: '0px',
    top: '0px',
    position: 'relative',
    height: 'auto',
    width: "100%",
    textAlign: 'center',
    display: 'block'
  }
});
const images = [
  './assets/images/1.png',
  './assets/images/2.png',
  './assets/images/3.png',
  './assets/images/ballanim.png',
  './assets/images/green_planet.png',
  './assets/images/puydesancy.jpg'
];

// Index courant
let currentIndex = 0;

vieLogo.addEventListener('click', () => {
  puts('hello!');

  // passer à l'image suivante
  currentIndex = (currentIndex + 1) % images.length;

  // mettre à jour la source
  vieLogo.src = images[currentIndex];
});



let calculatedCSS = {};
const shadowLeft = 0,
  shadowTop = 0,
  shadowBlur = 12;
const items_spacing = 6;
const item_border_radius = 6;
const item_size = 54;
let menuOpen = 'false';
let menuStack = [];

const Intuition_theme = {
  light: {
    items_spacing: items_spacing + 'px',
    item_size: item_size + 'px',
    support_thickness: item_size + shadowBlur + shadowTop + shadowLeft + 'px',
    // Translucent gradient for a glassy look
    tool_bg: 'linear-gradient(180deg, rgba(72,71,71,0.85) 0%, rgba(72,71,71,0.35) 100%)',
    tool_bg_active: "#656565ff",
    tool_backDrop_effect: '8px',
    tool_text: "#8c8b8bff",
    tool_font: "1.2vw",
    text_char_max: 6,
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

  // Fade mask on both edges. Important: when blur is active on children, avoid applying a mask on the parent
  // because WebKit may suppress backdrop-filter rendering for descendants under a masked ancestor.
  if (!currentTheme.tool_backDrop_effect) {
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
  } else {
    support.webkitMaskImage = 'none';
    support.maskImage = 'none';
  }

  // iOS native scroll needs the scrollable container to receive touch events
  // and to have momentum scrolling enabled. Also hint the primary pan axis.
  support.pointerEvents = 'auto';
  support.WebkitOverflowScrolling = 'touch';
  support.touchAction = isHorizontal ? 'pan-x' : 'pan-y';


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
    background: 'transparent',
    // Important: support container must NOT blur
    backdropFilter: 'none',
    WebkitBackdropFilter: 'none',
    // Remove any shadow on the support container
    boxShadow: 'none',
    gap: currentTheme.items_spacing,
    scrollbarWidth: 'none',
    msOverflowStyle: 'none',
    WebkitOverflowScrolling: 'touch',
    // default overflow; calculate_positions will override per direction
    overflowX: 'auto',
    overflowY: 'hidden',
    touchAction: 'manipulation'
  }
};


const intuition_content = {
  version: "1.1",
  meta: { namespace: "atome.menu", defaultLocale: "en" },
  toolbox: { children: ['home', 'find', 'time', 'view', 'tools', 'communication', 'capture', 'edit'] },
  home: { type: palette, children: ['quit', 'user', 'settings', 'clear', 'cleanup'] },
  find: { type: tool, children: ['filter'] },
  time: { type: particle, children: ['filter'] },
  view: { type: option },
  tools: { type: zonespecial, children: ['filter'] },
  communication: { type: palette, children: ['quit', 'user', 'settings', 'clear', 'cleanup'] },
  capture: { type: palette, children: ['filter'] },
  edit: { type: palette, children: ['filter'] },
  filter: { type: palette, children: ['internet', 'local'] },
  quit: { type: tool },
  user: { type: palette, children: ['add', 'remove'] },
  settings: { type: tool },
  clear: { type: tool },
  cleanup: { type: tool },
  add: { type: tool },
  remove: { type: tool },
};

const toolbox = {
  id: 'toolbox',
  type: 'toolbox',
  parent: '#intuition',
  css: {
    background: currentTheme.tool_bg,
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
    // Reset any popped-out palette before rebuilding
    if (typeof handlePaletteClick !== 'undefined' && handlePaletteClick.active) {
      restorePalette(handlePaletteClick.active);
    }
    // Initialize navigation stack with top-level methods
    menuStack = [{ parent, children: methods.slice() }];
    methods.forEach(name => {
      const fct_exec = intuition_content[name]['type'];
      if (typeof fct_exec === 'function') {
        const optionalParams = { ...{ id: `_intuition_${name}`, label: name, icon: name, parent: '#toolbox_support' }, ...(intuitionAddOn[name] || {}) };
        fct_exec(optionalParams);
        // Apply blur to the newly created item
        const itemEl = grab(`_intuition_${name}`);
        if (itemEl) applyBackdropStyle(itemEl, currentTheme.tool_backDrop_effect);
      } else {
        console.warn(`Function ${fct_exec} not found`);
      }
    });
    // Add a green overflow-forcing item when opening the menu
    addOverflowForcer();
    menuOpen = parent;
  } else {
    // Full close: close any submenu and restore state
    closeEntireMenu();
  }
}

function intuitionCommon(cfg) {
  const el = $('div', {
    id: cfg.id,
    parent: cfg.parent,
    class: cfg.type,
    css: {
      background: currentTheme.tool_bg,
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
  // Apply or disable blur according to element type
  if (cfg.id === 'toolbox_support') {
    applyBackdropStyle(el, null);
  } else if (cfg.id === 'toolbox') {
    applyBackdropStyle(el, currentTheme.tool_backDrop_effect);
  }
  return el;
}




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
        top: '9%',             // à l'intérieur de l'item pour éviter overflow hidden du parent
        left: '50%',
        transform: 'translateX(-50%)',
        fontSize: currentTheme.tool_font,
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


const items_common = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'sans-serif',
  userSelect: 'none',

};

function palette(cfg) {
  const paletteAddOn = { background: 'rgba(255, 0, 0, 0.5)' };
  const finalCfg = {
    ...cfg,
    css: {
      ...items_common,
      ...(cfg.css || {}),
      ...paletteAddOn
    }
  };
  var el = intuitionCommon(finalCfg);
  create_label(cfg)
  el.addEventListener('click', (e) => {
    // el.style.height = parseFloat(currentTheme.item_size) / 3 + 'px';
    // el.style.width = parseFloat(currentTheme.item_size) * 3 + 'px';
    e.stopPropagation();
    handlePaletteClick(el, finalCfg);
  });

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
  // Ensure scrolling on the toolbox controls the support overflow
  setupToolboxScrollProxy();
  // Apply initial backdrop styles
  const supportEl = grab('toolbox_support');
  const toolboxEl = grab('toolbox');
  if (supportEl) applyBackdropStyle(supportEl, null);
  if (toolboxEl) applyBackdropStyle(toolboxEl, currentTheme.tool_backDrop_effect);
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
  // Re-ensure scroll proxy after layout updates
  setupToolboxScrollProxy();
  // Re-apply backdrop styles (layout may reset style props)
  if (supportEl) applyBackdropStyle(supportEl, null);
  if (triggerEl) applyBackdropStyle(triggerEl, currentTheme.tool_backDrop_effect);
  if (supportEl) {
    Array.from(supportEl.children || []).forEach(child => {
      if (child && child.id !== '_intuition_overflow_forcer') {
        applyBackdropStyle(child, currentTheme.tool_backDrop_effect);
      }
    });
  }
  // Align to toolbox edge first (direction may have changed), then reposition popped-out palette
  alignSupportToToolboxEdge();
  // Reposition any popped-out palette on layout changes
  repositionPoppedPalette();
}

// Helper to set backdrop-filter with WebKit prefix
function applyBackdropStyle(el, blurPx) {
  if (!el || !el.style) return;
  const val = blurPx ? `blur(${blurPx})` : 'none';
  try {
    el.style.backdropFilter = val;
    el.style.WebkitBackdropFilter = val;
    el.style.setProperty('backdrop-filter', val);
    el.style.setProperty('-webkit-backdrop-filter', val);
  } catch (e) { /* ignore */ }
}


// Isolated methods to add/remove a green item to force overflow
function addOverflowForcer() {
  const supportEl = grab('toolbox_support');
  if (!supportEl) return;
  if (document.getElementById('_intuition_overflow_forcer')) return;

  // Create a transparent block matching the item size to extend the scrollable area
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


// Forward wheel/touch interactions on the toolbox to scroll the toolbox_support overflow
function setupToolboxScrollProxy() {
  const toolboxEl = grab('toolbox');
  const supportEl = grab('toolbox_support');
  if (!toolboxEl || !supportEl) return;
  if (toolboxEl._scrollProxyAttached) return;

  const isHorizontal = () => (currentTheme?.direction || '').toLowerCase().includes('horizontal');

  const onWheel = (e) => {
    const horiz = isHorizontal();
    const dx = e.deltaX || 0;
    const dy = e.deltaY || 0;
    // Prefer the component aligned with our main axis; fall back to dy for horizontal if dx is tiny
    const main = horiz ? (Math.abs(dx) > Math.abs(dy) ? dx : dy) : dy;
    if (main === 0) return;
    e.preventDefault();
    e.stopPropagation();
    if (horiz) supportEl.scrollBy({ left: main, behavior: 'auto' });
    else supportEl.scrollBy({ top: main, behavior: 'auto' });
  };

  let tX = 0, tY = 0;
  const onTouchStart = (e) => {
    if (!e.touches || e.touches.length === 0) return;
    tX = e.touches[0].clientX;
    tY = e.touches[0].clientY;
  };
  const onTouchMove = (e) => {
    if (!e.touches || e.touches.length === 0) return;
    const horiz = isHorizontal();
    const x = e.touches[0].clientX;
    const y = e.touches[0].clientY;
    const dx = x - tX;
    const dy = y - tY;
    const main = horiz ? -dx : -dy; // natural feel
    if (main !== 0) {
      e.preventDefault();
      e.stopPropagation();
      if (horiz) supportEl.scrollBy({ left: main, behavior: 'auto' });
      else supportEl.scrollBy({ top: main, behavior: 'auto' });
    }
    tX = x; tY = y;
  };

  toolboxEl.addEventListener('wheel', onWheel, { passive: false });
  toolboxEl.addEventListener('touchstart', onTouchStart, { passive: true });
  // On iOS, let the native scroll handle touchmove on the scrollable support container.
  // To avoid fighting with native momentum, don't intercept touchmove when the support can scroll.
  toolboxEl.addEventListener('touchmove', (e) => {
    const canScrollX = supportEl.scrollWidth > supportEl.clientWidth;
    const canScrollY = supportEl.scrollHeight > supportEl.clientHeight;
    if (canScrollX || canScrollY) {
      // Allow native scroll
      return;
    }
    // Fallback to proxy when no native overflow
    onTouchMove(e);
  }, { passive: true });
  toolboxEl._scrollProxyAttached = true;
}

// ===== Palette pop-out logic =====
function getDirMeta() {
  const dir = (currentTheme?.direction || '').toLowerCase();
  const isHorizontal = dir.includes('horizontal');
  const isTop = dir.includes('top');
  const isBottom = dir.includes('bottom');
  const isLeft = dir.includes('left');
  const isRight = dir.includes('right');
  // isReverse is kept for scroll-edge alignment semantics (row-reverse/column-reverse)
  const isReverse = (isHorizontal && isRight) || (!isHorizontal && isBottom);
  return { isHorizontal, isTop, isBottom, isLeft, isRight, isReverse, dir };
}

function handlePaletteClick(el, cfg) {

  // Exclusif: ramener l'ancien palette si présent
  const wasActive = handlePaletteClick.active && handlePaletteClick.active.el === el;
  // el.style.height = parseFloat(currentTheme.item_size) / 3 + 'px';
  // el.style.width = '300px';

  if (wasActive) {
    // BACK: go up one level in the stack and rebuild
    if (menuStack.length > 1) {
      const prevEntry = menuStack[menuStack.length - 2];
      // remove current level
      const currState = handlePaletteClick.active;
      const anchorRect = currState && currState.el ? currState.el.getBoundingClientRect() : null;
      menuStack.pop();
      // Restore current popped-out palette back into the menu
      if (currState) restorePalette(currState);
      handlePaletteClick.active = null;
      // Rebuild the menu to the previous level's children
      rebuildSupportToNames(prevEntry.children.slice());
      // Pop out the previous parent outside (e.g., 'home')
      popOutPaletteByName(prevEntry.parent, { anchorRect });
    } else {
      // At top level already; just restore palette and ensure top is shown
      const top = (menuStack[0] && menuStack[0].children) ? menuStack[0].children.slice() : [];
      // Remove any external popped item entirely at root
      if (handlePaletteClick.active) {
        restorePalette(handlePaletteClick.active);
      }
      rebuildSupportToNames(top);
      handlePaletteClick.active = null;
    }
    return;
  } else if (handlePaletteClick.active) {
    // Another palette was active; restore it before proceeding forward
    restorePalette(handlePaletteClick.active);
  }

  const supportEl = grab('toolbox_support');
  if (!supportEl || !el) return;

  // Créer un placeholder pour garder la place dans le flux
  const placeholder = document.createElement('div');
  placeholder.id = `${el.id}__placeholder`;
  placeholder.style.width = `${el.offsetWidth}px`;
  placeholder.style.height = `${el.offsetHeight}px`;
  placeholder.style.flex = '0 0 auto';
  placeholder.style.display = 'inline-block';
  placeholder.style.borderRadius = getComputedStyle(el).borderRadius;

  // Insérer le placeholder à la position de l'élément et extraire l'élément
  supportEl.insertBefore(placeholder, el);

  // Calculer la position de référence (placeholder) et du support
  const phRect = placeholder.getBoundingClientRect();
  const supportRect = supportEl.getBoundingClientRect();

  // Figer la taille courante pour éviter l'effondrement (pourcentage/flex) en position:fixed
  el.style.width = `${phRect.width}px`;
  el.style.height = `${phRect.height}px`;
  // Passer l'élément en position fixed pour le sortir du container, sans changer x/y main-axis
  el.style.position = 'fixed';
  // Déplacer dans le body pour éviter le bug des ancêtres transformés qui piègent position:fixed
  try { if (document.body && el.parentElement !== document.body) document.body.appendChild(el); } catch (e) { }
  el.style.left = `${phRect.left}px`;
  el.style.top = `${phRect.top}px`;
  el.style.margin = '0';
  el.style.zIndex = '10000004';

  // Maintenant déplacer l'élément le long de l'axe transversal pour être totalement hors du support
  const { isHorizontal, isTop, isBottom, isLeft, isRight } = getDirMeta();
  const gap = Math.max(8, parseFloat(currentTheme.items_spacing) || 8);
  const vw = window.innerWidth || document.documentElement.clientWidth;
  const vh = window.innerHeight || document.documentElement.clientHeight;
  const elW = el.offsetWidth;
  const elH = el.offsetHeight;

  if (isHorizontal) {
    // axe principal = X; on sort sur Y (au-dessus si possible quand top_*, sinon en dessous)
    const aboveSpace = supportRect.top;
    const belowSpace = vh - supportRect.bottom;
    let placeAbove = !!isTop;
    if (placeAbove && aboveSpace < elH + gap) placeAbove = false;
    if (!placeAbove && belowSpace < elH + gap && aboveSpace >= elH + gap) placeAbove = true;
    const targetTop = placeAbove ? (supportRect.top - elH - gap) : (supportRect.bottom + gap);
    // clamp dans l’écran
    const clampedTop = Math.max(0, Math.min(vh - elH, targetTop));
    el.style.top = `${clampedTop}px`;
    // garder l’axe X ancré à la placeholder, mais clamp dans l’écran
    const baseLeft = phRect.left;
    const clampedLeft = Math.max(0, Math.min(vw - elW, baseLeft));
    el.style.left = `${clampedLeft}px`;
  } else {
    // axe principal = Y; on sort sur X (à gauche si possible quand *_left, sinon à droite)
    const leftSpace = supportRect.left;
    const rightSpace = vw - supportRect.right;
    let placeLeft = !!isLeft;
    if (placeLeft && leftSpace < elW + gap) placeLeft = false;
    if (!placeLeft && rightSpace < elW + gap && leftSpace >= elW + gap) placeLeft = true;
    const targetLeft = placeLeft ? (supportRect.left - elW - gap) : (supportRect.right + gap);
    const clampedLeft = Math.max(0, Math.min(vw - elW, targetLeft));
    el.style.left = `${clampedLeft}px`;
    // garder l’axe Y ancré à la placeholder, mais clamp dans l’écran
    const baseTop = phRect.top;
    const clampedTop = Math.max(0, Math.min(vh - elH, baseTop));
    el.style.top = `${clampedTop}px`;
  }

  // Marquer l'état actif et garder les références pour restauration
  handlePaletteClick.active = { el, placeholder };

  // Mettre à jour les items restants avec le contenu du palette
  const paletteName = (cfg && cfg.label) || (cfg && cfg.id) || '';
  const desc = intuition_content[paletteName];
  if (desc && Array.isArray(desc.children)) {
    // Push next level into the navigation stack
    menuStack.push({ parent: paletteName, children: desc.children.slice() });
    rebuildSupportWithChildren(desc.children, el.id);
  }
}

// Helper to pop out a palette by name without altering the navigation stack
function popOutPaletteByName(name, opts = {}) {
  const supportEl = grab('toolbox_support');
  if (!supportEl || !name) return null;
  const id = `_intuition_${name}`;
  let el = grab(id);
  if (!el) {
    const def = intuition_content[name];
    if (!def || typeof def.type !== 'function') return null;
    const optionalParams = { id, label: name, icon: name, parent: '#toolbox_support' };
    def.type(optionalParams);
    el = grab(id);
    if (!el) return null;
    applyBackdropStyle(el, currentTheme.tool_backDrop_effect);
  }

  const { anchorRect } = opts;
  if (anchorRect) {
    // Use provided anchor (previous popped element position/size). No placeholder in menu.
    // If the element is currently in the support, detach it so it won't appear inside the menu.
    if (el.parentElement === supportEl) {
      try { el.remove(); } catch (e) { /* ignore */ }
    }
    el.style.width = `${anchorRect.width}px`;
    el.style.height = `${anchorRect.height}px`;
    el.style.position = 'fixed';
    try { if (document.body && el.parentElement !== document.body) document.body.appendChild(el); } catch (e) { }
    el.style.left = `${anchorRect.left}px`;
    el.style.top = `${anchorRect.top}px`;
    el.style.margin = '0';
    el.style.zIndex = '10000004';
    handlePaletteClick.active = { el, placeholder: null };
    return el;
  } else {
    // Default behavior: create a placeholder at the element's position and extract it
    const placeholder = document.createElement('div');
    placeholder.id = `${id}__placeholder`;
    placeholder.style.width = `${el.offsetWidth}px`;
    placeholder.style.height = `${el.offsetHeight}px`;
    placeholder.style.flex = '0 0 auto';
    placeholder.style.display = 'inline-block';
    placeholder.style.borderRadius = getComputedStyle(el).borderRadius;
    supportEl.insertBefore(placeholder, el);

    const phRect = placeholder.getBoundingClientRect();
    const supportRect = supportEl.getBoundingClientRect();

    el.style.width = `${phRect.width}px`;
    el.style.height = `${phRect.height}px`;
    el.style.position = 'fixed';
    try { if (document.body && el.parentElement !== document.body) document.body.appendChild(el); } catch (e) { }
    el.style.left = `${phRect.left}px`;
    el.style.top = `${phRect.top}px`;
    el.style.margin = '0';
    el.style.zIndex = '10000004';

    const { isHorizontal, isTop, isBottom, isLeft, isRight } = getDirMeta();
    const gap = Math.max(8, parseFloat(currentTheme.items_spacing) || 8);
    const vw = window.innerWidth || document.documentElement.clientWidth;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const elW = el.offsetWidth;
    const elH = el.offsetHeight;

    if (isHorizontal) {
      const aboveSpace = supportRect.top;
      const belowSpace = vh - supportRect.bottom;
      let placeAbove = !!isTop;
      if (placeAbove && aboveSpace < elH + gap) placeAbove = false;
      if (!placeAbove && belowSpace < elH + gap && aboveSpace >= elH + gap) placeAbove = true;
      const targetTop = placeAbove ? (supportRect.top - elH - gap) : (supportRect.bottom + gap);
      const clampedTop = Math.max(0, Math.min(vh - elH, targetTop));
      el.style.top = `${clampedTop}px`;
      const baseLeft = phRect.left;
      const clampedLeft = Math.max(0, Math.min(vw - elW, baseLeft));
      el.style.left = `${clampedLeft}px`;
    } else {
      const leftSpace = supportRect.left;
      const rightSpace = vw - supportRect.right;
      let placeLeft = !!isLeft;
      if (placeLeft && leftSpace < elW + gap) placeLeft = false;
      if (!placeLeft && rightSpace < elW + gap && leftSpace >= elW + gap) placeLeft = true;
      const targetLeft = placeLeft ? (supportRect.left - elW - gap) : (supportRect.right + gap);
      const clampedLeft = Math.max(0, Math.min(vw - elW, targetLeft));
      el.style.left = `${clampedLeft}px`;
      const baseTop = phRect.top;
      const clampedTop = Math.max(0, Math.min(vh - elH, baseTop));
      el.style.top = `${clampedTop}px`;
    }

    handlePaletteClick.active = { el, placeholder };
    return el;
  }
}

function restorePalette(state) {
  if (!state || !state.el) return;
  const { el, placeholder } = state;
  // Restaurer positionnement par défaut
  el.style.position = 'relative';
  el.style.left = '';
  el.style.top = '';
  el.style.zIndex = '';
  el.style.width = '';
  el.style.height = '';
  // Si un placeholder existe, on replace l'élément à sa position
  if (placeholder && placeholder.parentElement) {
    placeholder.parentElement.replaceChild(el, placeholder);
  } else {
    // Sinon, l'élément avait été extrait sans placeholder (mode ancré):
    // on le supprime du DOM pour éviter qu'il apparaisse à la fois dehors et dans le menu.
    try { el.remove(); } catch (e) { /* ignore */ }
  }
  handlePaletteClick.active = null;
}

function rebuildSupportWithChildren(childrenNames, excludeId) {
  const supportEl = grab('toolbox_support');
  if (!supportEl) return;
  // Retirer tous les items sauf le placeholder et l'overflow forcer et l'élément exclu
  Array.from(supportEl.children).forEach(ch => {
    if (ch.id === '_intuition_overflow_forcer') return;
    if (excludeId && ch.id === `${excludeId}__placeholder`) return;
    // on ne supprime pas le placeholder; les autres items sortent
    if (!excludeId || ch.id !== excludeId) ch.remove();
  });

  // Ajouter les enfants
  const placeholder = excludeId ? document.getElementById(`${excludeId}__placeholder`) : null;
  childrenNames.forEach(name => {
    const def = intuition_content[name];
    if (!def || typeof def.type !== 'function') return;
    const optionalParams = { id: `_intuition_${name}`, label: name, icon: name, parent: '#toolbox_support' };
    // Do not create a duplicate of the currently popped-out item inside the menu
    if (excludeId && optionalParams.id === excludeId) return;
    def.type(optionalParams);
    // If placeholder is present, place the item BEFORE it so it's aligned toward the toolbox
    const childEl = grab(`_intuition_${name}`);
    if (placeholder) {
      if (childEl && childEl.parentElement === supportEl) {
        supportEl.insertBefore(childEl, placeholder);
      }
    }
    // Ensure the child uses the current backdrop effect (glass) like top-level items
    if (childEl) applyBackdropStyle(childEl, currentTheme.tool_backDrop_effect);
  });

  // Aligner le scroll contre la toolbox une fois le layout calculé
  // S'assurer que l'overflow forcer est en toute fin (côté opposé à la toolbox)
  // Make sure an overflow forcer exists (some rebuild paths rely on it)
  addOverflowForcer();
  ensureOverflowForcerAtEnd();
  requestAnimationFrame(() => alignSupportToToolboxEdge());
}

// Rebuild the support with an explicit list of item names (no placeholder logic)
function rebuildSupportToNames(names) {
  const supportEl = grab('toolbox_support');
  if (!supportEl) return;
  // Remove all items except the overflow forcer
  Array.from(supportEl.children).forEach(ch => {
    if (ch.id === '_intuition_overflow_forcer') return;
    ch.remove();
  });
  // Create new items for the provided names
  names.forEach(name => {
    const def = intuition_content[name];
    if (!def || typeof def.type !== 'function') return;
    const optionalParams = { id: `_intuition_${name}`, label: name, icon: name, parent: '#toolbox_support' };
    def.type(optionalParams);
    const childEl = grab(`_intuition_${name}`);
    if (childEl) applyBackdropStyle(childEl, currentTheme.tool_backDrop_effect);
  });
  // Ensure overflow forcer exists
  addOverflowForcer();
  // And ensure it's at the end, away from the toolbox side
  ensureOverflowForcerAtEnd();
  // Align after layout
  requestAnimationFrame(() => alignSupportToToolboxEdge());
}

function ensureOverflowForcerAtEnd() {
  const el = document.getElementById('_intuition_overflow_forcer');
  if (el && el.parentElement && el.parentElement.lastElementChild !== el) {
    el.parentElement.appendChild(el);
  }
}

function closeEntireMenu() {
  const supportEl = grab('toolbox_support');
  // Restore popped-out palette and remove its placeholder if any
  if (typeof handlePaletteClick !== 'undefined' && handlePaletteClick.active) {
    const ph = handlePaletteClick.active.placeholder;
    restorePalette(handlePaletteClick.active);
    if (ph && ph.parentElement) ph.remove();
    handlePaletteClick.active = null;
  }
  // Remove all items from support (except none)
  if (supportEl) {
    Array.from(supportEl.children).forEach(ch => ch.remove());
  }
  // Remove overflow forcer explicitly
  removeOverflowForcer();
  // Reset state
  menuOpen = 'false';
  menuStack = [];
}

function repositionPoppedPalette() {
  const state = handlePaletteClick.active;
  if (!state || !state.el || !state.placeholder) return;
  const supportEl = grab('toolbox_support');
  if (!supportEl) return;
  const phRect = state.placeholder.getBoundingClientRect();
  const supportRect = supportEl.getBoundingClientRect();
  // Recalibrer la position X/Y principale à celle de la placeholder
  // Garder la taille verrouillée à celle de la placeholder
  state.el.style.width = `${phRect.width}px`;
  state.el.style.height = `${phRect.height}px`;
  state.el.style.left = `${phRect.left}px`;
  state.el.style.top = `${phRect.top}px`;

  // Puis re-déporter transversalement hors du support
  const { isHorizontal, isTop, isBottom, isLeft, isRight } = getDirMeta();
  const gap = Math.max(8, parseFloat(currentTheme.items_spacing) || 8);
  const vw = window.innerWidth || document.documentElement.clientWidth;
  const vh = window.innerHeight || document.documentElement.clientHeight;
  const elW = state.el.offsetWidth;
  const elH = state.el.offsetHeight;

  if (isHorizontal) {
    const aboveSpace = supportRect.top;
    const belowSpace = vh - supportRect.bottom;
    let placeAbove = !!isTop;
    if (placeAbove && aboveSpace < elH + gap) placeAbove = false;
    if (!placeAbove && belowSpace < elH + gap && aboveSpace >= elH + gap) placeAbove = true;
    const targetTop = placeAbove ? (supportRect.top - elH - gap) : (supportRect.bottom + gap);
    const clampedTop = Math.max(0, Math.min(vh - elH, targetTop));
    state.el.style.top = `${clampedTop}px`;
    const baseLeft = phRect.left;
    const clampedLeft = Math.max(0, Math.min(vw - elW, baseLeft));
    state.el.style.left = `${clampedLeft}px`;
  } else {
    const leftSpace = supportRect.left;
    const rightSpace = vw - supportRect.right;
    let placeLeft = !!isLeft;
    if (placeLeft && leftSpace < elW + gap) placeLeft = false;
    if (!placeLeft && rightSpace < elW + gap && leftSpace >= elW + gap) placeLeft = true;
    const targetLeft = placeLeft ? (supportRect.left - elW - gap) : (supportRect.right + gap);
    const clampedLeft = Math.max(0, Math.min(vw - elW, targetLeft));
    state.el.style.left = `${clampedLeft}px`;
    const baseTop = phRect.top;
    const clampedTop = Math.max(0, Math.min(vh - elH, baseTop));
    state.el.style.top = `${clampedTop}px`;
  }
}

function alignSupportToToolboxEdge() {
  const supportEl = grab('toolbox_support');
  if (!supportEl) return;
  const { isHorizontal, isReverse } = getDirMeta();
  if (isHorizontal) {
    supportEl.scrollLeft = isReverse
      ? (supportEl.scrollWidth - supportEl.clientWidth)
      : 0;
  } else {
    supportEl.scrollTop = isReverse
      ? (supportEl.scrollHeight - supportEl.clientHeight)
      : 0;
  }
}




