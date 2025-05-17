/**
 * Optimized A Framework - Minimalist version with modular structure
 */

// Export main variables for ES6
let A, grab, puts, defineParticle;

// Variables to expose for external particle definitions
let _formatSize, _isNumber, _registry, _particles;

// SECTION 1: UTILITIES
// ===================

// Isolated isNumber function
_isNumber = (function() {
    return function(v) {
        return typeof v === 'number';
    };
})();

// Isolated formatSize function
_formatSize = (function() {
    // Cache for common values
    const cache = new Map();

    return function(v) {
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

// Isolated puts function
puts = function(msg) {
    console.log(msg);
};

// SECTION 2: REGISTRY
// ===================

// Global registry for instances
_registry = {};

// Registry for particles
_particles = {};

// Isolated grab function
grab = (function() {
    // Cache for recent results
    const domCache = new Map();

    return function(id) {
        if (!id) return null;

        // Check registry first (fast)
        const instance = _registry[id];
        if (instance) return instance;

        // Check DOM cache
        if (domCache.has(id)) {
            const cached = domCache.get(id);
            // Verify element is still in the DOM
            if (cached && cached.isConnected) {
                return cached;
            } else {
                // Remove obsolete entry
                domCache.delete(id);
            }
        }

        // Look in the DOM
        const element = document.getElementById(id);
        if (!element) return null;

        // Add useful methods - only once!
        if (!element._enhanced) {
            // Mark as enhanced to avoid duplication
            element._enhanced = true;

            const cssProperties = ['width', 'height', 'color', 'backgroundColor', 'x', 'y'];
            cssProperties.forEach(prop => {
                const styleProp = prop === 'x' ? 'left' : prop === 'y' ? 'top' : prop;

                element[prop] = function(value) {
                    if (arguments.length === 0) {
                        return getComputedStyle(this)[styleProp];
                    }

                    this.style[styleProp] = _isNumber(value) ? _formatSize(value) : value;
                    return this;
                };
            });
        }

        // Cache for future calls
        domCache.set(id, element);

        return element;
    };
})();

// SECTION 3: PARTICLES
// ====================

// Isolated defineParticle function
defineParticle = function(config) {
    // Validate configuration
    if (!config || !config.name || !config.process || typeof config.process !== 'function') {
        console.error("Invalid particle definition:", config);
        return null;
    }

    _particles[config.name] = config;
    return config;
};

// SECTION 4: CLASS A (CORE)
// =========================

// Base styles
const baseStyles = {
    margin: '0', padding: '0', boxSizing: 'border-box',
    display: 'block', position: 'absolute',
    lineHeight: 'normal', fontSize: 'inherit',
    fontWeight: 'inherit', color: 'inherit',
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
            this[name] = function(value) {
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

            this[prop] = function(value) {
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
        if (key === 'inspect' || key === 'addChild' || key === 'getElement' ||
            typeof this[key] === 'function') {
            return; // Don't create method for these reserved names or existing methods
        }

        // Use direct binding rather than a complete closure
        // to reduce memory overhead
        const particle = _particles[key];
        const hasParticle = !!particle;

        this[key] = function(value) {
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
                A.prototype._collectPropertyUpdates.call(
                    this, key, value, styleUpdates, datasetUpdates
                );

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
window.grab = grab;
window.puts = puts;
window.defineParticle = defineParticle;

// Export for ES modules
export { A as default, A, grab, defineParticle, puts };

// EXTERNAL PARTICLE DEFINITIONS
// ============================

// Particle id
defineParticle({
    name: 'id',
    type: 'string',
    category: 'structural',
    process(el, v, _, instance) {
        el.id = v;
        if (v) _registry[v] = instance;  // Uses exposed _registry
    }
});

// Particle markup
defineParticle({
    name: 'markup',
    type: 'string',
    category: 'structural',
    process(el, v, data, instance) {
        if (!v || typeof v !== 'string') return;

        const newEl = document.createElement(v);
        // Copy attributes
        for (const attr of el.attributes) {
            newEl.setAttribute(attr.name, attr.value);
        }

        // Copy styles
        newEl.style.cssText = el.style.cssText;

        // Replace element
        instance.element = newEl;
    }
});

// Particle x
defineParticle({
    name: 'x',
    type: 'number',
    category: 'position',
    process(el, v) {
        el.style.left = _formatSize(v);  // Uses exposed _formatSize
    }
});

// Particle y
defineParticle({
    name: 'y',
    type: 'number',
    category: 'position',
    process(el, v) {
        el.style.top = _formatSize(v);  // Uses exposed _formatSize
    }
});

// Particle width
defineParticle({
    name: 'width',
    type: 'number',
    category: 'dimension',
    process(el, v) {
        el.style.width = _formatSize(v);  // Uses exposed _formatSize
    }
});

// Particle height
defineParticle({
    name: 'height',
    type: 'number',
    category: 'dimension',
    process(el, v) {
        el.style.height = _formatSize(v);  // Uses exposed _formatSize
    }
});

// Particle color
defineParticle({
    name: 'color',
    type: 'string',
    category: 'appearance',
    process(el, v) {
        el.style.backgroundColor = v;
    }
});

// Particle backgroundColor
defineParticle({
    name: 'backgroundColor',
    type: 'string',
    category: 'appearance',
    process(el, v) {
        el.style.backgroundColor = v;
    }
});

// Particle smooth
defineParticle({
    name: 'smooth',
    type: 'number',
    category: 'appearance',
    process(el, v) {
        el.style.borderRadius = _formatSize(v);  // Uses exposed _formatSize
    }
});

// Particle shadow
defineParticle({
    name: 'shadow',
    type: 'object',
    category: 'appearance',
    process(el, v) {
        if (Array.isArray(v)) {
            // Rename to avoid variable shadowing
            el.style.boxShadow = v.map(shadowItem => {
                const {blur = 0, x = 0, y = 0, color = {}, invert = false} = shadowItem;
                const {red = 0, green = 0, blue = 0, alpha = 1} = color;
                const rgba = `rgba(${red * 255},${green * 255},${blue * 255},${alpha})`;
                return `${invert ? 'inset ' : ''}${x}px ${y}px ${blur}px ${rgba}`;
            }).join(', ');
        } else if (typeof v === 'string') {
            el.style.boxShadow = v;
        }
    }
});

//////////////////////////////////////////////////////////////////////////////////////////
/**
 * A Framework - Simple Particles Extension
 * Une approche simplifiée pour ajouter des particles CSS au framework A
 */

(function() {
    // Variable pour contrôler le débogage
    const ENABLE_LOGS = true;

    // Attendre que le framework A soit chargé
    function waitForA() {
        if (typeof window.A !== 'function' || typeof window.defineParticle !== 'function') {
            if (ENABLE_LOGS) console.log('En attente du framework A...');
            setTimeout(waitForA, 10);
            return;
        }

        if (ENABLE_LOGS) console.log('Framework A détecté, initialisation des particles...');
        initSimpleParticles();
    }

    // Fonction d'initialisation principale
    function initSimpleParticles() {
        // Propriétés CSS intéressantes pour le test
        const cssPropsList = [
            'position', 'top', 'left', 'right', 'bottom',
            'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
            'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
            'fontSize', 'fontWeight', 'textAlign', 'lineHeight',
            'border', 'borderRadius', 'boxShadow',
            'display', 'flexDirection', 'justifyContent', 'alignItems'
        ];

        // Regex pré-compilée pour les propriétés qui nécessitent des pixels
        const needsPxRegex = /^(width|height|top|left|right|bottom|margin|padding|border|font|line|gap|radius)/;

        // Définir un particle pour chaque propriété CSS avec un log explicite
        for (let i = 0; i < cssPropsList.length; i++) {
            const prop = cssPropsList[i];

            // Définir un nouveau particle avec des logs explicites
            window.defineParticle({
                name: prop,
                type: 'any',
                category: 'css-simple',
                process: function(el, v, data, instance) {
                    if (ENABLE_LOGS) {
                        console.log(`=== PARTICLE ACTIVÉ: ${prop} ===`);
                        console.log(`Valeur: ${v}`);
                        console.log(`Élément: ${el.tagName || 'inconnu'}`);
                        console.log(`ID: ${el.id || 'sans ID'}`);
                    }

                    // Appliquer la valeur avec gestion automatique des unités
                    if (typeof v === 'number') {
                        // Propriétés dimensionnelles
                        el.style[prop] = needsPxRegex.test(prop) ? `${v}px` : v;
                    } else {
                        // Valeurs non numériques
                        el.style[prop] = v;
                    }

                    if (ENABLE_LOGS) {
                        console.log(`Style appliqué: ${prop}=${el.style[prop]}`);
                    }
                }
            });

            if (ENABLE_LOGS) {
                console.log(`[Simple] Particle ${prop} défini avec logs explicites`);
            }
        }

        // Définir un particle spécial pour 'role' (utilisé dans l'exemple)
        window.defineParticle({
            name: 'role',
            type: 'string',
            category: 'attribute-simple',
            process: function(el, v) {
                if (ENABLE_LOGS) {
                    console.log(`=== PARTICLE ROLE ACTIVÉ ===`);
                    console.log(`Valeur: ${v}`);
                    console.log(`Élément: ${el.tagName || 'inconnu'}`);
                }
                el.setAttribute('role', v);
            }
        });

        if (ENABLE_LOGS) {
            console.log('[Simple] Tous les particles simplifiés ont été définis');
            console.log('[Simple] Prêt à tester avec new A({...})');
        }
    }

    // Démarrer l'initialisation
    waitForA();
})();
//////////////////////////////////////////////////////////////////////////////////////////


// Particle overflow
defineParticle({
    name: 'overflow',
    type: 'string',
    category: 'appearance',
    process(el, v) {
        el.style.overflow = v;
    }
});

// Particle attach
defineParticle({
    name: 'attach',
    type: 'any',
    category: 'structural',
    process(el, v, _, instance) {
        instance._handleAttach(v);
    }
});