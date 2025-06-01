/**
 * 🚀 HYPER SQUIRREL - Transpileur Simplifié et Robuste
 * VERSION SIMPLE - Focus sur les transformations essentielles
 * FIXED VERSION - Gestion améliorée des commentaires
 */

// 🛡️ PROTECTION
if (typeof window._hyperSquirrelLocked === 'undefined') {
    window._hyperSquirrelLocked = true;
} else {
    console.warn('🛡️ Hyper Squirrel already loaded - preventing duplicate');
}

/**
 * 🎯 TRANSPILEUR SIMPLIFIÉ - VERSION CORRIGÉE
 */
function transpiler(rubyCode) {
    if (!rubyCode || typeof rubyCode !== 'string') {
        console.warn('⚠️ Invalid Ruby code input');
        return '';
    }

    // 🛡️ PROTECTION - Plus permissive pour les commentaires
    if (rubyCode.includes('function transpiler') || 
        rubyCode.includes('window.transpiler =') ||
        rubyCode.includes('hyper_squirrel.js') ||
        rubyCode.includes('_hyperSquirrelLocked')) {
        console.warn('🛡️ Refusing to transpile transpiler code');
        return '// Self-transpilation blocked for safety';
    }

    // console.log('⚡ Hyper Squirrel transpiling Ruby...');

    let js = rubyCode.trim();

    // 0. GÉRER LES COMMENTAIRES EN PREMIER - VERSION AMÉLIORÉE
    js = js
        .replace(/^\s*####.*$/gm, '') // Remove #### comments
        .replace(/^\s*#\s*#.*$/gm, '') // Remove # # comments (NOUVEAU)
        .replace(/^\s*#[^#].*$/gm, '') // Remove # comments (simple)
        .replace(/^\s*#\s*$/gm, '') // Remove lines with just # (NOUVEAU)
        .replace(/\n\s*\n/g, '\n'); // Clean double newlines

    // Si après nettoyage des commentaires il ne reste rien, retourner du code vide valide
    if (!js.trim()) {
        // console.log('✅ All code was comments - returning empty valid JS');
        return '// All content was comments';
    }

    // 1. GÉRER LES REQUIRES - Transformation simple
    js = js.replace(/^require\s+['"]([^'"]+)['"]$/gm, (match, filename) => {
        // console.log(`🔗 Converting require: ${filename}`);
        return `require('${filename}');`;  // Simple call, pas async
    });

    // 2. A.new() → new A() - Pattern le plus simple
    js = js.replace(/(\w+)\s*=\s*A\.new\s*\(/g, 'const $1 = new A(');

    // 3. Événements avec do...end
    js = js.replace(/(\w+)\.(on\w+|keyboard)\s+do\s*\|([^|]+)\|([\s\S]*?)end/g, 
        (match, obj, event, param, body) => {
            const cleanBody = body.trim().split('\n').map(line => '    ' + line.trim()).join('\n');
            
            if (event === 'keyboard') {
                return `${obj}.getElement().addEventListener('keydown', (${param}) => {\n${cleanBody}\n});`;
            } else {
                const eventName = event.startsWith('on') ? event.slice(2) : event;
                return `${obj}.getElement().addEventListener('${eventName}', (${param}) => {\n${cleanBody}\n});`;
            }
        }
    );

    // 4. Événements sans paramètres
    js = js.replace(/(\w+)\.(on\w+)\s+do\s*([\s\S]*?)end/g, 
        (match, obj, event, body) => {
            const cleanBody = body.trim().split('\n').map(line => '    ' + line.trim()).join('\n');
            return `${obj}.${event}(() => {\n${cleanBody}\n});`;
        }
    );

    // 5. Wait blocks
    js = js.replace(/wait\s+(\d+)\s+do\s*([\s\S]*?)end/g, 
        (match, delay, body) => {
            const cleanBody = body.trim().split('\n').map(line => '    ' + line.trim()).join('\n');
            return `setTimeout(() => {\n${cleanBody}\n}, ${delay});`;
        }
    );

    // 6. String interpolation
    js = js.replace(/"([^"]*?)#\{([^}]+)\}([^"]*?)"/g, '`$1${$2}$3`');
    js = js.replace(/'([^']*?)#\{([^}]+)\}([^']*?)'/g, '`$1${$2}$3`');

    // 7. Puts statements
    js = js.replace(/puts\s+(.+)/g, 'puts($1);');

    // 8. Conditionals
    js = js.replace(/key\.ctrl/g, 'key.ctrlKey');
    js = js.replace(/if\s+(.+?)\s*$/gm, 'if ($1) {');
    js = js.replace(/^\s*end\s*$/gm, '}');

    // 9. Grab calls
    js = js.replace(/grab\("([^"]+)"\)\.(\w+)\("([^"]+)"\)/g, 'grab("$1").$2("$3");');
    js = js.replace(/grab\("([^"]+)"\)\.(\w+)\(\)/g, 'grab("$1").$2();');

    // 10. Method calls - Simple pattern
    js = js.replace(/(\w+)\.(\w+)\s+([^(\n]+)$/gm, '$1.$2($3);');

    // 11. Nettoyage final - VERSION AMÉLIORÉE
    js = js
        .replace(/\n\s*\n/g, '\n') // Clean double newlines
        .replace(/\.preventDefault\(\}\;\)/g, '.preventDefault()') // Fix preventDefault(};)
        .replace(/\.preventDefault\(\}\)/g, '.preventDefault()') // Fix preventDefault(})
        .replace(/\.preventDefault\b(?!\()/g, '.preventDefault()') // Fix preventDefault without ()
        .replace(/\.preventDefault\(\)\;\)/g, '.preventDefault()') // Fix preventDefault();)
        .replace(/key\.ctrlKey\(&&/g, 'key.ctrlKey &&') // Fix ctrlKey(&&
        .replace(/\(\s*&&\s*/g, ' && ') // Fix (&&
        .replace(/\{\s*;\s*\}/g, '{}') // Fix {;}
        .replace(/\)\s*\{\s*;\s*\)/g, ') {}') // Fix ) {;)
        .replace(/if\s*\([^)]+\)\s*\{\s*;\s*\}/g, '// if statement removed (empty block)')
        .replace(/if\s*\([^)]+\)\s*\{\s*\)\s*;/g, '// if statement removed (malformed)')
        .replace(/\{\s*\)\s*;/g, '{}') // Fix {);
        .replace(/\}\s*container\./g, '});\ncontainer.') // Fix missing }); before container.
        .replace(/\}\s*setTimeout/g, '});\nsetTimeout') // Fix missing }); before setTimeout
        .trim();

    // Vérification finale - si le code est vide après nettoyage
    if (!js.trim()) {
        console.log('✅ Code became empty after processing - returning safe empty JS');
        return '// Code was empty after processing';
    }

    // console.log('✅ Ruby transpiled to JavaScript');
    return js;
}

/**
 * 🚀 EXÉCUTION SIMPLIFIÉE - VERSION AMÉLIORÉE
 */
function executeTranspiledCode(jsCode) {
    if (!jsCode || typeof jsCode !== 'string') {
        console.warn('⚠️ No code to execute');
        return;
    }
    
    // 🛡️ PROTECTION
    if (jsCode.includes('transpiler') || 
        jsCode.includes('hyper_squirrel') ||
        jsCode.includes('_hyperSquirrelLocked')) {
        console.warn('🛡️ Refusing to execute transpiler code');
        return;
    }
    
    // Vérifier si le code n'est que des commentaires
    const trimmedCode = jsCode.trim();
    if (trimmedCode.startsWith('// All content was comments') || 
        trimmedCode.startsWith('// Code was empty')) {
        // console.log('✅ Skipping execution - code was only comments');
        return;
    }
    
    // console.log('🔍 CODE TRANSPILED - About to execute:');
    // console.log('='.repeat(50));
    // console.log(jsCode);
    // console.log('='.repeat(50));
    
    try {
        eval(jsCode);
        // console.log('✅ Code executed successfully');
    } catch (error) {
        console.error('❌ EXECUTION ERROR:');
        console.error('Message:', error.message);
        console.error('Type:', error.name);
        
        // Simple line breakdown
        const lines = jsCode.split('\n');
        console.group('🔍 CODE LINES:');
        lines.forEach((line, index) => {
            console.log(`${(index + 1).toString().padStart(3)}: ${line}`);
        });
        console.groupEnd();
    }
}

/**
 * 📊 INFO
 */
function getTranspilerInfo() {
    return {
        name: 'Hyper Squirrel Simple Fixed',
        version: '3.0.1-fixed',
        approach: 'Simple regex-based transpilation with improved comment handling',
        features: ['A.new conversion', 'Events', 'String interpolation', 'Basic Ruby syntax', 'Better comment handling']
    };
}

// 🌍 EXPORTS
if (!window.transpiler) {
    window.transpiler = transpiler;
}

if (!window.executeTranspiledCode) {
    window.executeTranspiledCode = executeTranspiledCode;
}

if (!window.getTranspilerInfo) {
    window.getTranspilerInfo = getTranspilerInfo;
}

// console.log('⚡ Hyper Squirrel Simple Transpiler FIXED loaded!');