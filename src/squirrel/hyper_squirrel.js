// 🚀 Parser Hybride Simple - Stratégie Acorn
// Remplace hyper_squirrel.js par cette version simplifiée

// Variables globales
let hybridParser;

class SimpleHybridParser {
    constructor() {
        this.debugMode = true;
    }

    /**
     * Détecte si un fichier contient du code Ruby (heuristiques simples)
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
     * Stratégie Acorn : extraire le Ruby du JavaScript
     */
    extractRubyFromHybrid(code) {
        const rubyBlocks = [];
        const lines = code.split('\n');
        let jsCode = code;
        
        let i = 0;
        while (i < lines.length) {
            const line = lines[i];
            
            // Détecter le début d'un bloc Ruby
            if (this.isRubyStartLine(line)) {
                let rubyBlock = line;
                let startLine = i;
                let endLine = i;
                
                // Si c'est un bloc do...end, capturer tout le bloc
                if (line.includes(' do')) {
                    let doCount = 1; // Compter les "do" 
                    
                    for (let j = i + 1; j < lines.length; j++) {
                        const currentLine = lines[j];
                        rubyBlock += '\n' + currentLine;
                        
                        // Compter les "do" et "end" pour gérer les blocs imbriqués
                        if (currentLine.trim().includes(' do')) {
                            doCount++;
                        }
                        if (currentLine.trim() === 'end') {
                            doCount--;
                            if (doCount === 0) {
                                endLine = j;
                                break;
                            }
                        }
                        endLine = j;
                    }
                }
                
                rubyBlocks.push({
                    ruby: rubyBlock,
                    startLine,
                    endLine,
                    placeholder: `__RUBY_BLOCK_${rubyBlocks.length}__`
                });
                
                // Remplacer le Ruby par un placeholder dans le JS
                for (let k = startLine; k <= endLine; k++) {
                    if (k === startLine) {
                        lines[k] = `// ${rubyBlocks[rubyBlocks.length - 1].placeholder}`;
                    } else {
                        lines[k] = '';
                    }
                }
                
                i = endLine + 1; // Sauter les lignes traitées
            } else {
                i++;
            }
        }
        
        jsCode = lines.join('\n');
        
        if (this.debugMode) {
            console.log(`🔍 Extraits ${rubyBlocks.length} blocs Ruby du code hybride`);
            rubyBlocks.forEach((block, i) => {
                console.log(`📦 Bloc Ruby ${i + 1}:`, block.ruby.substring(0, 100) + '...');
            });
        }
        
        return { jsCode, rubyBlocks };
    }

    /**
     * Détecter le début d'un bloc Ruby (plus strict)
     */
    isRubyStartLine(line) {
        const trimmed = line.trim();
        
        // Ignorer les commentaires et lignes vides
        if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) {
            return false;
        }
        
        const rubyStartPatterns = [
            /^\w+\s*=\s*A\.new\s*\(/,           // container = A.new(
            /^\w+\.\w+\s+do\s*(\|[^|]*\|)?$/,   // obj.method do |param|
            /^puts\s+/,                         // puts statement
            /^grab\s*\(/,                       // grab method  
            /^wait\s+\d+\s+do/,                 // wait 1000 do
            /^def\s+\w+/,                       // def method
        ];
        
        return rubyStartPatterns.some(pattern => pattern.test(trimmed));
    }

    /**
     * Détecter une ligne Ruby
     */
    isRubyLine(line) {
        const trimmed = line.trim();
        
        // Ignorer les commentaires et lignes vides
        if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) {
            return false;
        }
        
        const rubyPatterns = [
            /^\w+\s*=\s*A\.new\s*\(/,           // container = A.new(
            /^\w+\.\w+\s+do\s*(\|[^|]*\|)?$/,   // obj.method do |param|
            /^puts\s+/,                         // puts statement
            /^grab\s*\(/,                       // grab method  
            /^wait\s+\d+\s+do/,                 // wait 1000 do
            /^def\s+\w+/,                       // def method
        ];
        
        // 🔧 FIX: Ne pas détecter "end" isolé comme Ruby dans un contexte JavaScript
        // Vérifier si c'est juste "end" isolé
        if (trimmed === 'end') {
            return false; // On laisse le parser de blocs gérer les "end"
        }
        
        return rubyPatterns.some(pattern => pattern.test(trimmed));
    }

    /**
     * Nettoyer les commentaires Ruby et syntaxe Ruby du code
     */
    cleanRubyComments(code) {
        return code.split('\n')
            .filter(line => {
                const trimmed = line.trim();
                // Garder les lignes qui ne sont pas des commentaires Ruby ou des "end" isolés
                return !trimmed.startsWith('#') && trimmed !== 'end';
            })
            .join('\n');
    }

    /**
     * Transpiler les blocs Ruby et les réinjecter
     */
    transpileAndReplace(jsCode, rubyBlocks) {
        let finalCode = jsCode;
        
        for (const block of rubyBlocks) {
            // Transpiler le Ruby
            const transpiledRuby = this.transpileRuby(block.ruby);
            
            // Remplacer le placeholder par le code transpilé
            finalCode = finalCode.replace(
                `// ${block.placeholder}`,
                transpiledRuby
            );
        }
        
        // 🔧 FIX: Nettoyer les commentaires Ruby restants
        finalCode = this.cleanRubyComments(finalCode);
        
        return finalCode;
    }

    /**
     * VOTRE fonction transpiler qui fonctionne parfaitement
     * Intégrée depuis transpiller.js
     */
    monBonTranspiler(rubyCode) {
        if (!rubyCode || typeof rubyCode !== 'string') {
            console.warn('⚠️ Invalid input for transpiler');
            return '';
        }

        // Clean the input first
        let js = rubyCode
            .trim()
            .split('\n')
            .filter(line => {
                const trimmed = line.trim();
                return trimmed && !trimmed.startsWith('####') && !trimmed.startsWith('#');
            })
            .join('\n');

        // Step 1: Convert A.new to new A (IMPROVED to handle complex objects)
        js = js.replace(/(\w+)\s*=\s*A\.new\s*\(\s*\{([\s\S]*?)\}\s*\)/g, (match, varName, props) => {
            // Don't modify the props content, just wrap it properly
            return `const ${varName} = new A({\n${props}\n});`;
        });

        // Step 2: Convert ALL event handlers with proper syntax (UNIVERSAL)
        js = js.replace(/(\w+)\.(on\w+|keyboard|drag|drop|focus|blur|change|input|submit|load|resize|scroll)\s+do\s*([\s\S]*?)end/g, (match, obj, event, body) => {
            console.log(`🔄 Event processing: ${obj}.${event}`);
            
            // Extract parameter if exists |param|
            const paramMatch = body.match(/^\s*\|([^|]+)\|/);
            
            if (paramMatch) {
                // Event with parameter
                const param = paramMatch[1].trim();
                const bodyWithoutParam = body.replace(/^\s*\|[^|]+\|\s*/, '').trim();
                
                const finalBody = bodyWithoutParam
                    .split('\n')
                    .map(line => '    ' + line.trim())
                    .join('\n');
                
                // Special handling for keyboard events
                if (event === 'keyboard') {
                    return `${obj}.getElement().addEventListener('keydown', (${param}) => {\n${finalBody}\n});`;
                } else {
                    // Generic event with parameter
                    const eventName = event.startsWith('on') ? event.slice(2) : event;
                    return `${obj}.getElement().addEventListener('${eventName}', (${param}) => {\n${finalBody}\n});`;
                }
            } else {
                // Event without parameter
                const cleanBody = body
                    .trim()
                    .split('\n')
                    .map(line => '    ' + line.trim())
                    .join('\n');
                
                return `${obj}.${event}(() => {\n${cleanBody}\n});`;
            }
        });

        // Step 2b: UNIVERSAL GENERIC RULE (catches non-event methods)
        js = js.replace(/(\w+)\.(\w+)\s+do\s*([\s\S]*?)end/g, (match, obj, method, body) => {
            console.log(`🔄 Generic rule processing: ${obj}.${method}`);
            
            // Skip if already processed by event rules
            if (match.includes('addEventListener') || match.includes('setTimeout')) {
                return match;
            }
            
            // Skip if it's an event (already handled above)
            if (method.match(/^(on\w+|keyboard|drag|drop|focus|blur|change|input|submit|load|resize|scroll)$/)) {
                return match;
            }
            
            // Extract parameter if exists |param|
            const paramMatch = body.match(/^\s*\|([^|]+)\|/);
            if (paramMatch) {
                const param = paramMatch[1].trim();
                const bodyWithoutParam = body.replace(/^\s*\|[^|]+\|\s*/, '').trim();
                
                const finalBody = bodyWithoutParam
                    .split('\n')
                    .map(line => '    ' + line.trim())
                    .join('\n');
                
                return `${obj}.${method}((${param}) => {\n${finalBody}\n});`;
            } else {
                // No parameter
                const cleanBody = body
                    .trim()
                    .split('\n')
                    .map(line => '    ' + line.trim())
                    .join('\n');
                
                return `${obj}.${method}(() => {\n${cleanBody}\n});`;
            }
        });

        // Step 2c: Handle simple method calls (no do...end blocks) - FIXED
        js = js.replace(/(\w+)\.(\w+)\(([^)]*)\)(?!\s*[;}])/g, '$1.$2($3);');

        // Step 3: Convert wait blocks to setTimeout
        js = js.replace(/wait\s+(\d+)\s+do\s*([\s\S]*?)end/g, (match, delay, body) => {
            const cleanBody = body
                .trim()
                .split('\n')
                .map(line => '    ' + line.trim())
                .join('\n');
            return `setTimeout(() => {\n${cleanBody}\n}, ${delay});`;
        });

        // Step 4: Handle simple method calls BEFORE string interpolation (MOVED UP)
        js = js.replace(/(\w+)\.(\w+)\(([^)]*)\)(?!\s*[;}])(?!\s+do)/g, '$1.$2($3);');

        // Step 4: Handle Ruby string interpolation FIRST (FIXED ORDER)
        js = js.replace(/"([^"]*?)#\{([^}]+)\}([^"]*?)"/g, '`$1${$2}$3`');
        js = js.replace(/'([^']*?)#\{([^}]+)\}([^']*?)'/g, '`$1${$2}$3`');
        
        // Step 5: Handle puts statements
        js = js.replace(/puts\s*\(\s*(.+)\s*\)/g, 'puts($1);');
        js = js.replace(/puts\s+(.+)/g, 'puts($1);');

        // Step 6: Handle Ruby conditionals
        js = js.replace(/key\.ctrl/g, 'key.ctrlKey');
        js = js.replace(/if\s+(.+?)\s*$/gm, 'if ($1) {');
        js = js.replace(/^\s*end\s*$/gm, '}');

        // Step 7: Handle grab calls (REVERTED - grab was working fine)
        js = js.replace(/grab\("([^"]+)"\)\.(\w+)\("([^"]+)"\)/g, 'grab("$1").$2("$3");');
        js = js.replace(/grab\('([^']+)'\)\.(\w+)\("([^"]+)"\)/g, 'grab("$1").$2("$3");');
        js = js.replace(/grab\("([^"]+)"\)\.(\w+)\(\)/g, 'grab("$1").$2();');
        js = js.replace(/grab\('([^']+)'\)\.(\w+)\(\)/g, 'grab("$1").$2();');

        // Step 9: Clean up syntax errors caused by multiple transformations
        js = js
            .replace(/^\s*#.*$/gm, '') // Remove any remaining comments
            .replace(/\n\s*\n\s*\n/g, '\n\n') // Clean multiple newlines
            .replace(/getElement\(\);\./g, 'getElement().') // Fix getElement();. → getElement().
            .replace(/\(\(\); =>/g, '(() =>') // Fix (()); => → (() =>
            .replace(/\.preventDefault\b(?!\()/g, '.preventDefault()') // Fix preventDefault without ()
            .trim();
        
        // Step 10: Fix the specific broken pattern we see in the logs - CORRIGÉ
        js = js.replace(
            /(addEventListener\('keydown',\s*\([^)]+\)\s*=>\s*\{[^}]*?key\.preventDefault\(\)[^}]*?if\s*\([^)]+\)\s*\{[^}]*?puts[^}]*?key\.preventDefault\(\))\s*\}\);/g,
            `$1
    }
});`
        );
        
        // Alternative fix - pattern plus simple
        js = js.replace(
            /key\.preventDefault\(\)\s*\}\);$/gm,
            `key.preventDefault();
    }
});`
        );

        console.log('🔍 Transpiled result:', js); // Debug log
        return js;
    }

    /**
     * Transpiler un bloc Ruby avec VOTRE transpiler qui fonctionne
     */
    transpileRuby(rubyCode) {
        // 🔧 UTILISATION DE VOTRE BON TRANSPILER
        return this.monBonTranspiler(rubyCode);
    }

    /**
     * Valider et corriger la syntaxe JavaScript
     */
    validateAndFixJavaScript(code) {
        let fixedCode = code;
        
        // 1. Supprimer les "end" isolés qui traînent
        fixedCode = fixedCode.replace(/^\s*end\s*$/gm, '');
        
        // 2. 🔧 FIX SPÉCIFIQUE: Corriger A.new en new A (au cas où le transpiler l'a raté)
        fixedCode = fixedCode.replace(/(\w+)\s*=\s*A\.new\s*\(\s*\{/g, 'const $1 = new A({');
        
        // 3. 🔧 FIX SPÉCIFIQUE: Corriger le addEventListener keyboard cassé
        fixedCode = fixedCode.replace(
            /(addEventListener\('keydown',\s*\([^)]*\)\s*=>\s*\{[^{}]*if\s*\([^)]*\)\s*\{[^{}]*key\.preventDefault\(\))\s*\}\);/g,
            '$1;\n    }\n});'
        );
        
        // 4. Nettoyer les lignes vides multiples
        fixedCode = fixedCode.replace(/\n\s*\n\s*\n/g, '\n\n');
        
        if (this.debugMode) {
            console.log('🔧 Code après correction syntaxe:', fixedCode.substring(0, 200) + '...');
        }
        
        return fixedCode;
    }

    /**
     * Traiter un fichier hybride (.sqh)
     */
    processHybridFile(code) {
        console.log('🔄 Traitement fichier hybride (.sqh)...');
        
        // Étape 1: Extraire le Ruby du JavaScript
        const { jsCode, rubyBlocks } = this.extractRubyFromHybrid(code);
        
        // Étape 2: Transpiler et réinjecter
        let finalCode = this.transpileAndReplace(jsCode, rubyBlocks);
        
        // Étape 3: Validation et correction JavaScript
        finalCode = this.validateAndFixJavaScript(finalCode);
        
        if (this.debugMode) {
            console.log('📝 Code final hybride:', finalCode.substring(0, 300) + '...');
            
            // 🔧 DEBUG: Afficher le code final complet pour diagnostiquer
            console.log('🔍 DEBUG - Code final CORRIGÉ:');
            console.log('=====================================');
            console.log(finalCode);
            console.log('=====================================');
        }
        
        return finalCode;
    }
}

// Fonction d'exécution simple
function executeCode(code) {
    if (!code || typeof code !== 'string' || code.trim() === '') {
        console.warn('⚠️ No code to execute');
        return;
    }
    
    console.log('🚀 Executing code...');
    
    try {
        eval(code);
        console.log('✅ Code executed successfully');
    } catch (error) {
        console.error('❌ Execution error:', error);
    }
}

// Fonction principale SIMPLIFIÉE
async function initSimple() {
    try {
        hybridParser = new SimpleHybridParser();
        console.log('🚀 Simple Hybrid Parser initialisé');
        
        // Détecter et charger le fichier approprié
        let code = null;
        let fileType = null;
        
        const checkFile = async function(path, type) {
            try {
                const response = await fetch(path);
                if (response.ok) {
                    const content = await response.text();
                    // 🔧 FIX: Vérifier que ce n'est pas du HTML
                    if (content && content.trim() !== '' && !content.trim().startsWith('<!DOCTYPE') && !content.trim().startsWith('<html')) {
                        return { content, type };
                    } else if (content.trim().startsWith('<!DOCTYPE') || content.trim().startsWith('<html')) {
                        console.log(`⚠️ ${path} contient du HTML, ignoré`);
                        return null;
                    }
                }
            } catch (e) {
                // Fichier non trouvé
            }
            return null;
        };
        
        // 1. Essayer .sqh (hybride)
        const sqhFile = await checkFile('./application/index.sqh', 'sqh');
        if (sqhFile) {
            code = sqhFile.content;
            fileType = 'sqh';
            console.log('📄 Fichier index.sqh trouvé (mode hybride)');
        }
        
        // 2. Essayer .sqr (Ruby pur)
        if (!code) {
            const sqrFile = await checkFile('./application/index.sqr', 'sqr');
            if (sqrFile) {
                code = sqrFile.content;
                fileType = 'sqr';
                console.log('📄 Fichier index.sqr trouvé (mode Ruby pur)');
            }
        }
        
        // 3. Essayer .sqj (JavaScript pur)
        if (!code) {
            const sqjFile = await checkFile('./application/index.sqj', 'sqj');
            if (sqjFile) {
                code = sqjFile.content;
                fileType = 'sqj';
                console.log('📄 Fichier index.sqj trouvé (mode JavaScript pur)');
            }
        }
        
        if (!code) {
            throw new Error('Aucun fichier index trouvé (.sqh, .sqr, .sqj)');
        }
        
        // Traitement selon le type
        let finalCode;
        
        if (fileType === 'sqh') {
            // Hybride: parser Acorn + extraction + transpilation
            finalCode = hybridParser.processHybridFile(code);
        } else if (fileType === 'sqr') {
            // Ruby pur: transpilation directe (comme avant)
            console.log('🔄 Transpilation Ruby directe...');
            finalCode = window.transpiler ? window.transpiler(code) : code;
        } else if (fileType === 'sqj') {
            // JavaScript pur: exécution directe
            console.log('✅ JavaScript pur, exécution directe');
            finalCode = code;
        }
        
        // Exécution
        setTimeout(() => {
            executeCode(finalCode);
        }, 100);
        
    } catch (e) {
        console.error('❌ Initialization failed:', e);
        
        // Fallback vers .sqr
        try {
            const response = await fetch('./application/index.sqr');
            if (response.ok) {
                const code = await response.text();
                const js = window.transpiler ? window.transpiler(code) : code;
                setTimeout(() => executeCode(js), 100);
            }
        } catch (fallbackError) {
            console.error('❌ Fallback failed:', fallbackError);
        }
    }
}

// Export et initialisation
window.SimpleHybridParser = SimpleHybridParser;
window.executeCode = executeCode;
window.initSimple = initSimple;

console.log('🎯 Simple Hybrid Parser - Starting...');
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSimple);
} else {
    initSimple();
}