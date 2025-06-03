/**
 * 🐿️ SQUIRREL ORCHESTRATOR - 100% PRISM AST TRANSPILER
 * Version 2.0 - Corrigé et optimisé pour l'interface PrismParser async
 */

class SquirrelOrchestrator {
    
    constructor() {
        console.log('🚀 Enhanced Squirrel Orchestrator - 100% Prism AST Transpiler!');
        this.prismParser = null;
        this.transpilationHandlers = this.initializeTranspilationHandlers();
        
        console.log(`📊 Loaded ${Object.keys(this.transpilationHandlers).length} transpilation handlers`);
    }

    /**
     * 🎯 INITIALIZE TRANSPILATION HANDLERS
     */
    initializeTranspilationHandlers() {
        return {
            // Core program structure
            'ProgramNode': this.transpileProgramNode.bind(this),
            'StatementsNode': this.transpileStatementsNode.bind(this),
            
            // Variable operations
            'LocalVariableWriteNode': this.transpileLocalVariableWrite.bind(this),
            'LocalVariableReadNode': this.transpileLocalVariableRead.bind(this),
            
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
     * 🔍 PARSE RUBY CODE WITH PRISM (CORRIGÉ)
     */
    async parseRubyCode(rubyCode) {
        console.log('🔍 Parsing Ruby code with enhanced Prism...');
        
        try {
            // Le PrismParser.parseRuby() retourne directement l'AST
            const ast = await this.prismParser.parseRuby(rubyCode);
            console.log('✅ Ruby code validated with Prism successfully');
            return ast; // Retourner directement l'AST
        } catch (error) {
            console.error('❌ Prism parsing failed:', error);
            throw error;
        }
    }

    /**
     * ⚡ TRANSPILE PRISM AST TO JAVASCRIPT (OPTIMISÉ)
     */
    transpilePrismASTToJavaScript(ast) {
        console.log('⚡ Transpiling Prism AST to JavaScript...');
        
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
                }
            } catch (error) {
                console.warn(`⚠️ Failed to transpile node ${index + 1}:`, error.message);
                // Ajouter un commentaire d'erreur au lieu de faire échouer
                jsLines.push(`// ERROR: Failed to transpile ${node.type || 'unknown'}: ${error.message}`);
            }
        }
        
        let result = jsLines.join('\n');
        
        console.log('✅ Prism AST transpiled to JavaScript');
        console.log(`📊 Generated ${jsLines.length} JavaScript statements`);
        
        return result;
    }

    /**
     * 🎯 TRANSPILE INDIVIDUAL PRISM NODE
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
        if (node.body && Array.isArray(node.body)) {
            return node.body.map(child => this.transpilePrismNode(child)).filter(Boolean).join('\n');
        }
        return '// Empty program';
    }

    /**
     * 📋 TRANSPILE STATEMENTS NODE
     */
    transpileStatementsNode(node) {
        if (node.body && Array.isArray(node.body)) {
            return node.body.map(child => this.transpilePrismNode(child)).filter(Boolean).join('\n');
        }
        return '';
    }

    /**
     * 📝 TRANSPILE LOCAL VARIABLE WRITE
     */
    transpileLocalVariableWrite(node) {
        if (!node.name) {
            return null;
        }
        
        // Cas spécial: new A({ ... })
        if (node.value && node.value.type === 'CallNode' && 
            node.value.receiver === 'A' && node.value.method === 'new') {
            
            let configObject = '{}';
            if (node.value.arguments && node.value.arguments.length > 0) {
                const hashArg = node.value.arguments[0];
                if (hashArg.type === 'HashNode') {
                    configObject = this.transpileHashNode(hashArg);
                }
            }
            
            return `const ${node.name} = new A(${configObject});`;
        }
        
        // Cas général
        if (node.value) {
            const value = this.transpilePrismNode(node.value);
            if (value && !value.startsWith('//')) {
                return `const ${node.name} = ${value};`;
            }
        }
        
        return `const ${node.name} = undefined; // Could not transpile value`;
    }

    /**
     * 📖 TRANSPILE LOCAL VARIABLE READ
     */
    transpileLocalVariableRead(node) {
        return node.name || 'undefined';
    }

    /**
     * 📞 TRANSPILE CALL NODE (CORRIGÉ POUR WAIT)
     */
    transpileCallNode(node) {
        if (!node.method) {
            return null;
        }
        
        // PUTS STATEMENTS
        if (node.method === 'puts') {
            if (node.arguments && node.arguments.length > 0) {
                const args = node.arguments.map(arg => this.transpilePrismNode(arg)).filter(Boolean);
                return `puts(${args.join(', ')});`;
            }
            return 'puts();';
        }
        
        // WAIT STATEMENTS - CORRIGÉ
        if (node.method === 'wait') {
            let delay = '1000'; // default
            
            if (node.arguments && node.arguments.length > 0) {
                const delayArg = node.arguments[0];
                if (delayArg.type === 'IntegerNode') {
                    delay = delayArg.value || '1000';
                } else {
                    delay = this.transpilePrismNode(delayArg) || '1000';
                }
            }
            
            // Si il y a un bloc, transpiler le bloc comme callback
            if (node.block && node.block.body) {
                const blockCode = this.transpileBlockNode(node.block);
                return `wait(${delay}, function() {\n${blockCode}\n});`;
            } else {
                return `setTimeout(function() {\n  // Empty wait block\n}, ${delay});`;
            }
        }
        
        // METHOD CALLS WITH RECEIVER
        if (node.receiver) {
            const receiver = typeof node.receiver === 'string' ? 
                node.receiver : this.transpilePrismNode(node.receiver);
            
            // Method calls with blocks
            if (node.block) {
                const blockCode = this.transpileBlockNode(node.block);
                
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
            
            return `${receiver}.${node.method}(${args});`;
        }
        
        // STANDALONE METHOD CALLS
        let args = '';
        if (node.arguments && node.arguments.length > 0) {
            const argList = node.arguments.map(arg => this.transpilePrismNode(arg)).filter(Boolean);
            args = argList.join(', ');
        }
        
        return `${node.method}(${args});`;
    }

    /**
     * 📄 TRANSPILE STRING NODE
     */
    transpileStringNode(node) {
        if (!node.value) {
            return '""';
        }
        
        let value = node.value;
        
        // Nettoyer les guillemets superflus
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
        return node.value || '0';
    }

    /**
     * 📦 TRANSPILE HASH NODE
     */
    transpileHashNode(node) {
        if (!node.content || !Array.isArray(node.content)) {
            return '{}';
        }
        
        const properties = [];
        
        for (const line of node.content) {
            if (typeof line === 'string' && line.trim()) {
                const cleanLine = line.trim().replace(/,$/, '');
                
                if (cleanLine.includes(':')) {
                    const colonIndex = cleanLine.indexOf(':');
                    const key = cleanLine.substring(0, colonIndex).trim();
                    const value = cleanLine.substring(colonIndex + 1).trim();
                    
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
     * 🧹 UTILITY: Clean hash values
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
        
        // Objects et arrays
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
            (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
            return trimmed;
        }
        
        // Strings déjà quotées
        if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || 
            (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
            return trimmed;
        }
        
        // Mots-clés spéciaux
        if (trimmed === 'null' || trimmed === 'undefined' || trimmed === 'body') {
            return trimmed === 'body' ? '"body"' : trimmed;
        }
        
        // Sélecteurs CSS
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
        if (!node.elements || !Array.isArray(node.elements)) {
            return '[]';
        }
        
        const elements = node.elements.map(el => this.transpilePrismNode(el)).filter(Boolean);
        return `[${elements.join(', ')}]`;
    }

    /**
     * 🎭 TRANSPILE BLOCK NODE
     */
    transpileBlockNode(node) {
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
     * 🔀 TRANSPILE IF NODE
     */
    transpileIfNode(node) {
        if (!node.condition) {
            return '// Invalid if node: no condition';
        }
        
        let condition = this.transpilePrismNode(node.condition) || 'true';
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
     * 🧹 UTILITY: Clean conditions
     */
    cleanCondition(condition) {
        let cleaned = condition.trim();
        
        // Remplacer les opérateurs Ruby
        cleaned = cleaned.replace(/\band\b/g, '&&');
        cleaned = cleaned.replace(/\bor\b/g, '||');
        cleaned = cleaned.replace(/\bnot\b/g, '!');
        
        // Corriger key.ctrl en key.ctrlKey
        cleaned = cleaned.replace(/key\.ctrl/g, 'key.ctrlKey');
        
        // S'assurer que les comparaisons utilisent ===
        cleaned = cleaned.replace(/([^=!])={1}([^=])/g, '$1===$2');
        
        return cleaned;
    }

    /**
     * ❓ TRANSPILE UNKNOWN NODE
     */
    transpileUnknownNode(node) {
        if (node.source_line) {
            return `// Unknown: ${node.source_line}`;
        }
        
        if (node.content) {
            return `// Unknown: ${node.content}`;
        }
        
        return `// Unknown node type: ${node.type || 'undefined'}`;
    }

    /**
     * 🚀 EXECUTE JAVASCRIPT
     */
    executeJS(jsCode) {
        console.log('🚀 Executing transpiled JavaScript...');
        
        try {
            console.log('🔍 Generated JavaScript:');
            console.log('--- START GENERATED CODE ---');
            console.log(jsCode);
            console.log('--- END GENERATED CODE ---');
            
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
            return { 
                success: false, 
                error: error.message,
                code: jsCode,
                errorType: error.name
            };
        }
    }

    /**
     * 🚀 MAIN PROCESS - 100% PRISM PIPELINE (CORRIGÉ)
     */
    async processRubyCode(rubyCode) {
        console.log('🚀 Starting 100% Prism Ruby to JS Pipeline...');
        
        try {
            // Step 1: Parse Ruby with Prism (CORRIGÉ)
            console.log('🔍 Step 1: Parsing Ruby with Prism...');
            const ast = await this.parseRubyCode(rubyCode);
            
            // Vérifier que nous avons un AST valide (CORRIGÉ)
            if (!ast || !ast.body) {
                throw new Error('No valid AST received from parser');
            }
            
            console.log(`🌳 Prism AST extracted with ${ast.body.length} nodes`);
            
            // Step 2: Transpile Prism AST to JavaScript
            console.log('⚡ Step 2: Transpiling Prism AST to JavaScript...');
            const jsCode = this.transpilePrismASTToJavaScript(ast);
            
            // Step 3: Execute JavaScript
            console.log('🚀 Step 3: Executing JavaScript...');
            const result = this.executeJS(jsCode);
            
            return result;
            
        } catch (error) {
            console.error('❌ Prism Pipeline failed:', error);
            throw error;
        }
    }
}

// Global export
if (typeof window !== 'undefined') {
    window.SquirrelOrchestrator = SquirrelOrchestrator;
    console.log('✅ Enhanced Squirrel Orchestrator ready!');
    console.log('✅ Fixed async interface with PrismParser!');
    console.log('✅ Removed obsolete code and optimized transpilation!');
}