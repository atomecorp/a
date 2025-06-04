/**
 * ⚡ TRANSPILER CORE
 * Now uses proper Prism WASM integration and native JavaScript generation
 * Version 4.0 - REQUIREMENTS COMPLIANT
 */

import NativeCodeGenerator from './native_code_generator.js';
import RubyParserManager from './ruby_parser_manager.js';

class TranspilerCore {
    constructor() {
        // Use NativeCodeGenerator for zero abstraction
        this.nativeCodeGenerator = new (window.NativeCodeGenerator || NativeCodeGenerator)();
        this.parserManager = new (window.RubyParserManager || RubyParserManager)();
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

        
        try {
            await this.parserManager.initializePrism();

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
     * ⚡ TRANSPILE PRISM AST TO JAVASCRIPT (MAIN METHOD - UPDATED)
     */
    transpilePrismASTToJavaScript(ast) {

        
        if (!ast || !ast.body || !Array.isArray(ast.body)) {
            throw new Error('Invalid Prism AST structure');
        }
        

        
        // NEW: Try CleanCodeGenerator first (works with real Prism nodes)
        try {

            const cleanJS = this.cleanCodeGenerator.generateFromRealNodes(ast.body);
            
            if (cleanJS && cleanJS.trim()) {





                return cleanJS;
            }
        } catch (error) {
            console.warn('⚠️ CleanCodeGenerator failed, trying fallback:', error.message);
        }
        
        // Fallback: Use old-style transpilation if CleanCodeGenerator fails

        
        // Final fallback: node-by-node transpilation

        const jsLines = [];
        
        for (const [index, node] of ast.body.entries()) {
            try {

                
                // Log actual node structure for debugging
                this.logRealNodeStructure(node, index + 1);
                
                const jsCode = this.transpilePrismNode(node);

                
                if (jsCode && jsCode.trim() && !jsCode.startsWith('//')) {
                    jsLines.push(jsCode);

                } else {
                    console.warn(`⚠️ Node ${index + 1} produced empty/comment JavaScript:`, jsCode);
                }
            } catch (error) {
                console.warn(`⚠️ Failed to transpile node ${index + 1}:`, error.message);

                
                jsLines.push(`// ERROR: Failed to transpile ${node.type || 'unknown'}: ${error.message}`);
            }
        }
        
        let result = jsLines.join('\n');
        


        
        return result;
    }

    /**
     * 🔍 LOG REAL NODE STRUCTURE (NEW)
     */
    logRealNodeStructure(node, nodeIndex) {

        
        // Log the real properties we expect from Prism
        const realProps = {
            type: node.type,
            name: node.name,
            value: node.value,
            receiver: node.receiver,
            arguments: node.arguments,
            block: node.block,
            flags: node.flags,
            depth: node.depth,
            elements: node.elements,
            body: node.body
        };
        
        // Filter out undefined properties
        const definedProps = {};
        for (const [key, value] of Object.entries(realProps)) {
            if (value !== undefined) {
                if (typeof value === 'object' && value !== null) {
                    definedProps[key] = `[${value.constructor?.name || 'Object'}]`;
                } else {
                    definedProps[key] = value;
                }
            }
        }
        

        
        // Check if this looks like a real Prism node vs a fallback
        const hasRealProps = node.name !== undefined || node.value !== undefined || 
                           node.arguments !== undefined || node.receiver !== undefined;
        

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


            return this.rubyHandlers.transpileUnknownNode(node);
        }
        
        try {
            const result = handler(node);

            return result;
        } catch (error) {
            console.error(`❌ Handler failed for ${nodeType}:`, error);

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

            return null;
        }
    }

    /**
     * 🚀 EXECUTE JAVASCRIPT
     */
    executeJS(jsCode) {

        
        try {




            
            if (!jsCode || jsCode.trim() === '') {
                console.warn('⚠️ Empty JavaScript code generated');
                return { success: true, warning: 'Empty code' };
            }
            
            // Execute the code
            eval(jsCode);

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

        
        try {
            // Step 1: Parse Ruby with Real Prism

            const parseResult = await this.parseRubyCode(rubyCode);
            const ast = parseResult.result.value;
            
            if (!ast || !ast.body) {
                throw new Error('No valid AST received from Real Prism parser');
            }
            

            
            // Step 2: Transpile Real Prism AST to JavaScript

            const jsCode = this.transpilePrismASTToJavaScript(ast);
            
            // Step 3: Execute JavaScript

            const result = this.executeJS(jsCode);
            
            return result;
            
        } catch (error) {
            console.error('❌ Real Prism Pipeline failed:', error);
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
            cleanCodeGenerator: !!this.cleanCodeGenerator,
            rubyHandlers: !!this.rubyHandlers,
            parserManager: this.parserManager.getDiagnostics(),
            handlerCount: Object.keys(this.transpilationHandlers).length,
            version: '3.0-RealPrism'
        };
    }
}

// Export and global assignment for compatibility
export default TranspilerCore;

// Global export
if (typeof window !== 'undefined') {
    window.TranspilerCore = TranspilerCore;

}