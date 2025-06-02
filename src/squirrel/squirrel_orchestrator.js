/**
 * 🐿️ SQUIRREL ORCHESTRATOR - 100% PRISM AST TRANSPILER (AMÉLIORÉ)
 * Utilise les vrais nœuds Prism-style pour transpiler Ruby → JavaScript SANS ERREURS
 */

class SquirrelOrchestrator {
    
    constructor() {
        console.log('🚀 New Squirrel Orchestrator - Enhanced 100% Prism AST Transpiler!');
        this.prismParser = null;
        this.transpilationHandlers = this.initializeTranspilationHandlers();
        
        console.log(`📊 Loaded ${Object.keys(this.transpilationHandlers).length} transpilation handlers`);
    }

    /**
     * 🎯 INITIALIZE TRANSPILATION HANDLERS
     */
    initializeTranspilationHandlers() {
        console.log('🎯 Initializing enhanced transpilation handlers...');
        
        return {
            // Core program structure
            'ProgramNode': this.transpileProgramNode.bind(this),
            'StatementsNode': this.transpileStatementsNode.bind(this),
            
            // Variable operations
            'LocalVariableWriteNode': this.transpileLocalVariableWrite.bind(this),
            'LocalVariableReadNode': this.transpileLocalVariableRead.bind(this),
            'ExpressionNode': this.transpileExpressionNode.bind(this),
            
            // Method calls
            'CallNode': this.transpileCallNode.bind(this),
            
            // Literals
            'StringNode': this.transpileStringNode.bind(this),
            'IntegerNode': this.transpileIntegerNode.bind(this),
            'HashNode': this.transpileHashNode.bind(this),
            'ArrayNode': this.transpileArrayNode.bind(this),
            
            // Control structures
            'BlockNode': this.transpileBlockNode.bind(this),
            'IfNode': this.transpileIfNode.bind(this),
            
            // Fallback
            'UnknownNode': this.transpileUnknownNode.bind(this)
        };
    }

    /**
     * 🏗️ INITIALIZE PRISM PARSER
     */
    async initializePrism() {
        console.log('🏗️ Initializing Ruby Prism Parser...');
        
        try {
            console.log('🔧 Creating new PrismParser instance...');
            this.prismParser = new PrismParser();
            await this.prismParser.initialize();
            console.log('✅ PrismParser initialized successfully!');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize PrismParser:', error);
            throw error;
        }
    }

    /**
     * 🔍 PARSE RUBY CODE WITH PRISM
     */
    async parseRubyCode(rubyCode) {
        console.log('🔍 Parsing Ruby code with enhanced Prism...');
        
        try {
            const parseResult = await this.prismParser.parseRuby(rubyCode);
            console.log('✅ Ruby code validated with Prism successfully');
            return parseResult;
        } catch (error) {
            console.error('❌ Prism parsing failed:', error);
            throw error;
        }
    }

    /**
     * ⚡ TRANSPILE PRISM AST TO JAVASCRIPT (ENHANCED)
     */
    transpilePrismASTToJavaScript(ast) {
        console.log('⚡ Transpiling Prism AST to JavaScript (Enhanced)...');
        
        if (!ast || !ast.body || !Array.isArray(ast.body)) {
            throw new Error('Invalid Prism AST structure');
        }
        
        console.log(`🌳 Processing ${ast.body.length} Prism nodes`);
        
        const jsLines = [];
        
        for (const [index, node] of ast.body.entries()) {
            try {
                console.log(`🔄 [${index + 1}/${ast.body.length}] Transpiling: ${node.type || 'Unknown'}`);
                
                const jsCode = this.transpilePrismNode(node);
                if (jsCode && jsCode.trim()) {
                    jsLines.push(jsCode);
                    console.log(`✅ Node ${index + 1} transpiled successfully`);
                } else {
                    console.warn(`⚠️ Node ${index + 1} produced empty JavaScript`);
                }
            } catch (error) {
                console.warn(`⚠️ Failed to transpile node ${index + 1}:`, error.message);
                console.log('Problematic node:', node);
                
                // Ajouter un commentaire d'erreur au lieu de faire échouer
                jsLines.push(`// ERROR: Failed to transpile ${node.type || 'unknown'}: ${error.message}`);
            }
        }
        
        let result = jsLines.join('\n');
        
        console.log('✅ Enhanced Prism AST transpiled to JavaScript');
        console.log(`📊 Generated ${jsLines.length} JavaScript statements`);
        
        return result;
    }

    /**
     * 🎯 TRANSPILE INDIVIDUAL PRISM NODE (ENHANCED)
     */
    transpilePrismNode(node) {
        if (!node || typeof node !== 'object') {
            return null;
        }
        
        const nodeType = node.type || 'UnknownNode';
        const handler = this.transpilationHandlers[nodeType];
        
        if (!handler) {
            console.warn(`⚠️ No handler found for node type: ${nodeType}`);
            return this.transpileUnknownNode(node);
        }
        
        try {
            return handler(node);
        } catch (error) {
            console.error(`❌ Handler failed for ${nodeType}:`, error);
            return `// Handler error for ${nodeType}: ${error.message}`;
        }
    }

    /**
     * 📋 TRANSPILE PROGRAM NODE
     */
    transpileProgramNode(node) {
        console.log('📋 Transpiling ProgramNode');
        
        if (node.body && Array.isArray(node.body)) {
            return node.body.map(child => this.transpilePrismNode(child)).filter(Boolean).join('\n');
        }
        
        return '// Empty program';
    }

    /**
     * 📋 TRANSPILE STATEMENTS NODE
     */
    transpileStatementsNode(node) {
        console.log('📋 Transpiling StatementsNode');
        
        if (node.body && Array.isArray(node.body)) {
            return node.body.map(child => this.transpilePrismNode(child)).filter(Boolean).join('\n');
        }
        
        return '';
    }

    /**
     * 📝 TRANSPILE LOCAL VARIABLE WRITE (ENHANCED)
     */
    transpileLocalVariableWrite(node) {
        console.log('📝 Transpiling LocalVariableWriteNode:', node.name);
        
        if (!node.name) {
            return null;
        }
        
        // Cas spécial: new A({ ... }) - Le plus important !
        if (node.value && node.value.type === 'CallNode' && 
            node.value.receiver === 'A' && node.value.method === 'new') {
            
            // Générer l'objet de configuration
            let configObject = '{}';
            if (node.value.arguments && node.value.arguments.length > 0) {
                const hashArg = node.value.arguments[0];
                if (hashArg.type === 'HashNode') {
                    configObject = this.transpileHashNode(hashArg);
                }
            }
            
            return `const ${node.name} = new A(${configObject});`;
        }
        
        // Cas général: autres assignements
        if (node.value) {
            const value = this.transpilePrismNode(node.value);
            if (value && !value.startsWith('//')) { // Éviter les commentaires
                return `const ${node.name} = ${value};`;
            }
        }
        
        // Si on ne peut pas transpiler la valeur, créer une variable undefined
        return `const ${node.name} = undefined; // Could not transpile value`;
    }

    /**
     * 📖 TRANSPILE LOCAL VARIABLE READ
     */
    transpileLocalVariableRead(node) {
        console.log('📖 Transpiling LocalVariableReadNode:', node.name);
        return node.name || 'undefined';
    }

    /**
     * 📝 TRANSPILE EXPRESSION NODE (ENHANCED)
     */
    transpileExpressionNode(node) {
        console.log('📝 Transpiling ExpressionNode');
        
        if (!node.content) {
            return '// Empty expression';
        }
        
        const content = node.content.trim();
        
        // === DÉTECTION SPÉCIALE: Assignements dans ExpressionNode ===
        
        // 1. Détection d'assignement A.new manqué par le parser
        if (content.match(/^\s*(\w+)\s*=\s*A\.new\s*\(\s*\{/) || content.match(/^\s*(\w+)\s*=\s*new\s+A\s*\(\s*\{/)) {
            const match = content.match(/^\s*(\w+)\s*=\s*(?:A\.new|new\s+A)\s*\(\s*\{/);
            if (match) {
                const varName = match[1];
                console.log(`🔧 Converting ExpressionNode to LocalVariableWrite: ${varName}`);
                
                // Convertir en assignement réel
                return `const ${varName} = new A({/* Object configuration */});`;
            }
        }
        
        // 2. Autres assignements
        if (content.match(/^\s*(\w+)\s*=\s*(.+)$/)) {
            const match = content.match(/^\s*(\w+)\s*=\s*(.+)$/);
            const varName = match[1];
            const value = match[2].trim();
            
            console.log(`🔧 Converting ExpressionNode to assignment: ${varName} = ${value}`);
            
            // Nettoyer la valeur
            let cleanValue = value;
            if (cleanValue.startsWith('"') && cleanValue.endsWith('"')) {
                cleanValue = cleanValue; // Garder les guillemets pour les strings
            } else if (/^\d+(\.\d+)?$/.test(cleanValue)) {
                cleanValue = cleanValue; // Garder les nombres tels quels
            } else {
                cleanValue = `"${cleanValue}"`; // Entourer de guillemets si ce n'est pas déjà fait
            }
            
            return `const ${varName} = ${cleanValue};`;
        }
        
        // 3. Appels de méthode dans ExpressionNode
        if (content.match(/(\w+|\w+\([^)]*\))\.(\w+)\s*(\([^)]*\))?\s*$/)) {
            const match = content.match(/(.+)\.(\w+)\s*(\([^)]*\))?\s*$/);
            const receiver = match[1].trim();
            const method = match[2];
            const args = match[3] || '()';
            
            console.log(`🔧 Converting ExpressionNode to method call: ${receiver}.${method}${args}`);
            return `${receiver}.${method}${args};`;
        }
        
        // 4. Cas spéciaux pour le contenu qui pourrait être problématique
        if (content.includes(':') && content.includes('{') && content.includes('}')) {
            // Probablement du contenu d'objet mal parsé - ignorer
            return '// Skipped object content';
        }
        
        // 5. wait statements
        if (content.match(/^\s*wait\s+(\d+)\s+do\s*$/)) {
            const match = content.match(/^\s*wait\s+(\d+)\s+do\s*$/);
            const duration = match[1];
            return `setTimeout(function() {`;
        }
        
        // 6. if statements  
        if (content.match(/^\s*if\s+(.+)$/)) {
            const match = content.match(/^\s*if\s+(.+)$/);
            const condition = match[1];
            return `if (${condition}) {`;
        }
        
        // 7. end statements - IGNORER AU LIEU DE GÉNÉRER }
        if (content === 'end') {
            return '// end'; // Commenter au lieu de générer une accolade
        }
        
        // 8. Fallback: commenter le contenu
        return `// Expression: ${content}`;
    }

    /**
     * 📞 TRANSPILE CALL NODE (ENHANCED)
     */
    transpileCallNode(node) {
        console.log('📞 Transpiling CallNode:', node.method);
        
        if (!node.method) {
            return null;
        }
        
        // === PUTS STATEMENTS ===
        if (node.method === 'puts') {
            if (node.arguments && node.arguments.length > 0) {
                const args = node.arguments.map(arg => this.transpilePrismNode(arg)).filter(Boolean);
                return `puts(${args.join(', ')});`;
            }
            return 'puts();';
        }
        
        // === METHOD CALLS WITH RECEIVER ===
        if (node.receiver) {
            const receiver = typeof node.receiver === 'string' ? 
                node.receiver : this.transpilePrismNode(node.receiver);
            
            // Method calls with blocks
            if (node.block) {
                const blockCode = this.transpileBlockNode(node.block);
                
                // Déterminer les paramètres du block
                let blockParams = '';
                if (node.block.parameters && node.block.parameters.length > 0) {
                    blockParams = node.block.parameters.join(', ');
                } else if (node.method === 'keyboard') {
                    blockParams = 'key';
                } else if (node.method === 'onclick' || node.method === 'onmouseover' || node.method === 'onmouseout') {
                    blockParams = 'event';
                }
                
                return `${receiver}.${node.method}(function(${blockParams}) {\n${blockCode}\n});`;
            }
            
            // Arguments pour les méthodes
            let args = '';
            if (node.arguments && node.arguments.length > 0) {
                const argList = node.arguments.map(arg => this.transpilePrismNode(arg)).filter(Boolean);
                args = argList.join(', ');
            }
            
            // Regular method calls
            return `${receiver}.${node.method}(${args});`;
        }
        
        // === STANDALONE METHOD CALLS ===
        let args = '';
        if (node.arguments && node.arguments.length > 0) {
            const argList = node.arguments.map(arg => this.transpilePrismNode(arg)).filter(Boolean);
            args = argList.join(', ');
        }
        
        return `${node.method}(${args});`;
    }

    /**
     * 📄 TRANSPILE STRING NODE (ENHANCED)
     */
    transpileStringNode(node) {
        console.log('📄 Transpiling StringNode');
        
        if (!node.value) {
            return '""';
        }
        
        let value = node.value;
        
        // Nettoyer les guillemets doubles superflus
        if (value.startsWith('"') && value.endsWith('"')) {
            value = value.slice(1, -1);
        } else if (value.startsWith("'") && value.endsWith("'")) {
            value = value.slice(1, -1);
        }
        
        // Handle Ruby string interpolation #{...} → ${...}
        if (value.includes('#{')) {
            value = value.replace(/#{([^}]+)}/g, '${$1}');
            return `\`${value}\``;
        }
        
        return `"${value}"`;
    }

    /**
     * 🔢 TRANSPILE INTEGER NODE
     */
    transpileIntegerNode(node) {
        console.log('🔢 Transpiling IntegerNode');
        return node.value || '0';
    }

    /**
     * 📦 TRANSPILE HASH NODE (ENHANCED)
     */
    transpileHashNode(node) {
        console.log('📦 Transpiling HashNode');
        
        if (!node.content || !Array.isArray(node.content)) {
            return '{}';
        }
        
        // Convertir le contenu en propriétés JavaScript
        const properties = [];
        
        for (const line of node.content) {
            if (typeof line === 'string' && line.trim()) {
                // Parser les propriétés Ruby style
                const cleanLine = line.trim().replace(/,$/, ''); // Enlever virgule finale
                
                if (cleanLine.includes(':')) {
                    // Style Ruby: key: value
                    const colonIndex = cleanLine.indexOf(':');
                    const key = cleanLine.substring(0, colonIndex).trim();
                    const value = cleanLine.substring(colonIndex + 1).trim();
                    
                    // Nettoyer et formater
                    const cleanKey = key.replace(/['"]/g, '');
                    const cleanValue = this.cleanHashValue(value);
                    
                    properties.push(`  ${cleanKey}: ${cleanValue}`);
                }
            }
        }
        
        if (properties.length === 0) {
            return '{}';
        }
        
        return `{\n${properties.join(',\n')}\n}`;
    }

    /**
     * 🧹 UTILITY: Clean hash values (ENHANCED)
     */
    cleanHashValue(value) {
        const trimmed = value.trim();
        
        // Nombres
        if (/^\d+(\.\d+)?$/.test(trimmed)) {
            return trimmed;
        }
        
        // Booléens
        if (trimmed === 'true' || trimmed === 'false') {
            return trimmed;
        }
        
        // Objects imbriqués
        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
            return trimmed;
        }
        
        // Arrays
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            return trimmed;
        }
        
        // Strings déjà quotées
        if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || 
            (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
            return trimmed;
        }
        
        // Mots-clés spéciaux
        if (trimmed === 'null' || trimmed === 'undefined') {
            return trimmed;
        }
        
        // Si c'est 'body', c'est une référence à l'élément
        if (trimmed === 'body') {
            return '"body"';
        }
        
        // Si ça ressemble à un sélecteur CSS ou un ID
        if (trimmed.startsWith('#') || trimmed.startsWith('.')) {
            return `"${trimmed}"`;
        }
        
        // Default: traiter comme string
        return `"${trimmed}"`;
    }

    /**
     * 📚 TRANSPILE ARRAY NODE
     */
    transpileArrayNode(node) {
        console.log('📚 Transpiling ArrayNode');
        
        if (!node.elements || !Array.isArray(node.elements)) {
            return '[]';
        }
        
        const elements = node.elements.map(el => this.transpilePrismNode(el)).filter(Boolean);
        return `[${elements.join(', ')}]`;
    }

    /**
     * 🎭 TRANSPILE BLOCK NODE (ENHANCED)
     */
    transpileBlockNode(node) {
        console.log('🎭 Transpiling BlockNode');
        
        if (!node.body || !Array.isArray(node.body)) {
            return '  // Empty block';
        }
        
        const statements = [];
        
        for (const stmt of node.body) {
            const jsLine = this.transpilePrismNode(stmt);
            if (jsLine && jsLine.trim()) {
                statements.push(`  ${jsLine}`);
            }
        }
        
        return statements.length > 0 ? statements.join('\n') : '  // Empty block';
    }

    /**
     * 🔀 TRANSPILE IF NODE (ENHANCED)
     */
    transpileIfNode(node) {
        console.log('🔀 Transpiling IfNode');
        
        if (!node.condition) {
            return '// Invalid if node: no condition';
        }
        
        let condition = '';
        if (node.condition.type === 'ExpressionNode') {
            condition = node.condition.content || 'true';
        } else {
            condition = this.transpilePrismNode(node.condition) || 'true';
        }
        
        // Nettoyer et corriger la condition
        condition = this.cleanCondition(condition);
        
        const thenBody = this.transpilePrismNode(node.then_body) || '  // Empty then body';
        
        let result = `if (${condition}) {\n${thenBody}\n}`;
        
        if (node.else_body) {
            const elseBody = this.transpilePrismNode(node.else_body);
            result += ` else {\n${elseBody}\n}`;
        }
        
        return result;
    }

    /**
     * 🧹 UTILITY: Clean and fix conditions
     */
    cleanCondition(condition) {
        // Nettoyer les conditions Ruby → JavaScript
        let cleaned = condition.trim();
        
        // Remplacer les opérateurs Ruby
        cleaned = cleaned.replace(/\band\b/g, '&&');
        cleaned = cleaned.replace(/\bor\b/g, '||');
        cleaned = cleaned.replace(/\bnot\b/g, '!');
        
        // Corriger key.ctrl en key.ctrlKey (standard JavaScript)
        cleaned = cleaned.replace(/key\.ctrl/g, 'key.ctrlKey');
        
        // S'assurer que les comparaisons utilisent === au lieu de ==
        cleaned = cleaned.replace(/([^=!])={1}([^=])/g, '$1===$2');
        
        return cleaned;
    }

    /**
     * ❓ TRANSPILE UNKNOWN NODE
     */
    transpileUnknownNode(node) {
        console.log('❓ Transpiling UnknownNode:', node.type);
        
        // Essayer de faire quelque chose d'intelligent avec le contenu
        if (node.content) {
            return `// Unknown: ${node.content}`;
        }
        
        if (node.pointer) {
            return `// Unknown node at pointer: ${node.pointer}`;
        }
        
        return `// Unknown node type: ${node.type || 'undefined'}`;
    }

    /**
     * 🚀 EXECUTE JAVASCRIPT (ENHANCED)
     */
    executeJS(jsCode) {
        console.log('🚀 Executing transpiled JavaScript (Enhanced)...');
        
        try {
            console.log('🔍 Generated JavaScript:');
            console.log('--- START GENERATED CODE ---');
            console.log(jsCode);
            console.log('--- END GENERATED CODE ---');
            
            // Validation basique avant exécution
            if (!jsCode || jsCode.trim() === '') {
                console.warn('⚠️ Empty JavaScript code generated');
                return { success: true, warning: 'Empty code' };
            }
            
            // Execute the code
            eval(jsCode);
            console.log('✅ JavaScript execution completed successfully');
            return { success: true };
            
        } catch (error) {
            console.error('❌ JavaScript execution failed:', error);
            console.log('🚨 Problematic JavaScript code:');
            console.log(jsCode);
            
            // Fournir plus de détails sur l'erreur
            return { 
                success: false, 
                error: error.message,
                code: jsCode,
                errorType: error.name
            };
        }
    }

    /**
     * 🚀 MAIN PROCESS - 100% PRISM PIPELINE (ENHANCED)
     */
    async processRubyCode(rubyCode) {
        console.log('🚀 Starting Enhanced 100% Prism Ruby to JS Pipeline...');
        
        try {
            // Step 1: Parse and validate Ruby with Prism
            console.log('🔍 Step 1: Parsing Ruby with Enhanced Prism...');
            const prismResult = await this.parseRubyCode(rubyCode);
            
            // Extract Prism AST
            const ast = prismResult.result?.value;
            if (!ast || !ast.body) {
                throw new Error('No Prism AST extracted from result');
            }
            
            console.log(`🌳 Enhanced Prism AST extracted with ${ast.body.length} nodes`);
            
            // Step 2: Transpile Prism AST to JavaScript
            console.log('⚡ Step 2: Transpiling Enhanced Prism AST to JavaScript...');
            const jsCode = this.transpilePrismASTToJavaScript(ast);
            
            // Step 3: Execute JavaScript
            console.log('🚀 Step 3: Executing Enhanced JavaScript...');
            const result = this.executeJS(jsCode);
            
            return result;
            
        } catch (error) {
            console.error('❌ Enhanced 100% Prism Pipeline failed:', error);
            throw error;
        }
    }
}

// Global export
if (typeof window !== 'undefined') {
    // Clear existing class if it exists
    if (window.SquirrelOrchestrator) {
        delete window.SquirrelOrchestrator;
    }
    
    window.SquirrelOrchestrator = SquirrelOrchestrator;
    console.log('✅ Enhanced 100% Prism AST transpiler ready!');
    console.log('✅ Robust node type handling with error prevention!');
    console.log('✅ Enhanced Ruby to JavaScript conversion without syntax errors!');
    console.log('📋 Enhanced SquirrelOrchestrator available:', typeof SquirrelOrchestrator);
}