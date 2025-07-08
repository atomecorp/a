/**
 * 🌐 APIS - EXTENSIONS FOR JAVASCRIPT
 * Adding Ruby-like functionalities to JavaScript + MINIMAL REQUIRE SYSTEM FOR SQUIRREL
 */

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

    return function (id) {
        if (!id) return null;

        // Check the registry first (fast path)
        const instance = _registry[id];
        if (instance) return instance;

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

        // Store in the cache for future calls
        domCache.set(id, element);

        return element;
    };
})();

// Add extensions to native JavaScript objects (similar to Ruby)
Object.prototype.define_method = function (name, fn) {
    this[name] = fn;
    return this;
};

// Add methods to Array to mimic Ruby behavior
Array.prototype.each = function (callback) {
    this.forEach(callback);
    return this;
};

// Extend the Object class to allow inspection
Object.prototype.inspect = function () {
    return AJS.inspect(this);
};

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
    inspect: function(obj) {
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
export { };