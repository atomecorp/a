// 🚀 FINAL Ultra-Optimized Ruby Transpiler with Execution

let parser;

// Debug console helper (disabled by default)
function debugLog(message) {
    console.log(message);
    // Debug console disabled to avoid visual pollution
    // Uncomment the lines below if you need visual debugging
    /*
    const debugConsole = document.getElementById('debug-console');
    if (debugConsole) {
        debugConsole.innerHTML += `<div>${new Date().toLocaleTimeString()}: ${message}</div>`;
        debugConsole.scrollTop = debugConsole.scrollHeight;
    }
    */
}

// ✅ Ultra-fast initialization
async function init() {
    try {
        debugLog('🚀 Initializing Squirrel transpiler...');
        
        // Skip parser initialization for now and work directly with the Ruby code
        debugLog('📁 Loading example.sqr...');
        const response = await fetch('./application/example.sqr');
        const code = await response.text();
        debugLog('✅ Code loaded successfully');
        
        // Transpile directly to JavaScript
        debugLog('🔄 Transpiling to JavaScript...');
        const js = transpiler(code);
        debugLog('✅ Transpilation complete');
        console.log('📝 Transpiled JS:', js);
        
        // Execute the transpiled JavaScript with a small delay to ensure DOM is ready
        debugLog('⚡ Executing transpiled code...');
        setTimeout(() => {
            executeTranspiledCode(js);
        }, 100); // Small delay to ensure A framework and particles are fully loaded
        
    } catch (e) {
        const errorMsg = `❌ Initialization failed: ${e.message}`;
        debugLog(errorMsg);
        console.error(errorMsg, e);
    }
}

document.readyState === 'loading' ?
    document.addEventListener('DOMContentLoaded', init) : init();