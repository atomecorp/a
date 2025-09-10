// menu – Modular Snake/Nibble Menu Spec v1.1 
// Notes: canvas holds a working spec with JSON + comments. JSON sections may include // comments.


const intuition = {
  "version": "1.1",
  "meta": { "namespace": "atome.menu", "defaultLocale": "en" },

  // =============================
  // 1) Providers (unchanged)
  // =============================
  "providers": {
    "templates": {
      "type": "static", "items": [
        { "id": "tpl.photo", "type": "template", "labelKey": "Templates.Photos" },
        { "id": "tpl.videoFx", "type": "template", "labelKey": "Templates.VideoFX" },
        { "id": "tpl.programming", "type": "template", "labelKey": "Templates.Programming" }
      ]
    },
    "viewModes": {
      "type": "static", "items": [
        { "id": "vm.list", "type": "viewMode", "labelKey": "ViewMode.List", "icon": "list", "action": { "command": "ui.setViewMode", "params": { "mode": "list" } } },
        { "id": "vm.grid", "type": "viewMode", "labelKey": "ViewMode.Grid", "icon": "grid", "action": { "command": "ui.setViewMode", "params": { "mode": "grid" } } },
        { "id": "vm.code", "type": "viewMode", "labelKey": "ViewMode.Code", "icon": "code", "action": { "command": "ui.setViewMode", "params": { "mode": "code" } } }
      ]
    },
    "recentProjects": { "type": "dynamic", "endpoint": "menu.fetchRecentProjects", "cacheTtlSec": 30 }
  },

  // =============================
  // 2) Menu Tree (sample)
  // =============================
  "menu": {
    "id": "root",
    "type": "group",
    "children": [
      {
        "id": "home",
        "type": "group",
        "labelKey": "Home",
        "icon": "home",
        "children": [
          { "id": "home.system", "type": "item", "labelKey": "System", "icon": "cpu", "action": { "command": "system.open" } },
          { "id": "home.user", "type": "item", "labelKey": "User", "icon": "user", "action": { "command": "user.openProfile" } },
          { "id": "home.recent", "type": "group", "labelKey": "Recent", "icon": "clock", "childrenProvider": { "use": "recentProjects" } }
        ]
      },

      {
        "id": "find", "type": "group", "labelKey": "Find", "icon": "search", "children": [
          { "id": "find.filter", "type": "item", "labelKey": "Filter", "icon": "filter", "action": { "command": "search.openFilter" } },
          {
            "id": "find.selector", "type": "group", "labelKey": "SelectorTags", "icon": "tag", "children": [
              { "id": "find.selector.label", "type": "item", "labelKey": "Label", "action": { "command": "tags.pick", "params": { "scope": "label" } } },
              { "id": "find.selector.name", "type": "item", "labelKey": "Name", "action": { "command": "tags.pick", "params": { "scope": "name" } } },
              { "id": "find.selector.slicer", "type": "item", "labelKey": "Slicer", "action": { "command": "tags.slicer" } }
            ]
          }
        ]
      },

      {
        "id": "time", "type": "group", "labelKey": "Time", "icon": "timer", "children": [
          { "id": "time.schedule", "type": "item", "labelKey": "Schedule", "action": { "command": "time.schedule" } },
          { "id": "time.clock", "type": "item", "labelKey": "Clock", "action": { "command": "time.clock" } },
          {
            "id": "time.timeline", "type": "group", "labelKey": "Timeline", "children": [
              { "id": "time.undo", "type": "item", "labelKey": "Undo", "icon": "undo", "action": { "command": "history.undo" } },
              { "id": "time.redo", "type": "item", "labelKey": "Redo", "icon": "redo", "action": { "command": "history.redo" } }
            ]
          },
          { "id": "time.wait", "type": "item", "labelKey": "Wait", "action": { "command": "time.waitDialog" } },
          { "id": "time.every", "type": "item", "labelKey": "Every", "action": { "command": "time.repeat" } }
        ]
      },

      { "id": "view", "type": "group", "labelKey": "View", "icon": "layout", "childrenProvider": { "use": "viewModes" } },
      { "id": "templates", "type": "group", "labelKey": "Templates", "icon": "template", "childrenProvider": { "use": "templates" } },

      {
        "id": "tools", "type": "group", "labelKey": "Tools", "icon": "wrench", "children": [
          {
            "id": "tools.communication", "type": "group", "labelKey": "Communication", "children": [
              { "id": "tools.share", "type": "item", "labelKey": "Share", "icon": "share", "action": { "command": "comm.share" } },
              { "id": "tools.message", "type": "item", "labelKey": "Message", "action": { "command": "comm.message" } },
              { "id": "tools.visio", "type": "item", "labelKey": "Visio", "action": { "command": "comm.visio" } },
              { "id": "tools.tel", "type": "item", "labelKey": "Phone", "action": { "command": "comm.phone" } },
              { "id": "tools.collab", "type": "item", "labelKey": "Collab", "action": { "command": "comm.collab" } }
            ]
          },
          { "id": "tools.capture", "type": "item", "labelKey": "Capture", "icon": "camera", "action": { "command": "capture.open" } },
          { "id": "tools.edit", "type": "item", "labelKey": "EditToolbox", "icon": "edit", "action": { "command": "toolbox.edit" } },
          { "id": "tools.create", "type": "item", "labelKey": "Create", "action": { "command": "content.create" } },
          { "id": "tools.change", "type": "item", "labelKey": "Change", "action": { "command": "content.change" } },
          { "id": "tools.find", "type": "item", "labelKey": "Find", "action": { "command": "search.open" } },
          { "id": "tools.userHome", "type": "item", "labelKey": "UserHome", "action": { "command": "nav.open", "params": { "path": "atome://home" } } },
          { "id": "tools.view", "type": "item", "labelKey": "View", "action": { "command": "ui.toggle" } },
          { "id": "tools.time", "type": "item", "labelKey": "Time", "action": { "command": "time.panel" } }
        ]
      },

      {
        "id": "settings", "type": "group", "labelKey": "Settings", "icon": "settings", "children": [
          { "id": "settings.language", "type": "item", "labelKey": "Language", "action": { "command": "settings.language" } },
          { "id": "settings.inspector", "type": "item", "labelKey": "Inspector", "action": { "command": "inspector.toggle" } },
          { "id": "settings.clear", "type": "item", "labelKey": "Clear", "action": { "command": "app.clearCache" } }
        ]
      },

      {
        "id": "help", "type": "group", "labelKey": "Help", "icon": "help", "children": [
          { "id": "help.docs", "type": "item", "labelKey": "Docs", "action": { "route": "/help" } },
          { "id": "help.about", "type": "item", "labelKey": "About", "action": { "command": "app.about" } }
        ]
      },

      { "id": "quit", "type": "item", "labelKey": "Quit", "icon": "power", "action": { "command": "app.quit" } }
    ]
  }
};

// =============================
// 3) Instance Options (from user answers)
// =============================
// Not in JSON data; passed at instantiation time.
const instanceOptions = {
  anchor: "top-left",                       // top-left | top-right | bottom-left | bottom-right
  primaryOrientation: "vertical",           // vertical | horizontal (N1)
  maxDepth: 5,                               // hard limit
  maxItemsPerLevel: 7,                       // enforce capping
  spacingPx: 12,                             // fixed spacing between levels
  overflow: "scroll",                       // when level exceeds viewport -> scroll
  mode: "step",                             // step | glide (gesture path)
  // Grip behavior
  grip: {
    enabled: true,
    // In step mode: replacing previous level; click grip -> restore previous level
    // In glide mode: previous level is cleared; hovering the grip while moving back restores
    sizePx: 28,
    longPressMs: 350,                         // long press on grip → pin/extract panel
    duplicateOnExtract: true                  // extracting creates a duplicate panel/tool
  },
  // Interaction
  interaction: {
    openOnHover: false,                      // desktop hover disabled
    openDelayMs: 0,
    autoCloseOnFocusExit: true
  },
  // Gesture (glide mode)
  gesture: {
    angleToleranceDeg: 35,
    minVelocityPxPerS: 250,
    snapRadiusPx: 40
  },
  // Alternating directions
  directions: {
    alternate: true,                         // N1 = primary, N2 = perpendicular, then repeat
    flipOnEdges: true,                       // flip when colliding screen edges
    rtlHorizontalInvert: true                // respect RTL locales
  },
  // Accessibility & keyboard
  a11y: {
    keyboard: true,                          // arrows/enter/esc
    tabCycle: true,
    roles: true,                             // aria roles
    // Physical sizing target: ~1.2 cm touch target (maps to >=44 px on most phones)
    minTouchSizeCm: 1.2,
    focusRing: true
  },
  // Animations & perf
  animation: {
    durationMs: 140,
    easing: "easeOutQuad",
    staggerMs: 12,
    rubberEffect: 0.08                        // subtle overshoot
  },
  performance: {
    lazyMount: true,
    virtualizeLongLists: true
  },
  // Data & dynamics
  data: {
    cacheDynamicProviders: true,             // cache recent/favorites
    fastestLoading: true,                    // choose spinner/skeleton heuristics
    liveFilterEnabled: true                  // Find regenerates current level
  },
  // Persistence
  persistence: {
    rememberLastPathPerContext: true,
    pinnedDock: {
      enabled: true,
      allowExtractSingleTool: true
    }
  },
  // Theme
  theme: {
    scheme: "auto",                          // light | dark | auto
    contrast: "AA",                           // AA | AAA (AAA when option enabled)
    allowDensityTweaks: false                // only light/dark; no density/skins
  }
};

// =============================
// 4) Layout Algorithm (pseudocode)
// =============================
/*
function openLevel(parentLevel, levelIndex, anchor, primaryOrientation) {
  const dir = (levelIndex % 2 === 1) ? primaryOrientation : perpendicular(primaryOrientation);
  const origin = computeOriginFromAnchor(anchor); // e.g., top-left
  const rect = computeLevelRect(parentLevel, dir, instanceOptions.spacingPx);
  if (wouldOverflow(rect)) {
    if (instanceOptions.directions.flipOnEdges) flipDirection(dir);
    if (stillOverflow(rect)) enableScroll(levelIndex); // overflow policy: scroll
  }
  renderLevel(levelIndex, rect, dir);
}
*/

// =============================
// 5) Grip Behavior (spec)
// =============================
// - Step mode: When entering level N, level N-1 is replaced by a GRIP placeholder.
//   Clicking the GRIP restores N-1 and collapses deeper levels.
// - Glide mode: Levels are cleared while the pointer follows the path; hovering the GRIP while moving back rehydrates the previous level.

// =============================
// 6) Keyboard Map
// =============================
// ArrowUp/ArrowDown: move focus within vertical levels
// ArrowLeft/ArrowRight: move focus within horizontal levels or ascend/descend depending on dir
// Enter/Space: activate/open focused item
// Esc: ascend one level (or close all if at root)

// =============================
// 7) Physical Sizing Helper
// =============================
/*
// Note: CSS cm units are unreliable across devices. We compute px-per-cm at runtime:
function pxPerCm() {
  const div = document.createElement('div');
  div.style.width = '10cm';
  div.style.position = 'absolute';
  div.style.visibility = 'hidden';
  document.body.appendChild(div);
  const px = div.getBoundingClientRect().width;
  document.body.removeChild(div);
  return px / 10; // px per 1 cm
}
const MIN_TOUCH_CM = instanceOptions.a11y.minTouchSizeCm; // 1.2
const MIN_TOUCH_PX = Math.max(44, Math.round(pxPerCm() * MIN_TOUCH_CM));
// Use MIN_TOUCH_PX for size of items and hit areas.
*/

// =============================
// 8) Panels & Item Types (normalized)
// =============================
// Separate navigation items from content panels.
// Types: group (toolbox), action (tool), option (toggle/button), property (slider/pot), input (text/radios/check), panel (specialized zone)

// Example item referencing a panel
/*
{
  id: "tools.color",
  type: "action",
  labelKey: "Tools.Color",
  icon: "palette",
  panelId: "palette.colors"
}
*/

// Example panel definition
/*
const panels = {
  "palette.colors": { kind: "colorPicker", props: { columns: 8, preview: true } },
  "pads.grid": { kind: "pads", props: { rows: 4, cols: 4, velocity: true } }
};
*/

// =============================
// 9) Gesture Path (glide) Parameters
// =============================
/*
- angleToleranceDeg: 35 → direction changes only when the pointer path deviates beyond 35° from current dir.
- minVelocityPxPerS: 250 → ignore jittery slow moves.
- snapRadiusPx: 40 → when path passes within 40px of an item center, snap focus to it.
*/

// =============================
// 10) Persistence Model
// =============================
/*
localState = {
  lastPathByContext: { [contextId]: [itemIds...] },
  pinned: [{ panelId, position, size }],
  extractedTools: [{ itemId, position }]
}
*/

// =============================
// 11) Open Questions
// =============================
// - Do we cap item label length and ellipsize beyond N chars? Suggest: 18 chars, tooltip on hover.
// - Max scroll height per level? Suggest: clamp to 60% of viewport height.
// - Rubber effect curve fine-tuning (currently 0.08). Want a per-level decay?



// === Theme (base) ===
const Inntuition_theme = {
  "light": {
    "tool-bg": "#313131ff",
     "tool-bg-active": "#656565ff",
    "item-text": "#000000",
    "tool-text": "#8c8b8bff",
    "tool-hover-bg": "#f0f0f0",
    "tool-hover-fg": "#000000",
    "tool-active-bg": "#e0e0e0",
    "tool-active-fg": "#000000",
    "icon-top": "16px",
  "icon-left": "9px",
  "icon-centered-top": "12px",
  "icon-centered-left": "5px",
    "icon-width": "21px",
    "icon-height": "16px",
    "tool-font-size": "10px",

    "item-shadow": "0px 0px 5px rgba(0,0,0,0.69)",
    "tool-icon-size": "20px",
    "item-border-radius": "3px",
    "item-width": "39px",
    "item-height": "39px",
  "toggle-btn-size": "19px",
      "global-label-font-size": "9px",
  "label-max-chars": 5
  }
};

// Keep an immutable base copy for scaling computations
const _Inntuition_theme_base = JSON.parse(JSON.stringify(Inntuition_theme));
let IntuitionMasterScale = 1; // global master scale
// Dropdown spacing configuration (user-adjustable)
const _intuitionDropdownSpacingCfg = {
  density: 'crush' // 'crush' | 'overlap' | 'ultra' | 'compact' | 'medium' | 'roomy'
};

// Proportional horizontal offset ratio so the icon appears consistently near the left edge
// Chosen so that at scale=2 (item width ~78px) left ≈2px (2/78 ≈ 0.026) which user found correct.
const INTUITION_ICON_LEFT_RATIO = 0.026; // ~2.6% of item width

// Keys that should scale (pixel values only)
const INTUITION_SCALABLE_KEYS = [
  // NOTE: we deliberately exclude horizontal offsets so icons don't drift right when scaling
  'icon-top',/*'icon-left',*/'icon-centered-top',/*'icon-centered-left',*/
  'icon-width','icon-height','tool-font-size','global-label-font-size','tool-icon-size',
  'item-border-radius','item-width','item-height','toggle-btn-size'
];

// Met à jour dynamiquement la limite de caractères des labels (particles: value + selector options)
window.setIntuitionLabelMaxChars = function(n){
  try {
  const theme = 'light'; // actuel
    const num = parseInt(n,10);
    if (!isNaN(num) && num > 0) {
      Inntuition_theme[theme]['label-max-chars'] = num;
    }
    // Re-tronquer les values
    document.querySelectorAll('[id$="_value"]').forEach(v => {
      if (v.dataset && v.dataset.originalValue) {
        v.textContent = window.__intuitionTruncate(v.dataset.originalValue);
      }
    });
    // Re-tronquer les labels principaux
    document.querySelectorAll('div[data-has-label="1"]').forEach(node => {
      if (node.dataset.originalLabel) {
        node.childNodes.forEach ? null : null; // no-op
        // Si l'icône injecte du contenu, le label texte est potentiellement mélangé.
        // On remplace seulement le premier nœud texte si présent.
        try {
          const orig = node.dataset.originalLabel;
          const truncated = window.__intuitionTruncate(orig);
          // Chercher un textNode direct avant éventuellement un svg
          let replaced = false;
          for (let i=0;i<node.childNodes.length;i++) {
            const cn = node.childNodes[i];
            if (cn.nodeType === 3) { // text
              cn.nodeValue = truncated;
              replaced = true;
              break;
            }
          }
          if (!replaced && node.textContent) {
            node.textContent = truncated; // fallback
          }
        } catch(e) {}
      }
    });
    // Re-tronquer les options visibles des dropdown (sélecteur principal)
    document.querySelectorAll('[id$="_selector"]').forEach(sel => {
      try {
        const originalLabels = sel.dataset.originalLabels ? JSON.parse(sel.dataset.originalLabels) : null;
        const display = sel.querySelector('div');
        if (display) {
          const base = display.dataset.originalLabel || (originalLabels ? originalLabels[0] : display.textContent);
          if (!display.dataset.originalLabel) display.dataset.originalLabel = base;
          display.textContent = window.__intuitionTruncate(base);
        }
        if (originalLabels) {
          const listItems = sel.querySelectorAll('.dropdown-item, li, [role="option"]');
          listItems.forEach((item, idx) => {
            const orig = item.dataset.originalLabel || originalLabels[idx] || item.textContent;
            if (!item.dataset.originalLabel) item.dataset.originalLabel = orig;
            item.textContent = window.__intuitionTruncate(orig);
          });
        }
      } catch(e) {}
    });
  } catch(e) { console.error('setIntuitionLabelMaxChars error', e); }
};

// Fonction globale de troncature (si déjà définie ne pas écraser)
if (!window.__intuitionTruncate) {
  window.__intuitionTruncate = function(txt, theme='light'){
    try {
      if (txt == null) return '';
      const s = String(txt);
      const th = Inntuition_theme[theme] || {};
      const raw = th['label-max-chars'];
      const maxChars = (typeof raw === 'number') ? raw : parseInt(raw,10) || 4;
      if (s.length <= maxChars) return s;
      return s.slice(0,maxChars) + '.';
    } catch(e){ return String(txt); }
  };
}

function _scalePx(value, scale) {
  if (typeof value !== 'string') return value;
  const m = value.match(/(-?\d*\.?\d+)/);
  if (!m) return value;
  const num = parseFloat(m[1]);
  if (!isFinite(num)) return value;
  const unit = value.replace(m[1], '') || 'px';
  return (Math.round(num * scale * 100) / 100) + unit;
}

function setIntuitionMasterScale(scale, force = false) {
  const s = Math.max(0.3, Math.min(4, Number(scale) || 1));
  const unchanged = (s === IntuitionMasterScale);
  if (unchanged && !force) {
    return; // silent no-op unless force
  }
  IntuitionMasterScale = s;
  _ensureDropdownSpacingStyle();
  Object.keys(_Inntuition_theme_base).forEach(themeName => {
    const base = _Inntuition_theme_base[themeName];
    const live = Inntuition_theme[themeName];
    INTUITION_SCALABLE_KEYS.forEach(k => {
      if (base[k]) live[k] = _scalePx(base[k], s);
    });
  });
  try { _updateIntuitionDomScale(); } catch(e) { /* ignore */ }
  // Deuxième passe après reflow pour stabiliser (icônes, left dynamiques)
  setTimeout(() => { try { _updateIntuitionDomScale(); } catch(e){} }, 16); // ~1 frame
  setTimeout(() => { try { _updateIntuitionDomScale(); } catch(e){} }, 64); // safety
  // Deferred passes (in case dropdown DOM injected slightly later)
  [30, 90, 180].forEach(delay => setTimeout(() => { try { _intuitionRespaceAllDropdowns(); } catch(e){} }, delay));
}

// Public helper to reapply spacing & scaling without changing scale value
function refreshIntuitionScale() {
  setIntuitionMasterScale(IntuitionMasterScale, true);
}

function setIntuitionDropdownDensity(density) {
  if (!['crush','overlap','ultra','compact','medium','roomy'].includes(density)) return;
  _intuitionDropdownSpacingCfg.density = density;
  // Rebuild styles + reapply spacing
  _ensureDropdownSpacingStyle();
  _intuitionRespaceAllDropdowns();
}

// Inject / update a global stylesheet for dropdown spacing (more robust than inline only)
function _ensureDropdownSpacingStyle() {
  try {
    const s = IntuitionMasterScale || 1;
    let lineMult, bonusPerScale, padBase, padScale, gapBase, gapScale;
    switch (_intuitionDropdownSpacingCfg.density) {
      case 'crush':
        // extrême: line-height bien plus petit que font-size, aucun padding/marge
        lineMult = 0.8; bonusPerScale = 0; padBase = 0; padScale = 0; gapBase = 0; gapScale = 0; break;
      case 'overlap':
        lineMult = 0.9; bonusPerScale = 0; padBase = 0; padScale = 0; gapBase = 0; gapScale = 0; break;
      case 'ultra':
    const theme = 'light'; // actuel
  lineMult = 1.0; bonusPerScale = 0; padBase = 0; padScale = 0; gapBase = 0; gapScale = 0; break;
      case 'compact':
        lineMult = 1.02; bonusPerScale = 1; padBase = 1; padScale = 1.0; gapBase = 1; gapScale = 0.6; break;
      case 'roomy':
        lineMult = 1.25; bonusPerScale = 6; padBase = 4; padScale = 3; gapBase = 4; gapScale = 2.4; break;
      case 'medium':
      default:
        lineMult = 1.12; bonusPerScale = 3; padBase = 3; padScale = 2.2; gapBase = 3; gapScale = 1.8; break;
    }
    const line = Math.round(18 * s * lineMult + bonusPerScale * Math.max(0, s - 1));
    const pad = Math.max(padBase, Math.round(padBase + (padScale * (s - 1))));
    const gap = Math.max(gapBase, Math.round(gapBase + (gapScale * (s - 1))));
    let tag = document.getElementById('intuitionDropdownSpacingStyle');
    const css = `/* dynamic dropdown spacing */\n` +
      `[data-intuition-dd]{overflow-y:auto;}` +
      `[data-intuition-dd] > [data-intuition-dd-item]{display:block !important; line-height:${line}px !important; min-height:${line}px !important; padding:${pad}px 8px !important; margin:0 !important; font-size:inherit; box-sizing:border-box;}` +
      `[data-intuition-dd] > [data-intuition-dd-item]:not(:last-child){margin-bottom:${gap}px !important; border-bottom:1px solid rgba(255,255,255,0.07) !important;}` +
      `[data-intuition-dd] > [data-intuition-dd-item]:last-child{border-bottom:none !important;}`;
    if (!tag) {
      tag = document.createElement('style');
      tag.id = 'intuitionDropdownSpacingStyle';
      document.head.appendChild(tag);
    }
    if (tag.textContent !== css) tag.textContent = css;
  } catch(e) {}
}

// Extracted global helper so we can call from observers / deferred passes
function _applyDropdownListScaling(selectorWrap) {
  if (!selectorWrap) return;
  const scale = IntuitionMasterScale || 1;
  // Accept multiple possible list containers (plugin variants)
  let list = selectorWrap.querySelector('.dropdown-list, ul, .list, .options');
  if (!list) {
    // Fallback: look for a child having many direct children (>2) - heuristic
    const candidates = Array.from(selectorWrap.children).filter(c => c.children && c.children.length > 2);
    list = candidates[0];
  }
  // Additional heuristic: look for a sibling / descendant whose children have role="option"
  if (!list) {
    const roleCandidates = selectorWrap.querySelectorAll('div');
    roleCandidates.forEach(rc => {
      if (list) return;
      const kids = Array.from(rc.children);
      if (kids.length > 1 && kids.every(k => k.getAttribute && k.getAttribute('role') === 'option')) {
        list = rc;
      }
    });
  }
  if (!list) return;
  const baseLine = 18;
  let lineMult, bonusPerScale, gapBase, gapScale;
  switch (_intuitionDropdownSpacingCfg.density) {
    case 'crush': lineMult = 0.8; bonusPerScale = 0; gapBase = 0; gapScale = 0; break;
    case 'overlap': lineMult = 0.9; bonusPerScale = 0; gapBase = 0; gapScale = 0; break;
    case 'ultra': lineMult = 1.0; bonusPerScale = 0; gapBase = 0; gapScale = 0; break;
    case 'compact': lineMult = 1.02; bonusPerScale = 1; gapBase = 1; gapScale = 0.6; break;
    case 'roomy': lineMult = 1.25; bonusPerScale = 6; gapBase = 4; gapScale = 2.4; break;
    case 'medium':
    default: lineMult = 1.12; bonusPerScale = 3; gapBase = 3; gapScale = 1.8; break;
  }
  const itemLine = Math.round(baseLine * scale * lineMult + bonusPerScale * Math.max(0, scale - 1));
  const gap = Math.max(gapBase, Math.round(gapBase + gapScale * (scale - 1)));
  list.style.paddingTop = gap + 'px';
  list.style.paddingBottom = gap + 'px';
  list.style.overflowY = 'auto';
  list.style.maxHeight = Math.round(140 * scale * (1 + 0.15 * Math.max(0, scale - 1))) + 'px';
  list.setAttribute('data-intuition-dd','1');
  // Broaden item selector: li, div, button except structural container
  const items = list.querySelectorAll('.dropdown-item, li, .item, div[role="option"], button');
  let count = 0;
  items.forEach(it => {
    // Skip if element is the list itself or acts as container with many children
    if (it === list) return;
    if (it.children && it.children.length > 3 && count === 0) return; // likely container, skip
    count++;
    it.setAttribute('data-intuition-dd-item','1');
    const declaredFont = parseFloat(it.style.fontSize) || (10 * scale * 3);
    // For medium density aim 1.15, compact 1.12, roomy 1.25 relative to declared font
    let rel;
    switch (_intuitionDropdownSpacingCfg.density) {
      case 'crush': rel = 0.78; break;
      case 'overlap': rel = 0.9; break;
      case 'ultra': rel = 1.0; break;
      case 'compact': rel = 1.06; break;
      case 'roomy': rel = 1.25; break;
      case 'medium':
      default: rel = 1.15; break;
    }
    const targetLine = Math.max(itemLine, Math.round(declaredFont * rel));
    const innerPad = (_intuitionDropdownSpacingCfg.density === 'crush') ? 0 : Math.max(2, Math.round(targetLine * 0.18));
    // Force with important (override existing inline 18px etc.)
    it.style.setProperty('line-height', targetLine + 'px', 'important');
    it.style.setProperty('min-height', targetLine + 'px', 'important');
    it.style.setProperty('padding-top', innerPad + 'px', 'important');
    it.style.setProperty('padding-bottom', innerPad + 'px', 'important');
    it.style.setProperty('display','block','important');
    it.style.margin = '0';
    if (!it.style.borderBottom) it.style.borderBottom = '1px solid rgba(255,255,255,0.07)';
  });
  // Clean last
  const realItems = Array.from(items).filter(n => n !== list);
  const last = realItems[realItems.length - 1];
  if (last) last.style.borderBottom = 'none';
  for (let i = 0; i < realItems.length - 1; i++) {
    const it = realItems[i];
    // Margin between items adapted to density
    let mbBase;
    switch (_intuitionDropdownSpacingCfg.density) {
      case 'crush':
      case 'overlap':
      case 'ultra': mbBase = 0; break;
      case 'compact': mbBase = 1; break;
      case 'roomy': mbBase = 6; break;
      case 'medium':
      default: mbBase = 4; break;
    }
    const mb = Math.max(mbBase, Math.round(mbBase + (scale - 1) * (mbBase * 0.6)));
    it.style.marginBottom = mb + 'px';
  }
  // Force global style injection each time (idempotent)
  _ensureDropdownSpacingStyle();
  // Fallback: if after all this two first items still have same top/bottom (no gap), inject a spacer div
  try {
    const firstTwo = realItems.slice(0,2);
    if (firstTwo.length === 2) {
      const r1 = firstTwo[0].getBoundingClientRect();
      const r2 = firstTwo[1].getBoundingClientRect();
      if (Math.abs(r2.top - r1.bottom) < 2) {
        const spacer = document.createElement('div');
        spacer.style.height = Math.max(6, Math.round(scale * 4)) + 'px';
        spacer.style.pointerEvents = 'none';
        spacer.style.background = 'transparent';
        list.insertBefore(spacer, firstTwo[1]);
      }
    }
  } catch(e) {}
}

function _intuitionRespaceAllDropdowns() {
  try {
    const root = document.getElementById('intuition');
    if (!root) return;
    root.querySelectorAll('div[id$="_selector"]').forEach(w => _applyDropdownListScaling(w));
    // Also scan for detached / portal style dropdown lists (if any library appends to body)
    document.querySelectorAll('.dropdown-list, div').forEach(list => {
      if (list.getAttribute && list.getAttribute('data-intuition-dd')) return; // already processed
      const kids = list.children ? Array.from(list.children) : [];
      if (kids.length > 1 && kids.every(k => k.getAttribute && k.getAttribute('role') === 'option')) {
        // Try find associated selector wrapper upwards
        let wrap = list.parentElement;
        while (wrap && wrap !== document.body && !wrap.id.endsWith('_selector')) wrap = wrap.parentElement;
        _applyDropdownListScaling(wrap || list.parentElement);
      }
    });
  } catch(e) {}
}

function _updateIntuitionDomScale() {
  const container = document.getElementById('intuition');
  if (!container) return;
  // Try to find the toolbox root element (id starts with toolsbox.) inside container
  const toolboxRoot = container.querySelector('div[id^="toolsbox."]');
  const rootOrientation = (toolboxRoot && (toolboxRoot.orientation || toolboxRoot.getAttribute('data-orientation'))) || 'vertical';
  const items = container.querySelectorAll('div[id^="toolsbox."]');
  items.forEach(el => {
    const theme = Inntuition_theme['light']; // only light implemented
    if (!theme) return;
    // Resize container
    el.style.width = theme['item-width'];
    el.style.height = theme['item-height'];
    // Force reflow pour que clientWidth/clientHeight reflètent la nouvelle taille avant calculs position
    void el.offsetWidth;
    // Font size + line heights (lineHeight proportionally 18px * scale)
    const baseLine = 18; // base constant used earlier
    const scaledLine = Math.round(baseLine * IntuitionMasterScale);
  el.style.fontSize = theme['global-label-font-size'] || theme['tool-font-size'];
    el.style.lineHeight = scaledLine + 'px';
    // Bottom value + selector + mini-button adjustments
    const valueEl = el.querySelector('[id$="_value"]');
    if (valueEl) {
  valueEl.style.fontSize = theme['global-label-font-size'] || theme['tool-font-size'];
      valueEl.style.height = scaledLine + 'px';
      valueEl.style.lineHeight = scaledLine + 'px';
    }
    const selectorWrap = el.querySelector('[id$="_selector"]');
    if (selectorWrap) {
      // Base (unscaled) selector height is 14px (was 12px) for deeper label placement; scale proportionally
      const selectorScaledH = Math.round(14 * IntuitionMasterScale);
      selectorWrap.style.height = selectorScaledH + 'px';
  selectorWrap.style.fontSize = theme['global-label-font-size'] || theme['tool-font-size'];
      // Larger downward nudge (2px * scale, min 2)
      const selectorNudgePx = Math.max(2, Math.round(2 * IntuitionMasterScale));
      selectorWrap.style.paddingTop = selectorNudgePx + 'px';
      selectorWrap.style.lineHeight = Math.max(1, selectorScaledH - selectorNudgePx) + 'px';
      // Allow dropdown list to extend beyond wrapper when opened
      selectorWrap.style.overflow = 'visible';
      // Immediate displayed button/content (first child) mirrors same metrics
      const firstChild = selectorWrap.firstElementChild;
      if (firstChild) {
        try {
          firstChild.style.fontSize = theme['global-label-font-size'] || theme['tool-font-size'];
          firstChild.style.height = selectorScaledH + 'px';
          firstChild.style.lineHeight = Math.max(1, selectorScaledH - selectorNudgePx) + 'px';
          firstChild.style.paddingTop = selectorNudgePx + 'px';
        } catch(e) {}
      }
      // Deep adjust all descendants to propagate font scaling to internal label spans
      try {
        selectorWrap.querySelectorAll('*').forEach(n => {
          // Skip dropdown list container & its items to avoid clipping / stacking issues
          const cls = (n.className || '').toString();
          if (/dropdown-list|dropdown-item/i.test(cls) || n.tagName === 'UL' || n.tagName === 'LI') return;
          n.style.fontSize = theme['global-label-font-size'] || theme['tool-font-size'];
          // Only adjust lineHeight for elements inside the closed button region (depth 1)
          if (n !== selectorWrap && n.parentElement === selectorWrap) {
            n.style.lineHeight = Math.max(1, selectorScaledH - selectorNudgePx) + 'px';
            if (!n.style.height) n.style.height = selectorScaledH + 'px';
            if (!n.style.paddingTop) n.style.paddingTop = selectorNudgePx + 'px';
          }
        });
      } catch(e) {}
      // Apply scalable spacing to dropdown list items (if already rendered)
      _applyDropdownListScaling(selectorWrap);
      // Hook once to reapply after opening (list usually rendered on first open)
      if (!selectorWrap.dataset.dropdownScaledHook) {
        selectorWrap.addEventListener('click', () => { setTimeout(() => _applyDropdownListScaling(selectorWrap), 0); });
        selectorWrap.dataset.dropdownScaledHook = '1';
      }
    }
    const miniBtn = el.querySelector('[id$="_input"]');
    if (miniBtn) {
      miniBtn.style.width = Math.round(25 * IntuitionMasterScale) + 'px';
      miniBtn.style.height = Math.max(4, Math.round(6 * IntuitionMasterScale)) + 'px';
      miniBtn.style.borderRadius = _scalePx(_Inntuition_theme_base.light['item-border-radius'], IntuitionMasterScale);
      // If this is a particle item, enforce vertical centering
      if (el.getAttribute('data-kind') === 'particle') {
        miniBtn.style.top = '50%';
        miniBtn.style.left = '50%';
        miniBtn.style.bottom = '';
        miniBtn.style.transform = 'translate(-50%, -50%)';
      }
    }
    // Scale toggle button (option) if present
    const toggleBtn = el.querySelector('[id$="_toggle"]');
    if (toggleBtn) {
      const size = Inntuition_theme.light['toggle-btn-size'];
      toggleBtn.style.width = size;
      toggleBtn.style.height = size;
      toggleBtn.style.borderRadius = Inntuition_theme.light['item-border-radius'];
      // Keep it positioned relative; if using relative top offset keep as-is
    }
    // Reposition / resize icon SVG if present
  // Prefer svg with _svg suffix (after loader change) else first svg
  let iconSvg = document.getElementById(el.id + '_icon_svg');
  if (!iconSvg) iconSvg = el.querySelector('svg');
  if (iconSvg) {
      iconSvg.style.width = Inntuition_theme.light['icon-width'];
      iconSvg.style.height = Inntuition_theme.light['icon-height'];
      // Attempt to set top/left via its container div
      const parentDiv = iconSvg.parentElement;
      if (parentDiv && parentDiv.id === iconSvg.id) { /* ignore - id reuse */ }
      // Reposition container wrapper if present (id pattern: toolsbox.<id>_icon)
      const iconContainer = document.getElementById(el.id + '_icon');
      if (iconContainer) {
        const hasLabel = el.getAttribute('data-has-label') === '1';
        const topKey = hasLabel ? 'icon-top' : 'icon-centered-top';
        // Always use base left offset (non-scaled) to lock icon horizontally when scaling
        const baseLeft = _Inntuition_theme_base.light['icon-left'];
        iconContainer.style.position = 'absolute';
  const parentW = el.clientWidth || parseFloat(Inntuition_theme.light['item-width']) || 0;
  const parentH = el.clientHeight || parseFloat(Inntuition_theme.light['item-height']) || 0;
        const iconNumW = parseFloat(Inntuition_theme.light['icon-width']);
        const iconNumH = parseFloat(Inntuition_theme.light['icon-height']);
        const centerLeftPx = Math.round((parentW - iconNumW)/2);
        const centerTopPx  = Math.round((parentH - iconNumH)/2);
        const isHorizontal = (rootOrientation === 'horizontal');
        // Centrage horizontal dans tous les cas
        iconContainer.style.left = centerLeftPx + 'px';
        if (isHorizontal) {
          iconContainer.style.top  = centerTopPx + 'px';
        } else {
          if (hasLabel) {
            iconContainer.style.top = Inntuition_theme.light[topKey];
          } else {
            iconContainer.style.top = centerTopPx + 'px';
          }
        }
        iconContainer.style.transform = '';
  iconContainer.style.width = Inntuition_theme.light['icon-width'];
  iconContainer.style.height = Inntuition_theme.light['icon-height'];
  // Marquage pour debug / recalcul
  iconContainer.dataset.intuitionIcon = '1';
        // Keep svg attributes aligned to theme size
        try {
          iconSvg.setAttribute('width', parseFloat(Inntuition_theme.light['icon-width']) || iconW);
          iconSvg.setAttribute('height', parseFloat(Inntuition_theme.light['icon-height']) || iconH);
        } catch(e){}
      }
    }

    // Particle stacking re-layout on scale change: keep mini button centered; place value & selector BELOW the mini button (not anchored to bottom).
    if (el.getAttribute('data-kind') === 'particle') {
      const mb = el.querySelector('[id$="_input"]');
      if (mb) {
        const selectorEl = el.querySelector('[id$="_selector"]');
        const valueEl = el.querySelector('[id$="_value"]');
        if (selectorEl || valueEl) {
          try {
            const scale = IntuitionMasterScale || 1;
            // Further reduced spacing (was 2*scale) for slightly higher row
            const spacing = Math.max(0, Math.round(1 * scale));
            const rootH = el.clientHeight;
            const mbRect = mb.getBoundingClientRect();
            const rootRect = el.getBoundingClientRect();
            const miniTopInside = (mbRect.top - rootRect.top);
            const miniHeight = mbRect.height;
            const miniBottomInside = miniTopInside + miniHeight;
            const rowTop = miniBottomInside + spacing; // unified row position below mini button
            if (valueEl && selectorEl) {
              // Side-by-side layout
              const valueH = parseInt(valueEl.style.height) || Math.round(18 * scale);
              const selectorH = (parseInt(selectorEl.style.height) || Math.round(14 * scale));
              const rowH = Math.max(valueH, selectorH);
              // Value
              valueEl.style.position = 'absolute';
              valueEl.style.bottom = '';
              valueEl.style.top = rowTop + 'px';
              valueEl.style.height = rowH + 'px';
              valueEl.style.lineHeight = rowH + 'px';
              valueEl.style.left = '0px';
              valueEl.style.width = '50%';
              // Selector
              selectorEl.style.position = 'absolute';
              selectorEl.style.bottom = '';
              selectorEl.style.top = rowTop + 'px';
              selectorEl.style.height = rowH + 'px';
              const innerNudge = Math.max(2, Math.round(2 * scale));
              selectorEl.style.paddingTop = innerNudge + 'px';
              selectorEl.style.lineHeight = Math.max(1, rowH - innerNudge) + 'px';
              selectorEl.style.left = '50%';
              selectorEl.style.width = '50%';
              try {
                const scFirst = selectorEl.firstElementChild;
                if (scFirst) {
                  scFirst.style.paddingTop = innerNudge + 'px';
                  scFirst.style.lineHeight = Math.max(1, rowH - innerNudge) + 'px';
                  scFirst.style.height = rowH + 'px';
                }
              } catch(e) {}
            } else if (valueEl) {
              const valueH = parseInt(valueEl.style.height) || Math.round(18 * scale);
              valueEl.style.position = 'absolute';
              valueEl.style.bottom = '';
              valueEl.style.top = rowTop + 'px';
            } else if (selectorEl) {
              // Only selector present: make it adopt value baseline height (18*scale) and vertically center text
              const valueBaseH = Math.round(18 * scale);
              selectorEl.style.position = 'absolute';
              selectorEl.style.bottom = '';
              selectorEl.style.top = rowTop + 'px';
              selectorEl.style.height = valueBaseH + 'px';
              selectorEl.style.paddingTop = '0px';
              selectorEl.style.lineHeight = valueBaseH + 'px';
              try {
                const scFirst = selectorEl.firstElementChild;
                if (scFirst) {
                  scFirst.style.height = valueBaseH + 'px';
                  scFirst.style.paddingTop = '0px';
                  scFirst.style.lineHeight = valueBaseH + 'px';
                  // Adjust inner absolute text node slightly downward for visual baseline alignment
                  try {
                    const innerTxt = scFirst.firstElementChild;
                    if (innerTxt && innerTxt.style) {
                      const nudge = 0.3 * scale; // adjusted to 0.6px * scale
                      innerTxt.style.top = nudge + 'px';
                      innerTxt.style.height = (valueBaseH - nudge) + 'px';
                      innerTxt.style.lineHeight = (valueBaseH - nudge) + 'px';
                    }
                  } catch(e) {}
                }
              } catch(e) {}
            }
          } catch(e) { /* ignore layout errors */ }
        }
      }
    }
  });
  // Global mutation observer (only once) to catch async list insertion
  if (!container.__intuitionDropdownObserver) {
    try {
      const obs = new MutationObserver(muts => {
        muts.forEach(m => {
          m.addedNodes.forEach(n => {
            if (!(n instanceof HTMLElement)) return;
            // If a list appears inside a selector wrapper
            const isNamedList = (n.classList && /dropdown-list|options|list/i.test(n.className)) || n.tagName === 'UL';
            const hasRoleOptions = !isNamedList && n.children && n.children.length > 1 && Array.from(n.children).every(k => k.getAttribute && k.getAttribute('role') === 'option');
            if (isNamedList || hasRoleOptions) {
              let wrap = n.parentElement;
              while (wrap && wrap !== container && !wrap.id.endsWith('_selector')) wrap = wrap.parentElement;
              const targetWrap = wrap || n.parentElement;
              _applyDropdownListScaling(targetWrap);
              try {
                if (targetWrap && targetWrap.dataset.originalLabels) {
                  const originalLabels = JSON.parse(targetWrap.dataset.originalLabels);
                  const items = targetWrap.querySelectorAll('.dropdown-item, li, [role="option"]');
                  items.forEach((item, idx) => {
                    const orig = item.dataset.originalLabel || originalLabels[idx] || item.textContent;
                    if (!item.dataset.originalLabel) item.dataset.originalLabel = orig;
                    item.textContent = window.__intuitionTruncate(orig);
                  });
                }
              } catch(e) {}
            }
          });
        });
      });
      obs.observe(container, { childList: true, subtree: true });
      container.__intuitionDropdownObserver = obs;
    } catch(e) {}
  }
  // Final pass to ensure all current selectors spaced
  _intuitionRespaceAllDropdowns();
}

// Expose scaling API
window.setIntuitionMasterScale = setIntuitionMasterScale;
window.refreshIntuitionScale = refreshIntuitionScale;
window.setIntuitionDropdownDensity = setIntuitionDropdownDensity;
window.getIntuitionMasterScale = () => IntuitionMasterScale;

function currentToolbox() {
  // Common utility functions for the Intuition framework
  let current_toolbox = grab('toolsbox.' + window.IntuitionToolbox);
  return current_toolbox;
}

function intuitionCommon(cfg) {
  const { id, label = null, icon = null, button=null, colorise = false, theme = 'light', type = null } = cfg;

  const id_created = `toolsbox.${id}`;
  const label_color = Inntuition_theme[theme]["tool-text"];

  // Raccourci local vers la fonction globale
  const truncateParticleText = (t)=> window.__intuitionTruncate(t, theme);
  const el = $('div', {
    parent: '#intuition',
    class: cfg.type,
  css: {
    backgroundColor: Inntuition_theme[theme]["tool-bg"],
    width: Inntuition_theme[theme]["item-width"],
    height: Inntuition_theme[theme]["item-height"],
    boxShadow: Inntuition_theme[theme]["item-shadow"],
    userSelect: 'none',
    WebkitUserSelect: 'none',
    MozUserSelect: 'none',
    borderRadius: Inntuition_theme[theme]["item-border-radius"],
    color: label_color,
  position: 'relative',
    margin: '1px',
    display: 'inline-block',
    verticalAlign: 'top',          // align all items to top
  fontSize: Inntuition_theme[theme]["global-label-font-size"] || Inntuition_theme[theme]["tool-font-size"],
    textTransform: 'capitalize',
    fontFamily: 'Roboto',
    textAlign: 'center',
    lineHeight: '18px',
  },

    // Affiche le texte seulement si un label est fourni
    text: (function (n) {
      if (!n) return undefined; // pas de label -> pas de texte
      // stocker l'original sur l'élément plus tard
      return window.__intuitionTruncate(n, theme);
    })(label),

    id: id_created,
    icon: icon || undefined,
  });
  // Preserve original label presence (later textContent includes SVG)
  try {
    el.setAttribute('data-has-label', label ? '1' : '0');
    if (label) el.dataset.originalLabel = String(label);
  } catch(e) {}
  // Tag element kind if provided (tool, palette, particle, option, etc.)
  if (type) {
    try { el.setAttribute('data-kind', type); } catch(e) {}
  }

  // Icône: insère le SVG seulement si 'icon' est fourni
 if (icon) {
  const hasLabel = el.getAttribute('data-has-label') === '1';
  const icon_top  = Inntuition_theme[theme][hasLabel ? "icon-top" : "icon-centered-top"];
  // Use base (unscaled) left to prevent drift
  const icon_left = _Inntuition_theme_base[theme]["icon-left"]; // ignore centered-left to avoid drift
    const icon_width = Inntuition_theme[theme]["icon-width"];
    const icon_height = Inntuition_theme[theme]["icon-height"];

    // Choix des couleurs selon 'colorise'
    let fill = null, stroke = null;
    if (colorise === false) {
      fill = null; stroke = null;
    } else if (typeof colorise === 'string') {
      fill = colorise; stroke = colorise;
    } else {
      fill = label_color; stroke = label_color;
    }

    // top, left, width, height, fill, stroke, id, parent
    fetch_and_render_svg(
      `./assets/images/icons/${icon}.svg`,
      `${id_created}_icon`,
      id_created,
     icon_left, icon_top, 
      icon_width, icon_height,
      fill, stroke
    );
    // After SVG insertion, normalize position.
    setTimeout(() => {
      try {
        const ori = el.orientation || el.getAttribute('data-orientation');
        const iconContainer = document.getElementById(id_created + '_icon');
        if (iconContainer) {
          const parentW = el.clientWidth || parseFloat(Inntuition_theme[theme]['item-width']) || 0;
          const parentH = el.clientHeight || parseFloat(Inntuition_theme[theme]['item-height']) || 0;
          const iconWnum = parseFloat(Inntuition_theme[theme]['icon-width']) || 0;
          const iconHnum = parseFloat(Inntuition_theme[theme]['icon-height']) || 0;
          const centerLeft = Math.round((parentW - iconWnum)/2);
          const centerTop  = Math.round((parentH - iconHnum)/2);
          // Centrage horizontal uniforme
          iconContainer.style.left = centerLeft + 'px';
          if (ori === 'horizontal') {
            iconContainer.style.top  = centerTop + 'px';
          } else {
            if (hasLabel) {
              iconContainer.style.top = Inntuition_theme[theme][hasLabel ? 'icon-top' : 'icon-centered-top'];
            } else {
              iconContainer.style.top = centerTop + 'px';
            }
          }
          iconContainer.style.position = 'absolute';
          iconContainer.style.width = Inntuition_theme[theme]['icon-width'];
          iconContainer.style.height = Inntuition_theme[theme]['icon-height'];
          iconContainer.style.transform = '';
        }
      } catch(e) { /* ignore */ }
    }, 0);
  }

  // Sélecteur skinnable en bas si cfg.selector est fourni
  if (Array.isArray(cfg.selector) && cfg.selector.length > 0) {
    const isParticle = cfg.type === 'particle';
    // Stocker les labels originaux (sans troncature)
    let originalSelectorLabels = cfg.selector.map(opt => {
      if (typeof opt === 'string') return opt;
      if (opt && typeof opt === 'object') {
        const val = opt.label !== undefined ? opt.label : (opt.value !== undefined ? opt.value : String(opt));
        return String(val);
      }
      return String(opt);
    });
    let selectorOptions = cfg.selector; // aucune modification pour dropDown
    const ddWrap = $('div', {
      parent: el,
      id: id_created + '_selector',
      css: {
        position: 'absolute',
        bottom: '0px',
        left: '0px',
    width: '100%',
  height: '14px',
  overflow: 'visible'
      }
    });

    const dd = dropDown({
      parent: ddWrap,
      options: selectorOptions,
      theme,
      openDirection: 'up',
      css: {
        width: '100%',
        height: '100%',
        backgroundColor: 'transparent',
        color: label_color,
        fontFamily: 'Roboto',
  fontSize: Inntuition_theme[theme]["global-label-font-size"] || Inntuition_theme[theme]["tool-font-size"],
        textAlign: 'center',
  // Base selector height increased to 14px (was 12px) for deeper vertical placement
  // Nudge label 2px downward
  paddingTop: '2px',
  lineHeight: '12px'
      },
      listCss: {
        backgroundColor: Inntuition_theme[theme]["tool-bg"],
        boxShadow: Inntuition_theme[theme]["item-shadow"],
        borderRadius: Inntuition_theme[theme]["item-border-radius"]
      },
      itemCss: {
        fontFamily: 'Roboto',
  fontSize: Inntuition_theme[theme]["global-label-font-size"] || Inntuition_theme[theme]["tool-font-size"],
        color: label_color,
  // Keep list items at 18px base line-height (they are separate from selector button)
  lineHeight: '18px',
        textAlign: 'center'
      }
    });
    try { ddWrap.dataset.originalLabels = JSON.stringify(originalSelectorLabels); } catch(e) {}
    if (isParticle) {
      // Appliquer troncature uniquement sur le display interne (évite d'écraser la structure)
      try {
        const rootNode = ddWrap.firstElementChild; // root du dropdown
        const displayNode = rootNode && rootNode.firstElementChild; // premier enfant = display
        if (displayNode && displayNode !== rootNode) {
          const base = displayNode.dataset.originalLabel || originalSelectorLabels[0] || displayNode.textContent;
          if (!displayNode.dataset.originalLabel) displayNode.dataset.originalLabel = base;
          displayNode.textContent = window.__intuitionTruncate(base, theme);
        }
      } catch(e) {}
    }
  }

  // Texte en bas si cfg.value est fourni
  if (cfg.value !== undefined && cfg.value !== null) {
    const isParticle = cfg.type === 'particle';
  const valueText = isParticle ? truncateParticleText(cfg.value) : String(cfg.value);
    const hasSelector = Array.isArray(cfg.selector) && cfg.selector.length > 0;
    const bottomText = $('div', {
      parent: el,
      id: id_created + '_value',
      text: valueText,
      css: {
        position: 'absolute',
        bottom: hasSelector ? '18px' : '0px',
        left: '0px',
        width: '100%',
        height: '18px',
        backgroundColor: 'transparent',
        color: label_color,
        fontFamily: 'Roboto',
  fontSize: Inntuition_theme[theme]["global-label-font-size"] || Inntuition_theme[theme]["tool-font-size"],
        textTransform: 'inherit',
        textAlign: 'center',
        lineHeight: '18px',
        pointerEvents: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none'
      }
    });
  try { bottomText.dataset.originalValue = String(cfg.value); } catch(e) {}
  }

  // Petit bouton intermédiaire si cfg.input est fourni
  if (cfg.input !== undefined) {
    const hasSelector = Array.isArray(cfg.selector) && cfg.selector.length > 0;
    const hasValue = cfg.value !== undefined && cfg.value !== null;
    // Place it just above value/select block(s)
    // - if both value and select: above value -> bottom: 36px
    // - if either value or select present: bottom: 18px
    // - else: bottom: 0px
    const bottomOffset = (hasSelector && hasValue) ? 36 : ((hasSelector || hasValue) ? 18 : 0);
  const isParticle = cfg.type === 'particle';

    const parentSelectorForEl = '#' + (window.CSS && CSS.escape
      ? CSS.escape(id_created)
      : id_created.replace(/\./g, '\\.')
    );

    const miniBtn = Button({
      parent: parentSelectorForEl,
      id: id_created + '_input',
      css: {
        position: 'absolute',
        left: '50%',
  // Always keep particle mini button vertically centered; selector/value will be placed BELOW it.
  top: (isParticle ? '50%' : undefined),
  transform: (isParticle ? 'translate(-50%, -50%)' : 'translateX(-50%)'),
  bottom: (isParticle ? undefined : bottomOffset + 'px'),
        width: '25px',
        height: '6px',
        padding: '0',
        margin: '0',
        boxSizing: 'border-box',
        overflow: 'hidden',
        fontSize: '0px',
        borderRadius: '3px',
        backgroundColor: Inntuition_theme[theme]["tool-bg-active"],
        boxShadow: Inntuition_theme[theme]["item-shadow"]
      }
    });

    // Re-layout for particle stacking (mini centered; then value & selector share one row side-by-side below mini)
    if (isParticle && (hasSelector || hasValue)) {
      setTimeout(() => {
        try {
          const elRoot = document.getElementById(id_created);
          if (!elRoot) return;
          const mb = document.getElementById(id_created + '_input');
          const selectorEl = document.getElementById(id_created + '_selector');
          const valueEl = document.getElementById(id_created + '_value');
          if (!mb) return;
          const scale = (window.getIntuitionMasterScale && window.getIntuitionMasterScale()) || 1;
          // Further reduced spacing (was 2*scale) for slightly higher row
          const spacing = Math.max(0, Math.round(1 * scale));
          const rootRect = elRoot.getBoundingClientRect();
          const mbRect = mb.getBoundingClientRect();
          const miniBottom = (mbRect.top - rootRect.top) + mbRect.height;
          const rowTop = miniBottom + spacing;
          if (valueEl && selectorEl) {
            const valueH = parseInt(valueEl.style.height) || Math.round(18 * scale);
            const selectorH = (parseInt(selectorEl.style.height) || Math.round(14 * scale));
            const rowH = Math.max(valueH, selectorH);
            valueEl.style.position = 'absolute';
            valueEl.style.bottom = '';
            valueEl.style.top = rowTop + 'px';
            valueEl.style.height = rowH + 'px';
            valueEl.style.lineHeight = rowH + 'px';
            valueEl.style.left = '0px';
            valueEl.style.width = '50%';
            selectorEl.style.position = 'absolute';
            selectorEl.style.bottom = '';
            selectorEl.style.top = rowTop + 'px';
            selectorEl.style.height = rowH + 'px';
            const innerNudge = Math.max(2, Math.round(2 * scale));
            selectorEl.style.paddingTop = innerNudge + 'px';
            selectorEl.style.lineHeight = Math.max(1, rowH - innerNudge) + 'px';
            selectorEl.style.left = '50%';
            selectorEl.style.width = '50%';
            try {
              const scFirst = selectorEl.firstElementChild;
              if (scFirst) {
                scFirst.style.paddingTop = innerNudge + 'px';
                scFirst.style.lineHeight = Math.max(1, rowH - innerNudge) + 'px';
                scFirst.style.height = rowH + 'px';
              }
            } catch(e) {}
          } else if (valueEl) {
            valueEl.style.position = 'absolute';
            valueEl.style.bottom = '';
            valueEl.style.top = rowTop + 'px';
          } else if (selectorEl) {
            // Only selector present: unify with value baseline height for cross-particle alignment
            const valueBaseH = Math.round(18 * scale);
            selectorEl.style.position = 'absolute';
            selectorEl.style.bottom = '';
            selectorEl.style.top = rowTop + 'px';
            selectorEl.style.height = valueBaseH + 'px';
            selectorEl.style.paddingTop = '0px';
            selectorEl.style.lineHeight = valueBaseH + 'px';
            try {
              const scFirst = selectorEl.firstElementChild;
              if (scFirst) {
                scFirst.style.height = valueBaseH + 'px';
                scFirst.style.paddingTop = '0px';
                scFirst.style.lineHeight = valueBaseH + 'px';
                // Slight downward nudge for inner text to match value baseline in other particles
                try {
                  const innerTxt = scFirst.firstElementChild;
                  if (innerTxt && innerTxt.style) {
                    const nudge = 0.6 * scale; // adjusted to 0.6px * scale
                    innerTxt.style.top = nudge + 'px';
                    innerTxt.style.height = (valueBaseH - nudge) + 'px';
                    innerTxt.style.lineHeight = (valueBaseH - nudge) + 'px';
                  }
                } catch(e) {}
              }
            } catch(e) {}
          }
        } catch(e) {}
      },0);
    }
  }
  if (button) {
    const parentSelector = '#' + (window.CSS && CSS.escape
      ? CSS.escape(id_created)           // ex: toolsbox.boolean -> toolsbox\.boolean
      : id_created.replace(/\./g, '\\.') // fallback simple
    );

     Button({
      parent: parentSelector,
      id: id_created + '_toggle',
      css: {
        left: '0px',
        top: '-3px',
        width: Inntuition_theme[theme]['toggle-btn-size'],
        height: Inntuition_theme[theme]['toggle-btn-size'],
        position: 'relative',
        boxSizing: 'border-box',
        padding: '0',
        minWidth: '0px',
        minHeight: '0px',
        overflow: 'hidden',
        fontSize: '0px',
        borderRadius: Inntuition_theme[theme]['item-border-radius'],
        backgroundColor: Inntuition_theme[theme]["tool-bg"],
        boxShadow: Inntuition_theme[theme]["item-shadow"]
      },
         onStyle: {
        background: 'linear-gradient(135deg, #48c6ef 0%, #6f86d6 100%)',
        transform: 'scale(1.05)',
        boxShadow: '0 6px 20px rgba(72, 198, 239, 0.6)'
    },
    offStyle: {
        background: 'linear-gradient(135deg, #fc466b 0%, #3f5efb 100%)',
        transform: 'scale(0.95)',
        boxShadow: '0 2px 10px rgba(252, 70, 107, 0.4)'
    },
    });

    // Stocke la taille de base (non scalée) pour recalcul dynamique après interactions
    setTimeout(() => {
      const t = document.getElementById(id_created + '_toggle');
      if (t) {
        try { t.dataset.baseToggleSize = (_Inntuition_theme_base[theme]['toggle-btn-size']||'19px').replace('px',''); } catch(e) {}
      }
    },0);

   
  }
  

  return el;
}

{

}
function toolbox(cfg) {
  const { id, orientation = 'vertical', position = 'bottom-left', theme = 'light' } = cfg;
  window.IntuitionToolbox = id;
  const el = intuitionCommon(cfg);
  el.theme = theme;
  el.orientation = orientation;
  el.position = position;
  // keep original config for later use
  el._intuitionCfg = cfg;
  return el;
}

function palette(cfg) {
  cfg.theme = currentToolbox().theme;
  const el = intuitionCommon(cfg)
}

function tool(cfg) {

  cfg.theme = currentToolbox().theme;
  const el = intuitionCommon(cfg)

}

function particle(cfg) {
  cfg.theme = currentToolbox().theme;
  if (!cfg.type) cfg.type = 'particle';
  const el = intuitionCommon(cfg);
}

function option(cfg) {
    cfg.theme = currentToolbox().theme;
  const el = intuitionCommon(cfg)
}

function zonespecial(cfg) {
 cfg.theme = currentToolbox().theme;
  const el = intuitionCommon(cfg)
}


toolbox(
  {
  id: "intuition",
   type: "toolsbox",
  label: null,
  icon: 'menu',
  colorise: true, // true | false | 'color' | '#rrggbb'
  orientation: 'vertical', // vertical | horizontal
  position: 'bottom-left', // top-left | top-right | bottom-left | bottom-right
  theme: 'light' // light | dark | auto 
}
);




palette({
  id: "communication",
  type: "palette",
  label: 'communication',
  icon: 'communication',
  colorise: true, // true | false | 'color' | '#rrggbb'
});



tool({
    id: "create",
    type: "tool",
  label: 'create',
  icon: 'create',
  colorise: true, 
});

option({
    id: "boolean",
    type: "option",
  label: 'boolean',
  button: 'boolean',
  colorise: true, 
});


zonespecial({
    id: "color-pallete",
    type: "special",
  label: 'palette',
  icon: 'color',
  colorise: true, 
});


particle({
    id: "width-particle",
    type: "particle",
  label: 'width',
  input: 0.5,
  selector:['%','px','cm','em','rem','vh','vw'],

});


particle({
    id: "red-particle",
    type: "particle",
  label: 'color',
  input: 0.5,
  value: 'red',

});




 setIntuitionMasterScale(1.7)
  dataFetcher('assets/images/icons/menu.svg')
    .then(svgData => { render_svg(svgData,'my_nice_svg', 'view','120px', '200px', '33px', '33px' , null, null);  })
    .catch(err => { span.textContent = 'Erreur: ' + err.message; });


     setTimeout(() => {
  resize('my_nice_svg', 233, 333, 0.5, 'elastic');
  }, 2500);
