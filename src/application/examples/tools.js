let calculatedCSS = {};
const shadowLeft = 5,
  shadowTop = 5,
  shadowBlur = 5;

let menuOpen = 'false';

const Intuition_theme = {
  light: {

    items_spacing: "25px",
    item_size: "69px",
    support_thickness: "130px",
    tool_bg: "#484747ff",
    tool_bg_active: "#656565ff",
    tool_text: "#8c8b8bff",
    tool_active_bg: "#e0e0e0",
    toolboxOffsetMain: "116px",
    toolboxOffsetEdge: "35px",
    icon_top: "45%",
    icon_left: "33%",
    icon_centered_top: "33%",
    icon_centered_left: "33%",
    icon_size: "16%",
    item_shadow: `${shadowLeft}px ${shadowTop}px ${shadowBlur}px rgba(0,0,0,0.69)`,
    item_border_radius: "20%",
  }
};

const currentTheme = Intuition_theme.light;

currentTheme.direction = "top_left_horizontal";
// currentTheme.direction = "top_right_horizontal";
// currentTheme.direction = "bottom_left_horizontal";
// currentTheme.direction = "bottom_right_horizontal";
// currentTheme.direction = "top_left_vertical";
// currentTheme.direction = "bottom_left_vertical";
// currentTheme.direction = "bottom_right_vertical";
// currentTheme.direction = "top_right_vertical";
// currentTheme.direction = "bottom_right_vertical";


function calculate_positions() {
  const dir = (currentTheme?.direction || 'top_left_horizontal').toLowerCase();
  const thickness = currentTheme.support_thickness || (parseFloat(currentTheme.item_size || '0') + parseFloat((currentTheme.margin || '0')) + 'px');


  const toolboxOffsetMain = currentTheme.toolboxOffsetMain || '0px';
  const toolboxOffsetEdge = currentTheme.toolboxOffsetEdge || '0px';

  const itemOffsetMain = '  139px  ';
  const items_offset_edge = '  12px ';

  const H = { width: `calc(100vw - ${items_offset_edge}px)`, height: thickness, columnGap: currentTheme.items_spacing };
  const V = { width: thickness, height: `calc(100vh - ${items_offset_edge}px)`, rowGap: currentTheme.items_spacing };

  let support = {};
  let trigger = {};

  switch (dir) {
    case 'top_left_horizontal':
      support = { ...H, flexDirection: 'row', top: items_offset_edge, left: itemOffsetMain, alignItems: 'center', overflowX: 'auto', overflowY: 'hidden' };
      trigger = { top: toolboxOffsetEdge, left: toolboxOffsetMain };
      break;
    case 'top_right_horizontal':
      support = { ...H, flexDirection: 'row-reverse', top: items_offset_edge, right: itemOffsetMain, alignItems: 'center', overflowX: 'auto', overflowY: 'hidden' };
      trigger = { top: toolboxOffsetEdge, right: toolboxOffsetMain };
      break;
    case 'bottom_left_horizontal':
      support = { ...H, flexDirection: 'row', bottom: items_offset_edge, left: itemOffsetMain, alignItems: 'center', overflowX: 'auto', overflowY: 'hidden' };
      trigger = { bottom: toolboxOffsetEdge, left: toolboxOffsetMain };
      break;
    case 'bottom_right_horizontal':
      support = { ...H, flexDirection: 'row-reverse', bottom: items_offset_edge, right: itemOffsetMain, alignItems: 'center', overflowX: 'auto', overflowY: 'hidden' };
      trigger = { bottom: toolboxOffsetEdge, right: toolboxOffsetMain };
      break;
    case 'top_left_vertical':
      support = { ...V, flexDirection: 'column', top: itemOffsetMain, left: items_offset_edge, alignItems: 'center', overflowX: 'hidden', overflowY: 'auto' };
      trigger = { top: toolboxOffsetMain, left: toolboxOffsetEdge };
      break;
    case 'bottom_left_vertical':
      support = { ...V, flexDirection: 'column-reverse', bottom: itemOffsetMain, left: items_offset_edge, alignItems: 'center', overflowX: 'hidden', overflowY: 'auto' };
      trigger = { bottom: toolboxOffsetMain, left: toolboxOffsetEdge };
      break;
    case 'top_right_vertical':
      support = { ...V, flexDirection: 'column', top: itemOffsetMain, right: items_offset_edge, alignItems: 'center', overflowX: 'hidden', overflowY: 'auto' };
      trigger = { top: toolboxOffsetMain, right: toolboxOffsetEdge };
      break;
    case 'bottom_right_vertical':
      support = { ...V, flexDirection: 'column-reverse', bottom: itemOffsetMain, right: items_offset_edge, alignItems: 'center', overflowX: 'hidden', overflowY: 'auto' };
      trigger = { bottom: toolboxOffsetMain, right: toolboxOffsetMain };
      break;
    default:
      support = { ...H, flexDirection: 'row', top: items_offset_edge, left: itemOffsetMain, alignItems: 'center', overflowX: 'auto', overflowY: 'hidden' };
      trigger = { top: toolboxOffsetEdge, left: toolboxOffsetMain };
  }
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
    justifyContent: 'flex-start',
    boxSizing: 'border-box',
    justifyContent: 'flex-start',
    width: width,
    maxWidth: width,
    height: height,
    maxHeight: height,
    position: 'fixed',
    boxShadow: '0px 0px 0px rgba(0,0,0,0)',
    borderRadius: 0,
    backgroundColor: 'green',
    gap: currentTheme.items_spacing,
    scrollbarWidth: 'none',
    msOverflowStyle: 'none',
    ...posCss
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
    backgroundColor: 'red',
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
    menuOpen = parent;
  } else {
    methods.forEach(name => {
      const el = grab(`_intuition_${name}`);
      if (el) el.remove();
    });
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

function palette(cfg) { intuitionCommon({ ...cfg, ...items_common }); }
function tool(cfg) { intuitionCommon({ ...cfg, ...items_common }); }
function particle(cfg) { intuitionCommon({ ...cfg, ...items_common }); }
function option(cfg) { intuitionCommon({ ...cfg, ...items_common }); }
function zonespecial(cfg) { intuitionCommon({ ...cfg, ...items_common }); }

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
    Object.assign(supportEl.style, calculatedCSS.toolbox_support);
    supportEl.style.width = calculatedCSS.toolbox_support.width;
    supportEl.style.height = calculatedCSS.toolbox_support.height;
  }
  if (triggerEl) {
    Object.assign(triggerEl.style, calculatedCSS.toolbox);
  }
}

window.addEventListener('resize', apply_layout);
window.setDirection = function (dir) { currentTheme.direction = dir; apply_layout(); };

init_inituition();
apply_layout();