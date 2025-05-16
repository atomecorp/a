
/**
 * Particle Framework - A flexible meta-programming approach for property handlers
 *
 * This framework allows you to define behavior for properties as "particles"
 * with pre-processing and post-processing capabilities, as well as type validation
 * and organization by categories.
 */

let A = (() => {

    // Global storage for Atome instances by ID for references
    const atomeRegistry = {};

    // Base styles to reset default values
    const baseStyles = {
        margin: '0',
        padding: '0',
        boxSizing: 'border-box',
        display: 'block',
        position: 'absolute', // Default absolute positioning
        lineHeight: 'normal',
        fontSize: 'inherit',
        fontWeight: 'inherit',
        color: 'inherit',
        background: 'transparent'
    };

    /**
     * Particle class - Encapsulates a property handler with pre/post processing
     */
    class Particle {
        /**
         * Creates a new Particle
         * @param {Object} config - Configuration object for the particle
         * @param {string} config.name - Name of the particle (property name)
         * @param {string} config.type - Expected data type ('number', 'string', etc.)
         * @param {string} config.category - Category for organizing particles
         * @param {Function|Object} config.handler - Handler function or object with before/process/after methods
         */
        constructor(config) {
            this.name = config.name;
            this.type = config.type;
            this.category = config.category;

            // If handler is a function, use it as the main process function
            if (typeof config.handler === 'function') {
                this.process = config.handler;
                this.before = null;
                this.after = null;
            }
            // If handler is an object with process/before/after methods
            else if (typeof config.handler === 'object') {
                this.process = config.handler.process || ((el, v) => {});
                this.before = config.handler.before || null;
                this.after = config.handler.after || null;
            }
            // Alternatively, use direct method definitions if provided
            if (config.process) this.process = config.process;
            if (config.before) this.before = config.before;
            if (config.after) this.after = config.after;
        }

        /**
         * Validates the value against the expected type
         * @param {any} value - Value to validate
         * @returns {boolean} - True if valid, false otherwise
         */
        validateType(value) {
            switch(this.type) {
                case 'integer':
                    return Number.isInteger(value);
                case 'number':
                    return typeof value === 'number';
                case 'string':
                    return typeof value === 'string';
                case 'boolean':
                    return typeof value === 'boolean';
                case 'object':
                    return typeof value === 'object' && value !== null;
                case 'array':
                    return Array.isArray(value);
                case 'mixed':
                    return true; // Accepts any type
                default:
                    return true;
            }
        }

        /**
         * Applies the particle to an element
         * @param {HTMLElement} el - DOM element to apply changes to
         * @param {any} value - Value to apply
         * @param {Object} data - Complete data object
         * @param {Object} instance - ABase instance
         * @returns {any} - Result of the operation
         */
        apply(el, value, data, instance) {
            // 1. Validation (optional)
            if (!this.validateType(value)) {
                console.warn(`Warning: Property '${this.name}' expects type '${this.type}' but received ${typeof value}`);
            }

            // 2. Pre-processing if defined
            let processedValue = value;
            if (this.before) {
                processedValue = this.before(value, el, data, instance);
            }

            // 3. Main processing
            const result = this.process(el, processedValue, data, instance);

            // 4. Post-processing if defined
            if (this.after) {
                this.after(el, processedValue, result, data, instance);
            }

            return result;
        }
    }

    // Registry for all particles
    const particleRegistry = {};

    /**
     * Defines and registers a new particle
     * @param {Object} config - Configuration for the particle
     * @returns {Particle} - The created particle
     */
    const defineParticle = (config) => {
        const particle = new Particle(config);
        particleRegistry[config.name] = particle;
        return particle;
    };

    /**
     * Default handler for properties without a specific particle
     * @param {HTMLElement} el - DOM element
     * @param {any} value - Value to apply
     * @param {string} key - Property name
     */
    function defaultHandler(el, value, key) {
        if (typeof value === 'number' || typeof value === 'string') {
            // styles in px if number
            el.style[key] = typeof value === 'number' ? `${value}px` : value;
        } else if (typeof value === 'boolean') {
            el.dataset[key] = value;
        } else if (Array.isArray(value)) {
            el.dataset[key] = value.join(',');
        } else if (value instanceof HTMLElement) {
            el.appendChild(value);
        } else if (value && typeof value === 'object') {
            el.dataset[key] = JSON.stringify(value);
        }
    }

    // Define all standard particles

    // --- Structural particles ---
    defineParticle({
        name: 'id',
        type: 'string',
        category: 'structural',
        process(el, v, _, instance) {
            el.id = v;
            // Register the instance in the global registry for later references
            if (v) {
                atomeRegistry[v] = instance;
            }
        }
    });

    defineParticle({
        name: 'class',
        type: 'mixed',
        category: 'structural',
        process(el, v) {
            const cls = Array.isArray(v) ? v.join(' ') : v;
            el.className = cls;
        }
    });

    defineParticle({
        name: 'markup',
        type: 'string',
        category: 'structural',
        process(el, v, _, instance) {
            // If markup is specified, create a new element of the requested type
            if (v && typeof v === 'string') {
                const newEl = document.createElement(v);
                // Copy attributes and styles from the old element
                Array.from(el.attributes).forEach(attr => {
                    newEl.setAttribute(attr.name, attr.value);
                });
                newEl.style.cssText = el.style.cssText;
                // Replace the element in the instance
                instance._element = newEl;
                return newEl; // Important: return the new element
            }
            return el;
        }
    });

    defineParticle({
        name: 'type',
        type: 'string',
        category: 'structural',
        process(el, v) {
            el.dataset.type = v;
        }
    });

    defineParticle({
        name: 'renderers',
        type: 'array',
        category: 'structural',
        process(el, v) {
            if (Array.isArray(v)) v.forEach(r => el.classList.add(`renderer-${r}`));
        }
    });

    // --- Physical particles (positioning and dimensions) ---

    // Helper function for dimension properties
    const createDimensionParticle = (name, cssProperty) => {
        return defineParticle({
            name,
            type: 'number',
            category: 'physical',
            process(el, value, data) {
                if (value === undefined || value === null) return;

                // Determine the unit
                let unit = 'px'; // Default unit
                if (data.unit && data.unit[name]) {
                    unit = data.unit[name];
                }

                // Apply the property with its unit
                el.style[cssProperty] = `${value}${unit}`;
            }
        });
    };


    // Create dimension particles
    createDimensionParticle('x', 'left');
    createDimensionParticle('y', 'top');
    createDimensionParticle('width', 'width');
    createDimensionParticle('height', 'height');

    defineParticle({
        name: 'position',
        type: 'string',
        category: 'physical',
        process(el, v) {
            el.style.position = v;
        }
    });

    defineParticle({
        name: 'origin',
        type: 'object',
        category: 'physical',
        process(el, v) {
            if (!v || typeof v !== 'object') return;

            // Store the origin in the element's data for reference
            el.dataset.origin = JSON.stringify(v);

            // Apply position adjustments if necessary
            // Note: this would be better managed with a complete positioning system
        }
    });

    defineParticle({
        name: 'overflow',
        type: 'string',
        category: 'physical',
        process(el, v) {
            el.style.overflow = v;
        }
    });

    defineParticle({
        name: 'center',
        type: 'boolean',
        category: 'physical',
        process(el, v) {
            if (v) {
                // Center horizontally while respecting absolute positioning
                el.style.left = '50%';
                el.style.transform = 'translateX(-50%)';
                // If we also want to center vertically
                // el.style.top = '50%';
                // el.style.transform = 'translate(-50%, -50%)';
            }
        }
    });

    // --- Visual particles ---
    defineParticle({
        name: 'smooth',
        type: 'mixed',
        category: 'visual',
        process(el, v) {
            if (typeof v === 'number') {
                el.style.borderRadius = `${v}px`;
            } else if (typeof v === 'string') {
                el.style.borderRadius = v;
            }
        }
    });

    defineParticle({
        name: 'color',
        type: 'string',
        category: 'visual',
        process(el, v) {
            el.style.backgroundColor = v;
        }
    });

    // Complex shadow particle with preprocessing example
    defineParticle({
        name: 'shadow',
        type: 'mixed',
        category: 'visual',

        // Preprocess to normalize shadow configurations
        before(v) {
            // Convert single shadow object to array for unified processing
            if (v && typeof v === 'object' && !Array.isArray(v)) {
                return [v];
            }
            return v;
        },

        // Main process function
        process(el, v) {
            if (!Array.isArray(v)) return;

            // Multiple shadows case
            let result = '';
            const len = v.length;

            for (let i = 0; i < len; i++) {
                const shadow = v[i];
                const blur = shadow.blur !== undefined ? shadow.blur : 7;
                const x = shadow.x !== undefined ? shadow.x : 3;
                const y = shadow.y !== undefined ? shadow.y : 3;
                const inset = shadow.invert ? 'inset ' : '';

                // Color processing
                let color = 'rgba(0,0,0,0.6)';

                if (shadow.color) {
                    if (typeof shadow.color === 'string') {
                        color = shadow.color;
                    } else if (typeof shadow.color === 'object') {
                        const red = shadow.color.red !== undefined ? Math.round(shadow.color.red * 255) : 0;
                        const green = shadow.color.green !== undefined ? Math.round(shadow.color.green * 255) : 0;
                        const blue = shadow.color.blue !== undefined ? Math.round(shadow.color.blue * 255) : 0;
                        const alpha = shadow.color.alpha !== undefined ? shadow.color.alpha : 0.6;

                        color = `rgba(${red},${green},${blue},${alpha})`;
                    }
                }

                // Build the shadow string and add comma if needed
                result += inset + x + 'px ' + y + 'px ' + blur + 'px ' + color;
                if (i < len - 1) result += ', ';
            }

            el.style.boxShadow = result;
        },

        // Post-processing example
        after(el, v) {
            // Add a data attribute with the number of shadows
            if (Array.isArray(v)) {
                el.dataset.shadowCount = v.length;
            }
        }
    });

    // --- Content particles ---
    defineParticle({
        name: 'text',
        type: 'string',
        category: 'content',
        process(el, v) {
            el.textContent = v;
        }
    });

    defineParticle({
        name: 'innerHTML',
        type: 'string',
        category: 'content',
        process(el, v) {
            el.innerHTML = v;
        }
    });

    // --- Behavioral particles ---
    defineParticle({
        name: 'reset',
        type: 'boolean',
        category: 'behavioral',
        process(el, v) {
            // If reset is false, don't apply the base styles
            if (v === false) return;

            // Apply base styles to reset browser defaults
            for (const [key, value] of Object.entries(baseStyles)) {
                el.style[key] = value;
            }
        }
    });

    defineParticle({
        name: 'apply',
        type: 'array',
        category: 'behavioral',
        process(el, v) {
            if (Array.isArray(v)) v.forEach(fn => {
                if (typeof el[fn] === 'function') el[fn]();
            });
        }
    });

    defineParticle({
        name: 'attach',
        type: 'mixed',
        category: 'behavioral',
        process(el, v) {
            let parent;
            if (typeof v === 'string') {
                parent = document.querySelector(v) || document.body;
            } else if (v instanceof HTMLElement) {
                parent = v;
            } else parent = document.body;
            parent.appendChild(el);
        }
    });

    defineParticle({
        name: 'unit',
        type: 'object',
        category: 'behavioral',
        process(el, v) {
            // Does nothing directly, but will be used by other handlers
        }
    });

    // --- Relationship particles ---
    defineParticle({
        name: 'fasten',
        type: 'array',
        category: 'relationship',
        process(el, v, _, instance) {
            if (Array.isArray(v)) {
                el.dataset.fasten = v.join(',');
                // Store the IDs of the children in the instance
                instance._fastened = v;
            }
        }
    });

    defineParticle({
        name: 'children',
        type: 'array',
        category: 'relationship',
        process(el, v, _, instance) {
            if (!Array.isArray(v) || v.length === 0) return;

            // Use DocumentFragment to improve performance
            const fragment = document.createDocumentFragment();

            // Array to store the IDs of created children
            const childrenIds = [];

            // Create each child and attach it to the fragment
            v.forEach(childConfig => {
                // Ensure the child is properly configured
                const childAtome = new A({
                    ...childConfig,
                    attach: null // Don't attach right away
                });

                // Add the element to the fragment
                fragment.appendChild(childAtome.getElement());

                // If the child has an ID, add it to the list of children
                if (childConfig.id) {
                    childrenIds.push(childConfig.id);
                }
            });

            // Attach all children in a single operation
            el.appendChild(fragment);

            // If children were created with IDs, add them to fasten
            if (childrenIds.length > 0) {
                // If fasten already exists, merge the arrays
                if (instance._fastened && Array.isArray(instance._fastened)) {
                    instance._fastened = [...new Set([...instance._fastened, ...childrenIds])];
                    el.dataset.fasten = instance._fastened.join(',');
                } else {
                    instance._fastened = childrenIds;
                    el.dataset.fasten = childrenIds.join(',');
                }
            }
        }
    });

    // --- Interactive particles ---
    defineParticle({
        name: 'events',
        type: 'object',
        category: 'interactive',
        process(el, v) {
            if (v && typeof v === 'object') {
                // Store the handlers for later removal
                el._eventHandlers = el._eventHandlers || {};

                for (const [event, handler] of Object.entries(v)) {
                    if (typeof handler === 'function') {
                        el.addEventListener(event, handler);
                        el._eventHandlers[event] = handler;
                    }
                }
            }
        }
    });

    defineParticle({
        name: 'animate',
        type: 'object',
        category: 'interactive',
        process(el, v) {
            if (v && typeof v === 'object') {
                // Set transition properties
                const duration = v.duration || 0.3;
                const easing = v.easing || 'ease';
                const delay = v.delay || 0;

                el.style.transition = `all ${duration}s ${easing} ${delay}s`;

                // Use requestAnimationFrame for better performance
                if (v.properties && typeof v.properties === 'object') {
                    requestAnimationFrame(() => {
                        for (const [prop, value] of Object.entries(v.properties)) {
                            el.style[prop] = typeof value === 'number' ? `${value}px` : value;
                        }
                    });
                }
            }
        }
    });

    // Example of a simple rotation particle
    defineParticle({
        name: 'rotation',
        type: 'number',
        category: 'transform',

        // Before processing, normalize the angle
        before(value) {
            return value % 360;
        },

        // Main process
        process(el, value) {
            // Preserve existing transforms
            const currentTransform = el.style.transform || '';
            // Remove any existing rotate transform
            const cleanTransform = currentTransform.replace(/rotate\([^)]*\)/g, '').trim();
            // Add new rotation
            el.style.transform = `${cleanTransform} rotate(${value}deg)`.trim();
        },

        // After processing
        after(el, value) {
            // Add a data attribute for the rotation value
            el.dataset.rotation = value;

            // Add orientation classes
            if (value > 45 && value < 135) {
                el.classList.add('rotated-right');
            } else if (value >= 135 && value < 225) {
                el.classList.add('upside-down');
            } else if (value >= 225 && value < 315) {
                el.classList.add('rotated-left');
            } else {
                el.classList.add('normal-orientation');
            }
        }
    });

    /**
     * Base class for A objects with proxy for direct property access
     */
    class ABase {
        constructor(jsonObject) {
            if (!jsonObject || typeof jsonObject !== 'object' || Array.isArray(jsonObject)) {
                throw new TypeError('Invalid JSON object (non-null, object expected).');
            }
            this._data = jsonObject;
            this._element = document.createElement('div');
            this._fastened = []; // List of attached elements (children)

            // Create a proxy for the style
            this._styleProxy = new Proxy({}, {
                get: (target, prop) => {
                    return this._element.style[prop];
                },
                set: (target, prop, value) => {
                    // Log the property and value being added/modified
                    console.log(`Style: ${prop} = ${value}`);
                    this._element.style[prop] = value;
                    return true;
                }
            });

            // By default, apply the style reset
            if (this._data.reset !== false) {
                for (const [key, value] of Object.entries(baseStyles)) {
                    this._element.style[key] = value;
                }
            }

            this._process();

            // Automatic integration if attach is provided
            if (this._data.attach && !this._element.parentNode) {
                let parent;
                const v = this._data.attach;
                if (typeof v === 'string') {
                    parent = document.querySelector(v) || document.body;
                } else if (v instanceof HTMLElement) {
                    parent = v;
                } else parent = document.body;
                parent.appendChild(this._element);
            }

            // Create the proxy for direct property access
            return new Proxy(this, {
                get(target, prop) {
                    // Access to style via .style
                    if (prop === 'style') {
                        return target._styleProxy;
                    }

                    // Special properties that should be directly accessible
                    if (prop === '_data' || prop === '_fastened' || prop === '_process' ||
                        prop === 'destroy' || prop === 'get' || prop === 'set' ||
                        prop === 'addChild' || prop === 'removeChild' ||
                        prop === 'getFastened' || prop === 'getElement' ||
                        prop === '_element' || prop === '_styleProxy') {
                        return target[prop];
                    }

                    // Access to the DOM element via .element
                    if (prop === 'element') {
                        return target._element;
                    }

                    // If the property exists in _data, create a getter/setter function
                    if (prop in target._data) {
                        // Return a function that acts as getter/setter
                        return function(value) {
                            // If an argument is provided, it's a setter
                            if (arguments.length > 0) {
                                // Log the property and value being added/modified
                                console.log(`Property: ${prop} = ${value}`);

                                target._data[prop] = value;
                                // Apply the modification to the element
                                if (particleRegistry[prop]) {
                                    particleRegistry[prop].apply(target._element, value, target._data, target);
                                } else {
                                    defaultHandler(target._element, value, prop);
                                }
                                return target; // For chaining
                            }
                            // Without an argument, it's a getter
                            return target._data[prop];
                        };
                    }

                    // Otherwise, return the normal property of the object
                    return target[prop];
                },
                set(target, prop, value) {
                    // Don't allow modifying certain special properties
                    if (prop === '_data' || prop === '_element' || prop === '_fastened' ||
                        prop === '_process' || prop === 'destroy' || prop === 'get' ||
                        prop === 'set' || prop === 'addChild' || prop === 'removeChild' ||
                        prop === 'getFastened' || prop === 'getElement' ||
                        prop === '_styleProxy') {
                        return false;
                    }

                    // Special properties
                    if (prop === 'element') {
                        return false; // Don't allow directly replacing the element
                    }

                    if (prop === 'style') {
                        return false; // Can't replace the style proxy
                    }

                    // If it's a known property in _data, update it and apply it
                    if (prop in target._data) {
                        // Log the property and value being added/modified
                        console.log(`Property: ${prop} = ${value}`);

                        target._data[prop] = value;

                        // Apply the modification to the element
                        if (particleRegistry[prop]) {
                            particleRegistry[prop].apply(target._element, value, target._data, target);
                        } else {
                            defaultHandler(target._element, value, prop);
                        }

                        return true;
                    }

                    // Otherwise, set as a normal property of the object
                    target[prop] = value;
                    return true;
                }
            });
        }

        /**
         * Process all properties in the data object
         */
        _process() {
            let el = this._element;
            const data = this._data;

            // Process markup first if it exists
            if (data.markup && particleRegistry.markup) {
                el = particleRegistry.markup.apply(el, data.markup, data, this);
            }

            // Process height and width properties first to avoid the height: 0 problem
            if (data.height !== undefined && particleRegistry.height) {
                particleRegistry.height.apply(el, data.height, data, this);
            }
            if (data.width !== undefined && particleRegistry.width) {
                particleRegistry.width.apply(el, data.width, data, this);
            }

            // Process ID first for registration
            if (data.id && particleRegistry.id) {
                particleRegistry.id.apply(el, data.id, data, this);
            }

            // Define the order of categories for processing
            const categoryOrder = ['structural', 'physical', 'visual', 'content', 'behavioral', 'relationship', 'interactive', 'transform'];

            // Process properties by category
            for (const category of categoryOrder) {
                for (const [key, value] of Object.entries(data)) {
                    // Skip already processed properties
                    if (key === 'markup' || key === 'height' || key === 'width' || key === 'id') continue;

                    const particle = particleRegistry[key];
                    if (particle && particle.category === category) {
                        particle.apply(el, value, data, this);
                    }
                }
            }

            // Process remaining properties (without a category or default)
            for (const [key, value] of Object.entries(data)) {
                // Skip already processed properties
                if (key === 'markup' || key === 'height' || key === 'width' || key === 'id') continue;
                if (particleRegistry[key]) continue; // Already processed in the previous loop

                // Default handler for properties without a particle
                defaultHandler(el, value, key);
            }

            // Ensure position is properly defined
            if (!el.style.position && (data.x !== undefined || data.y !== undefined)) {
                el.style.position = 'absolute';
            }
        }

        /**
         * Gets the created element
         * @returns {HTMLElement} - The DOM element
         */
        getElement() {
            return this._element;
        }

        /**
         * Gets all attached elements (children)
         * @returns {Array} - Array of Atome instances
         */
        getFastened() {
            return this._fastened.map(id => atomeRegistry[id]).filter(Boolean);
        }

        /**
         * Adds a child element
         * @param {Object|ABase} childConfig - Child configuration or an existing Atome instance
         * @returns {ABase} - The created or attached child
         */
        addChild(childConfig) {
            // If childConfig is already an Atome
            if (childConfig instanceof ABase) {
                this._element.appendChild(childConfig.getElement());
                if (childConfig._data.id) {
                    this._fastened.push(childConfig._data.id);
                    this._element.dataset.fasten = this._fastened.join(',');
                }
                return childConfig;
            }

            // Otherwise, create a new Atome from the config
            const child = new A({
                ...childConfig,
                attach: this._element
            });

            // If the child has an ID, add it to the list of children
            if (childConfig.id) {
                this._fastened.push(childConfig.id);
                this._element.dataset.fasten = this._fastened.join(',');
            }

            return child;
        }

        /**
         * Removes a child by ID
         * @param {string} childId - ID of the child to remove
         * @returns {boolean} - True if successful, false otherwise
         */
        removeChild(childId) {
            const child = atomeRegistry[childId];
            if (child && child.getElement().parentNode === this._element) {
                this._element.removeChild(child.getElement());
                this._fastened = this._fastened.filter(id => id !== childId);
                this._element.dataset.fasten = this._fastened.join(',');
                return true;
            }
            return false;
        }

        /**
         * Gets a value from the data
         * @param {string} key - Property name
         * @returns {any} - The property value
         */
        get(key) {
            return this._data[key];
        }

        /**
         * Sets a value and applies it
         * @param {string} key - Property name
         * @param {any} value - Value to set
         * @returns {ABase} - This instance for chaining
         */
        set(key, value) {
            this._data[key] = value;
            if (particleRegistry[key]) {
                particleRegistry[key].apply(this._element, value, this._data, this);
            } else {
                defaultHandler(this._element, value, key);
            }
            return this;
        }

        /**
         * Cleanup method - can be called to free resources
         */
        destroy() {
            // Remove from DOM
            if (this._element.parentNode) {
                this._element.parentNode.removeChild(this._element);
            }

            // Remove event listeners
            if (this._element._eventHandlers) {
                for (const [event, handler] of Object.entries(this._element._eventHandlers)) {
                    this._element.removeEventListener(event, handler);
                }
                this._element._eventHandlers = {};
            }

            // Remove from registry
            if (this._data.id) {
                delete atomeRegistry[this._data.id];
            }

            // Clean up references
            this._fastened = null;
            this._data = null;
        }
    }

    /**
     * Creation of the final A class
     */
    const A = function(config) {
        return new ABase(config);
    };

    /**
     * Add static methods to the A constructor
     */

    // Get an instance by ID
    A.getById = function(id) {
        return atomeRegistry[id];
    };

    // Clean up the registry by removing instances that are no longer in the DOM
    A.cleanRegistry = function() {
        for (const id in atomeRegistry) {
            const instance = atomeRegistry[id];
            if (!instance._element || !document.contains(instance._element)) {
                delete atomeRegistry[id];
            }
        }
    };

    /**
     * Expose particle management API
     */

    // Register a new particle
    A.defineParticle = defineParticle;

    // Get a particle from the registry
    A.getParticle = function(name) {
        return particleRegistry[name];
    };

    // List all available particles
    A.listParticles = function() {
        return Object.keys(particleRegistry);
    };

    // List particles by category
    A.listParticlesByCategory = function(category) {
        return Object.entries(particleRegistry)
            .filter(([_, particle]) => particle.category === category)
            .map(([name]) => name);
    };

    // Remove a particle
    A.removeParticle = function(name) {
        if (particleRegistry[name]) {
            delete particleRegistry[name];
            return true;
        }
        return false;
    };


    // Export for use as a module
    window.A = A;
    return A;
})();

export default A;


// Cache global des instances A créées manuellement
const instanceCache = {};

// Fonction pour enregistrer une instance dans le cache
function registerInstance(instance, id) {
    if (id) {
        instanceCache[id] = instance;
        console.log(`Instance '${id}' enregistrée dans le cache`);
    }
}

// Remplacer new A pour qu'il enregistre automatiquement les instances
const originalA = window.A;
window.A = function(config) {
    const instance = new originalA(config);
    if (config && config.id) {
        registerInstance(instance, config.id);
    }
    return instance;
};
// Copier les méthodes statiques
for (const key in originalA) {
    if (originalA.hasOwnProperty(key)) {
        window.A[key] = originalA[key];
    }
}

// Fonction grab qui utilise le cache
function grab(id) {
    // Consulter d'abord le cache pour une correspondance exacte
    if (instanceCache[id]) {
        return instanceCache[id];
    }

    // Si pas dans le cache, essayer A.getById
    if (typeof A !== 'undefined' && typeof A.getById === 'function') {
        const instance = A.getById(id);
        if (instance) {
            return instance;
        }
    }

    // Fallback : retourner l'élément DOM
    return document.getElementById(id);
}

// Exposer globalement
window.grab = grab;
window.registerInstance = registerInstance;



// Enregistrer les instances existantes
// Ajouter après avoir créé container:
// registerInstance(container, 'main_container');