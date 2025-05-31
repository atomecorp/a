/**
 * 🚀 HYPER SQUIRREL - Transpileur Simplifié et Robuste
 * VERSION SIMPLE - Focus sur les transformations essentielles
 */

// 🛡️ PROTECTION
if (typeof window._hyperSquirrelLocked === 'undefined') {
    window._hyperSquirrelLocked = true;
} else {
    console.warn('🛡️ Hyper Squirrel already loaded - preventing duplicate');
}

/**
 * 🎯 TRANSPILEUR SIMPLIFIÉ
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

    console.log('⚡ Hyper Squirrel transpiling Ruby...');

    let js = rubyCode.trim();

    // 0. GÉRER LES REQUIRES - Transformation simple
    js = js.replace(/^require\s+['"]([^'"]+)['"]$/gm, (match, filename) => {
        console.log(`🔗 Converting require: ${filename}`);
        return `require('${filename}');`;  // Simple call, pas async
    });

    // 1. A.new() → new A() - Pattern le plus simple
    js = js.replace(/(\w+)\s*=\s*A\.new\s*\(/g, 'const $1 = new A(');

    // 2. Événements avec do...end
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

    // 3. Événements sans paramètres
    js = js.replace(/(\w+)\.(on\w+)\s+do\s*([\s\S]*?)end/g, 
        (match, obj, event, body) => {
            const cleanBody = body.trim().split('\n').map(line => '    ' + line.trim()).join('\n');
            return `${obj}.${event}(() => {\n${cleanBody}\n});`;
        }
    );

    // 4. Wait blocks
    js = js.replace(/wait\s+(\d+)\s+do\s*([\s\S]*?)end/g, 
        (match, delay, body) => {
            const cleanBody = body.trim().split('\n').map(line => '    ' + line.trim()).join('\n');
            return `setTimeout(() => {\n${cleanBody}\n}, ${delay});`;
        }
    );

    // 5. String interpolation
    js = js.replace(/"([^"]*?)#\{([^}]+)\}([^"]*?)"/g, '`$1${$2}$3`');
    js = js.replace(/'([^']*?)#\{([^}]+)\}([^']*?)'/g, '`$1${$2}$3`');

    // 6. Puts statements
    js = js.replace(/puts\s+(.+)/g, 'puts($1);');

    // 7. Conditionals
    js = js.replace(/key\.ctrl/g, 'key.ctrlKey');
    js = js.replace(/if\s+(.+?)\s*$/gm, 'if ($1) {');
    js = js.replace(/^\s*end\s*$/gm, '}');

    // 8. Grab calls
    js = js.replace(/grab\("([^"]+)"\)\.(\w+)\("([^"]+)"\)/g, 'grab("$1").$2("$3");');
    js = js.replace(/grab\("([^"]+)"\)\.(\w+)\(\)/g, 'grab("$1").$2();');

    // 9. Method calls - Simple pattern
    js = js.replace(/(\w+)\.(\w+)\s+([^(\n]+)$/gm, '$1.$2($3);');

    // 10. Nettoyage final - CORRECTION EVENTS
    js = js
        .replace(/^\s*####.*$/gm, '') // Remove #### comments
        .replace(/^\s*#[^#].*$/gm, '') // Remove # comments
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

    console.log('✅ Ruby transpiled to JavaScript');
    return js;
}

/**
 * 🚀 EXÉCUTION SIMPLIFIÉE
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
    
    console.log('🔍 CODE TRANSPILED - About to execute:');
    console.log('='.repeat(50));
    console.log(jsCode);
    console.log('='.repeat(50));
    
    try {
        eval(jsCode);
        console.log('✅ Code executed successfully');
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
        name: 'Hyper Squirrel Simple',
        version: '3.0.0-simple',
        approach: 'Simple regex-based transpilation',
        features: ['A.new conversion', 'Events', 'String interpolation', 'Basic Ruby syntax']
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

console.log('⚡ Hyper Squirrel Simple Transpiler loaded!');