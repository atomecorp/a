/**
 * 🌐 APIS - EXTENSIONS FOR JAVASCRIPT
 * Adding Ruby-like functionalities to JavaScript
 */

// Add the puts method to display in the console
function puts(val) {
    // Log value
}
window.puts = puts;

// Add the grab method to retrieve DOM elements
const grab = (function () {
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

                    this.style[styleProp] = _isNumber(value) ? _formatSize(value) : value;
                    return this;
                };
            });
        }

        // Store in the cache for future calls
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

///////

// 🚀 OPTIMIZED: require() - Support for .sqr and .rb transpilation

const requireCache = new Map();
const loadingFiles = new Set();

window.require = async function(filename) {
    // Check the cache
    if (requireCache.has(filename)) {
        // console.log(`📦 From cache: ${filename}`);
        return requireCache.get(filename);
    }
    
    // Protection against circular imports
    if (loadingFiles.has(filename)) {
        // console.warn(`⚠️ Circular require detected: ${filename}`);
        return null;
    }
    
    loadingFiles.add(filename);
    
    try {
        // Paths to try (like Ruby) - Support .sqr and .rb
        const paths = [
            `./application/${filename}.sqr`,      // Support .sqr
            `./application/${filename}.rb`,       // 🆕 Support .rb
            `./${filename}.sqr`,                  // Support .sqr
            `./${filename}.rb`,                   // 🆕 Support .rb
            `./application/${filename}`,
            `./${filename}`,
            `./vie/${filename}.sqr`,              // Support .sqr
            `./vie/${filename}.rb`,               // 🆕 Support .rb
            `./vie/${filename}`,
        ];
        
        for (const path of paths) {
            try {
                const response = await fetch(path);
                if (response.ok) {
                    const content = await response.text();
                    
                    // Avoid HTML error pages
                    if (!content.trim().startsWith('<!DOCTYPE') && 
                        !content.trim().startsWith('<html')) {
                        
                        let finalCode = content;
                        
                        // 🚀 TRANSPILER if it's a Ruby file (.sqr OR .rb)
                        if (path.endsWith('.sqr') || path.endsWith('.rb')) {
                            // console.log(`🔄 Transpiling Ruby file: ${path}...`);
                            
                            // 🎯 Use SquirrelOrchestrator for all Ruby files
                            if (window.SquirrelOrchestrator) {
                                try {
                                    // console.log(`🦫 Using SquirrelOrchestrator for ${path}...`);
                                    
                                    // Create an instance and process the Ruby file
                                    const orchestrator = new window.SquirrelOrchestrator();
                                    await orchestrator.initializePrism();
                                    
                                    // Parse and transpile the Ruby code
                                    const parseResult = await orchestrator.parseRubyCode(content);
                                    const ast = parseResult.result?.value;
                                    
                                    if (ast && ast.body) {
                                        finalCode = orchestrator.transpilePrismASTToJavaScript(ast);
                                        // console.log(`✅ Successfully transpiled ${path} with SquirrelOrchestrator`);
                                    } else {
                                        throw new Error('No AST generated');
                                    }
                                    
                                } catch (error) {
                                    console.error(`❌ SquirrelOrchestrator failed for ${path}:`, error);
                                    // console.warn(`⚠️ Executing raw Ruby code for ${path}`);
                                    // If the transpiler fails, try executing the code as is
                                    finalCode = `// Raw Ruby code from ${path}\n${content}`;
                                }
                            } else {
                                console.error(`❌ No SquirrelOrchestrator available for ${path}`);
                                finalCode = `// No transpiler available for ${path}\n${content}`;
                            }
                            
                            // console.log(`✅ Processed ${path}`);
                        }
                        
                        // Execute the transpiled code
                        if (window.executeCode && typeof window.executeCode === 'function') {
                            window.executeCode(finalCode);
                        } else {
                            eval(finalCode);
                        }
                        
                        // Cache the result
                        requireCache.set(filename, path);
                        
                        // console.log(`✅ Successfully required: ${path}`);
                        return path;
                    }
                }
            } catch (e) {
                // console.log(`❌ Failed to load ${path}:`, e.message);
            }
        }
        
        console.error(`❌ File not found: ${filename}`);
        return null;
        
    } finally {
        loadingFiles.delete(filename);
    }
};

// Declare functions at top level for ES6 export
const requireFile = window.require;

// Alias for compatibility
window.load = window.require;

const log = function(message) {
    // Alert message
};
window.log = log;

// Export for ES6 modules
export { puts, wait, grab, requireFile, log };