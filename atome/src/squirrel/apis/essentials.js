/**
 * essentials
 *
 * Role:
 * - Global theme + convenience helpers exposed to the runtime.
 * - Legacy compatibility helpers for UI workflows.
 */
// The legacy `window.currentTheme` table that used to live here carried its own
// 54 px `item_size` base, next to a 12 px shadow and a 3 px spacing. Nothing in
// the runtime ever read it back (the live theme is `eveToolTheme`, resolved
// from the tool skin), so the whole parallel base is gone rather than kept as a
// second source of truth for the same square.

// `puts` is the product's user-facing notice channel: 13 call sites in the aBox
// media transport report upload/download outcomes through it ("Connectez-vous
// pour envoyer des fichiers", "[download] échec pour ..."). Its body was empty,
// so every one of those messages went nowhere and a failed transfer was silent.
//
// It follows the same shape as reportRuntimeError (squirrel/runtime_errors.js):
// the last entries stay readable on `window.__squirrelNotices`, and the console
// only speaks when `window.__SQUIRREL_DEBUG` is truthy -- production stays quiet
// without the message being destroyed.
const NOTICE_RING_SIZE = 200;
const noticeRing = [];
window.__squirrelNotices = noticeRing;

window.puts = function puts(...values) {
  const message = values
    .map((value) => (typeof value === 'string' ? value : (() => {
      try { return JSON.stringify(value); } catch (_) { return String(value); }
    })()))
    .join(' ');
  noticeRing.push({ at: new Date().toISOString(), message });
  if (noticeRing.length > NOTICE_RING_SIZE) {
    noticeRing.splice(0, noticeRing.length - NOTICE_RING_SIZE);
  }
  if (window.__SQUIRREL_DEBUG && typeof console !== 'undefined') console.log(message);
  return message;
};

// `window.print` is NOT redefined: it used to be overwritten with an empty
// function, which permanently disabled the browser's native print dialog for
// the whole application. Nothing in the product calls a `print()` global.

// Add the grab method to retrieve DOM elements
window.grab = (function () {
  // Cache des résultats récents.
  //
  // Une entrée n'était retirée que si l'élément était détaché AU MOMENT d'une
  // relecture du même id: un id consulté une seule fois gardait son nœud vivant
  // pour la session entière, ce qui empêchait aussi le ramasse-miettes de libérer
  // le sous-arbre DOM correspondant. La carte est insertion-ordonnée, donc la
  // tête est l'entrée la plus ancienne.
  const DOM_CACHE_MAX = 512;
  const domCache = new Map();
  const rememberElement = (id, element) => {
    domCache.set(id, element);
    while (domCache.size > DOM_CACHE_MAX) {
      const oldest = domCache.keys().next().value;
      if (oldest === id) break;
      domCache.delete(oldest);
    }
  };

  const looksLikeUuid = (val) => {
    if (!val) return false;
    const s = String(val);
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
  };

  const resolveSelectableId = (thing, fallbackId = null) => {

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


    if (fallbackId && looksLikeUuid(fallbackId)) return String(fallbackId);
    return fallbackId ? String(fallbackId) : null;
  };

  const ensureSelectionApi = () => {
    if (window.SelectionAPI) return window.SelectionAPI;

    const _selected = new Set();
    let _last = null;

    const publish = () => {

      window.__selectedAtomeId = _last;
      window.__selectedAtomeIds = Array.from(_selected);
      window.dispatchEvent(new CustomEvent('adole-atome-selected', { detail: { atomeId: _last, selected: Array.from(_selected) } }));

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
    rememberElement(id, element);

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


