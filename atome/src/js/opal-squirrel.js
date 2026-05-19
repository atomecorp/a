/**
 * Opal-Squirrel Bridge v3
 * 
 * 100% JavaScript - NO BACKTICKS in Ruby code!
 * Defines Ruby classes entirely in JavaScript using Opal's internal API.
 * 
 * Usage in Ruby:
 *   box = Squirrel.create('div', id: 'my-box', css: { background_color: 'red' })
 *   box.on(:click) { puts "Clicked!" }
 *   box.css[:background_color] = 'blue'
 */

(function (global) {
    'use strict';

    function initBridge() {
        if (typeof Opal === 'undefined') {
            setTimeout(initBridge, 50);
            return;
        }

        console.log('[opal-squirrel] Initializing bridge (no backticks)...');

        // Helper: Convert Ruby symbol/string to JS string
        function toStr(val) {
            if (val && val.$$is_symbol) return val.toString();
            if (val && typeof val.$to_s === 'function') return val.$to_s();
            return String(val);
        }

        // Helper: Convert snake_case to camelCase
        function toCamelCase(str) {
            return str.replace(/_([a-z])/g, function (g) { return g[1].toUpperCase(); });
        }

        // Helper: Convert Opal Hash to JS Object
        function hashToObj(hash) {
            if (!hash || hash === Opal.nil) return {};
            if (!hash.$$is_hash) return hash;

            var result = {};
            var keys = hash.$keys();
            for (var i = 0; i < keys.length; i++) {
                var key = keys[i];
                var jsKey = toCamelCase(toStr(key));
                var value = hash.$fetch(key, Opal.nil);
                if (value && value.$$is_hash) {
                    result[jsKey] = hashToObj(value);
                } else if (value !== Opal.nil) {
                    result[jsKey] = value;
                }
            }
            return result;
        }

        // ═══════════════════════════════════════════════════════════════════════
        // CSSProxy Class
        // ═══════════════════════════════════════════════════════════════════════

        var CSSProxy = Opal.klass(Opal.Object, Opal.Object, 'CSSProxy', function () { });

        Opal.defn(CSSProxy, '$initialize', function (nativeEl) {
            this.native = nativeEl;
            return this;
        });

        Opal.defn(CSSProxy, '$[]', function (prop) {
            var jsProp = toCamelCase(toStr(prop));
            return this.native.style[jsProp] || getComputedStyle(this.native)[jsProp] || Opal.nil;
        });

        Opal.defn(CSSProxy, '$[]=', function (prop, value) {
            var jsProp = toCamelCase(toStr(prop));
            this.native.style[jsProp] = value;
            return value;
        });

        // ═══════════════════════════════════════════════════════════════════════
        // Element Class
        // ═══════════════════════════════════════════════════════════════════════

        var Element = Opal.klass(Opal.Object, Opal.Object, 'SquirrelElement', function () { });

        Opal.defn(Element, '$initialize', function (nativeEl) {
            this.native = nativeEl;
            this.cssProxy = null;
            return this;
        });

        Opal.defn(Element, '$native', function () {
            return this.native;
        });

        // ID
        Opal.defn(Element, '$id', function () {
            return this.native.id || Opal.nil;
        });

        Opal.defn(Element, '$id=', function (val) {
            this.native.id = val;
            return val;
        });

        // Text
        Opal.defn(Element, '$text', function () {
            return this.native.textContent || Opal.nil;
        });

        Opal.defn(Element, '$text=', function (val) {
            this.native.textContent = val;
            return val;
        });

        // HTML
        Opal.defn(Element, '$html', function () {
            return this.native.innerHTML || Opal.nil;
        });

        Opal.defn(Element, '$html=', function (val) {
            this.native.innerHTML = val;
            return val;
        });

        // CSS Proxy
        Opal.defn(Element, '$css', function () {
            if (!this.cssProxy) {
                this.cssProxy = CSSProxy.$new(this.native);
            }
            return this.cssProxy;
        });

        // Set multiple CSS at once
        Opal.defn(Element, '$set_css', function (props) {
            var self = this;
            var obj = hashToObj(props);
            Object.keys(obj).forEach(function (key) {
                self.native.style[key] = obj[key];
            });
            return this;
        });

        // Event listener - handles Ruby blocks properly
        Opal.defn(Element, '$on', function $$on(event) {
            var block = $$on.$$p || null;
            $$on.$$p = null;

            var self = this;
            var eventName = toStr(event);

            this.native.addEventListener(eventName, function (e) {
                if (block) {
                    try {
                        // Pass event info to block if it accepts arguments
                        block.$call();
                    } catch (err) {
                        console.error('[opal-squirrel] Event handler error:', err);
                    }
                }
            });
            return this;
        });

        // Drag support
        Opal.defn(Element, '$make_draggable', function $$makeDraggable() {
            var block = $$makeDraggable.$$p || null;
            $$makeDraggable.$$p = null;

            var self = this;
            var el = this.native;
            var isDragging = false;
            var offsetX = 0, offsetY = 0;

            el.style.cursor = 'grab';

            el.addEventListener('mousedown', function (e) {
                isDragging = true;
                offsetX = e.clientX - el.offsetLeft;
                offsetY = e.clientY - el.offsetTop;
                el.style.cursor = 'grabbing';
                e.preventDefault();
            });

            document.addEventListener('mousemove', function (e) {
                if (!isDragging) return;
                var newX = e.clientX - offsetX;
                var newY = e.clientY - offsetY;
                el.style.left = newX + 'px';
                el.style.top = newY + 'px';

                if (block) {
                    try {
                        block.$call(newX, newY);
                    } catch (err) {
                        console.error('[opal-squirrel] Drag callback error:', err);
                    }
                }
            });

            document.addEventListener('mouseup', function () {
                if (isDragging) {
                    isDragging = false;
                    el.style.cursor = 'grab';
                }
            });

            return this;
        });

        // Show/Hide
        Opal.defn(Element, '$show', function () {
            this.native.style.display = '';
            return this;
        });

        Opal.defn(Element, '$hide', function () {
            this.native.style.display = 'none';
            return this;
        });

        Opal.defn(Element, '$toggle', function () {
            if (this.native.style.display === 'none') {
                this.native.style.display = '';
            } else {
                this.native.style.display = 'none';
            }
            return this;
        });

        // Remove
        Opal.defn(Element, '$remove', function () {
            if (this.native.parentNode) {
                this.native.parentNode.removeChild(this.native);
            }
            return this;
        });

        // Append
        Opal.defn(Element, '$append', function (child) {
            if (child.native) {
                this.native.appendChild(child.native);
            } else {
                this.native.appendChild(child);
            }
            return this;
        });

        // Attributes
        Opal.defn(Element, '$[]', function (attr) {
            return this.native.getAttribute(toStr(attr)) || Opal.nil;
        });

        Opal.defn(Element, '$[]=', function (attr, value) {
            this.native.setAttribute(toStr(attr), value);
            return value;
        });

        // Classes
        Opal.defn(Element, '$add_class', function (cls) {
            this.native.classList.add(cls);
            return this;
        });

        Opal.defn(Element, '$remove_class', function (cls) {
            this.native.classList.remove(cls);
            return this;
        });

        Opal.defn(Element, '$toggle_class', function (cls) {
            this.native.classList.toggle(cls);
            return this;
        });

        Opal.defn(Element, '$has_class?', function (cls) {
            return this.native.classList.contains(cls);
        });

        // Position/Size
        Opal.defn(Element, '$left', function () {
            return this.native.offsetLeft;
        });

        Opal.defn(Element, '$left=', function (val) {
            this.native.style.left = (typeof val === 'number') ? val + 'px' : val;
            return val;
        });

        Opal.defn(Element, '$top', function () {
            return this.native.offsetTop;
        });

        Opal.defn(Element, '$top=', function (val) {
            this.native.style.top = (typeof val === 'number') ? val + 'px' : val;
            return val;
        });

        Opal.defn(Element, '$width', function () {
            return this.native.offsetWidth;
        });

        Opal.defn(Element, '$width=', function (val) {
            this.native.style.width = (typeof val === 'number') ? val + 'px' : val;
            return val;
        });

        Opal.defn(Element, '$height', function () {
            return this.native.offsetHeight;
        });

        Opal.defn(Element, '$height=', function (val) {
            this.native.style.height = (typeof val === 'number') ? val + 'px' : val;
            return val;
        });

        // Focus/Blur
        Opal.defn(Element, '$focus', function () {
            this.native.focus();
            return this;
        });

        Opal.defn(Element, '$blur', function () {
            this.native.blur();
            return this;
        });

        // Inspect
        Opal.defn(Element, '$inspect', function () {
            return "#<SquirrelElement id=\"" + (this.native.id || '') + "\">";
        });

        // ═══════════════════════════════════════════════════════════════════════
        // Squirrel Module
        // ═══════════════════════════════════════════════════════════════════════

        var Squirrel = Opal.module(Opal.Object, 'Squirrel', function () { });

        // Store references
        Opal.const_set(Squirrel, 'Element', Element);
        Opal.const_set(Squirrel, 'CSSProxy', CSSProxy);

        // Squirrel.create
        var createFn = function (tag, options) {
            if (options === undefined) options = Opal.hash();

            var opts = hashToObj(options);
            var el = document.createElement(tag);

            if (opts.id) el.id = opts.id;
            if (opts.text) el.textContent = opts.text;
            if (opts.html) el.innerHTML = opts.html;
            if (opts.className || opts.class) el.className = opts.className || opts.class;

            if (opts.css) {
                Object.keys(opts.css).forEach(function (key) {
                    el.style[key] = opts.css[key];
                });
            }

            // Support both 'attach' and 'parent' options
            var parent = opts.attach || opts.parent;
            if (parent) {
                var parentEl;
                if (typeof parent === 'string') {
                    // Support both '#id' and 'id' formats
                    parentEl = document.querySelector(parent) || document.getElementById(parent.replace('#', ''));
                } else if (parent.native) {
                    parentEl = parent.native;
                } else {
                    parentEl = parent;
                }
                if (parentEl) {
                    parentEl.appendChild(el);
                } else {
                    console.warn('[opal-squirrel] Parent not found:', parent);
                    document.getElementById('view')?.appendChild(el) || document.body.appendChild(el);
                }
            } else {
                // Default: attach to #view (Squirrel's main container) or body
                var view = document.getElementById('view') || document.body;
                view.appendChild(el);
            }

            return Element.$new(el);
        };

        Squirrel.$create = createFn;
        Squirrel.create = createFn;
        Opal.defs(Squirrel, '$create', createFn);

        // Squirrel.find
        var findFn = function (selector) {
            var el = document.querySelector(selector);
            return el ? Element.$new(el) : Opal.nil;
        };

        Squirrel.$find = findFn;
        Squirrel.find = findFn;
        Opal.defs(Squirrel, '$find', findFn);

        // Squirrel.find_all
        var findAllFn = function (selector) {
            var els = document.querySelectorAll(selector);
            var result = [];
            for (var i = 0; i < els.length; i++) {
                result.push(Element.$new(els[i]));
            }
            return result;
        };

        Squirrel.$find_all = findAllFn;
        Squirrel.find_all = findAllFn;
        Opal.defs(Squirrel, '$find_all', findAllFn);

        // Squirrel.grab (by ID)
        var grabFn = function (id) {
            var el = document.getElementById(id);
            return el ? Element.$new(el) : Opal.nil;
        };

        Squirrel.$grab = grabFn;
        Squirrel.grab = grabFn;
        Opal.defs(Squirrel, '$grab', grabFn);

        // Make globally accessible
        Opal.const_set(Opal.Object, 'Squirrel', Squirrel);
        global.OpalSquirrel = Squirrel;

        console.log('[opal-squirrel] Bridge initialized ✓ (no backticks required!)');
    }

    // Start initialization
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initBridge);
    } else {
        initBridge();
    }

})(typeof window !== 'undefined' ? window : this);
