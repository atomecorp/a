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
    "icon-top": "-3px",
    "icon-left": "0px",
        "icon-centered-top": "7px",
    "icon-centered-left": "0px",
    "icon-width": "23px",
    "icon-height": "23px",

    "tool-font-size": "10px",
    "item-shadow": "0px 0px 5px rgba(0,0,0,0.69)",
    "tool-icon-size": "20px",
    "item-border-radius": "3px",
    "item-width": "39px",
    "item-height": "39px",
  }
};

function currentToolbox() {
  // Common utility functions for the Intuition framework
  let current_toolbox = grab('toolsbox.' + window.IntuitionToolbox);
  return current_toolbox;
}

function intuitionCommon(cfg) {
  const { id, label = null, icon = null, button=null,colorise = false, theme = 'light' } = cfg;

  const id_created = `toolsbox.${id}`;
  const label_color = Inntuition_theme[theme]["tool-text"];

  const el = $('div', {
    parent: '#intuition',
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
    fontSize: Inntuition_theme[theme]["tool-font-size"],
    textTransform: 'capitalize',
    fontFamily: 'Roboto',
    textAlign: 'center',
    lineHeight: '18px',
  },

    // Affiche le texte seulement si un label est fourni
    text: (function (n) {
      if (!n) return undefined; // pas de label -> pas de texte
      const chars = Array.from(String(n));
      return chars.length > 5 ? chars.slice(0, 4).join('') + '.' : String(n);
    })(label),

    id: id_created,
    icon: icon || undefined,
  });

  // Icône: insère le SVG seulement si 'icon' est fourni
 if (icon) {
    const hasLabel = !!label && String(label).length > 0;
    const icon_top  = Inntuition_theme[theme][hasLabel ? "icon-top" : "icon-centered-top"];
    const icon_left = Inntuition_theme[theme][hasLabel ? "icon-left" : "icon-centered-left"];
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
      `../../assets/images/icons/${icon}.svg`,
     icon_left, icon_top, 
      icon_width, icon_height,
      fill, stroke,
      `${id_created}_icon`,
      id_created
    );
  }

  // Sélecteur skinnable en bas si cfg.selector est fourni
  if (Array.isArray(cfg.selector) && cfg.selector.length > 0) {
    const ddWrap = $('div', {
      parent: el,
      id: id_created + '_selector',
      css: {
        position: 'absolute',
        bottom: '0px',
        left: '0px',
        width: '100%',
        height: '12px'
      }
    });

    dropDown({
      parent: ddWrap,
      options: cfg.selector,
      theme,
      openDirection: 'up',
      css: {
        width: '100%',
        height: '100%',
        backgroundColor: 'transparent',
        color: label_color,
        fontFamily: 'Roboto',
        fontSize: Inntuition_theme[theme]["tool-font-size"],
        textAlign: 'center',
        lineHeight: '18px'
      },
      listCss: {
        backgroundColor: Inntuition_theme[theme]["tool-bg"],
        boxShadow: Inntuition_theme[theme]["item-shadow"],
        borderRadius: Inntuition_theme[theme]["item-border-radius"]
      },
      itemCss: {
        fontFamily: 'Roboto',
        fontSize: Inntuition_theme[theme]["tool-font-size"],
        color: label_color,
        lineHeight: '18px',
        textAlign: 'center'
      }
    });
  }

  // Texte en bas si cfg.value est fourni
  if (cfg.value !== undefined && cfg.value !== null) {
    const hasSelector = Array.isArray(cfg.selector) && cfg.selector.length > 0;
    const bottomText = $('div', {
      parent: el,
      text: String(cfg.value),
      css: {
        position: 'absolute',
        bottom: hasSelector ? '18px' : '0px',
        left: '0px',
        width: '100%',
        height: '18px',
        backgroundColor: 'transparent',
        color: label_color,
        fontFamily: 'Roboto',
        fontSize: Inntuition_theme[theme]["tool-font-size"],
        textTransform: 'inherit',
        textAlign: 'center',
        lineHeight: '18px',
        pointerEvents: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none'
      }
    });
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

    const parentSelectorForEl = '#' + (window.CSS && CSS.escape
      ? CSS.escape(id_created)
      : id_created.replace(/\./g, '\\.')
    );

    Button({
      parent: parentSelectorForEl,
      id: id_created + '_input',
      css: {
        position: 'absolute',
        left: '50%',
        transform: 'translateX(-50%)',
        bottom: bottomOffset + 'px',
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
  }
  if (button) {
    const parentSelector = '#' + (window.CSS && CSS.escape
      ? CSS.escape(id_created)           // ex: toolsbox.boolean -> toolsbox\.boolean
      : id_created.replace(/\./g, '\\.') // fallback simple
    );

     Button({
      parent: parentSelector,
      css: {
        left: '0px',
        top: '-3px',
        width: '19px',
        height: '19px',
        position: 'relative',
        boxSizing: 'border-box',
        padding: '0',
        minWidth: '0px',
        minHeight: '0px',
        overflow: 'hidden',
        fontSize: '0px',
        borderRadius: '3px',
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
  const el = intuitionCommon(cfg)
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


