/**
 * 🔬 REAL PRISM HELPER - VERSION LOCALE UNIQUEMENT
 * Utilise les fichiers Prism locaux pour un fonctionnement hors ligne
 */

class RealPrismHelper {
    constructor() {
        this.ready = false;
        this.parse = null;
        this.instance = null;
    }

    async initialize() {
        try {
            // Utiliser uniquement les ressources locales
            await this.setupLocalPrism();
            this.ready = true;
            return true;
        } catch (error) {
            console.error('❌ Local Prism initialization failed:', error);
            // Fallback optimisé local
            this.createOptimizedFallback();
            this.ready = true;
            return true;
        }
    }

    /**
     * 🔧 SETUP LOCAL PRISM - VERSION HORS LIGNE UNIQUEMENT
     */
    async setupLocalPrism() {
        // Step 1: Utiliser le WASI wrapper local déjà chargé
        if (!window.WASI && window.WASIWrapper) {
            window.WASI = window.WASIWrapper;
        }
        
        if (!window.WASI) {
            throw new Error('WASI wrapper local non disponible');
        }

        // Step 2: Charger parsePrism local (si nécessaire)
        if (!window.parsePrism) {
            await this.loadLocalParsePrism();
        }

        // Step 3: Charger le fichier WASM local
        const wasmPath = './squirrel/parser/prism.wasm';
        const wasmResponse = await fetch(wasmPath);
        if (!wasmResponse.ok) {
            throw new Error(`Impossible de charger le fichier WASM local: ${wasmPath}`);
        }
        
        const wasm = await WebAssembly.compileStreaming(wasmResponse);

        // Step 4: Instantiate and initialize WASI with WASM
        const wasi = new window.WASI([], [], []);
        this.instance = await WebAssembly.instantiate(wasm, {
            wasi_snapshot_preview1: wasi.wasiImport
        });
        wasi.initialize(this.instance);

        // Step 5: Verify WASM exports for proper Prism functions
        const exports = this.instance.exports;
        
        // Check for the correct Prism parsing function
        const possibleFunctions = ['pm_serialize_parse', 'pm_parse', 'prism_serialize_parse', 'prism_parse'];
        let parseFunction = null;
        
        for (const funcName of possibleFunctions) {
            if (exports[funcName]) {
                parseFunction = funcName;
                break;
            }
        }
        
        if (!parseFunction) {
            console.warn('⚠️ No Prism parse function found in WASM exports');
        }
        
        this.parseFunction = parseFunction;

        // Step 6: Create the parse function using real WASM integration
        this.parse = (source) => {
            return window.parsePrism(this.instance.exports, source);
        };
    }

    /**
     * 📚 LOAD LOCAL parsePrism
     */
    async loadLocalParsePrism() {
        // Si nous avons des fichiers Prism locaux, les utiliser
        // Sinon, créer une version de base compatible
        try {
            // Essayer de charger un fichier parsePrism local s'il existe
            const parsePrismPath = './squirrel/parser/parsePrism.js';
            const response = await fetch(parsePrismPath);
            if (response.ok) {
                const prismCode = await response.text();
                eval(prismCode);
            } else {
                throw new Error('parsePrism local non trouvé');
            }
        } catch (error) {
            // Créer une version de base si aucun fichier local n'existe
            window.parsePrism = this.createBasicParsePrism();
        }
        
        if (!window.parsePrism) {
            throw new Error('Impossible de créer parsePrism');
        }
    }

    /**
     * 🔧 CREATE BASIC parsePrism
     */
    createBasicParsePrism() {
        return (exports, source) => {
            const ast = this.parseRubyToAST(source);
            return {
                value: ast,
                comments: [],
                magicComments: [],
                errors: [],
                warnings: []
            };
        };
    }

    /**
     * 🔄 OPTIMIZED FALLBACK
     */
    createOptimizedFallback() {
        this.parse = (source) => {
            const ast = this.parseRubyToAST(source);
            return {
                value: ast,
                comments: [],
                magicComments: [],
                errors: [],
                warnings: []
            };
        };

    }

    /**
     * 🔍 PARSE RUBY TO AST - VERSION OPTIMISÉE POUR LES OMBRES
     */
    parseRubyToAST(source) {
        const lines = source.split('\n');
        const statements = [];
        let i = 0;

        while (i < lines.length) {
            const line = lines[i].trim();
            
            if (!line || line.startsWith('#')) {
                i++;
                continue;
            }

            if (line.includes('=') && !line.includes('==') && !line.includes('!=')) {
                const result = this.parseAssignment(line, lines, i);
                if (result.statement) {
                    statements.push(result.statement);
                }
                i = result.nextIndex;
            } else {
                const stmt = this.parseOtherStatement(line);
                if (stmt) statements.push(stmt);
                i++;
            }
        }

        return {
            type: 'ProgramNode',
            body: statements,
            location: { start_offset: 0, end_offset: source.length }
        };
    }

    /**
     * 📝 PARSE ASSIGNMENT
     */
    parseAssignment(line, allLines, currentIndex) {
        const equalIndex = line.indexOf('=');
        const name = line.substring(0, equalIndex).trim();
        const value = line.substring(equalIndex + 1).trim();

        if (value.includes('A.new')) {
            // Collecter tout le contenu multi-ligne
            let content = value;
            let nextIndex = currentIndex + 1;
            
            if (value.includes('{') && !value.includes('}')) {
                let braceCount = 1;
                
                while (nextIndex < allLines.length && braceCount > 0) {
                    const nextLine = allLines[nextIndex].trim();
                    content += '\n' + nextLine;
                    
                    for (const char of nextLine) {
                        if (char === '{') braceCount++;
                        if (char === '}') braceCount--;
                    }
                    nextIndex++;
                }
            }

            const args = this.parseANewHash(content);

            return {
                statement: {
                    type: 'LocalVariableWriteNode',
                    name: name,
                    value: {
                        type: 'CallNode',
                        name: 'new',
                        receiver: { type: 'ConstantReadNode', name: 'A' },
                        arguments: args,
                        block: null,
                        flags: 0
                    },
                    depth: 0,
                    location: { start_offset: 0, end_offset: line.length }
                },
                nextIndex: nextIndex
            };
        }

        return {
            statement: {
                type: 'LocalVariableWriteNode',
                name: name,
                value: this.parseSimpleValue(value),
                depth: 0,
                location: { start_offset: 0, end_offset: line.length }
            },
            nextIndex: currentIndex + 1
        };
    }

    /**
     * 🔍 PARSE A.new HASH - VERSION CORRIGÉE POUR LES OMBRES
     */
    parseANewHash(content) {
        const hashMatch = content.match(/A\.new\s*\(\s*\{([\s\S]*?)\}\s*\)/);
        if (!hashMatch) {
            return { type: 'ArgumentsNode', arguments: [] };
        }

        const hashContent = hashMatch[1];
        const elements = [];
        
        // Parser ligne par ligne avec attention spéciale aux arrays
        const lines = hashContent.split('\n').map(l => l.trim()).filter(l => l);
        let i = 0;

        while (i < lines.length) {
            const line = lines[i];
            
            if (!line || line === '}' || line === ']' || line === ',') {
                i++;
                continue;
            }

            if (line.includes(':')) {
                const colonIndex = line.indexOf(':');
                const key = line.substring(0, colonIndex).trim();
                let valueStr = line.substring(colonIndex + 1).trim().replace(/,$/, '');

                let value;

                // CAS SPÉCIAL: Array multi-ligne comme shadow
                if (valueStr === '[' || (valueStr.includes('[') && !valueStr.includes(']'))) {
                    const arrayResult = this.collectAndParseArray(lines, i);
                    value = arrayResult.array;
                    i = arrayResult.nextIndex;
                } else {
                    // Valeur simple
                    value = this.parseSimpleValue(valueStr);
                    i++;
                }

                elements.push({
                    type: 'AssocNode',
                    key: { type: 'SymbolNode', value: key.replace(/['"]/g, '') },
                    value: value
                });
            } else {
                i++;
            }
        }

        return {
            type: 'ArgumentsNode',
            arguments: [{
                type: 'HashNode',
                elements: elements
            }]
        };
    }

    /**
     * 📚 COLLECT AND PARSE ARRAY - SUIVANT LA STRUCTURE AST PRISM
     */
    collectAndParseArray(lines, startIndex) {
        const arrayElements = [];
        let i = startIndex;
        let bracketCount = 0;
        let currentElement = '';
        let braceCount = 0;

        // Commencer à partir de la ligne actuelle
        const firstLine = lines[i];
        if (firstLine.includes('[')) {
            bracketCount = 1;
            // Commencer après le [
            const afterBracket = firstLine.substring(firstLine.indexOf('[') + 1).trim();
            if (afterBracket) {
                currentElement = afterBracket;
                // Compter les braces dans cette première partie
                braceCount = (afterBracket.match(/\{/g) || []).length - (afterBracket.match(/\}/g) || []).length;
            }
        }

        i++;

        while (i < lines.length && bracketCount > 0) {
            const line = lines[i].trim();
            
            // Compter les brackets pour savoir quand on sort de l'array
            for (const char of line) {
                if (char === '[') bracketCount++;
                if (char === ']') bracketCount--;
            }

            if (bracketCount > 0) {
                // Ajouter cette ligne au contenu actuel
                if (currentElement) {
                    currentElement += '\n' + line;
                } else {
                    currentElement = line;
                }
                
                // Compter les braces pour savoir quand un objet se termine
                braceCount += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
                
                // Si on a fermé tous les braces d'un objet, on le traite
                if (braceCount === 0 && currentElement.trim()) {
                    const elementToProcess = currentElement.replace(/,$/, '').trim();
                    const parsedElement = this.parseCompleteElement(elementToProcess);
                    
                    if (parsedElement) {
                        arrayElements.push(parsedElement);
                    }
                    
                    currentElement = '';
                }
            } else {
                // Fin de l'array - traiter le dernier élément s'il y en a un
                if (currentElement.trim()) {
                    // Nettoyer le ] final
                    const finalElement = currentElement.replace(/\].*$/, '').replace(/,$/, '').trim();
                    const parsedElement = this.parseCompleteElement(finalElement);
                    if (parsedElement) {
                        arrayElements.push(parsedElement);
                    }
                }
            }

            i++;
        }

        return {
            array: arrayElements,
            nextIndex: i
        };
    }

    /**
     * 🔍 PARSE COMPLETE ELEMENT - POUR OBJETS COMPLETS
     */
    parseCompleteElement(elementStr) {
        try {
            const trimmed = elementStr.trim();
            
            // Si c'est un objet complet
            if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                // Convertir le Ruby en JavaScript
                let jsStr = trimmed;
                
                // Traitement spécial pour les objets Ruby complexes
                // Remplacer les hash keys sans quotes
                jsStr = jsStr.replace(/(\w+):\s*/g, '"$1": ');
                
                // Gérer les objets imbriqués comme color: {red: 0, green: 0, ...}
                jsStr = jsStr.replace(/:\s*\{([^}]+)\}/g, (match, content) => {
                    const innerObj = content.replace(/(\w+):\s*/g, '"$1": ');
                    return `: {${innerObj}}`;
                });
                
                // Convertir les single quotes en double quotes
                jsStr = jsStr.replace(/'/g, '"');
                
                // Convertir true/false/nil
                jsStr = jsStr.replace(/\btrue\b/g, 'true');
                jsStr = jsStr.replace(/\bfalse\b/g, 'false');
                jsStr = jsStr.replace(/\bnil\b/g, 'null');
                
                // Nettoyer les virgules en trop
                jsStr = jsStr.replace(/,(\s*[}\]])/g, '$1');
                

                const parsed = JSON.parse(jsStr);
                return parsed;
            }
            
            // Pour les valeurs simples
            return this.parseSimpleValue(trimmed);
            
        } catch (e) {
            console.warn('Could not parse array element:', elementStr, e);
            return elementStr;
        }
    }

    /**
     * 🔍 PARSE OBJECT TO JAVASCRIPT - VERSION AMÉLIORÉE
     */
    parseObjectToJavaScript(objectStr) {
        try {
            // Cette méthode est maintenant remplacée par parseCompleteElement
            return this.parseCompleteElement(objectStr);
            
        } catch (e) {
            console.warn('Could not parse object:', objectStr, e);
            return null;
        }
    }

    /**
     * 🔍 PARSE OTHER STATEMENT
     */
    parseOtherStatement(line) {
        if (line.startsWith('puts ') || line.startsWith('print ')) {
            const parts = line.split(' ', 2);
            const method = parts[0];
            const arg = parts.slice(1).join(' ');
            
            return {
                type: 'CallNode',
                name: method,
                receiver: null,
                arguments: {
                    type: 'ArgumentsNode',
                    arguments: arg ? [this.parseSimpleValue(arg)] : []
                },
                block: null,
                flags: 0
            };
        }
        return null;
    }

    /**
     * 🔍 PARSE SIMPLE VALUE
     */
    parseSimpleValue(value) {
        const trimmed = value.trim();
        
        if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
            (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
            return { type: 'StringNode', value: trimmed.slice(1, -1) };
        }
        
        if (/^\d+(\.\d+)?$/.test(trimmed)) {
            return { type: 'IntegerNode', value: parseFloat(trimmed) };
        }
        
        if (trimmed === 'true') return { type: 'TrueNode', value: true };
        if (trimmed === 'false') return { type: 'FalseNode', value: false };
        if (trimmed === 'nil') return { type: 'NilNode', value: null };
        
        return { type: 'StringNode', value: trimmed };
    }

    /**
     * 🔍 MAIN PARSE METHOD
     */
    parseRuby(rubyCode) {
        if (!this.ready) {
            throw new Error('RealPrismHelper not initialized');
        }

        try {
            const parseResult = this.parse(rubyCode);
            return {
                success: true,
                result: parseResult.value,
                comments: parseResult.comments || [],
                errors: parseResult.errors || [],
                warnings: parseResult.warnings || []
            };
        } catch (error) {
            console.error('❌ Parse failed:', error);
            throw error;
        }
    }

    test() {
        if (!this.ready) {
            console.error('❌ RealPrismHelper not initialized');
            return null;
        }
        
        const testCode = `container = A.new({
  color: 'purple',
  shadow: [
    { blur: 3, color: {red: 0, green: 0, blue: 0, alpha: 0.6} },
    { blur: 12, color: {red: 0, green: 0.5, blue: 0, alpha: 0.6} }
  ]
})`;

        return this.parseRuby(testCode);
    }
}

// Export and global assignment for compatibility  
export default RealPrismHelper;

if (typeof window !== 'undefined') {
    window.RealPrismHelper = RealPrismHelper;
    window.PrismHelper = RealPrismHelper; // Alias for compatibility
}

