// 🚀 FINAL Ultra-Optimized Ruby Transpiler with Execution

let parser;


// ✅ Ultra-fast initialization
async function init() {
    try {
        
        const response = await fetch('./application/index.sqr');
        const code = await response.text();
        const js = transpiler(code);
        setTimeout(() => {
            executeTranspiledCode(js);
        }, 100); // Small delay to ensure A framework and particles are fully loaded
        
    } catch (e) {
        const errorMsg = `❌ Initialization failed: ${e.message}`;
        console.error(errorMsg, e);
    }
}

document.readyState === 'loading' ?
    document.addEventListener('DOMContentLoaded', init) : init();