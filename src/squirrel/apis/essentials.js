/**
 * 🌐 APIS - EXTENSIONS FOR JAVASCRIPT
 * Adding Ruby-like functionalities to JavaScript + MINIMAL REQUIRE SYSTEM FOR SQUIRREL
 */
const shadowLeft = 0,
  shadowTop = 0,
  shadowBlur = 12;
const items_spacing = 3;
const item_border_radius = 6;
const item_size = 54;

window.currentTheme = {
  basic: {
    button_color: 'rgba(204, 35, 35, 0.85)',
    button_active_color: "rgba(72,71,71,0.15) 100%)",
    palette_bg: 'rgba(72,71,71,0)',
    tool_bg: 'rgba(72,71,71,0)',
    particle_bg: 'rgba(72,71,71)',
    option_bg: 'rgba(72,71,71,0)',
    zonespecial_bg: 'rgba(72,71,71,0)',
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
    satellite_offset: '0px',
    satellite_bg: 'rgba(72,71,71,0)',
    items_spacing: items_spacing + 'px',
    item_size: item_size + 'px',
    support_thickness: item_size + shadowBlur + shadowTop + shadowLeft + 'px',
    // Translucent gradient for a glassy look
    tool_bg: 'linear-gradient(180deg, rgba(72,71,71,0.85) 0%, rgba(72,71,71,0.35) 100%)',
    tool_bg_active: "#7a7c73ff",
    tool_backDrop_effect: '0px',
    tool_text: "#cacacaff",
    tool_font: "0.9vw",
    tool_font_px: 10,
    text_char_max: 9,
    tool_active_bg: "#a06e0aff",
    tool_lock_bg: '#9f1f1fff', // couleur lock

    tool_lock_pulse_duration: '1400ms', // durée animation clignotement doux
    tool_lock_toggle_mode: 'long', // 'long' (par défaut) ou 'click' pour permettre le clic simple de sortir

    toolbox_icon: 'data:image/svg+xml;base64,' + "PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz48IURPQ1RZUEUgc3ZnIFBVQkxJQyAiLS8vVzNDLy9EVEQgU1ZHIDEuMS8vRU4iICJodHRwOi8vd3d3LnczLm9yZy9HcmFwaGljcy9TVkcvMS4xL0RURC9zdmcxMS5kdGQiPjxzdmcgdmVyc2lvbj0iMS4xIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMjgiIGhlaWdodD0iMTI4IiAgeG1sOnNwYWNlPSJwcmVzZXJ2ZSIgaWQ9Im1lbnVDYW52YXMiPgk8ZyBpZD0ibWVudUNhbnZhcy1ncm91cCI+CQk8ZyBpZD0ibWVudUNhbnZhcy1ncm91cDIiPgkJCTxnIGlkPSJtZW51Q2FudmFzLWdyb3VwMyI+CQkJPHBhdGggaWQ9Im1lbnVDYW52YXMtYmV6aWVyMyIgc3Ryb2tlPSJyZ2IoMjM4LCAyMzgsIDIzOCkiIHN0cm9rZS13aWR0aD0iMzMiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgZmlsbD0ibm9uZSIgZD0iTSAxNy42NywxMTAuNjcgTCAxMTEuMzMsMTEwLjY3IiAvPgkJCQk8cGF0aCBpZD0ibWVudUNhbnZhcy1iZXppZXIxIiBzdHJva2U9InJnYigyMzgsIDIzOCwgMjM4KSIgc3Ryb2tlLXdpZHRoPSIzMyIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBmaWxsPSJub25lIiBkPSJNIDE3LjY3LDE4LjMzIEwgMTExLjMzLDE4LjMzIiAvPgkJCQk8cGF0aCBpZD0ibWVudUNhbnZhcy1iZXppZXIyIiBzdHJva2U9InJnYigyMzgsIDIzOCwgMjM4KSIgc3Ryb2tlLXdpZHRoPSIzMyIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBmaWxsPSJub25lIiBkPSJNIDE3LjY3LDY0LjUgTCAxMTEuMzMsNjQuNSIgLz4JCQk8L2c+CQk8L2c+CTwvZz48L3N2Zz4=",
    toolbox_icon_color: '#cacacaff',
    toolbox_icon_size: '39%',      // px, %, ou ratio (0..1)
    toolbox_icon_top: '50%',       // position verticale
    toolbox_icon_left: '50%',
    toolboxOffsetMain: "7px",
    toolboxOffsetEdge: "7px",
    items_offset_main: item_border_radius + items_spacing + 'px',
    icon_color: "#cacacaff",
    icon_size: "39%",
    icon_top: '63%',       // position verticale
    icon_left: '50%',
    // Toggle label/icon visibility when a palette is popped out
    palette_icon: false,
    palette_label: true,
    dropdown_text_color: '#ffff00',
    dropdown_background_color: 'yellow',
    floating_host_bg: 'transparent',
    floating_host_shadow: 'none',
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
    edit_mode_color: '#ff6f61'
  }
};

// Add the puts method to display in the console
window.puts = function puts(val) {
  console.log(val);
};

// Add the print method to display in the console without newline (Ruby-like)
window.print = function print(val) {
  // In browser, we can't avoid newline easily, so we use console.log but prefix with [PRINT]
  console.log('[PRINT]', val);
};

// Add the grab method to retrieve DOM elements
window.grab = (function () {
  // Cache for recent results
  const domCache = new Map();

  const looksLikeUuid = (val) => {
    if (!val) return false;
    const s = String(val);
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
  };

  const resolveSelectableId = (thing, fallbackId = null) => {
    try {
      if (!thing) return null;
      if (typeof thing === 'string') return thing;

      // DOM element id conventions
      const elId = thing.id ? String(thing.id) : '';
      if (elId.startsWith('atome_')) return elId.slice('atome_'.length);
      if (elId.startsWith('project_view_')) return elId.slice('project_view_'.length);
      if (looksLikeUuid(elId)) return elId;

      // Common object id fields
      const candidate = thing.atome_id || thing.object_id || thing.id || null;
      if (candidate && looksLikeUuid(candidate)) return String(candidate);
    } catch (_) { }

    if (fallbackId && looksLikeUuid(fallbackId)) return String(fallbackId);
    return fallbackId ? String(fallbackId) : null;
  };

  const ensureSelectionApi = () => {
    if (window.SelectionAPI) return window.SelectionAPI;

    const _selected = new Set();
    let _last = null;

    const publish = () => {
      try {
        window.__selectedAtomeId = _last;
        window.__selectedAtomeIds = Array.from(_selected);
        window.dispatchEvent(new CustomEvent('adole-atome-selected', { detail: { atomeId: _last, selected: Array.from(_selected) } }));
      } catch (_) { }
    };

    window.SelectionAPI = {
      select(thingOrId, options = {}) {
        const id = resolveSelectableId(thingOrId, options.fallbackId || null);
        if (!id) return null;
        const add = options.add === true;
        const toggle = options.toggle === true;

        if (!add && !toggle) {
          _selected.clear();
        }

        if (toggle) {
          if (_selected.has(id)) _selected.delete(id);
          else _selected.add(id);
        } else {
          _selected.add(id);
        }

        _last = id;
        publish();
        return id;
      },
      clear() {
        _selected.clear();
        _last = null;
        publish();
        return true;
      },
      selected() {
        return Array.from(_selected);
      },
      last() {
        return _last;
      },
      isSelected(id) {
        return _selected.has(String(id));
      }
    };

    return window.SelectionAPI;
  };

  const enhanceSelectable = (obj, fallbackId = null) => {
    if (!obj) return obj;
    if (obj._enhancedSelection) return obj;
    try {
      Object.defineProperty(obj, '_enhancedSelection', { value: true, enumerable: false });

      Object.defineProperty(obj, 'select', {
        value: function (options = {}) {
          const api = ensureSelectionApi();
          return api.select(this, { ...options, fallbackId });
        },
        enumerable: false
      });

      Object.defineProperty(obj, 'selected', {
        value: function () {
          const api = ensureSelectionApi();
          return api.selected();
        },
        enumerable: false
      });
    } catch (_) { }
    return obj;
  };

  return function (id) {
    if (!id) return null;

    // Check the registry first (fast path)
    const instance = _registry[id];
    if (instance) return enhanceSelectable(instance, id);

    // Check the DOM cache
    if (domCache.has(id)) {
      const cached = domCache.get(id);
      // Check if the element is still in the DOM
      if (cached && cached.isConnected) {
        return cached;
      } else {
        // Remove obsolete entry
        domCache.delete(id);
      }
    }

    // Search in the DOM
    const element = document.getElementById(id);
    if (!element) return null;

    // Add useful methods – only once!
    if (!element._enhanced) {
      // Mark as enhanced to avoid duplicates
      element._enhanced = true;

      const cssProperties = ['width', 'height', 'color', 'backgroundColor', 'x', 'y'];
      cssProperties.forEach(prop => {
        const styleProp = prop === 'x' ? 'left' : prop === 'y' ? 'top' : prop;

        element[prop] = function (value) {
          if (arguments.length === 0) {
            return getComputedStyle(this)[styleProp];
          }

          this.style[styleProp] = window._isNumber && window._isNumber(value) ?
            window._formatSize(value) : value;
          return this;
        };
      });
    }

    enhanceSelectable(element, id);

    // Store in the cache for future calls
    domCache.set(id, element);

    return element;
  };
})();

// Add extensions to native JavaScript objects (similar to Ruby)
// Use non-enumerable properties to avoid contaminating for...in loops
Object.defineProperty(Object.prototype, 'define_method', {
  value: function (name, fn) {
    this[name] = fn;
    return this;
  },
  enumerable: false,    // Crucial: ne pas apparaître dans for...in
  writable: false,
  configurable: false
});

// Add methods to Array to mimic Ruby behavior
Array.prototype.each = function (callback) {
  this.forEach(callback);
  return this;
};

// Extend the Object class to allow inspection  
// Use non-enumerable property to avoid contaminating for...in loops
Object.defineProperty(Object.prototype, 'inspect', {
  value: function () {
    return AJS.inspect(this);
  },
  enumerable: false,    // Crucial: ne pas apparaître dans for...in
  writable: false,
  configurable: false
});

// Add a wait function for delays (promisified version is more modern)
const wait = (delay, callback) => {
  if (typeof callback === 'function') {
    setTimeout(callback, delay);
  } else {
    // Return a promise if no callback
    return new Promise(resolve => setTimeout(resolve, delay));
  }
};
window.wait = wait;

// Add log function (alias for puts)
window.log = window.puts;

// Helper functions for grab method - use global versions
// (Remove duplicated functions since they're already defined in a.js)

// Registry for grab method
window._registry = window._registry || {};

// AJS object for inspect method
window.AJS = window.AJS || {
  inspect: function (obj) {
    return JSON.stringify(obj, null, 2);
  }
};


// Function to completely clear the screen
window.clearScreen = function () {
  const viewContainer = document.getElementById('view');

  if (viewContainer) {
    // 1. Clean all events from children recursively
    cleanupElementEvents(viewContainer);

    // 2. Empty the container
    viewContainer.innerHTML = '';

    // 3. Clean global variables if needed
    cleanupGlobalVariables();
  }
}

// Recursive function to clean events
function cleanupElementEvents(element) {
  // Clean events on the current element
  if (element.removeAllEventListeners) {
    element.removeAllEventListeners();
  } else {
    // Alternative method - clone the element to remove all events
    const clone = element.cloneNode(false);
    // Note: this method removes events but we'll rather use a manual approach
  }

  // Recursively clean all children
  Array.from(element.children).forEach(child => {
    cleanupElementEvents(child);
  });
}

// Function to clean global variables
function cleanupGlobalVariables() {
  // Stop GSAP animations
  if (window.gsap) {
    gsap.killTweensOf("*");
    gsap.globalTimeline.clear();
  }

  // Clear timers
  if (window.rotationAnimation) {
    cancelAnimationFrame(window.rotationAnimation);
    window.rotationAnimation = null;
  }

  // Clear deformation variables
  if (window.deformTweens) {
    window.deformTweens.forEach(tween => {
      if (tween && tween.kill) tween.kill();
    });
    window.deformTweens = [];
  }
}



// Export for ES6 modules
export { wait };




