/**
 * 🚀 FINAL CLASS A - OPTIMIZED ARCHITECTURE + SMART PROXY
 * PERFORMANCE ENHANCED VERSION with caching, lazy loading, and monitoring
 */

(function() {
    'use strict';

    // Import optimizations
    let DOMCache, EventManager, aInstanceCache, perfMonitor, moduleLoader;
    
    // Try to import optimizations if available
    try {
        if (typeof window !== 'undefined') {
            DOMCache = window.DOMCache;
            EventManager = window.EventManager;
            aInstanceCache = window.aInstanceCache;
            perfMonitor = window.perfMonitor;
            moduleLoader = window.moduleLoader;
        }
    } catch (e) {
        // Fallback if optimizations not loaded
        console.warn('Performance optimizations not loaded, using basic implementation');
    }

    // Export main variables for ES6
    let A, defineParticle;

    // Variables to expose for external particle definitions
    let _formatSize, _isNumber, _registry, _particles;

    // Global cache instances
    const domCache = DOMCache ? new DOMCache() : null;
    const eventManager = EventManager ? new EventManager() : null;

    // Performance-optimized isNumber function
    _isNumber = (function () {
        const cache = new Map();
        return function (v) {
            if (cache.has(v)) return cache.get(v);
            const result = typeof v === 'number';
            if (cache.size < 1000) cache.set(v, result); // Limit cache size
            return result;
        };
    })();
    window._isNumber = _isNumber;

    // Performance-optimized formatSize function
    _formatSize = (function () {
        const cache = new Map();
        return function (v) {
            if (!_isNumber(v)) return v;
            
            // Use cache for common values
            if (cache.has(v)) return cache.get(v);
            
            const result = v >= 0 && v <= 1000 && v === Math.floor(v) 
                ? `${v}px` 
                : `${v}px`;
                
            if (cache.size < 1000) cache.set(v, result); // Limit cache size
            return result;
        };
    })();
    window._formatSize = _formatSize;

    // Global registry for instances with performance tracking
    _registry = {};
    window._registry = _registry;

    // Registry for particles with lazy loading support
    _particles = new Proxy({}, {
        get(target, prop) {
            if (!(prop in target) && moduleLoader) {
                // Try to lazy load particle
                moduleLoader.loadParticles(prop).catch(() => {
                    console.warn(`Particle category '${prop}' not found`);
                });
            }
            return target[prop];
        }
    });
    window._particles = _particles;

    // Performance-optimized defineParticle function
    defineParticle = function (config) {
        if (!config || !config.name || !config.process || typeof config.process !== 'function') {
            console.error("Invalid particle definition:", config);
            return null;
        }
        
        // Track particle creation for performance monitoring
        if (perfMonitor) {
            perfMonitor.trackParticleCreation(config.name);
        }
        
        // Optimize particle process function for frequent calls
        const originalProcess = config.process;
        config.process = function(el, v, data, instance) {
            const startTime = performance.now();
            try {
                return originalProcess.call(this, el, v, data, instance);
            } finally {
                // Track particle execution time
                if (perfMonitor) {
                    const duration = performance.now() - startTime;
                    if (duration > 1) { // Only track slow operations
                        perfMonitor.trackOperation(`particle:${config.name}`, () => {}, duration);
                    }
                }
            }
        };
        
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

    // 🚀 CLASS A - OPTIMIZED ARCHITECTURE + SMART PROXY
    A = class {
        constructor(config = {}) {
            const startTime = performance.now();
            
            // Check instance cache first
            if (aInstanceCache) {
                const cached = aInstanceCache.getByElement(config.element);
                if (cached) {
                    perfMonitor?.trackInstanceOperation('constructor', performance.now() - startTime, true);
                    return cached;
                }
            }
            
            this.particles = {...config};
            this.html_object = config.element || document.createElement(config.markup || 'div');
            this._fastened = config.fasten || [];
            this.style = this.html_object.style;
            this.dataset = this.html_object.dataset;
            this._observers = []; // Track observers for cleanup
            this._bindings = new Map(); // Track bindings for performance

            // Use cached DOM operations
            if (domCache) {
                this._domCache = domCache;
            }

            // Apply base styles with batching
            if (config.reset !== false) {
                this._applyBaseStyles();
            }

            // 🎯 OPTIMIZED ARCHITECTURE: Prepare all methods dynamically with caching
            this._preparePropertyMethods();

            // Process all properties with performance tracking
            if (perfMonitor) {
                perfMonitor.trackRender('A.constructor', () => {
                    this._processConfig(config);
                });
            } else {
                this._processConfig(config);
            }
            
            // Register with instance cache
            if (aInstanceCache && this.html_object) {
                aInstanceCache.registerWithElement(this.html_object, this);
            }
            
            // Track construction time
            if (perfMonitor) {
                perfMonitor.trackInstanceOperation('constructor', performance.now() - startTime, false);
            }

            // Attach element if needed
            if (config.attach) {
                this._handleAttach(config.attach);
            }

            // Register instance if it has an ID
            if (config.id) {
                _registry[config.id] = this;
            }

            // 🎯 SMART PROXY - WRAPPER AROUND EXISTING ARCHITECTURE
            return new Proxy(this, {
                get(target, prop) {
                    const value = target[prop];
                    
                    // If it's a method AND a Ruby-style property
                    if (typeof value === 'function' && target._isRubyProperty(prop)) {
                        // Create a magic function that can be used as a value OR function
                        const smartProperty = function(...args) {
                            return value.apply(target, args);
                        };
                        
                        // 🎯 MAGIC: valueOf and toString return the value directly
                        smartProperty.valueOf = () => target.particles[prop];
                        smartProperty.toString = () => String(target.particles[prop]);
                        
                        // For comparisons and operations
                        smartProperty[Symbol.toPrimitive] = (hint) => {
                            const val = target.particles[prop];
                            if (hint === 'number') return Number(val);
                            if (hint === 'string') return String(val);
                            return val;
                        };
                        
                        return smartProperty;
                    }
                    
                    // Normal property - return as is
                    return value;
                }
            });
        }

        // Check if it's a Ruby-style property
        _isRubyProperty(prop) {
            const rubyProps = ['width', 'height', 'x', 'y', 'color', 'id', 'text', 'backgroundColor'];
            return rubyProps.includes(prop);
        }

        // 🔥 ORIGINAL ARCHITECTURE: Pre-instantiate methods for all known particles
        _preparePropertyMethods() {
            // List of methods not to create
            const reservedMethods = [
                'inspect', 'addChild', 'getElement', 'getFastened', 'style', 'element', 'method'
            ];

            // Create methods for all known particles
            for (const name in _particles) {
                if (reservedMethods.includes(name) || typeof this[name] === 'function') continue;

                const particle = _particles[name];
                this[name] = function (value) {
                    if (arguments.length === 0) return this.particles[name];

                    this.particles[name] = value;

                    try {
                        particle.process(this.html_object, value, this.particles, this);
                    } catch (err) {
                        console.error(`Error when calling particle ${name}:`, err);
                    }

                    return this;
                };
            }

            // Additionally add methods for standard CSS properties without particles
            const cssProperties = [
                'attrContenteditable', 'contentEditable', 'contenteditable'
            ];
            
            cssProperties.forEach(prop => {
                if (typeof this[prop] === 'function' || reservedMethods.includes(prop)) return;

                this[prop] = function (value) {
                    if (arguments.length === 0) return this.particles[prop];

                    this.particles[prop] = value;

                    // Special cases for contenteditable
                    if (prop === 'attrContenteditable' || prop === 'contentEditable') {
                        this.html_object.contentEditable = value;
                    } else if (prop === 'contenteditable') {
                        this.html_object.contentEditable = value;
                    }

                    return this;
                };
            });
        }

        // === RUBY method() ===
        method(propertyName) {
            const prop = propertyName.replace(':', '');
            
            if (typeof this[prop] === 'function') {
                return this[prop].bind(this);
            }
            
            throw new Error(`Method ${prop} not found`);
        }

        // Process all properties
        _processConfig(config) {
            const styleUpdates = {};
            const datasetUpdates = {};

            for (const [key, value] of Object.entries(config)) {
                if (key === 'fasten' || key === 'reset') continue;

                const particle = _particles[key];
                if (particle) {
                    try {
                        particle.process(this.html_object, value, config, this);
                    } catch (err) {
                        console.error(`Error processing particle ${key}:`, err);
                    }
                } else {
                    this._collectPropertyUpdates(key, value, styleUpdates, datasetUpdates);
                }

                // Create a method for this property if it doesn't already exist
                if (typeof this[key] !== 'function' && !this.hasOwnProperty(key)) {
                    this._createPropertyMethod(key);
                }
            }

            if (Object.keys(styleUpdates).length > 0) {
                Object.assign(this.html_object.style, styleUpdates);
            }
            if (Object.keys(datasetUpdates).length > 0) {
                Object.assign(this.html_object.dataset, datasetUpdates);
            }
        }

        // Create a getter/setter method for a property (ORIGINAL ARCHITECTURE)
        _createPropertyMethod(key) {
            const reservedMethods = ['inspect', 'addChild', 'getElement', 'method'];
            
            if (reservedMethods.includes(key) || typeof this[key] === 'function') {
                return;
            }

            const particle = _particles[key];
            const hasParticle = !!particle;

            this[key] = function (value) {
                if (arguments.length === 0) {
                    return this.particles[key];
                }

                this.particles[key] = value;

                if (hasParticle) {
                    try {
                        particle.process(this.html_object, value, this.particles, this);
                    } catch (err) {
                        console.error(`Error calling particle ${key}:`, err);
                    }
                } else {
                    const styleUpdates = {};
                    const datasetUpdates = {};
                    this._collectPropertyUpdates(key, value, styleUpdates, datasetUpdates);

                    if (Object.keys(styleUpdates).length > 0) {
                        Object.assign(this.html_object.style, styleUpdates);
                    }
                    if (Object.keys(datasetUpdates).length > 0) {
                        Object.assign(this.html_object.dataset, datasetUpdates);
                    }
                }

                return this;
            };
        }

        _collectPropertyUpdates(key, value, styleUpdates, datasetUpdates) {
            // Check if there's a particle for this property
            const particle = _particles[key];
            if (particle) {
                try {
                    particle.process(this.html_object, value, this.particles, this);
                    return;
                } catch (err) {
                    console.error(`Error processing particle ${key}:`, err);
                }
            }

            // Generic handling for non-particle properties
            if (typeof value === 'number') {
                styleUpdates[key] = _formatSize(value);
            } else if (typeof value === 'string') {
                styleUpdates[key] = value;
            } else if (Array.isArray(value)) {
                datasetUpdates[key] = value.join(',');
            } else if (value instanceof HTMLElement) {
                this.html_object.appendChild(value);
            } else if (value && typeof value === 'object') {
                datasetUpdates[key] = JSON.stringify(value);
            }
        }

        _handleAttach(value) {
            if (document.readyState === 'complete' || document.readyState === 'interactive') {
                this._performAttach(value);
            } else {
                requestAnimationFrame(() => this._performAttach(value));
            }
        }

        _performAttach(value) {
            if (this.html_object.parentNode) return;

            let parent;
            if (typeof value === 'string') {
                parent = document.querySelector(value) || document.body;
            } else if (value instanceof HTMLElement) {
                parent = value;
            } else {
                parent = document.body;
            }

            parent.appendChild(this.html_object);
        }

        // Optimized base styles application
        _applyBaseStyles() {
            if (this._domCache) {
                this._domCache.batchUpdate(this.html_object, () => {
                    Object.assign(this.style, baseStyles);
                });
            } else {
                Object.assign(this.style, baseStyles);
            }
        }

        // Enhanced cleanup for memory management
        destroy() {
            // Cleanup observers
            this._observers.forEach(observer => {
                if (observer && typeof observer.disconnect === 'function') {
                    observer.disconnect();
                }
            });
            this._observers = [];

            // Cleanup event listeners
            if (eventManager) {
                eventManager.cleanupElement(this.html_object);
            }

            // Clear bindings
            this._bindings.clear();

            // Remove from registry
            Object.keys(_registry).forEach(key => {
                if (_registry[key] === this) {
                    delete _registry[key];
                }
            });

            // Return to instance cache if possible
            if (aInstanceCache) {
                aInstanceCache.returnToPool(this);
            }

            // Remove from DOM
            if (this.html_object && this.html_object.parentNode) {
                this.html_object.parentNode.removeChild(this.html_object);
            }
        }

        // === EVENT METHODS ===
        onclick(callback) {
            this.html_object.addEventListener('click', callback);
            return this;
        }
        
        onmouseover(callback) {
            this.html_object.addEventListener('mouseover', callback);
            return this;
        }
        
        onmouseout(callback) {
            this.html_object.addEventListener('mouseout', callback);
            return this;
        }

        // Public API
        getElement() { return this.html_object; }
        getFastened() { return this._fastened.map(id => _registry[id]).filter(Boolean); }

        addChild(childConfig) {
            if (childConfig instanceof A) {
                this.html_object.appendChild(childConfig.getElement());
                if (childConfig.particles.id) {
                    this._fastened.push(childConfig.particles.id);
                }
                return childConfig;
            }

            const child = new A({...childConfig, attach: this.html_object});
            if (childConfig.id) {
                this._fastened.push(childConfig.id);
            }
            return child;
        }

        inspect() {
            console.group('A Instance');
            // Debug information
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

    // Export for ES6 modules
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { A, defineParticle };
    }

    // Notify that A framework is loaded
    window.dispatchEvent(new CustomEvent('AFrameworkLoaded'));
    


})();

// ES6 export
export default window.A;