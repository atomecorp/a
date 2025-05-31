/**
 * 🚀 SQUIRREL RUNNER - Version Bypass Parser
 * SOLUTION: Traite tout le code comme du Ruby/Hybrid
 */

console.log('🐿️ Squirrel Runner BYPASS loading...');

/**
 * 🎯 FONCTION PRINCIPALE - Sans séparation Ruby/JS
 */
async function runSquirrelFile(filename = './application/index.sqh') {
    console.log(`🚀 Running Squirrel file: ${filename}`);
    
    try {
        // 1. Charger le fichier
        console.log('📁 Loading file...');
        const response = await fetch(filename);
        
        if (!response.ok) {
            throw new Error(`Failed to load ${filename}: ${response.status}`);
        }
        
        const content = await response.text();
        console.log('✅ File loaded, content length:', content.length);
        
        // Vérifier que ce n'est pas une page d'erreur HTML
        if (content.trim().startsWith('<!DOCTYPE') || content.trim().startsWith('<html')) {
            throw new Error('File returned HTML error page instead of content');
        }
        
        // 2. BYPASS PARSER - Traiter tout comme Ruby/Hybrid
        console.log('⚡ Bypassing parser - treating all as Ruby/Hybrid...');
        
        // 3. Transpiler directement tout le contenu
        if (window.transpiler && typeof window.transpiler === 'function') {
            console.log('🔄 Transpiling entire content...');
            const transpiledJS = window.transpiler(content);
            console.log('✅ Content transpiled');
            
            // 4. Exécuter le code transpilé
            if (transpiledJS && transpiledJS.trim()) {
                console.log('🚀 Executing transpiled code...');
                
                if (window.executeTranspiledCode && typeof window.executeTranspiledCode === 'function') {
                    window.executeTranspiledCode(transpiledJS);
                } else {
                    eval(transpiledJS);
                }
                
                console.log('✅ All code executed successfully!');
            } else {
                console.warn('⚠️ No transpiled code to execute');
            }
        } else {
            console.error('❌ transpiler not available');
        }
        
        return true;
        
    } catch (error) {
        console.error('❌ Squirrel Runner error:', error);
        return false;
    }
}

/**
 * 🔧 FONCTION D'INITIALISATION
 */
async function initSquirrelRunner() {
    console.log('🔄 Initializing Squirrel Runner BYPASS...');
    
    // Vérifier les dépendances essentielles
    const dependencies = {
        'A framework': !!window.A,
        'transpiler': !!window.transpiler,
        'puts function': !!window.puts,
        'grab function': !!window.grab
    };
    
    console.log('🔍 Dependencies check:', dependencies);
    
    const missingDeps = Object.entries(dependencies)
        .filter(([name, exists]) => !exists)
        .map(([name]) => name);
    
    if (missingDeps.length > 0) {
        console.warn('⚠️ Missing dependencies:', missingDeps);
    }
    
    // Attendre un peu que tout soit chargé
    setTimeout(async () => {
        console.log('🚀 Auto-starting with BYPASS mode...');
        await runSquirrelFile();
    }, 100);
}

/**
 * 🧪 FONCTIONS DE TEST
 */
function testSquirrelFramework() {
    console.log('🧪 Testing Squirrel Framework...');
    
    try {
        const testElement = new A({
            width: 50,
            height: 50,
            color: 'red',
            x: 10,
            y: 10,
            attach: 'body'
        });
        
        console.log('✅ A framework test successful');
        return testElement;
    } catch (error) {
        console.error('❌ A framework test failed:', error);
        return null;
    }
}

function testRubyTranspilation() {
    console.log('🧪 Testing Ruby transpilation...');
    
    const testRuby = `
container = A.new({
    width: 100,
    height: 100,
    color: 'blue',
    attach: 'body'
})

puts "Test container created"
    `;
    
    try {
        if (window.transpiler) {
            const result = window.transpiler(testRuby);
            console.log('✅ Ruby transpilation test successful');
            console.log('Transpiled:', result);
            
            // Exécuter le test
            eval(result);
            return true;
        } else {
            console.error('❌ No transpiler available');
            return false;
        }
    } catch (error) {
        console.error('❌ Ruby transpilation test failed:', error);
        return false;
    }
}

/**
 * 🔧 TEST MANUEL SIMPLIFIÉ
 */
function runSimpleTest() {
    console.log('🧪 Running simple manual test...');
    
    const simpleCode = `
test_element = A.new({
    width: 150,
    height: 100,
    color: 'green',
    x: 100,
    y: 100,
    attach: 'body'
})

puts "Simple test element created"

test_element.onclick do
    puts "Simple test clicked!"
end
    `;
    
    try {
        if (window.transpiler) {
            const transpiled = window.transpiler(simpleCode);
            console.log('Transpiled test code:', transpiled);
            eval(transpiled);
            console.log('✅ Simple test completed');
        }
    } catch (error) {
        console.error('❌ Simple test failed:', error);
    }
}

// 🌍 EXPORTS GLOBAUX
window.runSquirrelFile = runSquirrelFile;
window.initSquirrelRunner = initSquirrelRunner;
window.testSquirrelFramework = testSquirrelFramework;
window.testRubyTranspilation = testRubyTranspilation;
window.runSimpleTest = runSimpleTest;

// 🚀 DÉMARRAGE AUTOMATIQUE
console.log('🐿️ Squirrel Runner BYPASS loaded! Starting initialization...');

// Attendre que la page soit complètement chargée
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSquirrelRunner);
} else {
    setTimeout(initSquirrelRunner, 50);
}

console.log('🐿️ Squirrel Runner BYPASS ready!');