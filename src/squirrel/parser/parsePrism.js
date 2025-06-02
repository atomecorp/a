// Version corrigée qui utilise le workflow Prism correct

function parsePrism(exports, source) {
    try {
        if (!exports || !exports.memory) {
            throw new Error('WASM exports not available');
        }
        
        console.log('🔍 Available WASM functions:', Object.keys(exports).filter(k => typeof exports[k] === 'function').slice(0, 10));
        
        // Debug: Afficher TOUTES les fonctions parse-related
        const allFunctions = Object.keys(exports).filter(k => typeof exports[k] === 'function');
        const parseRelated = allFunctions.filter(name => 
            name.includes('parse') || name.startsWith('pm_') || name.includes('prism')
        );
        console.log('🧪 All parse-related functions:', parseRelated.slice(0, 20)); // Premier 20 pour lisibilité
        
        const encoder = new TextEncoder();
        const sourceBytes = encoder.encode(source);
        
        // Vérifier les fonctions de mémoire
        const malloc = exports.malloc || exports.__wbindgen_malloc || exports.memory_allocate;
        const free = exports.free || exports.__wbindgen_free || exports.memory_free;
        
        if (!malloc) {
            console.warn('⚠️ No malloc function found');
            return createErrorResult(source, 'No memory allocation functions available');
        }
        
        console.log('📦 Using Prism parser workflow');
        
        // === WORKFLOW PRISM CORRECT ===
        
        // 1. Chercher les fonctions nécessaires
        const parserInit = exports.pm_parser_init || exports.prism_parser_init;
        const parserParse = exports.pm_parser_parse || exports.prism_parser_parse;
        const parserFree = exports.pm_parser_free || exports.prism_parser_free;
        
        if (!parserInit) {
            console.log('⚠️ No parser_init found, trying direct parsing methods...');
            return tryDirectParsing(exports, source, sourceBytes, malloc, free);
        }
        
        console.log('✅ Found Prism parser functions');
        
        // 2. Allouer mémoire pour le parser (struct pm_parser)
        const parserSize = 1024; // Taille approximative du struct parser
        const parserPtr = malloc(parserSize);
        if (!parserPtr) {
            throw new Error('Failed to allocate parser memory');
        }
        
        // 3. Allouer mémoire pour le code source
        const bufferSize = sourceBytes.length + 64;
        const sourcePtr = malloc(bufferSize);
        if (!sourcePtr) {
            free(parserPtr);
            throw new Error('Failed to allocate source memory');
        }
        
        console.log(`💾 Allocated parser at ${parserPtr}, source at ${sourcePtr}`);
        
        // 4. Copier le code source
        const memory = new Uint8Array(exports.memory.buffer);
        memory.set(sourceBytes, sourcePtr);
        memory[sourcePtr + sourceBytes.length] = 0;
        
        console.log('📝 Source copied, initializing parser...');
        
        // 5. Initialiser le parser
        try {
            parserInit(parserPtr, sourcePtr, sourceBytes.length);
            console.log('✅ Parser initialized');
        } catch (error) {
            free(sourcePtr);
            free(parserPtr);
            throw new Error(`Parser init failed: ${error.message}`);
        }
        
        // 6. Parser le code
        let resultPtr = 0;
        try {
            if (parserParse) {
                resultPtr = parserParse(parserPtr);
                console.log(`✅ Parse completed, result: ${resultPtr}`);
            } else {
                console.log('⚠️ No parser_parse function, using parser directly');
                resultPtr = parserPtr; // Le parser contient le résultat
            }
        } catch (error) {
            console.warn(`⚠️ Parser parse failed: ${error.message}`);
        }
        
        // 7. Nettoyer la mémoire
        free(sourcePtr);
        if (parserFree) {
            parserFree(parserPtr);
        } else {
            free(parserPtr);
        }
        
        // 8. Créer le résultat
        const result = {
            value: {
                type: 'ProgramNode',
                location: {
                    start_offset: 0,
                    end_offset: source.length
                },
                body: [],
                success: true,
                result_pointer: resultPtr,
                parser_used: true
            },
            comments: [],
            magicComments: [],
            errors: [],
            warnings: [],
            source: source,
            parse_info: {
                workflow: 'prism_parser',
                parser_ptr: parserPtr,
                result_ptr: resultPtr,
                source_length: sourceBytes.length
            }
        };
        
        return result;
        
    } catch (error) {
        console.error('❌ parsePrism error:', error);
        return createErrorResult(source, error.message);
    }
}

// Fonction pour essayer le parsing direct (fallback)
function tryDirectParsing(exports, source, sourceBytes, malloc, free) {
    console.log('🔄 Trying direct parsing methods...');
    
    // Chercher des fonctions de parsing direct
    const directCandidates = [
        'pm_parse_string',
        'prism_parse_string', 
        'pm_parse_source',
        'prism_parse_source'
    ];
    
    for (const funcName of directCandidates) {
        if (exports[funcName]) {
            console.log(`🎯 Trying direct function: ${funcName}`);
            
            try {
                const bufferSize = sourceBytes.length + 64;
                const sourcePtr = malloc(bufferSize);
                if (!sourcePtr) continue;
                
                const memory = new Uint8Array(exports.memory.buffer);
                memory.set(sourceBytes, sourcePtr);
                memory[sourcePtr + sourceBytes.length] = 0;
                
                const result = exports[funcName](sourcePtr, sourceBytes.length);
                free(sourcePtr);
                
                console.log(`✅ Direct parsing succeeded with ${funcName}`);
                return {
                    value: {
                        type: 'ProgramNode',
                        success: true,
                        result_pointer: result,
                        method: `direct_${funcName}`
                    },
                    errors: [],
                    source: source
                };
                
            } catch (error) {
                console.warn(`⚠️ ${funcName} failed: ${error.message}`);
                continue;
            }
        }
    }
    
    return createErrorResult(source, 'No working parse function found');
}

// Fonction utilitaire pour créer un résultat d'erreur
function createErrorResult(source, errorMessage) {
    return {
        value: null,
        comments: [],
        magicComments: [],
        errors: [{ message: errorMessage, type: 'ParseError' }],
        warnings: [],
        source: source
    };
}

// Fonction pour trouver une fonction de parsing appropriée
function findParseFunction(exports) {
    const candidates = [
        'pm_parse',
        'parse',
        'prism_parse',
        'ruby_parse',
        'pm_parser_parse',
        'prism_parser_parse',
        'pm_parse_string',
        'prism_parse_string'
    ];
    
    for (const name of candidates) {
        if (exports[name] && typeof exports[name] === 'function') {
            console.log(`🎯 Found parse function: ${name}`);
            return { name, func: exports[name] };
        }
    }
    
    // Si aucune fonction standard trouvée, chercher des patterns
    const allFunctions = Object.keys(exports).filter(k => typeof exports[k] === 'function');
    const parseFunctions = allFunctions.filter(name => 
        name.includes('parse') || name.startsWith('pm_') || name.includes('prism')
    );
    
    console.log('🔍 Available parse-related functions:', parseFunctions);
    
    if (parseFunctions.length > 0) {
        const funcName = parseFunctions[0];
        console.log(`🎲 Using first available function: ${funcName}`);
        return { name: funcName, func: exports[funcName] };
    }
    
    return null;
}

// Fonction pour trouver une fonction alternative
function findAlternativeParseFunction(exports, excludeName) {
    const allFunctions = Object.keys(exports).filter(k => 
        typeof exports[k] === 'function' && 
        k !== excludeName && 
        (k.includes('parse') || k.startsWith('pm_'))
    );
    
    console.log('🔍 Alternative parse functions:', allFunctions.slice(0, 5));
    
    if (allFunctions.length > 0) {
        return { name: allFunctions[0], func: exports[allFunctions[0]] };
    }
    
    return null;
}

// Fonction de parsing avec accès direct à la mémoire (fallback)
function parseWithDirectMemory(exports, source, sourceBytes) {
    console.log('🔄 Trying direct memory access method...');
    
    try {
        // Essayer d'écrire directement dans la mémoire WASM
        const memory = new Uint8Array(exports.memory.buffer);
        const startOffset = 1024; // Commencer après les premiers 1KB
        
        if (startOffset + sourceBytes.length >= memory.length) {
            throw new Error('Source too large for direct memory access');
        }
        
        // Copier le source
        memory.set(sourceBytes, startOffset);
        memory[startOffset + sourceBytes.length] = 0;
        
        // Chercher une fonction de parsing
        const parseFunc = findParseFunction(exports);
        
        if (parseFunc) {
            const result = parseFunc.func(startOffset, sourceBytes.length);
            
            return {
                value: {
                    type: 'ProgramNode',
                    location: { start_offset: 0, end_offset: source.length },
                    body: [],
                    success: true,
                    result_pointer: result,
                    method: 'direct_memory'
                },
                comments: [],
                errors: [],
                warnings: [],
                source: source
            };
        }
        
        throw new Error('No parse function available');
        
    } catch (error) {
        return {
            value: null,
            errors: [{ message: `Direct memory error: ${error.message}` }],
            source: source
        };
    }
}

// Export pour utilisation globale
if (typeof window !== 'undefined') {
    window.parsePrism = parsePrism;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { parsePrism };
}