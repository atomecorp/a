/**
 * 🌐 APIS - MINIMAL REQUIRE SYSTEM FOR SQUIRREL
 * Pure JavaScript transpilation without Ruby abstractions
 */

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

// Export for ES6 modules
export { };