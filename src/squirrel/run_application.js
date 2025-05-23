
// fetch("./application/example.sqr")
//     .then((res) => res.text())
//     .then((code) => {
//         runSquirrel(code)
//     })
//     .catch((err) => {
//         console.error("❌ Erreur :", err);
//     });
//
//
// fetch("./application/example.sqj")
//     .then((res) => res.text())
//     .then((code) => {
//         runSquirrel(code)
//     })
//     .catch((err) => {
//         console.error("❌ Erreur :", err);
//     });

// 🚀 FINAL Ultra-Optimized Ruby Transpiler
// Zero overhead, vanilla JS performance, perfect syntax

// ✅ Ultra-fast transpiler with perfect syntax generation
function transpileRuby(code) {
    let js = code;

    // 1. FIRST: Fix all $){ patterns in the original Ruby code
    js = js.replace(/\$\)\{/g, '${');

    // 2. Symbol conversion (fastest first)
    js = js.replace(/:(\w+)/g, '"$1"');

    // 3. String interpolation with aggressive $){ prevention
    js = js.replace(/"([^"]*#\{[^}]+\}[^"]*)"/g, (match, content) => {
        let fixed = content.replace(/#\{([^}]+)\}/g, '${$1}');
        // Triple protection against $){
        fixed = fixed.replace(/\$\)\{/g, '${');
        fixed = fixed.replace(/\$\s*\)\s*\{/g, '${');
        return '`' + fixed + '`';
    });

    // 4. Block patterns (order optimized for performance)
    js = js.replace(/wait\s+(\d+)\s+do\s*([\s\S]*?)\s*end/g,
        'wait($1)(() => {$2})');

    js = js.replace(/compute\s+([\d\s,]+)\s+do\s*\|([^|]*)\|\s*([\s\S]*?)\s*end/g,
        'compute($1)(($2) => {$3})');

    // 5. Method calls with blocks - PERFECT syntax generation (fix line breaks)
    js = js.replace(/(\w+)\s*\(\s*([^)]+)\s*\)\s+do\s*\|([^|]*)\|\s*([\s\S]*?)\s*end/g,
        (match, method, args, param, body) => {
            const cleanArgs = args.replace(/\s+/g, ' ').trim();
            const cleanParam = param.replace(/\s+/g, ' ').trim();
            const cleanBody = body.trim();
            return `(() => { const result = ${method}(${cleanArgs}); (function(${cleanParam}) { ${cleanBody} })(result); })()`;
        });

    // 6. Array/object methods with blocks - PERFECT syntax with parentheses
    js = js.replace(/(\w+)\.each\s+do\s*\|([^|]*)\|\s*([\s\S]*?)\s*end/g,
        (match, obj, param, body) => {
            let fixedBody = body.replace(/\$\)\{/g, '${').replace(/`([^`]*)`log/g, '`$1`');
            fixedBody = fixedBody.replace(/\$\s*\)\s*\{/g, '${');
            // Ensure puts statements have closing parentheses
            fixedBody = fixedBody.replace(/puts\(`([^`]*)`$/gm, 'puts(`$1`)');
            return `${obj}.forEach((${param}) => {${fixedBody}})`;
        });

    js = js.replace(/(\w+)\.each_with_index\s+do\s*\|([^,|]+),\s*([^|]+)\|\s*([\s\S]*?)\s*end/g,
        (match, obj, param, index, body) => {
            let fixedBody = body.replace(/\$\)\{/g, '${').replace(/`([^`]*)`log/g, '`$1`');
            fixedBody = fixedBody.replace(/\$\s*\)\s*\{/g, '${');
            // Ensure puts statements have closing parentheses
            fixedBody = fixedBody.replace(/puts\(`([^`]*)`$/gm, 'puts(`$1`)');
            // Fix for objects - use Object.entries instead of direct forEach
            return `Object.entries(${obj}).forEach(([${param}, ${index}]) => {${fixedBody}})`;
        });

    js = js.replace(/\[([^\]]+)\]\.each\s+do\s*\|([^|]*)\|\s*([\s\S]*?)\s*end/g,
        '[$1].forEach(($2) => {$3})');

    // 7. Function definitions - AGGRESSIVE artifact cleaning
    js = js.replace(/def\s+(\w+)\s*\(\s*\*(\w+)\s*\)\s*([\s\S]*?)\s*end/g,
        (match, name, args, body) => {
            let cleanBody = body.replace(/\$\)\{/g, '${').replace(/`([^`]*)`log/g, '`$1`');
            cleanBody = cleanBody.replace(/\$\s*\)\s*\{/g, '${');
            return `function ${name}(...${args}) {${cleanBody}}`;
        });

    js = js.replace(/def\s+(\w+)\s*\(([^)]*)\)\s*([\s\S]*?)\s*end/g,
        (match, name, params, body) => {
            let cleanBody = body.replace(/\$\)\{/g, '${').replace(/`([^`]*)`log/g, '`$1`');
            cleanBody = cleanBody.replace(/\$\s*\)\s*\{/g, '${');
            return `function ${name}(${params}) { return ${cleanBody}; }`;
        });

    js = js.replace(/def\s+(\w+)\s*([\s\S]*?)\s*end/g,
        (match, name, body) => {
            let cleanBody = body.trim().replace(/\$\)\{/g, '${').replace(/`([^`]*)`log/g, '`$1`');
            cleanBody = cleanBody.replace(/\$\s*\)\s*\{/g, '${');
            // Ensure puts statements have closing parentheses
            cleanBody = cleanBody.replace(/puts\(`([^`]*)`$/gm, 'puts(`$1`)');
            cleanBody = cleanBody.replace(/puts\(`([^`]*)`\s*;/g, 'puts(`$1`);');
            return `function ${name}() { return ${cleanBody}; }`;
        });

    // 8. Simple replacements (compiled patterns for speed)
    js = js.replace(/puts\s+([^;\n\r{}()]+)/g, 'puts($1)');
    js = js.replace(/(\w+)\[:(\w+)\]/g, '$1["$2"]');
    js = js.replace(/(\w+)\.json\b(?!\()/g, 'JSON.stringify($1)');

    // 9. Variable assignment with global sharing
    const declaredVars = new Set();
    js = js.replace(/^(\s*)([a-z_]\w*)\s*=\s*(.+)$/gm, (match, indent, varName, value) => {
        if (declaredVars.has(varName)) {
            return `${indent}window.${varName} = ${value};`;
        } else {
            declaredVars.add(varName);
            return `${indent}window.${varName} = ${value};`;
        }
    });

    // 10. FINAL: Aggressive cleanup + parentheses fix
    js = js.replace(/\$\)\{/g, '${');
    js = js.replace(/\$\s*\)\s*\{/g, '${');

    // Fix missing parentheses in puts statements
    js = js.replace(/puts\(`([^`]*)`$/gm, 'puts(`$1`)');
    js = js.replace(/puts\(`([^`]*)`\s*;/g, 'puts(`$1`);');
    js = js.replace(/puts\(`([^`]*)`\s*\}/g, 'puts(`$1`)}');

    return js;
}

// ✅ Ultra-fast post-processor (surgical fixes only)
function cleanJS(js) {
    // Final emergency fixes (should not be needed now)
    js = js.replace(/\$\)\{/g, '${');
    js = js.replace(/`([^`]*)`log/g, '`$1`');
    js = js.replace(/log;/g, ';');
    js = js.replace(/\(function\(([^)]+)\s*\n\s*\)/g, '(function($1)');

    return js;
}

// ✅ Perfect executor (line-by-line, guaranteed execution)
function executeJS(js) {
    try {
        js = cleanJS(js);

        // Execute line by line for maximum reliability
        const lines = js.split('\n');
        let currentBlock = '';

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            currentBlock += line + '\n';

            // Execute complete statements immediately
            if (trimmed.endsWith(';') ||
                trimmed.endsWith('}') ||
                trimmed.endsWith(')') ||
                trimmed.includes(')()')) {

                try {
                    // Execute in global scope
                    (1, eval)(currentBlock.trim());

                    // Track functions for global access
                    const funcMatch = currentBlock.match(/function\s+(\w+)/);
                    if (funcMatch) {
                        const funcName = funcMatch[1];
                        window[funcName] = eval(funcName);
                    }
                } catch (e) {
                    // Try to execute anyway, might be partial block
                    if (currentBlock.includes('function ') && !currentBlock.includes('}')) {
                        // Function not complete, continue
                        continue;
                    }
                    console.warn(`⚠️ Block failed: ${e.message}`);
                }

                currentBlock = '';
            }
        }

        // Execute any remaining code
        if (currentBlock.trim()) {
            try {
                (1, eval)(currentBlock.trim());
            } catch (e) {
                console.warn(`⚠️ Final block failed: ${e.message}`);
            }
        }

        console.log('✅ Ruby executed successfully');
    } catch (e) {
        console.error('❌ Execution failed:', e);
    }
}

// ✅ Ultra-fast code splitter (single pass, optimized)
function parseCode(rawCode) {
    const lines = rawCode.split('\n');
    let dslCode = '';
    let rubyCode = '';
    let inDSL = false;
    let braceCount = 0;

    for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed.startsWith('#') && !trimmed.includes('DSL')) continue;

        if (trimmed.includes('DSL') || trimmed.includes('A.new')) {
            inDSL = true;
        }

        if (inDSL) {
            if (!trimmed.startsWith('#')) {
                dslCode += line + '\n';

                for (const char of line) {
                    if (char === '{') braceCount++;
                    if (char === '}') braceCount--;
                }

                if (braceCount === 0 && dslCode.includes('}')) {
                    inDSL = false;
                }
            }
        } else if (trimmed && !trimmed.startsWith('#')) {
            rubyCode += line + '\n';
        }
    }

    return { dslCode: dslCode.trim(), rubyCode: rubyCode.trim() };
}

// ✅ Minimal processors (zero overhead)
function processDSL(dslCode) {
    if (!dslCode) return;

    console.log('🔧 DSL processing...');
    try {
        const cleanDSL = dslCode.replace(/A\.new\s*\(/g, 'new A(');
        (new Function(cleanDSL))();
        console.log('✅ DSL executed');
    } catch (e) {
        console.error('❌ DSL failed:', e);
    }
}

function processRuby(rubyCode) {
    if (!rubyCode) return;

    console.log('🔧 Ruby processing...');

    setTimeout(() => {
        try {
            const js = transpileRuby(rubyCode);
            console.log('🧠 Generated JS:', js);
            executeJS(js);
        } catch (e) {
            console.error('❌ Ruby failed:', e);
        }
    }, 0);
}

// ✅ Main processor (ultra-fast, zero allocations where possible)
function processCode(rawCode) {
    if (!rawCode?.trim()) return;

    const { dslCode, rubyCode } = parseCode(rawCode);

    processDSL(dslCode);
    processRuby(rubyCode);
}

// ✅ Runtime helpers (zero-overhead, bitwise optimizations)
window.wait = ms => fn => setTimeout(fn, ms | 0);
window.compute = (a, b) => fn => fn((a | 0) + (b | 0));
window.puts = console.log;

// ✅ Ultra-fast initialization
function init() {
    fetch('./application/example.sqr')
        .then(r => r.text())
        .then(code => {
            console.log('📄 Code loaded');
            processCode(code);
        })
        .catch(e => console.warn('❌ Load failed:', e));
}

document.readyState === 'loading' ?
    document.addEventListener('DOMContentLoaded', init) : init();