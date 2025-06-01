/**
 * 🚀 HYPER SQUIRREL - Transpileur Ultra-Simple
 * VERSION FINALE - Pattern matching précis
 */

// 🛡️ PROTECTION
if (typeof window._hyperSquirrelLocked === 'undefined') {
    window._hyperSquirrelLocked = true;
} else {
    console.warn('🛡️ Hyper Squirrel already loaded - preventing duplicate');
}

/**
 * 🎯 TRANSPILEUR FINAL - Pattern matching précis
 */
function transpiler(rubyCode) {
    if (!rubyCode || typeof rubyCode !== 'string') {
        console.warn('⚠️ Invalid Ruby code input');
        return '';
    }

    // 🛡️ PROTECTION
    if (rubyCode.includes('function transpiler') || 
        rubyCode.includes('window.transpiler =') ||
        rubyCode.includes('hyper_squirrel.js') ||
        rubyCode.includes('_hyperSquirrelLocked')) {
        console.warn('🛡️ Refusing to transpile transpiler code');
        return '// Self-transpilation blocked for safety';
    }

    console.log('⚡ Hyper Squirrel FINAL transpiling Ruby...');

    let js = rubyCode.trim();

    // 0. NETTOYER LES COMMENTAIRES RUBY
    js = js
        .replace(/^\s*####.*$/gm, '') 
        .replace(/^\s*#\s*#.*$/gm, '')   
        .replace(/^\s*#[^#{}].*$/gm, '') 
        .replace(/^\s*#\s*$/gm, '') 
        .replace(/\n\s*\n/g, '\n');

    if (!js.trim()) {
        return '// All content was comments';
    }

    // 1. REQUIRES
    js = js.replace(/^require\s+['"]([^'"]+)['"]$/gm, "require('$1');");

    // 2. SYMBOLES RUBY
    js = js.replace(/:(\w+)/g, '"$1"');

    // 3. STRING INTERPOLATION
    js = js.replace(/"([^"]*?)#\{([^}]+)\}([^"]*?)"/g, '`$1${$2}$3`');
    js = js.replace(/'([^']*?)#\{([^}]+)\}([^']*?)'/g, '`$1${$2}$3`');

    // 4. A.new() → const x = new A()
    js = js.replace(/(\w+)\s*=\s*A\.new\s*\(/g, 'const $1 = new A(');

    // 5. TRANSFORMATION SPÉCIALE POUR KEYBOARD DO AVEC IF IMBRIQUÉ
    js = js.replace(
        /(\w+)\.keyboard\s+do\s*\|([^|]+)\|([\s\S]*?)if\s+(.+?)\n([\s\S]*?)end\s*([\s\S]*?)end/g,
        (match, obj, param, beforeIf, condition, ifBody, afterIf) => {
            // Nettoyer la condition
            const cleanCondition = condition.replace(/key\.ctrl/g, 'key.ctrlKey').trim();
            
            // Nettoyer le contenu avant le if
            const cleanBeforeIf = beforeIf.trim().split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0)
                .map(line => {
                    let processed = line;
                    // Traiter les appels de fonction sans parenthèses
                    if (/^(puts|log|console\.log)\s+[^(]/.test(processed)) {
                        processed = processed.replace(/^(puts|log|console\.log)\s+(.+)$/, '$1($2)');
                    }
                    return '    ' + processed + (processed.endsWith(';') ? '' : ';');
                })
                .join('\n');
            
            // Nettoyer le contenu du if
            const cleanIfBody = ifBody.trim().split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0)
                .map(line => {
                    let processed = line;
                    // Traiter les appels de fonction sans parenthèses
                    if (/^(puts|log|console\.log)\s+[^(]/.test(processed)) {
                        processed = processed.replace(/^(puts|log|console\.log)\s+(.+)$/, '$1($2)');
                    }
                    return '        ' + processed + (processed.endsWith(';') ? '' : ';');
                })
                .join('\n');
            
            // Nettoyer le contenu après le if
            const cleanAfterIf = afterIf.trim().split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0)
                .map(line => '    ' + line + (line.endsWith(';') ? '' : ';'))
                .join('\n');
            
            let result = `${obj}.getElement().addEventListener('keydown', (${param.trim()}) => {\n`;
            
            if (cleanBeforeIf) {
                result += cleanBeforeIf + '\n';
            }
            
            result += `    if (${cleanCondition}) {\n${cleanIfBody}\n    }\n`;
            
            if (cleanAfterIf) {
                result += cleanAfterIf + '\n';
            }
            
            result += '});';
            
            return result;
        }
    );

    // 6. WAIT BLOCKS
    js = js.replace(/wait\s+(\d+)\s+do\s*([\s\S]*?)end/g, (match, delay, body) => {
        const cleanBody = body.trim().split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .map(line => {
                let processed = line;
                // Traiter les appels de fonction sans parenthèses (puts, log, etc.)
                if (/^(puts|log|console\.log)\s+[^(]/.test(processed)) {
                    processed = processed.replace(/^(puts|log|console\.log)\s+(.+)$/, '$1($2)');
                }
                return '    ' + processed + (processed.endsWith(';') ? '' : ';');
            })
            .join('\n');
        return `setTimeout(() => {\n${cleanBody}\n}, ${delay});`;
    });

    // 7. ÉVÉNEMENTS AVEC PARAMÈTRES comme touch("down") do
    js = js.replace(/(\w+)\.(\w+)\s*\(([^)]+)\)\s+do\s*([\s\S]*?)end/g, (match, obj, method, params, body) => {
        const cleanBody = body.trim().split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .map(line => {
                let processed = line;
                // Traiter les appels de fonction sans parenthèses
                if (/^(puts|log|console\.log)\s+[^(]/.test(processed)) {
                    processed = processed.replace(/^(puts|log|console\.log)\s+(.+)$/, '$1($2)');
                }
                return '    ' + processed + (processed.endsWith(';') ? '' : ';');
            })
            .join('\n');
        return `${obj}.${method}(${params}, () => {\n${cleanBody}\n});`;
    });

    // 8. ÉVÉNEMENTS SIMPLES (onclick, onmouseover, etc.)
    js = js.replace(/(\w+)\.(on\w+)\s+do\s*([\s\S]*?)end/g, (match, obj, event, body) => {
        const cleanBody = body.trim().split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .map(line => {
                let processed = line;
                // Traiter les appels de fonction sans parenthèses
                if (/^(puts|log|console\.log)\s+[^(]/.test(processed)) {
                    processed = processed.replace(/^(puts|log|console\.log)\s+(.+)$/, '$1($2)');
                }
                return '    ' + processed + (processed.endsWith(';') ? '' : ';');
            })
            .join('\n');
        return `${obj}.${event}(() => {\n${cleanBody}\n});`;
    });

    // 9. PUTS STATEMENTS
    js = js.replace(/^puts\s+(.+)$/gm, (match, content) => {
        if (content.trim().startsWith('(') && content.trim().endsWith(')')) {
            return `puts${content};`;
        }
        return `puts(${content});`;
    });

    // 10. GRAB CALLS
    js = js.replace(/grab\("([^"]+)"\)\.(\w+)\("([^"]+)"\)/g, 'grab("$1").$2("$3");');
    js = js.replace(/grab\("([^"]+)"\)\.(\w+)\(\)/g, 'grab("$1").$2();');

    // 11. METHOD CALLS SIMPLES
    js = js.replace(/^(\w+)\.(\w+)\s+([^(\n{;]+)$/gm, (match, obj, method, args) => {
        if (args.includes('(') || args.includes('{') || args.includes('addEventListener')) {
            return match;
        }
        return `${obj}.${method}(${args});`;
    });

    // 12. NETTOYAGE FINAL MINIMAL
    js = js
        .replace(/\n\s*\n/g, '\n')
        .replace(/\.preventDefault\b(?!\()/g, '.preventDefault()')
        .replace(/^(\w+\.\w+\([^)]*\))\s*$/gm, '$1;')
        .replace(/;+/g, ';')
        .trim();

    console.log('✅ Ruby transpiled to JavaScript');
    return js;
}

/**
 * 🚀 EXÉCUTION SIMPLE
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
    
    const trimmedCode = jsCode.trim();
    if (trimmedCode.startsWith('// All content was comments') || 
        trimmedCode.startsWith('// Code was empty')) {
        console.log('✅ Skipping execution - code was only comments');
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
        
        // Analyser l'erreur avec plus de contexte
        const lines = jsCode.split('\n');
        console.group('🔍 Code with line numbers:');
        lines.forEach((line, index) => {
            const lineNum = (index + 1).toString().padStart(3);
            if (line.includes('if (') || line.includes('});') || line.includes('}')) {
                console.log(`>>> ${lineNum}: ${line}`); // Mettre en évidence les lignes suspectes
            } else {
                console.log(`    ${lineNum}: ${line}`);
            }
        });
        console.groupEnd();
    }
}

/**
 * 📊 INFO
 */
function getTranspilerInfo() {
    return {
        name: 'Hyper Squirrel Final',
        version: '6.0.0-final',
        approach: 'Precise pattern matching for nested structures',
        features: ['Nested if...end handling', 'Precise keyboard blocks', 'Clean structure']
    };
}

// 🌍 EXPORTS
window.transpiler = transpiler;
window.executeTranspiledCode = executeTranspiledCode;
window.getTranspilerInfo = getTranspilerInfo;

console.log('⚡ Hyper Squirrel FINAL Transpiler loaded!');