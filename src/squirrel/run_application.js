
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

// 🚀 COMPLETE & OPTIMIZED Ruby-to-JS Transpiler
// Full feature set with maximum performance

// ✅ Pre-compiled lookup tables for fastest node processing
const NODE_PROCESSORS = Object.freeze({
    'Begin': (node) => node.statements?.map(fastTranspile).join(';\n') || '',
    'Lvasgn': (node) => `let ${node.name} = ${fastTranspile(node.value)}`,
    'Const': (node) => `const ${node.name} = ${fastTranspile(node.value)}`,
    'Gvasgn': (node) => `window.${node.name} = ${fastTranspile(node.value)}`,
    'Hash': (node) => {
        if (!node.pairs?.length) return '{}';
        const pairs = node.pairs.map(pair => {
            const key = fastTranspile(pair.key);
            const value = fastTranspile(pair.value);
            return `${key}: ${value}`;
        });
        return `{ ${pairs.join(', ')} }`;
    },
    'Pair': (node) => `${fastTranspile(node.key)}: ${fastTranspile(node.value)}`,
    'Array': (node) => {
        if (!node.elements?.length) return '[]';
        return `[${node.elements.map(fastTranspile).join(', ')}]`;
    },
    'Int': (node) => node.value?.toString() || '0',
    'Float': (node) => node.value?.toString() || '0',
    'Str': (node) => JSON.stringify(node.value || ''),
    'Sym': (node) => JSON.stringify(node.name || node.value || ''),
    'True': () => 'true',
    'False': () => 'false',
    'Nil': () => 'null',
    'Lvar': (node) => node.name || 'unknownVar',
    'Gvar': (node) => `window.${node.name?.slice(1) || 'unknownGlobalVar'}`,
    'Ivar': (node) => `this.${node.name?.slice(1) || 'unknownInstanceVar'}`,
    'Cvar': (node) => `this.constructor.${node.name?.slice(2) || 'unknownClassVar'}`
});

// ✅ Method mapping for Ruby -> JS conversion
const METHOD_MAP = Object.freeze({
    'puts': 'console.log',
    'log': 'console.log',
    'p': 'console.log',
    'print': 'console.log'
});

// ✅ Fast string interpolation processing
function processDstr(node) {
    if (!node.parts?.length) return '""';
    const parts = node.parts.map(part => {
        if (typeof part === 'string') return part;
        if (part.type === 'Str') return part.value || '';
        return '${' + fastTranspile(part) + '}';
    });
    return '`' + parts.join('') + '`';
}

// ✅ Fast Send node processing (most common Ruby construct)
function processSend(node) {
    const recv = node.receiver ? fastTranspile(node.receiver) : '';
    const method = node.method_name || 'unknownMethod';
    const args = node.args?.map(fastTranspile).join(', ') || '';

    // Special method mappings
    const mappedMethod = METHOD_MAP[method] || method;

    // Special cases for framework integration
    if (method === 'new' && recv === 'A') {
        return `new A(${args})`;
    }

    if (method === 'each' && recv) {
        return `${recv}.forEach`;
    }

    // Handle puts/log without receiver
    if (!recv && (method === 'puts' || method === 'log' || method === 'p')) {
        return `console.log(${args})`;
    }

    // Standard method call
    if (recv) {
        return `${recv}.${mappedMethod}(${args})`;
    } else {
        return `${mappedMethod}(${args})`;
    }
}

// ✅ Block processing for Ruby blocks -> JS callbacks
function processBlock(node) {
    const call = fastTranspile(node.call);
    const args = (node.args?.args || []).map(a => a.name || 'arg').join(', ');
    const body = Array.isArray(node.body) ?
        node.body.map(fastTranspile).join(';\n  ') :
        fastTranspile(node.body);
    return `${call}((${args}) => {\n  ${body}\n})`;
}

// ✅ Function definition processing
function processDef(node) {
    const fnName = node.name || 'anon';
    const args = (node.args?.args || []).map(a => a.name || 'arg').join(', ');
    const body = fastTranspile(node.body);
    return `function ${fnName}(${args}) {\n  ${body};\n}`;
}

// ✅ Conditional processing
function processIf(node) {
    const condition = fastTranspile(node.cond);
    const thenBranch = fastTranspile(node.if_true);
    const elseBranch = node.if_false ? fastTranspile(node.if_false) : '';

    if (elseBranch) {
        return `if (${condition}) {\n  ${thenBranch};\n} else {\n  ${elseBranch};\n}`;
    } else {
        return `if (${condition}) {\n  ${thenBranch};\n}`;
    }
}

// ✅ Main ultra-fast transpiler
function fastTranspile(node) {
    if (!node) return 'null';
    if (typeof node !== 'object') return JSON.stringify(node);
    if (!node.type) {
        // Handle malformed nodes
        console.warn('Node without type:', node);
        return `/* Malformed node: ${JSON.stringify(node).slice(0, 100)}... */`;
    }

    // Fast lookup for common nodes
    const processor = NODE_PROCESSORS[node.type];
    if (processor) return processor(node);

    // Handle complex nodes that need special processing
    switch (node.type) {
        case 'Send':
            return processSend(node);

        case 'Dstr':
            return processDstr(node);

        case 'Block':
            return processBlock(node);

        case 'Def':
            return processDef(node);

        case 'If':
            return processIf(node);

        case 'Return':
            return `return ${fastTranspile(node.value)}`;

        case 'Binary':
            return `${fastTranspile(node.left)} ${node.operator} ${fastTranspile(node.right)}`;

        case 'Index':
            if (!node.indexes?.length) return `${fastTranspile(node.recv)}[]`;
            return `${fastTranspile(node.recv)}[${node.indexes.map(fastTranspile).join(', ')}]`;

        case 'While':
            const whileCond = fastTranspile(node.cond);
            const whileBody = fastTranspile(node.body);
            return `while (${whileCond}) {\n  ${whileBody};\n}`;

        case 'For':
            const forVar = node.var ? fastTranspile(node.var) : 'item';
            const forIterable = fastTranspile(node.in);
            const forBody = fastTranspile(node.body);
            return `for (const ${forVar} of ${forIterable}) {\n  ${forBody};\n}`;

        case 'Case':
            // Simple case -> switch conversion
            const caseExpr = fastTranspile(node.expr);
            const whenBranches = (node.when_bodies || []).map(when => {
                const values = when.values?.map(fastTranspile).join(', ') || 'default';
                const body = fastTranspile(when.body);
                return values === 'default' ?
                    `default:\n    ${body};\n    break;` :
                    `case ${values}:\n    ${body};\n    break;`;
            }).join('\n  ');
            return `switch (${caseExpr}) {\n  ${whenBranches}\n}`;

        default:
            console.warn(`⚠️ Unhandled node type: ${node.type}`);
            return `/* Unhandled: ${node.type} */`;
    }
}

// ✅ Single-pass string optimization
const FAST_REPLACEMENTS = [
    [/A\.new\s*\(/g, 'new A('],
    [/puts\s+/g, 'console.log('],
    [/log\s+/g, 'console.log('],
    [/undefined/g, 'null'],
    [/const\(let /g, 'let '],
    [/\[object Object\]/g, 'null'],
    [/function null\(/g, 'function anon(']
];

function ultraFastSanitize(code) {
    let result = code;
    for (const [pattern, replacement] of FAST_REPLACEMENTS) {
        result = result.replace(pattern, replacement);
    }
    return result;
}

// ✅ Enhanced DSL processor with full Ruby-like syntax support
function processRawDSL(code) {
    return code
        .replace(/A\.new\s*\(/g, 'new A(')
        .replace(/wait\s+(\d+)\s+do\s*([\s\S]*?)\s*end/g, 'setTimeout(() => { $2 }, $1)')
        .replace(/compute\s+(\d+),\s*(\d+)\s+do\s*\|(.*?)\|\s*([\s\S]*?)\s*end/g,
            'compute($1, $2)(($3) => { $4 })')
        .replace(/(\w+)\.each\s+do\s*\|(.*?)\|\s*([\s\S]*?)\s*end/g,
            '$1.forEach(($2) => { $3 })');
}

// ✅ Optimized execution with error handling
function executeJS(jsCode) {
    try {
        const fn = new Function(jsCode);
        return fn();
    } catch (err) {
        console.error('❌ Execution failed:', err);
        console.error('Generated code:', jsCode);
        return null;
    }
}

// ✅ Main AST processor
function runParsedAST(ast) {
    try {
        const js = fastTranspile(ast);
        const clean = ultraFastSanitize(js);

        console.log('🧠 JavaScript transpiled:\n', clean);

        return executeJS(clean);
    } catch (err) {
        console.error('❌ Transpilation failed:', err);
        return null;
    }
}

// ✅ Smart code processor with automatic detection
function processCode(rawCode) {
    if (!rawCode?.trim()) return;

    const lines = rawCode.split('\n');
    let dslBuffer = '';
    let rubyBuffer = '';
    let inDSLSection = false;
    let dslComplete = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Detect DSL section start
        if (trimmed.includes('#### DSL') || trimmed.includes('DSL js syntaxe')) {
            inDSLSection = true;
            continue;
        }

        // If we're in DSL section
        if (inDSLSection) {
            // Check if this line starts a multi-line construct
            if (trimmed.includes('const') && trimmed.includes('A.new') && trimmed.includes('{')) {
                // Start collecting the complete DSL block
                let bracketCount = 0;
                let dslBlock = '';

                // Count brackets to find the complete block
                for (let j = i; j < lines.length; j++) {
                    const currentLine = lines[j];
                    dslBlock += currentLine + '\n';

                    // Count opening and closing brackets
                    for (const char of currentLine) {
                        if (char === '{') bracketCount++;
                        if (char === '}') bracketCount--;
                    }

                    // If brackets are balanced, we have a complete block
                    if (bracketCount === 0 && dslBlock.includes('}')) {
                        dslBuffer += dslBlock;
                        i = j; // Skip processed lines
                        inDSLSection = false;
                        dslComplete = true;
                        break;
                    }
                }
            } else if (trimmed && !trimmed.startsWith('#')) {
                // Single line DSL
                dslBuffer += line + '\n';
            }

            // End DSL section on empty line or when we've processed a complete block
            if (!trimmed && dslComplete) {
                inDSLSection = false;
            }
        } else {
            // Not in DSL section - check if it's Ruby code
            if (trimmed && !trimmed.startsWith('#') && !dslComplete) {
                rubyBuffer += line + '\n';
            }
        }
    }

    // Execute DSL immediately for instant visual feedback
    if (dslBuffer.trim()) {
        console.log('🔧 Processing DSL code...');
        const processedDSL = processRawDSL(dslBuffer);
        const cleanDSL = ultraFastSanitize(processedDSL);
        executeJS(cleanDSL);
        console.log('✅ DSL executed');
    }

    // Process Ruby code asynchronously
    if (rubyBuffer.trim()) {
        console.log('🔧 Processing Ruby code...');
        console.log('Ruby buffer content:', rubyBuffer);
        setTimeout(() => {
            try {
                if (typeof LibRubyParser !== 'undefined') {
                    const result = LibRubyParser.parse(rubyBuffer);
                    console.log('Parse result:', result);
                    if (result?.ast) {
                        runParsedAST(result.ast);
                        console.log('✅ Ruby code processed');
                    } else {
                        console.warn('No AST returned from parser');
                    }
                } else {
                    console.warn('LibRubyParser not available');
                }
            } catch (e) {
                console.error('❌ Ruby processing failed:', e);
            }
        }, 0);
    }
}

// ✅ Runtime helpers
window.wait = (ms) => (fn) => setTimeout(fn, parseInt(ms));
window.compute = (a, b) => (fn) => fn(a + b);

// ✅ Initialize when DOM is ready
function initTranspiler() {
    const checkReady = setInterval(() => {
        if (typeof LibRubyParser !== 'undefined' && typeof LibRubyParser.parse === 'function') {
            clearInterval(checkReady);

            fetch('./application/example.sqr')
                .then(res => res.text())
                .then(code => {
                    console.log('📄 Original code loaded');
                    processCode(code);
                })
                .catch(e => console.error('❌ Failed to load code:', e));
        }
    }, 50);
}

// Start when DOM is ready
document.readyState === 'loading' ?
    document.addEventListener('DOMContentLoaded', initTranspiler) :
    initTranspiler();});