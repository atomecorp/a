/**
 * Optimized A Framework - Minimalist version with modular structure
 */


// Export main variables for ES6
let A, defineParticle;

// Variables to expose for external particle definitions
let _formatSize, _isNumber, _registry, _particles;


// Isolated isNumber function
_isNumber = (function () {
    return function (v) {
        return typeof v === 'number';
    };
})();
window._isNumber = _isNumber
// Isolated formatSize function
_formatSize = (function () {
    // Cache for common values
    const cache = new Map();

    return function (v) {
        if (!_isNumber(v)) return v;

        // Use cache for common values
        if (v >= 0 && v <= 1000 && v === Math.floor(v)) {
            if (!cache.has(v)) {
                cache.set(v, `${v}px`);
            }
            return cache.get(v);
        }

        // Non-cached values
        return `${v}px`;
    };
})();
window._formatSize = _formatSize


// Global registry for inst
_registry = {};
window._registry = _registry;

// Registry for particles
_particles = {};
window._particles = _particles


// Isolated defineParticle function
defineParticle = function (config) {
    // Validate configuration
    if (!config || !config.name || !config.process || typeof config.process !== 'function') {
        console.error("Invalid particle definition:", config);
        return null;
    }

    _particles[config.name] = config;
    return config;
};

// Base styles
const baseStyles = {
    margin: '0',
    padding: '0',
    boxSizing: 'border-box',
    display: 'block',
    position: 'absolute',
    lineHeight: 'normal',
    fontSize: 'inherit',
    fontWeight: 'inherit',
    color: 'inherit',
    background: 'transparent'
};

// Main A class with maximum optimizations
A = class {
    constructor(config = {}) {
        this._data = {...config};
        this.element = document.createElement('div');
        this._fastened = config.fasten || [];

        // Direct access to style and dataset to avoid repeated lookups
        this.style = this.element.style;
        this.dataset = this.element.dataset;

        // Apply base styles in a single operation
        if (config.reset !== false) {
            Object.assign(this.style, baseStyles);
        }

        // Pre-instantiate all known methods to avoid dynamic creation
        this._preparePropertyMethods();

        // Process all properties
        this._processConfig(config);

        // Attach element if needed
        if (config.attach) {
            this._handleAttach(config.attach);
        }

        // Register instance if it has an ID
        if (config.id) {
            _registry[config.id] = this;
        }
    }

    // Pre-instantiate methods for all known particles
    _preparePropertyMethods() {
        // List of methods not to create
        const reservedMethods = ['inspect', 'addChild', 'getElement', 'getFastened', 'style', 'element'];

        // Create methods for all known particles
        for (const name in _particles) {
            if (reservedMethods.includes(name) || typeof this[name] === 'function') continue;

            const particle = _particles[name];
            this[name] = function (value) {
                if (arguments.length === 0) return this._data[name];

                this._data[name] = value;

                try {
                    particle.process(this.element, value, this._data, this);
                } catch (err) {
                    console.error(`Error when calling particle ${name}:`, err);
                }

                return this;
            };
        }

        // Additionally add methods for standard CSS properties without particles
        const cssProperties = ['zIndex', 'opacity', 'transform', 'transition', 'display'];
        cssProperties.forEach(prop => {
            if (typeof this[prop] === 'function' || reservedMethods.includes(prop)) return;

            // Capture 'this' to prevent reference issues in the nested function
            const self = this;

            this[prop] = function (value) {
                if (arguments.length === 0) return this._data[prop];

                this._data[prop] = value;

                // Apply CSS property directly
                const styleUpdates = {};
                const datasetUpdates = {};

                // Use self instead of this for the method call
                self._collectPropertyUpdates(prop, value, styleUpdates, datasetUpdates);

                // Apply updates
                if (Object.keys(styleUpdates).length > 0) {
                    Object.assign(this.element.style, styleUpdates);
                }
                if (Object.keys(datasetUpdates).length > 0) {
                    Object.assign(this.element.dataset, datasetUpdates);
                }

                return this;
            };
        });
    }

    // Process all properties
    _processConfig(config) {
        // Collect style updates to apply them at once
        const styleUpdates = {};
        const datasetUpdates = {};

        for (const [key, value] of Object.entries(config)) {
            if (key === 'fasten' || key === 'reset') {
                continue; // Already handled
            }

            // Find associated particle
            const particle = _particles[key];
            if (particle) {
                try {
                    // Particles can modify the element directly
                    particle.process(this.element, value, config, this);
                } catch (err) {
                    console.error(`Error processing particle ${key}:`, err);
                }
            } else {
                // Default handling - collect instead of applying immediately
                this._collectPropertyUpdates(key, value, styleUpdates, datasetUpdates);
            }

            // Create a method for this property if it doesn't already exist
            if (typeof this[key] !== 'function') {
                this._createPropertyMethod(key);
            }
        }

        // Apply all style updates at once
        if (Object.keys(styleUpdates).length > 0) {
            Object.assign(this.element.style, styleUpdates);
        }

        // Apply all dataset updates at once
        if (Object.keys(datasetUpdates).length > 0) {
            Object.assign(this.element.dataset, datasetUpdates);
        }
    }

    // Collect updates instead of applying them immediately
    _collectPropertyUpdates(key, value, styleUpdates, datasetUpdates) {
        if (typeof value === 'number') {
            // Numeric value = likely a size in pixels
            styleUpdates[key] = _formatSize(value);
        } else if (typeof value === 'string') {
            // String value = likely a direct CSS property
            styleUpdates[key] = value;
        } else if (Array.isArray(value)) {
            // Array = store in dataset
            datasetUpdates[key] = value.join(',');
        } else if (value instanceof HTMLElement) {
            // HTML Element = add as child (cannot be deferred)
            this.element.appendChild(value);
        } else if (value && typeof value === 'object') {
            // Object = serialize to JSON
            datasetUpdates[key] = JSON.stringify(value);
        }
    }

    // Create a getter/setter method for a property
    _createPropertyMethod(key) {
        if (key === 'inspect' || key === 'addChild' || key === 'getElement' || typeof this[key] === 'function') {
            return; // Don't create method for these reserved names or existing methods
        }

        // Use direct binding rather than a complete closure
        // to reduce memory overhead
        const particle = _particles[key];
        const hasParticle = !!particle;

        this[key] = function (value) {
            if (arguments.length === 0) {
                // Getter - direct access, no additional processing
                return this._data[key];
            }

            // Setter
            this._data[key] = value;

            // Apply value via particle if it exists
            if (hasParticle) {
                try {
                    particle.process(this.element, value, this._data, this);
                } catch (err) {
                    console.error(`Error calling particle ${key}:`, err);
                }
            } else {
                // Use a bound function call to avoid 'this' reference issues
                const styleUpdates = {};
                const datasetUpdates = {};
                // Call the method with the proper 'this' context
                A.prototype._collectPropertyUpdates.call(this, key, value, styleUpdates, datasetUpdates);

                // Apply updates
                if (Object.keys(styleUpdates).length > 0) {
                    Object.assign(this.element.style, styleUpdates);
                }
                if (Object.keys(datasetUpdates).length > 0) {
                    Object.assign(this.element.dataset, datasetUpdates);
                }
            }

            return this;
        };
    }

    // Handle DOM attachment - optimized version
    _handleAttach(value) {
        // Avoid setTimeout if possible
        // Using requestAnimationFrame ensures attachment is done
        // during the next render cycle, which is more efficient
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            this._performAttach(value);
        } else {
            requestAnimationFrame(() => this._performAttach(value));
        }
    }

    // Factorized attachment function
    _performAttach(value) {
        if (this.element.parentNode) return;

        let parent;
        if (typeof value === 'string') {
            parent = document.querySelector(value) || document.body;
        } else if (value instanceof HTMLElement) {
            parent = value;
        } else {
            parent = document.body;
        }

        parent.appendChild(this.element);
    }

    // Public API
    getElement() {
        return this.element;
    }

    getFastened() {
        return this._fastened.map(id => _registry[id]).filter(Boolean);
    }

    addChild(childConfig) {
        if (childConfig instanceof A) {
            this.element.appendChild(childConfig.getElement());
            if (childConfig._data.id) {
                this._fastened.push(childConfig._data.id);
            }
            return childConfig;
        }

        const child = new A({...childConfig, attach: this.element});
        if (childConfig.id) {
            this._fastened.push(childConfig.id);
        }
        return child;
    }

    inspect() {
        console.group('A Instance');
        console.log('ID:', this._data.id);
        console.log('Element:', this.element);
        console.log('Style:', this.element.style.cssText);
        console.log('Data:', this._data);
        console.groupEnd();
        return this;
    }

    static getById(id) {
        return _registry[id];
    }
};

// Export to global scope
window.A = A;

window.defineParticle = defineParticle;

// Export for ES modules
export {A as default, A, defineParticle};

// EXTERNAL PARTICLE DEFINITIONS
// ============================
