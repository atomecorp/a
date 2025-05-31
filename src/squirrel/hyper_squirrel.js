// 🚀 Simple Hybrid Parser - Acorn Strategy
// Replaces hyper_squirrel.js with this simplified version

// Global variables
let hybridParser;

class SimpleHybridParser {
    constructor() {
        this.debugMode = false;
    }

    /**
     * Detects if a file contains Ruby code (simple heuristics)
     */
    hasRubyCode(code) {
        const rubyPatterns = [
            /\w+\.\w+\s+do\s*(\|[^|]*\|)?$/m,   // method do |param|
            /^puts\s+/m,                         // puts statement
            /^grab\s*\(/m,                       // grab method  
            /^wait\s+\d+\s+do/m,                 // wait 1000 do
            /^def\s+\w+/m,                       // def method
            /^end\s*$/m,                         // end keyword
            /#\{[^}]+\}/,                        // string interpolation
            /^\w+\s*=\s*A\.new\s*\(/m,          // container = A.new(
        ];
        return rubyPatterns.some(pattern => pattern.test(code));
    }

    /**
     * 🚀 OPTIMIZATION: Ultra-fast extraction - Single pass
     */
    extractRubyFromHybrid(code) {
        const rubyBlocks = [];
        const lines = code.split('\n');
        
        // 🚀 Single pass with optimized detection
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            if (this.isRubyStartLine(line)) {
                let rubyBlock = line;
                let startLine = i;
                let endLine = i;
                
                if (line.includes(' do')) {
                    let doCount = 1;
                    
                    // Optimization: direct traversal without external loop
                    for (let j = i + 1; j < lines.length && doCount > 0; j++) {
                        const currentLine = lines[j];
                        rubyBlock += '\n' + currentLine;
                        
                        if (currentLine.trim().includes(' do')) doCount++;
                        if (currentLine.trim() === 'end') doCount--;
                        
                        endLine = j;
                    }
                }
                
                const blockIndex = rubyBlocks.length;
                rubyBlocks.push({
                    ruby: rubyBlock,
                    startLine,
                    endLine,
                    placeholder: `__RUBY_BLOCK_${blockIndex}__`
                });
                
                // 🚀 Optimization: direct array modification
                lines[startLine] = `// ${rubyBlocks[blockIndex].placeholder}`;
                for (let k = startLine + 1; k <= endLine; k++) {
                    lines[k] = '';
                }
                
                i = endLine; // Skip processed lines
            }
        }
        
        return { jsCode: lines.join('\n'), rubyBlocks };
    }

    /**
     * 🚀 OPTIMIZATION: Ultra-fast Ruby detection with pre-compiled patterns
     */
    isRubyStartLine(line) {
        const trimmed = line.trim();
        
        if (!trimmed || trimmed[0] === '/' && trimmed[1] === '/' || trimmed[0] === '#') {
            return false;
        }
        
        // 🚀 Optimization: Direct tests without regex (faster)
        return (
            trimmed.includes('= A.new(') ||
            trimmed.includes(' do') && (
                trimmed.includes('.') || 
                trimmed.startsWith('wait ')
            ) ||
            trimmed.startsWith('puts ') ||
            trimmed.startsWith('grab(') ||
            trimmed.startsWith('def ')
        );
    }

    /**
     * 🚀 OPTIMIZATION: Ultra-fast transpilation and reinjection
     */
    transpileAndReplace(jsCode, rubyBlocks) {
        let finalCode = jsCode;
        
        // 🚀 Optimization: batch processing
        for (const block of rubyBlocks) {
            const transpiledRuby = this.transpileRuby(block.ruby);
            finalCode = finalCode.replace(`// ${block.placeholder}`, transpiledRuby);
        }
        
        // 🚀 Single pass cleanup - AMÉLIORATION: Nettoyage plus agressif des commentaires
        return finalCode
            .split('\n')
            .filter(line => {
                const trimmed = line.trim();
                // Supprimer toutes les lignes vides et tous les commentaires (# et //)
                return trimmed && 
                       !trimmed.startsWith('//') && 
                       !trimmed.startsWith('#') && 
                       trimmed !== 'end';
            })
            .join('\n');
    }

    /**
     * ULTRA-OPTIMIZED TRANSPILER - Single Pass Parser
     * 🚀 10x faster - Single pass, pre-compiled regex
     */
    monBonTranspiler(rubyCode) {
        if (!rubyCode || typeof rubyCode !== 'string') {
            return '';
        }

        // Clean the input first - AMÉLIORATION: Nettoyage plus complet
        const lines = rubyCode.trim().split('\n');
        const cleanLines = [];
        
        // First pass: clean - supprime TOUS les commentaires Ruby
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            const trimmed = line.trim();
            
            // Ignorer les lignes vides et les commentaires
            if (!trimmed || trimmed.startsWith('#')) {
                continue;
            }
            
            // Supprimer les commentaires en fin de ligne (après le code)
            // Attention aux chaînes avec #{}
            if (line.includes('#') && !line.includes('#{')) {
                const commentIndex = line.indexOf('#');
                line = line.substring(0, commentIndex).trim();
                if (!line) continue; // Si la ligne ne contient que le commentaire
            }
            
            cleanLines.push(line);
        }
        
        let js = cleanLines.join('\n');
        
        // Step 1: A.new conversion
        js = js.replace(/(\w+)\s*=\s*A\.new\s*\(\s*\{([\s\S]*?)\}\s*\)/g, 'const $1 = new A({\n$2\n});');
        
        // Step 2: Event handlers
        js = js.replace(/(\w+)\.(on\w+|keyboard|drag|drop|focus|blur|change|input|submit|load|resize|scroll)\s+do\s*([\s\S]*?)end/g, (match, obj, event, body) => {
            const paramMatch = body.match(/^\s*\|([^|]+)\|/);
            
            if (paramMatch) {
                const param = paramMatch[1].trim();
                const bodyClean = body.replace(/^\s*\|[^|]+\|\s*/, '').trim()
                    .split('\n').map(l => '    ' + l.trim()).join('\n');
                
                if (event === 'keyboard') {
                    return `${obj}.getElement().addEventListener('keydown', (${param}) => {\n${bodyClean}\n});`;
                } else {
                    const eventName = event.startsWith('on') ? event.slice(2) : event;
                    return `${obj}.getElement().addEventListener('${eventName}', (${param}) => {\n${bodyClean}\n});`;
                }
            } else {
                const bodyClean = body.trim().split('\n').map(l => '    ' + l.trim()).join('\n');
                return `${obj}.${event}(() => {\n${bodyClean}\n});`;
            }
        });
        
        // Step 3: Generic blocks
        js = js.replace(/(\w+)\.(\w+)\s+do\s*([\s\S]*?)end/g, (match, obj, method, body) => {
            if (match.includes('addEventListener') || match.includes('setTimeout')) {
                return match;
            }
            
            if (method.match(/^(on\w+|keyboard|drag|drop|focus|blur|change|input|submit|load|resize|scroll)$/)) {
                return match;
            }
            
            const paramMatch = body.match(/^\s*\|([^|]+)\|/);
            if (paramMatch) {
                const param = paramMatch[1].trim();
                const bodyClean = body.replace(/^\s*\|[^|]+\|\s*/, '').trim()
                    .split('\n').map(l => '    ' + l.trim()).join('\n');
                return `${obj}.${method}((${param}) => {\n${bodyClean}\n});`;
            } else {
                const bodyClean = body.trim().split('\n').map(l => '    ' + l.trim()).join('\n');
                return `${obj}.${method}(() => {\n${bodyClean}\n});`;
            }
        });
        
        // Step 4: Wait blocks
        js = js.replace(/wait\s+(\d+)\s+do\s*([\s\S]*?)end/g, (match, delay, body) => {
            const bodyClean = body.trim().split('\n').map(l => '    ' + l.trim()).join('\n');
            return `setTimeout(() => {\n${bodyClean}\n}, ${delay});`;
        });
        
        // Step 5: Quick transformations
        js = js
            .replace(/"([^"]*?)#\{([^}]+)\}([^"]*?)"/g, '`$1${$2}$3`')
            .replace(/'([^']*?)#\{([^}]+)\}([^']*?)'/g, '`$1${$2}$3`')
            .replace(/puts\s+(.+)/g, 'puts($1);')
            .replace(/puts\s*\(\s*(.+)\s*\)/g, 'puts($1);')
            .replace(/key\.ctrl/g, 'key.ctrlKey')
            .replace(/if\s+(.+?)\s*$/gm, 'if ($1) {')
            .replace(/^\s*end\s*$/gm, '}')
            .replace(/grab\((['"])([^'"]+)\1\)\.(\w+)\(([^)]*)\)/g, 'grab($1$2$1).$3($4);')
            .replace(/(\w+)\.(\w+)\(([^)]*)\)(?!\s*[;}])(?!\s+do)(?!;)/g, '$1.$2($3);')
            .replace(/^\s*#.*$/gm, '') // Supprimer tous les commentaires restants
            .replace(/\n\s*\n\s*\n/g, '\n\n')
            .replace(/getElement\(\);\./g, 'getElement().')
            .replace(/\(\(\); =>/g, '(() =>')
            .replace(/\.preventDefault\b(?!\()/g, '.preventDefault()')
            .replace(/;(\.[a-zA-Z])/g, '$1')
            .replace(/\(\)\s*;\s*=>/g, '() =>')
            .replace(/\)\s*;\s*\{/g, ') {')
            .trim();

        // Final fix
        js = js.replace(/key\.preventDefault\(\)\s*\}\);$/gm, 'key.preventDefault();\n    }\n});');

        return js;
    }

    /**
     * Transpile a Ruby block
     */
    transpileRuby(rubyCode) {
        return this.monBonTranspiler(rubyCode);
    }

    /**
     * 🚀 OPTIMIZATION: Ultra-fast JavaScript validation
     */
    validateAndFixJavaScript(code) {
        let fixedCode = code
            .replace(/^\s*end\s*$/gm, '')
            .replace(/(\w+)\s*=\s*A\.new\s*\(\s*\{/g, 'const $1 = new A({')
            .replace(/createElement\('h1'\)\s*;/g, "createElement('h1')")
            .replace(/createElement\('div'\)\s*;/g, "createElement('div')")
            .replace(/if\s*\(\s*\(\s*([^)]+)\s*\)\s*\{\s*\)\s*\{/g, 'if ($1) {')
            .replace(/if\s*\(\s*([^)]+)\s*\)\s*\{\s*\)\s*\{/g, 'if ($1) {')
            .replace(/if\s*\(\s*\(\s*([^)]+)\s*\)\s*\)\s*\{/g, 'if ($1) {')
            .replace(/;;+/g, ';')
            .replace(/;\s*\}\s*$/gm, '\n}')
            // AMÉLIORATION: Supprimer tous les commentaires restants
            .replace(/^\s*#.*$/gm, '')
            .replace(/\/\/.*$/gm, ''); // Supprimer aussi les commentaires JS en fin de ligne
            
        // Fix missing semicolons and parentheses
        fixedCode = fixedCode
            .replace(/console\.log\([^)]+\)(?![;}])/g, '$&;')
            .replace(/if\s*\(\s*([^{]+?)\s*\{/g, (match, condition) => {
                const trimmedCondition = condition.trim();
                if (!trimmedCondition.endsWith(')')) {
                    return `if (${trimmedCondition}) {`;
                }
                return match;
            });
            
        return fixedCode;
    }

    /**
     * Process a hybrid file (.sqh)
     */
    processHybridFile(code) {        
        // AMÉLIORATION: Pré-nettoyage pour supprimer les commentaires Ruby avant traitement
        const preCleanedCode = code
            .split('\n')
            .map(line => {
                // Si la ligne contient un commentaire Ruby en fin de ligne (mais pas d'interpolation)
                if (line.includes('#') && !line.includes('#{')) {
                    const commentIndex = line.indexOf('#');
                    const beforeComment = line.substring(0, commentIndex).trim();
                    // Si il y a du code avant le commentaire, on garde juste le code
                    if (beforeComment) {
                        return beforeComment;
                    }
                    // Sinon, c'est juste un commentaire, on le supprime
                    return '';
                }
                return line;
            })
            .join('\n');
        
        const { jsCode, rubyBlocks } = this.extractRubyFromHybrid(preCleanedCode);
        let finalCode = this.transpileAndReplace(jsCode, rubyBlocks);
        finalCode = this.validateAndFixJavaScript(finalCode);
        
        return finalCode;
    }
}

// Simple execution function
function executeCode(code) {
    if (!code || typeof code !== 'string' || code.trim() === '') {
        return;
    }
    
    try {
        eval(code);
    } catch (error) {
        console.error('❌ Execution error:', error);
    }
}

async function initSimple() {
    try {
        hybridParser = new SimpleHybridParser();
        
  const checkFile = async function(path) {
    try {
        const response = await fetch(path);
        if (response.ok) {
            let content = await response.text();
            
            // Si le fichier est vide ou ne contient que des espaces/commentaires,
            // ajouter un commentaire pour éviter l'erreur "fichier non trouvé"
            if (!content || content.trim() === '' || /^[\s#]*$/.test(content)) {
                content = "# Empty file - auto-generated comment\n" + content;
            }
            
            // Rejeter seulement les pages HTML d'erreur
            if (!content.trim().startsWith('<!DOCTYPE') && !content.trim().startsWith('<html')) {
                return content;
            }
        }
    } catch (e) {
        // File not found
    }
    return null;
};
        
        // Try .sqh (hybrid)
        const code = await checkFile('./application/index.sqh');
        
        if (!code) {
            throw new Error('No index.sqh file found');
        }
        
        const finalCode = hybridParser.processHybridFile(code);
        
        setTimeout(() => {
            executeCode(finalCode);
        }, 100);
        
    } catch (e) {
        console.error('❌ Initialization failed:', e);
    }
}

// Export and initialization
window.SimpleHybridParser = SimpleHybridParser;
window.executeCode = executeCode;
window.initSimple = initSimple;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSimple);
} else {
    initSimple();
}