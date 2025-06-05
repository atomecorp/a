/**
 * 🐿️ SQUIRREL ORCHESTRATOR - COORDINATEUR PRINCIPAL
 * Version optimisée - Architecture modulaire simplifiée
 */

import TranspilerCore from './transpiler_core_compliant.js';

class SquirrelOrchestrator {
    constructor() {
        this.transpilerCore = new (window.TranspilerCore || TranspilerCore)();
        this.initializationPromise = null;
    }

    /**
     * 🏗️ INITIALIZE ALL COMPONENTS
     */
    async initializePrism() {
        if (this.initializationPromise) {
            return await this.initializationPromise;
        }
        
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
            await this.transpilerCore.initializePrism();
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize Squirrel components:', error);
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
        return await this.transpilerCore.parseRubyCode(rubyCode);
    }

    /**
     * ⚡ TRANSPILE PRISM AST TO JAVASCRIPT
     */
    transpilePrismASTToJavaScript(ast) {
        return this.transpilerCore.transpilePrismASTToJavaScript(ast);
    }

    /**
     * 🚀 EXECUTE JAVASCRIPT
     */
    executeJS(jsCode) {
        return this.transpilerCore.executeJS(jsCode);
    }

    /**
     * 🚀 MAIN PROCESS - COMPLETE RUBY TO JS PIPELINE
     */
    async processRubyCode(rubyCode, options = {}) {
        
        try {
            const result = await this.transpilerCore.processRubyCode(rubyCode);
            
            // Debug logging for auto-save
            
            // Auto-save si l'option est activée et que SquirrelSaver est disponible
            if (options.autoSave && window.SquirrelSaver) {
                try {
                    
                    const saveResult = await window.SquirrelSaver.autoSave({
                        code: result.js,
                        originalCode: rubyCode,
                        filename: options.filename || 'transpiled.js',
                        timestamp: new Date().toISOString(),
                        metadata: {
                            sourceFile: options.sourceFile,
                            transpilerVersion: '5.0',
                            ...options.metadata
                        }
                    });
                    
                    if (saveResult) {
                        result.savedFiles = saveResult.files;
                    } else {
                        console.warn('⚠️ Auto-save returned null/false');
                    }
                } catch (saveError) {
                    console.warn('⚠️ Auto-save failed (continuing execution):', saveError.message);
                    console.error('💥 Auto-save error details:', saveError);
                }
            }
            
            return result;
        } catch (error) {
            console.error('❌ MODULAR pipeline failed:', error);
            throw error;
        }
    }

    /**
     * 💾 SAVE TRANSPILED CODE TO DISK
     */
    async saveTranspiledCode(rubyCode, filename = 'manual-save.js', metadata = {}) {
        if (!window.SquirrelSaver) {
            throw new Error('SquirrelSaver not available. Make sure the server is running.');
        }

        try {
            // Transpiler le code d'abord
            const result = await this.processRubyCode(rubyCode);
            
            // Sauvegarder sur le disque
            const saveResult = await window.SquirrelSaver.saveTranspiledCode({
                transpiledCode: result.js,
                rubyCode: rubyCode,
                filename: filename,
                metadata: {
                    transpilerVersion: '5.0',
                    architecture: 'Modular',
                    timestamp: new Date().toISOString(),
                    ...metadata
                }
            });

            return {
                transpilation: result,
                save: saveResult
            };

        } catch (error) {
            console.error('❌ Failed to save transpiled code:', error);
            throw error;
        }
    }

    /**
     * 🔧 CHECK IF READY
     */
    isReady() {
        return this.transpilerCore?.isReady() || false;
    }

    /**
     * 📊 GET COMPREHENSIVE DIAGNOSTICS
     */
    getDiagnostics() {
        const diagnostics = {
            orchestrator: 'SquirrelOrchestrator v5.0 - Modular',
            architecture: '5-component modular design',
            components: {
                transpilerCore: !!this.transpilerCore,
                ready: this.isReady()
            }
        };

        if (this.transpilerCore) {
            diagnostics.components = {
                ...diagnostics.components,
                ...this.transpilerCore.getDiagnostics()
            };
        }

        return diagnostics;
    }

    /**
     * 🎯 GET INDIVIDUAL COMPONENTS (FOR ADVANCED USAGE)
     */
    getComponents() {
        return {
            transpilerCore: this.transpilerCore,
            codeGenerator: this.transpilerCore?.codeGenerator,
            rubyHandlers: this.transpilerCore?.rubyHandlers,
            parserManager: this.transpilerCore?.parserManager
        };
    }

    /**
     * 🛠️ ADVANCED: DIRECT ACCESS TO SPECIFIC COMPONENT
     */
    getCodeGenerator() {
        return this.transpilerCore?.codeGenerator;
    }

    getRubyHandlers() {
        return this.transpilerCore?.rubyHandlers;
    }

    getParserManager() {
        return this.transpilerCore?.parserManager;
    }

    getTranspilerCore() {
        return this.transpilerCore;
    }

    /**
     * 🎯 QUICK TEST METHOD
     */
    async quickTest() {
        
        const testCode = `
puts "Hello from modular Squirrel!"
container = A.new({
  attach: 'body',
  text: 'Modular architecture works!',
  color: 'green'
})
        `.trim();

        try {
            const result = await this.processRubyCode(testCode);
            return result;
        } catch (error) {
            console.error('❌ Quick test failed:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 📊 PERFORMANCE MONITOR
     */
    async performanceTest(rubyCode) {
        const startTime = performance.now();
        
        
        try {
            const result = await this.processRubyCode(rubyCode);
            const endTime = performance.now();
            const duration = endTime - startTime;
            
            
            return {
                ...result,
                performance: {
                    duration: duration,
                    durationFormatted: `${duration.toFixed(2)}ms`
                }
            };
        } catch (error) {
            const endTime = performance.now();
            const duration = endTime - startTime;
            
            console.error(`❌ Performance test failed after ${duration.toFixed(2)}ms:`, error);
            
            return {
                success: false,
                error: error.message,
                performance: {
                    duration: duration,
                    durationFormatted: `${duration.toFixed(2)}ms`
                }
            };
        }
    }
}

// Export and global assignment for compatibility
export default SquirrelOrchestrator;

// Global export
if (typeof window !== 'undefined') {
    window.SquirrelOrchestrator = SquirrelOrchestrator;

}
