
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


// JavaScript: Full transpile function for lib-ruby-parser output
// Transpile Ruby AST into JavaScript
// ✅ Utilitaire pour convertir les strings internes Ruby (Bytes, Symboles, etc.) en JS safe strings
function toJSString(value) {
    if (!value) return '""';
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'number') return value.toString();
    if (value.value) return JSON.stringify(value.value);
    if (value.name?.raw) return JSON.stringify(String.fromCharCode(...Object.values(value.name.raw)));
    if (value.name) return JSON.stringify(value.name);
    if (value.raw) return JSON.stringify(String.fromCharCode(...Object.values(value.raw)));
    return JSON.stringify(String(value));
}

// ✅ Sanitize JS final output pour éviter erreurs de nom ou collisions
function sanitize(js) {
    return js
        .replace(/const\(let /g, 'let ')                     // Fix const(let xxx)
        .replace(/undefined/g, 'null')                       // Sécurité JS
        .replace(/\[object Object\]/g, 'null')              // Fix objets mal parsés
        .replace(/function null\(.*?\)/g, 'function anon()') // Cas sans nom
        .replace(/\(\(\) => \{\n  \n\}\)/g, '(() => {})'); // Blocs vides
}

// ✅ Transpileur minimal Ruby AST ➝ JavaScript
function transpile(node) {
    if (!node || typeof node !== 'object') return 'null';
    if (!node.type) return `/* No type for: ${JSON.stringify(node)} */`;

    switch (node.type) {
        case 'Begin':
            return node.statements.map(transpile).join('\n');

        case 'Lvasgn':
            return `let ${node.name} = ${transpile(node.value)};`;

        case 'Hash': {
            const pairs = node.pairs.map(pair => `${toJSString(pair.key)}: ${transpile(pair.value)}`);
            return `{ ${pairs.join(', ')} }`;
        }

        case 'Array':
            return `[${node.elements.map(transpile).join(', ')}]`;

        case 'Int':
        case 'Float':
            return node.value;

        case 'Str':
        case 'Sym':
            return toJSString(node.value || node.name);

        case 'True':
            return 'true';

        case 'False':
            return 'false';

        case 'Lvar':
            return node.name;

        case 'Dstr':
            return '`' + node.parts.map(transpile).join('') + '`';

        case 'Send': {
            const recv = node.receiver ? transpile(node.receiver) + '.' : '';
            const method = node.method_name;
            const args = node.args ? node.args.map(transpile).join(', ') : '';
            if (!recv && method === 'puts') return `console.log(${args})`;
            return `${recv}${method}(${args})`;
        }

        case 'Def': {
            const fnName = node.name || 'anon';
            const args = (node.args?.args || []).map(a => a.name || 'arg').join(', ');
            const body = transpile(node.body);
            return `function ${fnName}(${args}) {\n  ${body}\n}`;
        }

        case 'Block': {
            const call = transpile(node.call);
            const args = (node.args?.args || []).map(a => a.name || 'arg').join(', ');
            const body = Array.isArray(node.body) ? node.body.map(transpile).join('\n  ') : transpile(node.body);
            return `${call}(((${args}) => {\n  ${body}\n}))`;
        }

        case 'Return':
            return `return ${transpile(node.value)}`;

        case 'Binary':
            return `${transpile(node.left)} ${node.operator} ${transpile(node.right)}`;

        case 'Index':
            return `${transpile(node.recv)}[${node.indexes.map(transpile).join(', ')}]`;

        default:
            console.warn(`⚠️ Unhandled node type: ${node.type}`);
            return `/* Unhandled node type: ${node.type} */`;
    }
}

// ✅ Fonction principale
function runParsedAST(ast) {
    try {
        const js = transpile(ast);
        const clean = sanitize(js);
        const fn = new Function(clean);
        fn();
        return clean;
    } catch (err) {
        console.error('Execution failed:', err);
        return null;
    }
}


// Runtime helpers if needed
function wait(ms) {
    return (fn) => setTimeout(fn, parseInt(ms));
}

function compute(a, b) {
    return (fn) => fn(a + b); // adapt as needed
}


window.addEventListener('DOMContentLoaded', () => {
    // on attend que la lib soit dispo globalement
    const checkReady = setInterval(() => {
        if (typeof LibRubyParser !== 'undefined' && typeof LibRubyParser.parse === 'function') {
            clearInterval(checkReady);

            fetch('../application/example.sqr')
                .then(res => res.text())
                .then(code => {
                    const result = LibRubyParser.parse(code);
                    // console.log(code)
                    const jsCode = transpile(result.ast);
                    console.log('🧠 JavaScript transpiled:\n', jsCode);
                })
                .catch(console.error);
        }
    }, 50);
});


// best solution to run js parsed data : const run = new Function(transpile(ast));
// run();