window.puts = function puts(val) {
    console.log(val);
};
window.puts = puts;

window.grab = (function () {
    // Cache for recent results
    const domCache = new Map();

    return function (id) {
        if (!id) return null;

        // Check in registry first (fast path)
        const instance = _registry[id];
        if (instance) return instance;

        // Check in DOM cache
        if (domCache.has(id)) {
            const cached = domCache.get(id);
            // Ensure the element is still in the DOM
            if (cached && cached.isConnected) {
                return cached;
            } else {
                // Remove outdated entry
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

                    this.style[styleProp] = _isNumber(value) ? _formatSize(value) : value;
                    return this;
                };
            });
        }

        // Store in cache for future calls
        domCache.set(id, element);

        return element;
    };
})();
window.grab = grab;


// Add extensions to native JavaScript objects (similar to Ruby)
Object.prototype.define_method = function (name, fn) {
    this[name] = fn;
    return this;
};

// Add methods to Array to mimic Ruby-like behavior
Array.prototype.each = function (callback) {
    this.forEach(callback);
    return this;
};

// Extend Object class to allow inspection
Object.prototype.inspect = function () {
    return AJS.inspect(this);
};

window.puts = puts;

function wait(delay, callback) {
    if (typeof callback === 'function') {
        setTimeout(callback, delay);
    } else {
        console.warn('wait() requires a callback function');
    }
}
window.wait = wait;