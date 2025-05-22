
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
function transpile(node) {
    if (!node || typeof node !== 'object') return '';

    // Infer node type if missing
    if (!node.type) {
        if ('statements' in node) node.type = 'Begin';
        else if ('method_name' in node) node.type = 'Send';
        else if ('call' in node && 'body' in node) node.type = 'Block';
        else if ('name' in node && 'args' in node && 'body' in node) node.type = 'Def';
        else if ('name' in node && 'value' in node) node.type = 'Lvasgn';
        else if ('name' in node && !('value' in node)) node.type = 'Lvar';
        else if ('value' in node && /^\d+$/.test(node.value)) node.type = 'Int';
        else if ('value' in node && /^\d+\.\d+$/.test(node.value)) node.type = 'Float';
        else if ('value' in node && typeof node.value === 'object') node.type = 'Str';
        else if ('parts' in node && Array.isArray(node.parts)) node.type = 'Dstr';
        else if ('pairs' in node) node.type = 'Hash';
        else if ('elements' in node) node.type = 'Array';
        else if ('indexes' in node && 'recv' in node) node.type = 'Index';
        else if ('name' in node && 'operator_l' in node) node.type = 'Sym';
        else if (node.constructor?.name === 'True') node.type = 'True';
        else if (node.constructor?.name === 'False') node.type = 'False';
        else {
            console.warn('❗ Node without .type (inconnu):', node);
            return '/* Unhandled node type: undefined */';
        }
    }

    switch (node.type) {
        case 'Begin':
            return (node.statements || []).map(transpile).join('\n');

        case 'Def': {
            const fnName = node.name;
            const args = (node.args?.parts || []).map(arg => arg.name).join(', ');
            const body = transpile(node.body);
            return `function ${fnName}(${args}) {\n  ${body}\n}`;
        }

        case 'Args':
            return (node.parts || []).map(arg => arg.name).join(', ');

        case 'Send': {
            const recv = node.receiver ? transpile(node.receiver) + '.' : '';
            const method = node.method_name;
            const args = (node.args || []).map(transpile).join(', ');

            if (!recv && method === 'puts') return `console.log(${args})`;
            if (!recv && method === 'log') return `console.log(${args})`;
            if (!recv && method === 'wait') return `wait(${args})`;
            if (!recv && method === 'compute') return `compute(${args})`;
            if (!recv && method === 'const' && node.args?.length === 2) {
                const [name, value] = node.args.map(transpile);
                return `const ${name} = ${value};`;
            }

            return `${recv}${method}(${args})`;
        }

        case 'Block': {
            const call = transpile(node.call);
            const args = (node.args?.parts || []).map(a => a.name).join(', ');
            const body = Array.isArray(node.body)
                ? node.body.map(transpile).join('\n  ')
                : transpile(node.body);
            return `${call}(((${args}) => {\n  ${body}\n}))`;
        }

        case 'Lvasgn':
            return `let ${node.name} = ${transpile(node.value)};`;

        case 'Lvar':
            return node.name;

        case 'Int':
        case 'Float':
            return node.value;

        case 'Str': {
            const raw = node.value?.bytes
                ? new TextDecoder().decode(new Uint8Array(node.value.bytes))
                : node.value;
            return JSON.stringify(raw);
        }

        case 'Sym': {
            const raw = node.name?.bytes
                ? new TextDecoder().decode(new Uint8Array(node.name.bytes))
                : node.name;
            return JSON.stringify(raw);
        }

        case 'Dstr':
            return '`' + (node.parts || []).map(transpile).join('') + '`';

        case 'Binary':
            return `${transpile(node.left)} ${node.operator} ${transpile(node.right)}`;

        case 'Hash':
            return `{ ${node.pairs.map(pair => `${transpile(pair.key)}: ${transpile(pair.value)}`).join(', ')} }`;

        case 'Array':
            return `[${node.elements.map(transpile).join(', ')}]`;

        case 'Index':
            return `${transpile(node.recv)}[${(node.indexes || []).map(transpile).join(', ')}]`;

        case 'Return':
            return `return ${transpile(node.value)}`;

        case 'Pair':
            return `${transpile(node.key)}: ${transpile(node.value)}`;

        case 'True':
            return 'true';

        case 'False':
            return 'false';

        default:
            console.warn(`⚠️ Unhandled node type: ${node.type}`, node);
            return `/* Unhandled node type: ${node.type} */`;
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
