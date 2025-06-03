/**
 * ⚡ TRANSPILER CORE
 * Logique principale de transpilation Ruby vers JavaScript
 */

class TranspilerCore {
    constructor() {
        this.codeGenerator = new window.CodeGenerator();
        this.rubyHandlers = new window.RubyHandlers(this.codeGenerator);
        this.parserManager = new window.RubyParserManager();
        
        // Set up the transpileNode method for handlers
        this.rubyHandlers.setTranspileNodeMethod(this.transpilePrismNode.bind(this));
        
        this.transpilationHandlers = this.initializeTranspilationHandlers();
        
        console.log('⚡ Transpiler Core initialized');
        console.log(`📊 Loaded ${Object.keys(this.transpilationHandlers).length} transpilation handlers`);
    }

    /**
     * 🎯 INITIALIZE TRANSPILATION HANDLERS
     */
    initializeTranspilationHandlers() {
        return {
            // Core program structure
            'ProgramNode': this.rubyHandlers.transpileProgramNode.bind(this.rubyHandlers),
            'StatementsNode': this.rubyHandlers.transpileStatementsNode.bind(this.rubyHandlers),
            
            // Variable operations
            'LocalVariableWriteNode': this.rubyHandlers.transpileLocalVariableWrite.bind(this.rubyHandlers),
            'LocalVariableReadNode': this.rubyHandlers.transpileLocalVariableRead.bind(this.rubyHandlers),
            
            // Method calls
            'CallNode': this.rubyHandlers.transpileCallNode.bind(this.rubyHandlers),
            
            // Literals
            'StringNode': this.rubyHandlers.transpileStringNode.bind(this.rubyHandlers),
            'IntegerNode': this.rubyHandlers.transpileIntegerNode.bind(this.rubyHandlers),
            'ArgumentsNode': this.rubyHandlers.transpileArgumentsNode.bind(this.rubyHandlers),
            
            // Control structures
            'BlockNode': this.rubyHandlers.transpileBlockNode.bind(this.rubyHandlers),
            'IfNode': this.rubyHandlers.transpileIfNode.bind(this.rubyHandlers),
            
            // Fallback
            'UnknownNode': this.rubyHandlers.transpileUnknownNode.bind(this.rubyHandlers)
        };
    }

    /**
     * 🏗️ INITIALIZE COMPONENTS
     */
    async initializePrism() {
        console.log('🏗️ Initializing Transpiler Core components...');
        
        try {
            await this.parserManager.initializePrism();
            console.log('✅ Transpiler Core ready!');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize Transpiler Core:', error);
            throw error;
        }
    }

    /**
     * 🔍 PARSE RUBY CODE
     */
    async parseRubyCode(rubyCode) {
        return await this.parserManager.parseRubyCode(rubyCode);
    }

    /**
     * ⚡ TRANSPILE PRISM AST TO JAVASCRIPT (MAIN METHOD)
     */
    transpilePrismASTToJavaScript(ast) {
        console.log('⚡ Transpiling REAL Prism AST to JavaScript...');
        
        if (!ast || !ast.body || !Array.isArray(ast.body)) {
            throw new Error('Invalid Prism AST structure');
        }
        
        console.log(`🌳 Processing ${ast.body.length} REAL Prism nodes`);
        
        // First, try to use the smart code generator for complete Ruby code
        const rubyCode = this.reconstructRubyCode(ast);
        if (rubyCode) {
            console.log('🎯 Using smart code generator for complete conversion...');
            const smartJS = this.codeGenerator.generateCompleteRubyConversion(rubyCode);
            if (smartJS && smartJS.trim()) {
                console.log('✅ Smart conversion successful!');
                return this.codeGenerator.fixJavaScriptSyntax(smartJS);
            }
        }
        
        // Fallback to node-by-node transpilation
        console.log('🔄 Using node-by-node transpilation...');
        const jsLines = [];
        
        for (const [index, node] of ast.body.entries()) {
            try {
                console.log(`🔄 [${index + 1}/${ast.body.length}] Transpiling: ${node.type || 'Unknown'}`);
                
                // Log actual node structure for debugging
                this.parserManager.logNodeStructure(node, index + 1);
                
                const jsCode = this.transpilePrismNode(node);
                console.log(`💡 Generated JS:`, jsCode);
                
                if (jsCode && jsCode.trim() && !jsCode.startsWith('//')) {
                    jsLines.push(jsCode);
                    console.log(`✅ Node ${index + 1} transpiled successfully: ${jsCode.substring(0, 50)}...`);
                } else {
                    console.warn(`⚠️ Node ${index + 1} produced empty/comment JavaScript:`, jsCode);
                }
            } catch (error) {
                console.warn(`⚠️ Failed to transpile node ${index + 1}:`, error.message);
                console.log('Problematic node:', node);
                
                jsLines.push(`// ERROR: Failed to transpile ${node.type || 'unknown'}: ${error.message}`);
            }
        }
        
        let result = jsLines.join('\n');
        
        // Apply syntax fixes
        result = this.codeGenerator.fixJavaScriptSyntax(result);
        result = this.codeGenerator.cleanGeneratedCode(result);
        
        console.log('✅ REAL Prism AST transpiled to JavaScript');
        console.log(`📊 Generated ${jsLines.length} JavaScript statements`);
        console.log('🔍 Final JavaScript output:');
        console.log('--- FINAL JAVASCRIPT ---');
        console.log(result);
        console.log('--- END JAVASCRIPT ---');
        
        return result;
    }

    /**
     * 🎯 TRANSPILE INDIVIDUAL PRISM NODE
     */
    transpilePrismNode(node) {
        if (!node || typeof node !== 'object') {
            console.log('❌ Invalid node: null or non-object');
            return null;
        }
        
        const nodeType = node.type || 'UnknownNode';
        console.log(`🎯 Transpiling ${nodeType}...`);
        
        const handler = this.transpilationHandlers[nodeType];
        
        if (!handler) {
            console.warn(`⚠️ No handler found for node type: ${nodeType}`);
            console.log('📊 Available handlers:', Object.keys(this.transpilationHandlers));
            console.log('📋 Node structure:', node);
            return this.rubyHandlers.transpileUnknownNode(node);
        }
        
        try {
            const result = handler(node);
            console.log(`✅ Handler result for ${nodeType}:`, result);
            return result;
        } catch (error) {
            console.error(`❌ Handler failed for ${nodeType}:`, error);
            console.log('📋 Node that caused error:', node);
            return `// Handler error for ${nodeType}: ${error.message}`;
        }
    }

    /**
     * 🔄 RECONSTRUCT RUBY CODE FROM AST (FOR SMART CONVERSION)
     */
    reconstructRubyCode(ast) {
        try {
            if (!ast.source) return null;
            
            // If we have the original source, use it
            return ast.source;
        } catch (error) {
            console.log('⚠️ Could not reconstruct Ruby code, using node-by-node approach');
            return null;
        }
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
     * 🚀 MAIN PROCESS - COMPLETE PIPELINE
     */
    async processRubyCode(rubyCode) {
        console.log('🚀 Starting FIXED Prism Ruby to JS Pipeline...');
        
        try {
            // Step 1: Parse Ruby with Prism
            console.log('🔍 Step 1: Parsing Ruby with Prism...');
            const parseResult = await this.parseRubyCode(rubyCode);
            const ast = parseResult.result.value;
            
            if (!ast || !ast.body) {
                throw new Error('No valid AST received from parser');
            }
            
            console.log(`🌳 Prism AST extracted with ${ast.body.length} nodes`);
            
            // Step 2: Transpile Prism AST to JavaScript
            console.log('⚡ Step 2: Transpiling REAL Prism AST to JavaScript...');
            const jsCode = this.transpilePrismASTToJavaScript(ast);
            
            // Step 3: Execute JavaScript
            console.log('🚀 Step 3: Executing JavaScript...');
            const result = this.executeJS(jsCode);
            
            return result;
            
        } catch (error) {
            console.error('❌ FIXED Prism Pipeline failed:', error);
            throw error;
        }
    }

    /**
     * 🔧 CHECK IF READY
     */
    isReady() {
        return this.parserManager.isReady();
    }

    /**
     * 📊 GET DIAGNOSTICS
     */
    getDiagnostics() {
        return {
            transpilerCore: true,
            codeGenerator: !!this.codeGenerator,
            rubyHandlers: !!this.rubyHandlers,
            parserManager: this.parserManager.getDiagnostics(),
            handlerCount: Object.keys(this.transpilationHandlers).length
        };
    }
}

// Global export
if (typeof window !== 'undefined') {
    window.TranspilerCore = TranspilerCore;
    console.log('✅ Transpiler Core ready');
}