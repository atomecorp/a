/**
 * 🔥 FINAL CLASS A - ORIGINAL ARCHITECTURE + SMART PROXY
 * FIXED VERSION - Without problematic ES6 exports
 */

(function() {
    'use strict';

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
    window._isNumber = _isNumber;

    // Isolated formatSize function
    _formatSize = (function () {
        const cache = new Map();
        return function (v) {
            if (!_isNumber(v)) return v;
            if (v >= 0 && v <= 1000 && v === Math.floor(v)) {
                if (!cache.has(v)) {
                    cache.set(v, `${v}px`);
                }
                return cache.get(v);
            }
            return `${v}px`;
        };
    })();
    window._formatSize = _formatSize;

    // Global registry for instances
    _registry = {};
    window._registry = _registry;

    // Registry for particles
    _particles = {};
    window._particles = _particles;

    // Isolated defineParticle function
    defineParticle = function (config) {
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

    // 🔥 CLASS A - ORIGINAL ARCHITECTURE + SMART PROXY
    A = class {
        constructor(config = {}) {
            this._data = {...config};
            this.element = document.createElement(config.markup || 'div');
            this._fastened = config.fasten || [];
            this.style = this.element.style;
            this.dataset = this.element.dataset;

            // Apply base styles
            if (config.reset !== false) {
                Object.assign(this.style, baseStyles);
            }

            // 🎯 ORIGINAL ARCHITECTURE: Prepare all methods dynamically
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
                        smartProperty.valueOf = () => target._data[prop];
                        smartProperty.toString = () => String(target._data[prop]);
                        
                        // For comparisons and operations
                        smartProperty[Symbol.toPrimitive] = (hint) => {
                            const val = target._data[prop];
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
            const cssProperties = [
                'width', 'height', 'x', 'y', 'color', 'id', 'text', 'backgroundColor',
                'zIndex', 'opacity', 'transform', 'transition', 'display',
                'attrContenteditable', 'contentEditable'
            ];
            
            cssProperties.forEach(prop => {
                if (typeof this[prop] === 'function' || reservedMethods.includes(prop)) return;

                this[prop] = function (value) {
                    if (arguments.length === 0) return this._data[prop];

                    this._data[prop] = value;

                    // Apply changes to DOM
                    const styleUpdates = {};
                    const datasetUpdates = {};

                    this._collectPropertyUpdates(prop, value, styleUpdates, datasetUpdates);

                    if (Object.keys(styleUpdates).length > 0) {
                        Object.assign(this.element.style, styleUpdates);
                    }
                    if (Object.keys(datasetUpdates).length > 0) {
                        Object.assign(this.element.dataset, datasetUpdates);
                    }

                    // Special cases
                    if (prop === 'attrContenteditable' || prop === 'contentEditable') {
                        this.element.contentEditable = value;
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
                        particle.process(this.element, value, config, this);
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
                Object.assign(this.element.style, styleUpdates);
            }
            if (Object.keys(datasetUpdates).length > 0) {
                Object.assign(this.element.dataset, datasetUpdates);
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
                    return this._data[key];
                }

                this._data[key] = value;

                if (hasParticle) {
                    try {
                        particle.process(this.element, value, this._data, this);
                    } catch (err) {
                        console.error(`Error calling particle ${key}:`, err);
                    }
                } else {
                    const styleUpdates = {};
                    const datasetUpdates = {};
                    this._collectPropertyUpdates(key, value, styleUpdates, datasetUpdates);

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

        _collectPropertyUpdates(key, value, styleUpdates, datasetUpdates) {
            // Handle special cases first
            switch(key) {
                case 'width':
                    styleUpdates.width = _formatSize(value);
                    return;
                case 'height':
                    styleUpdates.height = _formatSize(value);
                    return;
                case 'x':
                    styleUpdates.left = _formatSize(value);
                    return;
                case 'y':
                    styleUpdates.top = _formatSize(value);
                    return;
                case 'color':
                case 'backgroundColor':
                    styleUpdates.backgroundColor = value;
                    return;
                case 'id':
                    this.element.id = value;
                    if (value) _registry[value] = this;
                    return;
                case 'text':
                    this.element.textContent = value;
                    return;
            }

            // Generic handling
            if (typeof value === 'number') {
                styleUpdates[key] = _formatSize(value);
            } else if (typeof value === 'string') {
                styleUpdates[key] = value;
            } else if (Array.isArray(value)) {
                datasetUpdates[key] = value.join(',');
            } else if (value instanceof HTMLElement) {
                this.element.appendChild(value);
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

        // === EVENT METHODS ===
        onclick(callback) {
            this.element.addEventListener('click', callback);
            return this;
        }
        
        onmouseover(callback) {
            this.element.addEventListener('mouseover', callback);
            return this;
        }
        
        onmouseout(callback) {
            this.element.addEventListener('mouseout', callback);
            return this;
        }

        // Public API
        getElement() { return this.element; }
        getFastened() { return this._fastened.map(id => _registry[id]).filter(Boolean); }

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

    // Notify that A framework is loaded
    window.dispatchEvent(new CustomEvent('AFrameworkLoaded'));
    
    // console.log('✅ A Framework loaded with defineParticle');

})();