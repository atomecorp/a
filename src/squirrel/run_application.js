
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
function transpile(node) {
    if (!node || typeof node !== 'object') return '/* invalid node */';

    const type = node.type || node.constructor?.name;

    switch (type) {
        case 'Begin':
            return node.statements.map(transpile).join('\n');

        case 'Def': {
            const args = node.args.args.map(arg => transpile(arg)).join(', ');
            const body = transpile(node.body);
            return `function ${node.name}(${args}) {\n  ${body}\n}`;
        }

        case 'Args':
            return node.args.map(transpile).join(', ');

        case 'Send': {
            const recv = node.receiver ? transpile(node.receiver) + '.' : '';
            const args = (node.args || []).map(transpile).join(', ');
            const method = node.method_name;

            if (!recv && method === 'puts') return `console.log(${args})`;
            return `${recv}${method}(${args})`;
        }

        case 'Block': {
            const call = transpile(node.call);
            const args = (node.args?.args || []).map(transpile).join(', ');
            const body = Array.isArray(node.body) ? node.body : [node.body];
            const bodyCode = body.map(transpile).join('\n  ');
            return `${call}(((${args}) => {\n  ${bodyCode}\n}))`;
        }

        case 'Lvasgn':
            return `let ${node.name} = ${transpile(node.value)};`;

        case 'Lvar':
            return node.name;

        case 'Int':
        case 'Float':
            return node.value;

        case 'True':
            return 'true';

        case 'False':
            return 'false';

        case 'Str':
            return JSON.stringify(node.value.source || node.value);

        case 'Sym':
            return JSON.stringify(node.name.source || node.name);

        case 'Dstr':
            return '`' + node.parts.map(transpile).join('') + '`';

        case 'Array':
            return '[' + node.elements.map(transpile).join(', ') + ']';

        case 'Hash':
            return '{ ' + node.pairs.map(p => `${transpile(p.key)}: ${transpile(p.value)}`).join(', ') + ' }';

        case 'Index':
            return `${transpile(node.recv)}[${node.indexes.map(transpile).join(', ')}]`;

        case 'Binary':
            return `${transpile(node.left)} ${node.operator} ${transpile(node.right)}`;

        case 'Return':
            return `return ${transpile(node.value)}`;

        default:
            console.warn('⚠️ Unhandled node:', type, node);
            return `/* Unhandled node type: ${type} */`;
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
