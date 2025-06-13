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

// Add a wait function for delays
function wait(delay, callback) {
    if (typeof callback === 'function') {
        setTimeout(callback, delay);
    } else {
        console.warn('wait() requires a callback function');
    }
}
window.wait = wait;

// Add log function
window.log = function(message) {
    console.log(message);
};

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

// 🚀 MINIMAL require() - Support for .sqr transpilation only

const requireCache = new Map();
const loadingFiles = new Set();

window.require = async function(filename) {
    // Check the cache
    if (requireCache.has(filename)) {
        return requireCache.get(filename);
    }
    
    // Protection against circular imports
    if (loadingFiles.has(filename)) {
        return null;
    }
    
    loadingFiles.add(filename);
    
    try {
        // Single entry point: only index.sqr is allowed
        const path = `./application/index.sqr`;
        
        try {
            const response = await fetch(path);
            if (response.ok) {
                const content = await response.text();
                
                // Avoid HTML error pages
                if (!content.trim().startsWith('<!DOCTYPE') && 
                    !content.trim().startsWith('<html')) {
                    
                    let finalCode = content;
                    
                    // 🚀 TRANSPILER using Prism AST only
                    if (window.SquirrelOrchestrator) {
                        try {
                            // Create an instance and process the Ruby file
                            const orchestrator = new window.SquirrelOrchestrator();
                            await orchestrator.initializePrism();
                            
                            // Parse and transpile the Ruby code using Prism AST
                            const parseResult = await orchestrator.parseRubyCode(content);
                            const ast = parseResult.result?.value;
                            
                            if (ast && ast.body) {
                                // Generate pure native JavaScript (no abstractions)
                                finalCode = orchestrator.transpilePrismASTToJavaScript(ast);
                                
                                // Verify contenteditable property transpilation
                                if (finalCode.includes('contenteditable')) {
                                    document.title = '✅ Squirrel - Contenteditable Detected!';
                                } else {
                                    document.title = '❌ Squirrel - Missing Contenteditable';
                                }
                            } else {
                                throw new Error('No AST generated');
                            }
                            
                        } catch (error) {
                            console.error(`❌ SquirrelOrchestrator failed for ${path}:`, error);
                            console.error(`❌ Error details:`, error.message);
                            console.error(`❌ Error stack:`, error.stack);
                            // If the transpiler fails, comment out the code
                            finalCode = `// Transpilation failed for ${path}: ${error.message}\n// ${content.split('\n').map(line => '// ' + line).join('\n')}`;
                        }
                    } else {
                        console.error(`❌ No SquirrelOrchestrator available for ${path}`);
                        finalCode = `// No transpiler available for ${path}\n${content}`;
                    }
                    
                    // Execute the pure JavaScript code
                    eval(finalCode);
                    
                    // Visual confirmation of success
                    document.title = '✅ Squirrel - Transpilation Success!';
                    
                    // Cache the result
                    requireCache.set(filename, path);
                    
                    return path;
                }
            }
        } catch (e) {
            console.error(`❌ Failed to load ${path}:`, e.message);
        }
        
        console.error(`❌ File not found: ${filename}`);
        return null;
        
    } finally {
        loadingFiles.delete(filename);
    }
};

// Alias for compatibility
window.load = window.require;

// Export for ES6 modules
export { };