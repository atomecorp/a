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

///////

// 🚀 OPTIMIZED: require() - Support for .sqr and .rb transpilation

const requireCache = new Map();
const loadingFiles = new Set();

window.require = async function(filename) {
    // Vérifier le cache
    if (requireCache.has(filename)) {
        console.log(`📦 From cache: ${filename}`);
        return requireCache.get(filename);
    }
    
    // Protection contre les imports circulaires
    if (loadingFiles.has(filename)) {
        console.warn(`⚠️ Circular require detected: ${filename}`);
        return null;
    }
    
    loadingFiles.add(filename);
    
    try {
        // Chemins à essayer (comme Ruby) - Support .sqr et .rb
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
                    
                    // Éviter les pages d'erreur HTML
                    if (!content.trim().startsWith('<!DOCTYPE') && 
                        !content.trim().startsWith('<html')) {
                        
                        let finalCode = content;
                        
                        // 🚀 TRANSPILER si c'est un fichier Ruby (.sqr OU .rb)
                        if (path.endsWith('.sqr') || path.endsWith('.rb')) {
                            console.log(`🔄 Transpiling Ruby file: ${path}...`);
                            
                            // 🎯 Utiliser SquirrelOrchestrator pour tous les fichiers Ruby
                            if (window.SquirrelOrchestrator) {
                                try {
                                    console.log(`🦫 Using SquirrelOrchestrator for ${path}...`);
                                    
                                    // Créer une instance et traiter le fichier Ruby
                                    const orchestrator = new window.SquirrelOrchestrator();
                                    await orchestrator.initializePrism();
                                    
                                    // Parser et transpiler le code Ruby
                                    const parseResult = await orchestrator.parseRubyCode(content);
                                    const ast = parseResult.result?.value;
                                    
                                    if (ast && ast.body) {
                                        finalCode = orchestrator.transpilePrismASTToJavaScript(ast);
                                        console.log(`✅ Successfully transpiled ${path} with SquirrelOrchestrator`);
                                    } else {
                                        throw new Error('No AST generated');
                                    }
                                    
                                } catch (error) {
                                    console.error(`❌ SquirrelOrchestrator failed for ${path}:`, error);
                                    console.warn(`⚠️ Executing raw Ruby code for ${path}`);
                                    // Si le transpiler échoue, essayer d'exécuter le code tel quel
                                    finalCode = `// Raw Ruby code from ${path}\n${content}`;
                                }
                            } else {
                                console.error(`❌ No SquirrelOrchestrator available for ${path}`);
                                finalCode = `// No transpiler available for ${path}\n${content}`;
                            }
                            
                            console.log(`✅ Processed ${path}`);
                        }
                        
                        // Exécuter le code transpilé
                        if (window.executeCode && typeof window.executeCode === 'function') {
                            window.executeCode(finalCode);
                        } else {
                            eval(finalCode);
                        }
                        
                        // Mettre en cache
                        requireCache.set(filename, path);
                        
                        console.log(`✅ Successfully required: ${path}`);
                        return path;
                    }
                }
            } catch (e) {
                console.log(`❌ Failed to load ${path}:`, e.message);
            }
        }
        
        console.error(`❌ File not found: ${filename}`);
        return null;
        
    } finally {
        loadingFiles.delete(filename);
    }
};

// Code cleaned up - .sqh support removed

// Alias pour compatibilité
window.load = window.require;

window.log = function(message) {
    console.log(message);
};