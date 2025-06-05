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
        this.initializationPromise = null;
    }

    /**
     * 🏗️ INITIALIZE COMPONENTS
     */
    async initializePrism() {
        // Return existing promise if initialization is already in progress
        if (this.initializationPromise) {
            return await this.initializationPromise;
        }
        
        // Create and store the initialization promise
        this.initializationPromise = this._doInitialize();
        
        try {
            const result = await this.initializationPromise;
            return result;
        } catch (error) {
            // Reset promise on failure so it can be retried
            this.initializationPromise = null;
            throw error;
        }
    }
    
    /**
     * 🔧 INTERNAL INITIALIZATION LOGIC
     */
    async _doInitialize() {
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
        // Ensure initialization before parsing
        if (!this.initializationPromise) {
            await this.initializePrism();
        }
        return await this.parserManager.parseRubyCode(rubyCode);
    }

    /**
     * ⚡ TRANSPILE PRISM AST TO NATIVE JAVASCRIPT
     */
    transpilePrismASTToJavaScript(ast) {
        if (!ast || !ast.body || !Array.isArray(ast.body)) {
            throw new Error('Invalid Prism AST structure');
        }

        // Use NativeCodeGenerator for zero abstraction overhead
        return this.nativeCodeGenerator.generateNativeJS(ast.body);
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
            
            // Step 4: Return result including the transpiled JavaScript code
            return {
                ...result,
                js: jsCode,  // Include the transpiled JavaScript code for auto-save
                ast: ast     // Include AST for debugging if needed
            };
            
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
            nativeCodeGenerator: !!this.nativeCodeGenerator,
            parserManager: this.parserManager.getDiagnostics(),
            version: '4.0-RequirementsCompliant'
        };
    }
}

// Export and global assignment for compatibility
export default TranspilerCore;

// Global export
if (typeof window !== 'undefined') {
    window.TranspilerCore = TranspilerCore;
}
